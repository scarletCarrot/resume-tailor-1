import type { ExtractedJD, TailoredResume } from "./types";

export interface AtsScoreResult {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  hardSkillMatchRate: number;
  softSkillMatchRate: number;
  summary: string;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned || cleaned.length < 2) continue;
    const key = normalizeToken(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function resumeCorpus(resume: TailoredResume): string {
  const parts = [
    resume.summary,
    ...resume.skills.flatMap((g) => [g.category, ...g.items]),
    ...resume.experiences.flatMap((exp) => [
      exp.title,
      exp.company,
      exp.overview,
      ...exp.bullets,
    ]),
    ...resume.education.flatMap((edu) => [edu.degree, edu.school]),
    ...resume.keywords,
  ];
  return normalizeToken(parts.join("\n"));
}

function keywordPresent(corpus: string, keyword: string): boolean {
  const needle = normalizeToken(keyword);
  if (!needle) return false;
  if (corpus.includes(needle)) return true;

  // Allow partial match for multi-word terms if all tokens appear
  const tokens = needle.split(" ").filter((t) => t.length > 2);
  if (tokens.length > 1) {
    return tokens.every((token) => corpus.includes(token));
  }
  return false;
}

function matchRate(corpus: string, keywords: string[]): number {
  if (!keywords.length) return 1;
  const hits = keywords.filter((k) => keywordPresent(corpus, k)).length;
  return hits / keywords.length;
}

export function scoreAtsMatch(
  resume: TailoredResume,
  extracted: ExtractedJD,
  rawJd: string,
): AtsScoreResult {
  const corpus = resumeCorpus(resume);
  const hardSkills = uniqueKeywords(extracted.hardTechnicalSkills);
  const softSkills = uniqueKeywords(extracted.softSkills);
  const titleTerms = uniqueKeywords(
    [extracted.jobTitle, extracted.type].flatMap((v) =>
      v.split(/[|/,—,-]/).map((part) => part.trim()),
    ),
  );

  const jdTerms = uniqueKeywords(
    normalizeToken(rawJd)
      .split(/[^a-z0-9+#.\-/]+/)
      .filter((t) => t.length >= 4)
      .slice(0, 80),
  );

  // Prioritize extracted skills; use a small JD term set as supporting signal
  const primaryKeywords = uniqueKeywords([
    ...hardSkills,
    ...softSkills,
    ...titleTerms,
    ...resume.keywords.slice(0, 25),
  ]);

  const secondaryKeywords = jdTerms
    .filter((term) => !primaryKeywords.some((p) => normalizeToken(p) === normalizeToken(term)))
    .slice(0, 20);

  const matchedPrimary = primaryKeywords.filter((k) =>
    keywordPresent(corpus, k),
  );
  const missingPrimary = primaryKeywords.filter(
    (k) => !keywordPresent(corpus, k),
  );
  const matchedSecondary = secondaryKeywords.filter((k) =>
    keywordPresent(corpus, k),
  );

  const hardSkillMatchRate = matchRate(corpus, hardSkills);
  const softSkillMatchRate = matchRate(corpus, softSkills);
  const titleMatchRate = matchRate(corpus, titleTerms);
  const primaryMatchRate = primaryKeywords.length
    ? matchedPrimary.length / primaryKeywords.length
    : 0.7;
  const secondaryMatchRate = secondaryKeywords.length
    ? matchedSecondary.length / secondaryKeywords.length
    : 0.7;

  // Weighted blend oriented toward hard technical match for ATS
  const weighted =
    hardSkillMatchRate * 0.45 +
    primaryMatchRate * 0.25 +
    softSkillMatchRate * 0.1 +
    titleMatchRate * 0.1 +
    secondaryMatchRate * 0.1;

  const score = Math.max(
    55,
    Math.min(99, Math.round(weighted * 100)),
  );

  const matchedKeywords = uniqueKeywords([
    ...matchedPrimary,
    ...matchedSecondary.slice(0, 10),
  ]).slice(0, 40);

  const missingKeywords = missingPrimary.slice(0, 20);

  return {
    score,
    matchedKeywords,
    missingKeywords,
    hardSkillMatchRate,
    softSkillMatchRate,
    summary: `ATS score ${score}/100 · hard skills ${Math.round(hardSkillMatchRate * 100)}% · soft skills ${Math.round(softSkillMatchRate * 100)}%`,
  };
}

export function formatAtsScore(result: AtsScoreResult): string {
  return [
    `ATS Score: ${result.score}/100`,
    `Hard skill match: ${Math.round(result.hardSkillMatchRate * 100)}%`,
    `Soft skill match: ${Math.round(result.softSkillMatchRate * 100)}%`,
    "",
    "Matched keywords:",
    ...result.matchedKeywords.map((k) => `- ${k}`),
    "",
    "Missing / weak keywords:",
    ...(result.missingKeywords.length
      ? result.missingKeywords.map((k) => `- ${k}`)
      : ["- None detected"]),
  ].join("\n");
}
