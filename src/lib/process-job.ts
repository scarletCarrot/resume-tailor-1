import { scoreAtsMatch } from "./ats-score";
import { extractJobDescription } from "./extract";
import { generateTailoredPackage } from "./generate";
import type { JobLogger } from "./job-log";
import { saveJobPackage } from "./package";
import { scrapeJobDescription } from "./scrape";
import { validateAndFixResume } from "./validate-resume";
import type { CandidateProfile, ExtractedJD, PersonalInfo } from "./types";

export type PreparedJob = {
  index: number;
  jobUrl: string;
  rawText: string;
  pageTitle: string;
  extracted: ExtractedJD;
};

export type GeneratedJobResult = {
  index: number;
  jobUrl: string;
  company: string;
  zipName: string;
  folderName: string;
  resumeDocxName: string;
  resumePdfName: string;
  coverLetterDocxName: string;
  downloads: {
    zipBase64: string;
    resumeDocxBase64: string;
    coverLetterDocxBase64: string;
  };
  extracted: ExtractedJD;
  atsScore: number;
  atsSummary: string;
};

/** Phase 1: fetch (or accept pasted JD) and extract structured fields. */
export async function prepareOneJob(options: {
  index: number;
  jobUrl: string;
  manualJd?: string;
  log: JobLogger;
}): Promise<PreparedJob> {
  const { index, jobUrl, manualJd, log } = options;

  let rawText: string;
  let pageTitle: string;

  const pasted = manualJd?.trim();
  if (pasted && pasted.length >= 80) {
    log.step("scraping", "Using pasted job description (scrape skipped)…");
    rawText = pasted.slice(0, 50000);
    pageTitle = `Manual JD for ${jobUrl}`;
    log.step(
      "fetch_jd",
      `Loaded manual JD (${rawText.length.toLocaleString()} chars)`,
    );
  } else {
    log.step("scraping", "Scraping job page…");
    const scraped = await scrapeJobDescription(jobUrl);
    rawText = scraped.rawText;
    pageTitle = scraped.pageTitle;
    log.step(
      "fetch_jd",
      `Fetched JD (${rawText.length.toLocaleString()} chars)`,
    );
  }

  log.step("extracting", "Extracting structured JD…");
  const extracted = await extractJobDescription(rawText, pageTitle, jobUrl);
  log.info(
    `Prepared ${extracted.company} · ${extracted.jobTitle} (${extracted.type})`,
  );

  return {
    index,
    jobUrl,
    rawText,
    pageTitle,
    extracted,
  };
}

/** Phase 2: generate resume/cover letter, validate, score ATS, and package. */
export async function generateOneJob(options: {
  index: number;
  jobUrl: string;
  profile: CandidateProfile;
  personal: PersonalInfo;
  rawText: string;
  extracted: ExtractedJD;
  log: JobLogger;
}): Promise<GeneratedJobResult> {
  const { index, jobUrl, profile, personal, rawText, extracted, log } = options;

  log.step("generating", "Generating resume & cover letter…");
  let tailored = await generateTailoredPackage(profile, extracted, rawText);

  log.step("validating", "Validating resume format and content…");
  let validation = validateAndFixResume(tailored, profile, extracted);

  if (!validation.ok) {
    log.warn("Validation failed; regenerating once…");
    log.step("validating", "Fixing validation issues and regenerating…");
    tailored = await generateTailoredPackage(profile, extracted, rawText);
    validation = validateAndFixResume(tailored, profile, extracted);
  }

  tailored = validation.package;

  if (!validation.ok) {
    const critical = validation.issues
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .join("; ");
    throw new Error(
      critical || "Resume failed validation after formatting fixes.",
    );
  }

  const fixedCount = validation.issues.filter((i) => i.level === "fixed").length;
  const ats = scoreAtsMatch(tailored.resume, extracted, rawText);
  log.step(
    "zipping",
    `Validated${fixedCount ? ` (${fixedCount} fixes)` : ""} · ATS ${ats.score}/100 · packaging…`,
  );

  const saved = await saveJobPackage({
    index,
    jobUrl,
    rawJd: rawText,
    extracted,
    personal,
    tailored,
  });

  log.info(`Packaged ${saved.zipName} · ATS ${ats.score}/100`);

  return {
    index,
    jobUrl,
    company: saved.company,
    zipName: saved.zipName,
    folderName: saved.folderName,
    resumeDocxName: saved.resumeDocxName,
    resumePdfName: saved.resumePdfName,
    coverLetterDocxName: saved.coverLetterDocxName,
    downloads: saved.downloads,
    extracted,
    atsScore: ats.score,
    atsSummary: `ATS score ${ats.score}/100`,
  };
}
