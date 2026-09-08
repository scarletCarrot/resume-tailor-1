import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { tailorExperienceTitle } from "./job-title";
import { getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";
import {
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

Process (internal — do not output these steps):
1. Detect the main role domain from the JD: Backend, Frontend, Full Stack, AI, Data Science, ML, LLM, Mobile, or Hybrid.
2. Extract must-have skills, preferred skills, seniority, domain requirements, ATS keywords, and business/ownership signals.
3. Reposition the candidate's existing background to align with the role.
4. Rewrite summary, skills, and experience for maximum fit.
5. Emphasize the most relevant technologies, systems, and impact in the latest roles.
6. Keep the full resume cohesive and credible from top to bottom.
7. Choose ~20 keywords for bolding (plain strings only).
8. Final quality pass for top-tier, human, ATS-ready writing.

JSON shape:
{
  "resume": {
    "summary": string,
    "skills": [{ "category": string, "items": string[] }],
    "experiences": [{ "company": string, "title": string, "period": string, "location": string, "overview": string, "bullets": string[] }],
    "education": [{ "school": string, "degree": string, "period": string, "location": string }],
    "keywords": string[]
  },
  "coverLetter": string
}`;

export async function generateTailoredPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
  rawJd: string,
): Promise<TailoredPackage> {
  const client = getLlmClient();
  const model = getLlmModel();
  const userPayload = JSON.stringify({
    candidate: profile,
    extractedJd: extracted,
    rawJobDescription: rawJd.slice(0, 12000),
  });

  let content = await requestJson(client, model, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPayload },
  ]);

  let parsed: TailoredPackage;
  try {
    parsed = parseModelJson<TailoredPackage>(content);
  } catch (firstError) {
    content = await requestJson(client, model, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
      { role: "assistant", content },
      {
        role: "user",
        content:
          "Your previous reply was invalid JSON. Return ONLY repaired valid JSON for the same request. No markdown, no commentary.",
      },
    ]);
    try {
      parsed = parseModelJson<TailoredPackage>(content);
    } catch {
      throw firstError instanceof Error
        ? firstError
        : new Error("Failed to parse generated resume JSON.");
    }
  }

  // Models occasionally return resume fields at the top level instead of
  // nested under "resume"; accept both shapes.
  const shaped = parsed as Partial<TailoredPackage> & Partial<TailoredResume>;
  const rawResume =
    shaped.resume ??
    (Array.isArray(shaped.experiences) || shaped.summary
      ? (shaped as unknown as TailoredResume)
      : undefined);

  const resume = normalizeResume(rawResume, profile, extracted);
  const coverLetter = String(parsed.coverLetter || "").trim();

  if (!coverLetter) {
    throw new Error("Cover letter generation failed.");
  }

  return { resume, coverLetter };
}

async function requestJson(
  client: ReturnType<typeof getLlmClient>,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("Empty response while generating tailored resume.");
  }
  return content;
}

function normalizeSkills(
  skills: unknown,
  extracted: ExtractedJD,
): SkillGroup[] {
  if (Array.isArray(skills) && skills.length) {
    // New grouped format
    if (
      typeof skills[0] === "object" &&
      skills[0] !== null &&
      "category" in (skills[0] as object)
    ) {
      return (skills as Array<{ category?: unknown; items?: unknown }>)
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
  const safe = resume || {
    summary: "",
    skills: [],
    experiences: [],
    education: [],
    keywords: [],
  };

  const skillGroups = normalizeSkills(safe.skills, extracted);

  const modelKeywords = Array.from(
    new Set(
      (safe.keywords || [])
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
    const generated = safe.experiences?.[index];
    const bulletTarget = targetBulletCount(index);
    let bullets = dedupeBullets(
      (generated?.bullets || [])
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
      String(
        generated && "overview" in generated
          ? (generated as { overview?: string }).overview || ""
          : "",
      ),
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

  const summary = sanitizePlainText(String(safe.summary || ""));

  return {
    summary: summary || buildFallbackSummary(profile, extracted),
    skills: skillGroups,
    experiences,
    education:
      Array.isArray(safe.education) && safe.education.length
        ? safe.education.map((edu) => ({
            school: sanitizePlainText(edu.school),
            degree: sanitizePlainText(edu.degree),
            period: sanitizePlainText(edu.period),
            location: sanitizePlainText(edu.location),
          }))
        : profile.education,
    keywords: keywords.map((k) => sanitizePlainText(k)).filter(Boolean),
  };
}
