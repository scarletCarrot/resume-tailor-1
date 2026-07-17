import type { JobType } from "./types";

/** Align an experience title with the JD family and target seniority. */
export function tailorExperienceTitle(
  originalTitle: string,
  jobType: JobType,
  targetJobTitle: string,
): string {
  if (!/\bsenior\b/i.test(originalTitle)) return jobType;

  const seniority = /\blead\b/i.test(targetJobTitle) ? "Lead" : "Senior";
  return `${seniority} ${jobType}`;
}
