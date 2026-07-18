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
} from "./validate-resume";

const SYSTEM_PROMPT = `You are an expert ATS resume writer and career coach.
Create a tailored resume and cover letter that maximize ATS keyword match for the target role.

Hard rules:
1. Resume sections: Summary, Skills, Experience, Education.
2. Skills MUST be classified into compact groups (not one skill per line). Use 4-6 groups such as:
   Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI, Databases, Tools/Practices.
   Each group has a short category name and 4-10 comma-ready item strings.
3. Each experience MUST include:
   - overview: 1-2 sentences (about 25-45 words) describing what the company does and the candidate's core responsibility in that role, tailored toward the target JD.
   - exactly 7 bullet points of accomplishments.
4. Each bullet must be professional and specific (~25-40 words). Describe concrete work done.
5. Use concrete absolute measures where appropriate (counts, scale, volume, latency, users, datasets, or dollars). NEVER use percentages, percentage points, or the % symbol anywhere in the resume or cover letter.
6. Include slightly MORE relevant experience breadth than the JD strictly requires.
7. Mirror JD terminology and hard skills heavily for ATS scoring.
8. keywords: array of important JD keywords/phrases that should be bolded.
9. Cover letter: 3-4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis.
10. Keep the candidate's company names, periods, locations, and education exactly as given. Align every experience title to the extracted JD type. Use only Software Engineer, Data Engineer, Data Analyst, Data Scientist, or AI Engineer as the title family. The candidate's most recent senior role must use "Lead" when the JD title is a Lead role; otherwise use "Senior".
11. Do not invent employers or schools. Invent realistic overviews and accomplishment bullets grounded in the companies and JD.
12. Return ONLY valid compact JSON. Escape all double quotes inside strings. Do not wrap in markdown.
13. NEVER use markdown in any string (**bold**, *italic*, backticks, headings). Plain text only. Keyword bolding is applied later by the document formatter.

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

  const keywords = Array.from(
    new Set(
      [
        ...(safe.keywords || []),
        ...skillGroups.flatMap((g) => g.items),
        ...extracted.hardTechnicalSkills,
        ...extracted.softSkills,
        extracted.jobTitle,
        extracted.type,
        extracted.workMode,
      ]
        .map((k) => String(k).trim())
        .filter(Boolean),
    ),
  );

  const experiences = profile.experiences.map((exp, index) => {
    const generated = safe.experiences?.[index];
    let bullets = dedupeBullets(
      (generated?.bullets || [])
        .map(String)
        .map((b) => sanitizePlainText(b))
        .filter(Boolean),
    );

    let slot = 0;
    while (bullets.length < 7) {
      bullets = dedupeBullets([
        ...bullets,
        buildFillerBullet(exp.company, extracted.hardTechnicalSkills, slot),
      ]);
      slot += 1;
    }
    bullets = bullets.slice(0, 8);

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
