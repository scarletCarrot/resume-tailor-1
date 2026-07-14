import type { ExtractedJD, JobType, WorkMode } from "./types";
import { getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";

const JOB_TYPES: JobType[] = [
  "AI Engineer",
  "Data Engineer",
  "Software Engineer",
  "Data Analyst",
  "Data Scientist",
];

function normalizeType(value: string): JobType {
  const match = JOB_TYPES.find(
    (t) => t.toLowerCase() === value.toLowerCase().trim(),
  );
  if (match) return match;

  const lower = value.toLowerCase();
  if (lower.includes("ai") || lower.includes("ml") || lower.includes("llm")) {
    return "AI Engineer";
  }
  if (lower.includes("data engineer") || lower.includes("etl")) {
    return "Data Engineer";
  }
  if (lower.includes("analyst")) return "Data Analyst";
  if (lower.includes("scientist")) return "Data Scientist";
  return "Software Engineer";
}

function normalizeWorkMode(value: string): WorkMode {
  const lower = value.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  return "Onsite";
}

export async function extractJobDescription(
  rawJd: string,
  pageTitle: string,
  jobUrl: string,
): Promise<ExtractedJD> {
  const client = getLlmClient();

  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract structured hiring information from job postings.
Return ONLY valid JSON (no markdown) with keys:
- company (string)
- jobTitle (string)
- summary (2-4 sentence overview of the role and responsibilities)
- type (exactly one of: "AI Engineer", "Data Engineer", "Software Engineer", "Data Analyst", "Data Scientist")
- salaryExpectation (string; use "Not specified" if unknown)
- workMode (exactly one of: "Remote", "Hybrid", "Onsite")
- hardTechnicalSkills (string array of concrete technologies/tools/domains)
- softSkills (string array)

Infer company from the page title or URL when missing. Prefer specific skill names.
Escape quotes inside strings.`,
      },
      {
        role: "user",
        content: `Job URL: ${jobUrl}
Page title: ${pageTitle}

Job posting text:
${rawJd.slice(0, 20000)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response while extracting job description.");
  }

  const parsed = parseModelJson<
    Partial<ExtractedJD> & {
      hardTechnicalSkills?: unknown;
      softSkills?: unknown;
    }
  >(content);

  return {
    company: String(parsed.company || "Unknown Company").trim(),
    jobTitle: String(parsed.jobTitle || "Software Engineer").trim(),
    summary: String(parsed.summary || "").trim(),
    type: normalizeType(String(parsed.type || "Software Engineer")),
    salaryExpectation: String(
      parsed.salaryExpectation || "Not specified",
    ).trim(),
    workMode: normalizeWorkMode(String(parsed.workMode || "Onsite")),
    hardTechnicalSkills: Array.isArray(parsed.hardTechnicalSkills)
      ? parsed.hardTechnicalSkills.map(String).filter(Boolean)
      : [],
    softSkills: Array.isArray(parsed.softSkills)
      ? parsed.softSkills.map(String).filter(Boolean)
      : [],
  };
}
