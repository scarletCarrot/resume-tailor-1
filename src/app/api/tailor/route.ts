import { ZodError } from "zod";
import { processOneJob } from "@/lib/process-job";
import { CANDIDATE_PROFILE } from "@/lib/profile";
import { JOB_STEPS, type JobStep, type ProgressEvent } from "@/lib/progress";
import { parseTailorRequest } from "@/lib/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

function encodeSse(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  let payload;
  try {
    const body = await request.json();
    payload = parseTailorRequest(body);
  } catch (err) {
    const message =
      err instanceof ZodError
        ? "Invalid request"
        : err instanceof Error
          ? err.message
          : "Invalid request";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = CANDIDATE_PROFILE;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      try {
        const outcomes = await Promise.all(
          payload.jobUrls.map(async (jobUrl, i) => {
            const index = payload.indices?.[i] ?? i + 1;
            let currentStep: JobStep = JOB_STEPS[0];

            try {
              const result = await processOneJob({
                index,
                jobUrl,
                profile,
                personal: profile.personal,
                manualJd: payload.manualJds?.[i],
                onStep: (step, message) => {
                  currentStep = step;
                  send({
                    type: "step",
                    index,
                    jobUrl,
                    step,
                    message,
                  });
                },
              });

              send({
                type: "job_done",
                index,
                jobUrl,
                company: result.company,
                zipName: result.zipName,
                folderName: result.folderName,
                resumeDocxName: result.resumeDocxName,
                resumePdfName: result.resumePdfName,
                coverLetterDocxName: result.coverLetterDocxName,
                downloads: result.downloads,
                atsScore: result.atsScore,
                atsSummary: result.atsSummary,
                extracted: result.extracted,
              });

              return { ok: true as const };
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Unknown error for this job.";
              send({
                type: "job_error",
                index,
                jobUrl,
                step: currentStep,
                error: message,
              });
              return { ok: false as const };
            }
          }),
        );

        const succeeded = outcomes.filter((o) => o.ok).length;
        send({
          type: "done",
          succeeded,
          failed: outcomes.length - succeeded,
        });
      } catch (err) {
        send({
          type: "fatal",
          error: err instanceof Error ? err.message : "Unexpected error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
