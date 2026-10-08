import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { tailorExperienceTitle } from "./job-title";
import { chatJson } from "./llm";
import { parseModelJson } from "./parse-json";
import {
  buildFallbackCoverLetter,
  buildFallbackSummary,
  buildFillerBullet,
  dedupeBullets,
  sanitizePlainText,
  targetBulletCount,
} from "./validate-resume";

const SYSTEM_PROMPT = `Act as a top 1% technical resume writer specializing in software engineering resumes.

Task:
Tailor the candidate's base resume for the provided job description. Produce a final resume that is highly matched, ATS-optimized, human-convincing, realistic, and professionally written. Also write a matching cover letter.

Hard constraints:
- No questions, explanations, commentary, or chain-of-thought.
- No markdown anywhere (**bold**, *italic*, backticks, headings, bullet markers). Plain text only. Keyword bolding is applied later by the document formatter via the keywords array — never simulate bold in text.
- Do not change the candidate's name, contact info, company names, dates/periods, locations, or education.
- Only rewrite summary, skills, and experience content (overviews + bullets).
- Keep everything historically and technically believable.
- Make recent roles match the JD most strongly.
- Avoid repetitive bullets and keyword stuffing.
- Sound human, not AI-generated.
- Return ONLY valid compact JSON. Escape all double quotes inside strings. Do not wrap in markdown fences.

Summary:
- Write a polished professional summary of 4–6 sentences (~90–130 words). Never a one-liner or thin 1–2 sentence blurb.
- Open with seniority + target role domain aligned to the JD (e.g. Senior Backend / Full Stack / AI Engineer).
- Cover career arc briefly, core technical strengths that map to must-have JD skills, and how recent roles prepared the candidate for this position.
- Include 1 sentence on collaboration, ownership, or delivery style relevant to the JD.
- Close with clear intent for the target role/company type without naming a specific employer unless it appears in the JD company field.
- Dense, confident, human prose — no buzzword stacking, no first person ("I"), no markdown.

Skills:
- Classify skills into MORE than 4 categories (5+ preferred), such as Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI/ML, Databases, Tools/Practices.
- Each category MUST have MORE than 5 skill items (6–10 preferred).
- Category names stay short; items are comma-ready skill strings (not full sentences).

Experience structure:
- Preserve experience order from the candidate profile (most recent first).
- Each experience MUST include:
  - overview: 1–2 sentences (~25–45 words) describing what the company does and the candidate's core responsibility in that role, tailored toward the target JD.
  - bullets with this exact count by experience index (most recent = index 0):
    index 0 → 10 bullets, index 1 → 7, index 2 → 5, index 3 → 4, index 4+ → 3.
- Align every experience title to the extracted JD type. Use only Software Engineer, Data Engineer, Data Analyst, Data Scientist, or AI Engineer as the title family. The candidate's most recent senior role must use "Lead" when the JD title is a Lead role; otherwise use "Senior".
- Do not invent employers or schools. Invent realistic overviews and accomplishment bullets grounded in the given companies and JD.

Bullet quality (every bullet):
- 20–30 words, complete sentence, starts with a strong action verb.
- References a specific engineering task or system change.
- Includes at least one technology or platform.
- Reflects realistic software engineering work; no duplicate phrasing across bullets.
- Use realistic metrics in only ~30–40% of bullets. Prefer non-percentage metrics (counts, scale, volume, latency, users, datasets, dollars). NEVER use percentages, percentage points, or the % symbol anywhere in the resume or cover letter.

Keywords (for later Word bold formatting):
- keywords: array of ~20 important JD/resume terms and phrases to bold — high-signal skills, platforms, and domain terms only. Do not exceed ~22 items. No stuffing.

Cover letter:
- 3–4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis. Professionally mirror the tailored resume and JD.
- Emit coverLetter as the FIRST top-level JSON key so it is never dropped if output is truncated.

Process (internal — do not output these steps):
1. Detect the main role domain from the JD: Backend, Frontend, Full Stack, AI, Data Science, ML, LLM, Mobile, or Hybrid.
2. Extract must-have skills, preferred skills, seniority, domain requirements, ATS keywords, and business/ownership signals.
3. Write the cover letter first, then the resume body.
4. Reposition the candidate's existing background to align with the role.
5. Write a full professional summary (4–6 sentences, ~90–130 words), then rewrite skills and experience for maximum fit.
6. Emphasize the most relevant technologies, systems, and impact in the latest roles.
7. Keep the full resume cohesive and credible from top to bottom.
8. Choose ~20 keywords for bolding (plain strings only).
9. Final quality pass for top-tier, human, ATS-ready writing.

JSON shape (coverLetter MUST come first):
{
  "coverLetter": string,
  "resume": {
    "summary": string,
    "skills": [{ "category": string, "items": string[] }],
    "experiences": [{ "company": string, "title": string, "period": string, "location": string, "overview": string, "bullets": string[] }],
    "education": [{ "school": string, "degree": string, "period": string, "location": string }],
    "keywords": string[]
  }
}`;

