import type { JobStep, ProgressEvent } from "./progress";

export type JobLogLevel = "info" | "warn" | "error";

/**
 * Thin helper so prepare/generate steps and diagnostic logs share one SSE sender.
 */
export function createSseJobLog(options: {
  index: number;
  jobUrl: string;
  send: (event: ProgressEvent) => void;
}) {
  const { index, jobUrl, send } = options;

  return {
    step(step: JobStep, message: string) {
      send({
        type: "step",
        index,
        jobUrl,
        step,
        message,
      });
    },
    info(message: string) {
      send({
        type: "log",
        index,
        jobUrl,
        level: "info",
        message,
      });
    },
    warn(message: string) {
      send({
        type: "log",
        index,
        jobUrl,
        level: "warn",
        message,
      });
    },
    error(message: string) {
      send({
        type: "log",
        index,
        jobUrl,
        level: "error",
        message,
      });
    },
  };
}

export type JobLogger = ReturnType<typeof createSseJobLog>;
