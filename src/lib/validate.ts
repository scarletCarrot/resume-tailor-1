import { z } from "zod";

export const tailorRequestSchema = z
  .object({
    jobUrls: z.array(z.string().url()).min(1),
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
  });

export function parseTailorRequest(body: unknown): {
  jobUrls: string[];
  indices?: number[];
  manualJds?: string[];
} {
  return tailorRequestSchema.parse(body);
}
