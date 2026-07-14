export const JOB_STEPS = [
  "scraping",
  "fetch_jd",
  "extracting",
  "generating",
  "validating",
  "zipping",
] as const;

export type JobStep = (typeof JOB_STEPS)[number];

export const JOB_STEP_LABELS: Record<JobStep, string> = {
  scraping: "Scraping job page",
  fetch_jd: "Fetching job description",
  extracting: "Extracting JD",
  generating: "Generating resume",
  validating: "Validating content",
  zipping: "Zipping package",
};

export type ProgressEvent =
  | {
      type: "step";
      index: number;
      jobUrl: string;
      step: JobStep;
      message: string;
    }
  | {
      type: "job_done";
      index: number;
      jobUrl: string;
      company: string;
      zipName: string;
      folderName: string;
      resumeDocxName: string;
      resumePdfName: string;
      coverLetterDocxName: string;
      atsScore: number;
      atsSummary: string;
      /** Base64 payloads so downloads work when the server FS is ephemeral (Vercel). */
      downloads: {
        zipBase64: string;
        resumeDocxBase64: string;
        coverLetterDocxBase64: string;
      };
      extracted: {
        company: string;
        jobTitle: string;
        summary: string;
        type: string;
        salaryExpectation: string;
        workMode: string;
        hardTechnicalSkills: string[];
        softSkills: string[];
      };
    }
  | {
      type: "job_error";
      index: number;
      jobUrl: string;
      step?: JobStep;
      error: string;
    }
  | {
      type: "done";
      succeeded: number;
      failed: number;
    }
  | {
      type: "fatal";
      error: string;
    };
