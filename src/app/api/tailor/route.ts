import { ZodError } from "zod";
import { createSseJobLog } from "@/lib/job-log";
import { generateOneJob, prepareOneJob } from "@/lib/process-job";
import { CANDIDATE_PROFILE } from "@/lib/profile";
import {
  GENERATE_STEPS,
  PREPARE_STEPS,
  type JobStep,
  type ProgressEvent,
  type TailorPhase,
} from "@/lib/progress";
import { parseTailorRequest } from "@/lib/validate";
import type { TailorRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const HEARTBEAT_MS = 15_000;

function encodeSse(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function createProgressStream(
  phase: TailorPhase,
  run: (send: (event: ProgressEvent) => void) => Promise<void>,
) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", ts: Date.now(), phase });
      }, HEARTBEAT_MS);

      // Immediate ping so proxies see activity before the first long await.
      send({ type: "heartbeat", ts: Date.now(), phase });

      try {
        await run(send);
      } catch (err) {
        send({
          type: "fatal",
          phase,
          error: err instanceof Error ? err.message : "Unexpected error",
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });
}

async function runPreparePhase(
  payload: Extract<TailorRequest, { phase: "prepare" }>,
  send: (event: ProgressEvent) => void,
) {
  const outcomes = await Promise.all(
    payload.jobUrls.map(async (jobUrl, i) => {
      const index = payload.indices?.[i] ?? i + 1;
      let currentStep: JobStep = PREPARE_STEPS[0];
      const log = createSseJobLog({
        index,
        jobUrl,
        send: (event) => {
          if (event.type === "step") currentStep = event.step;
          send(event);
        },
      });

      try {
        const prepared = await prepareOneJob({
          index,
          jobUrl,
          manualJd: payload.manualJds?.[i],
          log,
        });

        send({
          type: "prepare_done",
          index: prepared.index,
          jobUrl: prepared.jobUrl,
          rawText: prepared.rawText,
          pageTitle: prepared.pageTitle,
          extracted: prepared.extracted,
        });

        return { ok: true as const };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error for this job.";
        log.error(message);
        send({
          type: "job_error",
          index,
          jobUrl,
          step: currentStep,
          error: message,
          phase: "prepare",
        });
        return { ok: false as const };
      }
    }),
  );

  const succeeded = outcomes.filter((o) => o.ok).length;
  send({
    type: "done",
    phase: "prepare",
    succeeded,
    failed: outcomes.length - succeeded,
  });
}

async function runGeneratePhase(
  payload: Extract<TailorRequest, { phase: "generate" }>,
  send: (event: ProgressEvent) => void,
) {
  const profile = CANDIDATE_PROFILE;

  const outcomes = await Promise.all(
    payload.preparedJobs.map(async (job) => {
      let currentStep: JobStep = GENERATE_STEPS[0];
      const log = createSseJobLog({
        index: job.index,
        jobUrl: job.jobUrl,
        send: (event) => {
          if (event.type === "step") currentStep = event.step;
          send(event);
        },
      });

      try {
        const result = await generateOneJob({
          index: job.index,
          jobUrl: job.jobUrl,
          profile,
          personal: profile.personal,
          rawText: job.rawText,
          extracted: job.extracted,
          log,
        });

        send({
          type: "job_done",
          index: result.index,
          jobUrl: result.jobUrl,
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
          err instanceof Error ? err.message : "Unknown error for this job.";
        log.error(message);
        send({
          type: "job_error",
          index: job.index,
          jobUrl: job.jobUrl,
          step: currentStep,
          error: message,
          phase: "generate",
        });
        return { ok: false as const };
      }
    }),
  );

  const succeeded = outcomes.filter((o) => o.ok).length;
  send({
    type: "done",
    phase: "generate",
    succeeded,
    failed: outcomes.length - succeeded,
  });
}

export async function POST(request: Request) {
  let payload: TailorRequest;
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

  const stream = createProgressStream(payload.phase, async (send) => {
    if (payload.phase === "prepare") {
      await runPreparePhase(payload, send);
    } else {
      await runGeneratePhase(payload, send);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