export async function generateTailoredPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
  rawJd: string,
): Promise<TailoredPackage> {
  // Keep the JD snippet modest — large prompts + reasoning models are what
  // push free Vercel past its 300s limit.
  const userPayload = JSON.stringify({
    candidate: profile,
    extractedJd: extracted,
    rawJobDescription: rawJd.slice(0, 8000),
  });

  let content = await requestJson([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPayload },
  ]);

  let parsed: TailoredPackage | null = tryParsePackage(content);
  const needsRetry =
    !parsed || !hasUsableResumeShape(parsed, profile.experiences.length);

  if (needsRetry) {
    content = await requestJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
      { role: "assistant", content },
      {
        role: "user",
        content:
          "Your previous reply was invalid. Return ONLY valid JSON matching the required shape. Each experiences item MUST be an object with overview (string) and bullets (string[]), not a string. No markdown, no commentary.",
      },
    ]);
    parsed = tryParsePackage(content);
  }

  if (!parsed) {
    throw new Error("Failed to parse generated resume JSON.");
  }

  const rawResume = extractRawResume(parsed);
  const resume = normalizeResume(rawResume, profile, extracted);
  const coverLetter =
    extractCoverLetter(parsed) ||
    buildFallbackCoverLetter(profile, extracted);

  return { resume, coverLetter };
}

function tryParsePackage(content: string): TailoredPackage | null {
  try {
    return parseModelJson<TailoredPackage>(content);
  } catch {
    return null;
  }
}

function extractRawResume(
  parsed: TailoredPackage,
): TailoredResume | undefined {
  // Models occasionally return resume fields at the top level instead of
  // nested under "resume"; accept both shapes.
  const shaped = parsed as Partial<TailoredPackage> & Partial<TailoredResume>;
  const nestedResume =
    shaped.resume &&
    typeof shaped.resume === "object" &&
    !Array.isArray(shaped.resume)
      ? shaped.resume
      : undefined;
  return (
    nestedResume ??
    (Array.isArray(shaped.experiences) || typeof shaped.summary === "string"
      ? (shaped as unknown as TailoredResume)
      : undefined)
  );
}

function coerceCoverLetterText(value: unknown): string {
  if (typeof value === "string") return sanitizePlainText(value).trim();
  if (Array.isArray(value)) {
    return sanitizePlainText(
      value
        .filter((part) => typeof part === "string")
        .join("\n\n"),
    ).trim();
  }
  return "";
}

/** Accept camelCase, snake_case, or cover letter nested under resume. */
function extractCoverLetter(parsed: TailoredPackage): string {
  const root = parsed as unknown as Record<string, unknown>;
  const nested =
    isPlainObject(root.resume) ? (root.resume as Record<string, unknown>) : null;

  const candidates = [
    root.coverLetter,
    root.cover_letter,
    root.CoverLetter,
    nested?.coverLetter,
    nested?.cover_letter,
  ];

  for (const candidate of candidates) {
    const text = coerceCoverLetterText(candidate);
    if (text) return text;
  }
  return "";
}

function hasUsableResumeShape(
  parsed: TailoredPackage,
  expectedExperienceCount: number,
): boolean {
  const resume = extractRawResume(parsed);
  if (!resume || !Array.isArray(resume.experiences)) return false;

  const objectEntries = resume.experiences.filter(isPlainObject);
  if (objectEntries.length === 0) return false;

  // At least one role should be a real object with bullets.
  const withBullets = objectEntries.filter((exp) =>
    Array.isArray(exp.bullets),
  ).length;
  return withBullets >= Math.min(expectedExperienceCount, 1);
}

