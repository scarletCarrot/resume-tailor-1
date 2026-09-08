import { z } from "zod";
import type { TailorRequest } from "./types";

const JOB_TYPES = [
  "AI Engineer",
  "Data Engineer",
  "Software Engineer",
  "Data Analyst",
  "Data Scientist",
] as const;

const WORK_MODES = ["Remote", "Hybrid", "Onsite"] as const;

const extractedJdSchema = z.object({
  company: z.string().min(1),
  jobTitle: z.string().min(1),
  summary: z.string(),
  type: z.enum(JOB_TYPES),
  salaryExpectation: z.string(),
  workMode: z.enum(WORK_MODES),
  hardTechnicalSkills: z.array(z.string()),
  softSkills: z.array(z.string()),
});

const prepareRequestSchema = z
  .object({
    phase: z.literal("prepare"),
    jobUrls: z.array(z.string().min(1)).min(1),
    indices: z.array(z.number().int().positive()).optional(),
    /** Optional pasted JD text per URL; empty/omitted entries still scrape */
    manualJds: z.array(z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.indices && value.indices.length !== value.jobUrls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "indices length must match jobUrls length",
        path: ["indices"],
      });
    }
    if (value.manualJds && value.manualJds.length !== value.jobUrls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manualJds length must match jobUrls length",
        path: ["manualJds"],
      });
    }
    value.jobUrls.forEach((jobUrl, index) => {
      const manualJd = value.manualJds?.[index]?.trim() || "";
      let validUrl = true;
      try {
        new URL(jobUrl);
      } catch {
        validUrl = false;
      }
      if (!validUrl && manualJd.length < 80) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Provide a valid job URL or at least 80 characters of JD text",
          path: ["jobUrls", index],
        });
      }
    });
  });

const preparedJobSchema = z.object({
  index: z.number().int().positive(),
  jobUrl: z.string().min(1),
  rawText: z.string().min(80),
  pageTitle: z.string().default(""),
  extracted: extractedJdSchema,
});

const generateRequestSchema = z.object({
  phase: z.literal("generate"),
  preparedJobs: z.array(preparedJobSchema).min(1),
});

export const tailorRequestSchema = {
  prepare: prepareRequestSchema,
  generate: generateRequestSchema,
};

export function parseTailorRequest(body: unknown): TailorRequest {
  const phase = z
    .object({ phase: z.enum(["prepare", "generate"]) })
    .parse(body).phase;

  if (phase === "prepare") {
    return prepareRequestSchema.parse(body);
  }

  return generateRequestSchema.parse(body);
}
