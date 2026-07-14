/** Split text into segments, bolding keyword matches (case-insensitive, longer first). */
export function segmentWithKeywords(
  text: string,
  keywords: string[],
): Array<{ text: string; bold: boolean }> {
  // Safety net: never render markdown bold markers in the final document
  const cleaned = String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "");

  const unique = Array.from(
    new Set(
      keywords
        .map((k) => k.trim())
        .filter((k) => k.length >= 2)
        .sort((a, b) => b.length - a.length),
    ),
  );

  if (!unique.length || !cleaned) {
    return [{ text: cleaned, bold: false }];
  }

  const escaped = unique.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = cleaned.split(pattern);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const isKeyword = unique.some(
        (k) => k.toLowerCase() === part.toLowerCase(),
      );
      return { text: part, bold: isKeyword };
    });
}

export function formatExtractedJd(extracted: {
  company: string;
  jobTitle: string;
  summary: string;
  type: string;
  salaryExpectation: string;
  workMode: string;
  hardTechnicalSkills: string[];
  softSkills: string[];
}): string {
  return [
    `Company: ${extracted.company}`,
    `Job Title: ${extracted.jobTitle}`,
    `Type: ${extracted.type}`,
    `Work Mode: ${extracted.workMode}`,
    `Salary Expectation: ${extracted.salaryExpectation}`,
    "",
    "Summary:",
    extracted.summary,
    "",
    "Hard Technical Skills:",
    ...extracted.hardTechnicalSkills.map((s) => `- ${s}`),
    "",
    "Soft Skills:",
    ...extracted.softSkills.map((s) => `- ${s}`),
  ].join("\n");
}