async function requestJson(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  return chatJson({
    messages,
    temperature: 0.3,
    maxTokens: 8192,
    emptyError: "Empty response while generating tailored resume.",
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Models sometimes emit string/null experience slots; ignore those. */
function asGeneratedExperience(
  value: unknown,
): { overview?: unknown; bullets?: unknown } | undefined {
  return isPlainObject(value) ? value : undefined;
}

function normalizeSkills(
  skills: unknown,
  extracted: ExtractedJD,
): SkillGroup[] {
  if (Array.isArray(skills) && skills.length) {
    // New grouped format
    if (isPlainObject(skills[0]) && "category" in skills[0]) {
      return (skills as Array<{ category?: unknown; items?: unknown }>)
        .filter(isPlainObject)
        .map((group) => ({
          category: sanitizePlainText(String(group.category || "Skills")),
          items: Array.isArray(group.items)
            ? group.items
                .map(String)
                .map((s) => sanitizePlainText(s))
                .filter(Boolean)
            : [],
        }))
        .filter((group) => group.items.length > 0);
    }

    // Legacy flat string list -> one compact Technical Skills group
    const items = skills
      .filter((s) => typeof s === "string" || typeof s === "number")
      .map(String)
      .map((s) => sanitizePlainText(s))
      .filter(Boolean);
    if (items.length) {
      return [{ category: "Technical Skills", items }];
    }
  }

  const fallback = extracted.hardTechnicalSkills.filter(Boolean);
  if (!fallback.length) {
    return [
      {
        category: "Core",
        items: ["Software Engineering", "System Design", "Agile Delivery"],
      },
    ];
  }

  return [
    {
      category: "Technical Skills",
      items: fallback,
    },
  ];
}

function normalizeResume(
  resume: TailoredResume | undefined,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredResume {
  const safe =
    resume && isPlainObject(resume)
      ? resume
      : {
          summary: "",
          skills: [],
          experiences: [],
          education: [],
          keywords: [],
        };

  const skillGroups = normalizeSkills(safe.skills, extracted);
  const rawExperiences = Array.isArray(safe.experiences) ? safe.experiences : [];

  const modelKeywords = Array.from(
    new Set(
      (Array.isArray(safe.keywords) ? safe.keywords : [])
        .map((k) => String(k).trim())
        .filter(Boolean),
    ),
  );
  const fallbackKeywords = Array.from(
    new Set(
      [
        ...extracted.hardTechnicalSkills,
        ...skillGroups.flatMap((g) => g.items),
        extracted.jobTitle,
        extracted.type,
      ]
        .map((k) => String(k).trim())
        .filter(Boolean),
    ),
  );
  const keywords = (
    modelKeywords.length ? modelKeywords : fallbackKeywords
  ).slice(0, 20);

  const experiences = profile.experiences.map((exp, index) => {
    const generated = asGeneratedExperience(rawExperiences[index]);
    const bulletTarget = targetBulletCount(index);
    let bullets = dedupeBullets(
      (Array.isArray(generated?.bullets) ? generated.bullets : [])
        .map(String)
        .map((b) => sanitizePlainText(b))
        .filter(Boolean),
    );

    let slot = 0;
    while (bullets.length < bulletTarget) {
      bullets = dedupeBullets([
        ...bullets,
        buildFillerBullet(exp.company, extracted.hardTechnicalSkills, slot),
      ]);
      slot += 1;
    }
    bullets = bullets.slice(0, bulletTarget);

    const overview = sanitizePlainText(
      String(typeof generated?.overview === "string" ? generated.overview : ""),
    );

    return {
      company: exp.company,
      title: tailorExperienceTitle(
        exp.title,
        extracted.type,
        extracted.jobTitle,
      ),
      period: exp.period,
      location: exp.location,
      overview:
        overview ||
        `${exp.company} team delivering software products in a ${exp.location.toLowerCase()} setting; served as ${exp.title} owning delivery of key features and technical outcomes aligned to business needs.`,
      bullets,
    };
  });

  const summary = sanitizePlainText(
    String(typeof safe.summary === "string" ? safe.summary : ""),
  );

  return {
    summary: summary || buildFallbackSummary(profile, extracted),
    skills: skillGroups,
    experiences,
    education:
      Array.isArray(safe.education) && safe.education.length
        ? safe.education.filter(isPlainObject).map((edu) => ({
            school: sanitizePlainText(String(edu.school ?? "")),
            degree: sanitizePlainText(String(edu.degree ?? "")),
            period: sanitizePlainText(String(edu.period ?? "")),
            location: sanitizePlainText(String(edu.location ?? "")),
          }))
        : profile.education,
    keywords: keywords.map((k) => sanitizePlainText(k)).filter(Boolean),
  };
}
