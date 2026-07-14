import { scoreAtsMatch } from "./ats-score";
import { extractJobDescription } from "./extract";
import { generateTailoredPackage } from "./generate";
import { saveJobPackage } from "./package";
import { scrapeJobDescription } from "./scrape";
import { validateAndFixResume } from "./validate-resume";
import type { JobStep } from "./progress";
import type { CandidateProfile, ExtractedJD, PersonalInfo } from "./types";

export async function processOneJob(options: {
  index: number;
  jobUrl: string;
  profile: CandidateProfile;
  personal: PersonalInfo;
  /** When provided, skip scrape and use this JD text */
  manualJd?: string;
  onStep: (step: JobStep, message: string) => void;
}): Promise<{
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
}> {
  const { index, jobUrl, profile, personal, manualJd, onStep } = options;

  let rawText: string;
  let pageTitle: string;

  const pasted = manualJd?.trim();
  if (pasted && pasted.length >= 80) {
    onStep("scraping", "Using pasted job description (scrape skipped)…");
    rawText = pasted.slice(0, 50000);
    pageTitle = `Manual JD for ${jobUrl}`;
    onStep(
      "fetch_jd",
      `Loaded manual JD (${rawText.length.toLocaleString()} chars)`,
    );
  } else {
    onStep("scraping", "Scraping job page…");
    const scraped = await scrapeJobDescription(jobUrl);
    rawText = scraped.rawText;
    pageTitle = scraped.pageTitle;
    onStep(
      "fetch_jd",
      `Fetched JD (${rawText.length.toLocaleString()} chars)`,
    );
  }

  onStep("extracting", "Extracting structured JD…");
  const extracted = await extractJobDescription(rawText, pageTitle, jobUrl);

  onStep("generating", "Generating resume & cover letter…");
  let tailored = await generateTailoredPackage(profile, extracted, rawText);

  onStep("validating", "Validating resume format and content…");
  let validation = validateAndFixResume(tailored, profile, extracted);

  if (!validation.ok) {
    onStep("validating", "Fixing validation issues and regenerating…");
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
  onStep(
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
