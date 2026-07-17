"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  JOB_STEPS,
  JOB_STEP_LABELS,
  type JobStep,
  type ProgressEvent,
} from "@/lib/progress";

type StepStatus = "pending" | "active" | "done" | "error";
type InputMode = "urls" | "manual";

type JobDownloads = {
  resumeDocxUrl: string;
  coverLetterDocxUrl: string;
  zipUrl: string;
};

type JobProgress = {
  index: number;
  jobUrl: string;
  status: "queued" | "running" | "done" | "error";
  currentStep: JobStep | null;
  stepStatuses: Record<JobStep, StepStatus>;
  stepMessage: string;
  company?: string;
  zipName?: string;
  folderName?: string;
  resumeDocxName?: string;
  resumePdfName?: string;
  coverLetterDocxName?: string;
  downloads?: JobDownloads;
  jobTitle?: string;
  atsScore?: number;
  error?: string;
};

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function base64ToObjectUrl(base64: string, mime: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function downloadsFromEvent(
  data: Extract<ProgressEvent, { type: "job_done" }>,
): JobDownloads {
  return {
    resumeDocxUrl: base64ToObjectUrl(data.downloads.resumeDocxBase64, DOCX_MIME),
    coverLetterDocxUrl: base64ToObjectUrl(
      data.downloads.coverLetterDocxBase64,
      DOCX_MIME,
    ),
    zipUrl: base64ToObjectUrl(data.downloads.zipBase64, "application/zip"),
  };
}

const STEP_SHORT: Record<JobStep, string> = {
  scraping: "Scrape",
  fetch_jd: "Fetch",
  extracting: "Extract",
  generating: "Generate",
  validating: "Validate",
  zipping: "Zip",
};

function initialStepStatuses(): Record<JobStep, StepStatus> {
  return {
    scraping: "pending",
    fetch_jd: "pending",
    extracting: "pending",
    generating: "pending",
    validating: "pending",
    zipping: "pending",
  };
}

function createJobProgress(index: number, jobUrl: string): JobProgress {
  return {
    index,
    jobUrl,
    status: "queued",
    currentStep: null,
    stepStatuses: initialStepStatuses(),
    stepMessage: "Queued",
  };
}

function markStepProgress(
  job: JobProgress,
  step: JobStep,
  message: string,
): JobProgress {
  const stepStatuses = { ...job.stepStatuses };
  const stepIndex = JOB_STEPS.indexOf(step);

  for (let i = 0; i < JOB_STEPS.length; i++) {
    const key = JOB_STEPS[i];
    if (i < stepIndex) stepStatuses[key] = "done";
    else if (i === stepIndex) stepStatuses[key] = "active";
    else if (stepStatuses[key] === "active") stepStatuses[key] = "pending";
  }

  return {
    ...job,
    status: "running",
    currentStep: step,
    stepStatuses,
    stepMessage: message,
    error: undefined,
  };
}

function markJobDone(
  job: JobProgress,
  data: Extract<ProgressEvent, { type: "job_done" }>,
): JobProgress {
  const stepStatuses = { ...job.stepStatuses };
  for (const step of JOB_STEPS) stepStatuses[step] = "done";

  if (job.downloads) {
    URL.revokeObjectURL(job.downloads.resumeDocxUrl);
    URL.revokeObjectURL(job.downloads.coverLetterDocxUrl);
    URL.revokeObjectURL(job.downloads.zipUrl);
  }

  return {
    ...job,
    status: "done",
    currentStep: null,
    stepStatuses,
    stepMessage: "Complete",
    company: data.company,
    zipName: data.zipName,
    folderName: data.folderName,
    resumeDocxName: data.resumeDocxName,
    resumePdfName: data.resumePdfName,
    coverLetterDocxName: data.coverLetterDocxName,
    downloads: downloadsFromEvent(data),
    jobTitle: data.extracted.jobTitle,
    atsScore: data.atsScore,
    error: undefined,
  };
}

function markJobError(
  job: JobProgress,
  data: Extract<ProgressEvent, { type: "job_error" }>,
): JobProgress {
  const stepStatuses = { ...job.stepStatuses };
  if (data.step) stepStatuses[data.step] = "error";

  return {
    ...job,
    status: "error",
    currentStep: data.step ?? job.currentStep,
    stepStatuses,
    stepMessage: data.error,
    error: data.error,
  };
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4v6h6M20 20v-6h-6M5.5 9A7 7 0 0119 8m-.5 7A7 7 0 015 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: JobProgress["status"] }) {
  const label =
    status === "queued"
      ? "Queued"
      : status === "running"
        ? "Running"
        : status === "done"
          ? "Done"
          : "Failed";
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export default function ResumeForm() {
  const [inputMode, setInputMode] = useState<InputMode>("urls");
  const [jobLinks, setJobLinks] = useState("");
  const [manualJobDescription, setManualJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryingIndices, setRetryingIndices] = useState<Record<number, true>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [manualJds, setManualJds] = useState<Record<number, string>>({});

  const linkCount = useMemo(
    () =>
      jobLinks
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean).length,
    [jobLinks],
  );

  const summary = useMemo(() => {
    const done = jobs.filter((j) => j.status === "done").length;
    const failed = jobs.filter((j) => j.status === "error").length;
    const running = jobs.filter((j) => j.status === "running").length;
    return { done, failed, running, total: jobs.length };
  }, [jobs]);

  function patchJob(index: number, updater: (job: JobProgress) => JobProgress) {
    setJobs((prev) =>
      prev.map((job) => (job.index === index ? updater(job) : job)),
    );
  }

  function setManualJd(index: number, value: string) {
    setManualJds((prev) => ({ ...prev, [index]: value }));
  }

  async function runJobs(
    targets: Array<{ url: string; index: number; manualJd?: string }>,
    mode: "batch" | "retry",
  ) {
    setError(null);
    const retryIndex = mode === "retry" ? targets[0]?.index : null;

    if (mode === "batch") {
      setJobs(targets.map((t) => createJobProgress(t.index, t.url)));
      setManualJds(
        Object.fromEntries(
          targets
            .filter((target) => target.manualJd)
            .map((target) => [target.index, target.manualJd!]),
        ),
      );
      setRetryingIndices({});
      setLoading(true);
      setStatus(
        `Running ${targets.length} job${targets.length > 1 ? "s" : ""} in parallel`,
      );
    } else {
      const target = targets[0];
      setRetryingIndices((prev) => ({ ...prev, [target.index]: true }));
      patchJob(target.index, () => createJobProgress(target.index, target.url));
      setStatus(
        target.manualJd?.trim()
          ? `Retrying job ${target.index} with pasted JD…`
          : `Retrying job ${target.index}…`,
      );
    }

    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobUrls: targets.map((t) => t.url),
          indices: targets.map((t) => t.index),
          manualJds: targets.map((t) => t.manualJd || ""),
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to start processing.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((entry) => entry.startsWith("data: "));
          if (!line) continue;

          const event = JSON.parse(line.slice(6)) as ProgressEvent;

          if (event.type === "step") {
            patchJob(event.index, (job) =>
              markStepProgress(job, event.step, event.message),
            );
          } else if (event.type === "job_done") {
            patchJob(event.index, (job) => markJobDone(job, event));
          } else if (event.type === "job_error") {
            patchJob(event.index, (job) => markJobError(job, event));
          } else if (event.type === "done") {
            setStatus(
              mode === "retry"
                ? event.succeeded
                  ? `Retry finished · job succeeded`
                  : `Retry finished · job failed`
                : `Finished · ${event.succeeded} succeeded${
                    event.failed ? ` · ${event.failed} failed` : ""
                  }`,
            );
          } else if (event.type === "fatal") {
            setError(event.error);
            setStatus(null);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatus(null);
    } finally {
      if (mode === "batch") {
        setLoading(false);
      } else if (retryIndex != null) {
        setRetryingIndices((prev) => {
          const next = { ...prev };
          delete next[retryIndex];
          return next;
        });
      }
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (inputMode === "manual") {
      const pasted = manualJobDescription.trim();
      if (pasted.length < 80) {
        setError("Paste at least 80 characters of the job description.");
        return;
      }

      await runJobs(
        [{ url: "Pasted job description", index: 1, manualJd: pasted }],
        "batch",
      );
      return;
    }

    const jobUrls = jobLinks
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!jobUrls.length) {
      setError("Add at least one job URL.");
      return;
    }

    await runJobs(
      jobUrls.map((url, i) => ({ url, index: i + 1 })),
      "batch",
    );
  }

  async function onRetry(job: JobProgress, useManualJd: boolean) {
    // Allow paste/retry while other jobs are still running; only block this job.
    if (retryingIndices[job.index] || job.status === "running") return;
    const pasted = (manualJds[job.index] || "").trim();
    if (useManualJd && pasted.length < 80) {
      setError(
        `Job ${job.index}: paste at least ~80 characters of the job description before generating.`,
      );
      return;
    }
    await runJobs(
      [
        {
          url: job.jobUrl,
          index: job.index,
          manualJd: useManualJd ? pasted : undefined,
        },
      ],
      "retry",
    );
  }

  const hasActiveRetries = Object.keys(retryingIndices).length > 0;
  const busy = loading || hasActiveRetries;
  const completedDownloads = jobs.filter(
    (job) => job.status === "done" && job.downloads && job.zipName,
  );

  function downloadAllZips() {
    for (const job of completedDownloads) {
      const link = document.createElement("a");
      link.href = job.downloads!.zipUrl;
      link.download = job.zipName!;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  return (
    <div className="workspace">
      <form className="composer" onSubmit={onSubmit}>
        <div className="input-mode-tabs" aria-label="Job description input method">
          <button
            type="button"
            className={inputMode === "urls" ? "input-mode active" : "input-mode"}
            aria-pressed={inputMode === "urls"}
            onClick={() => setInputMode("urls")}
            disabled={busy}
          >
            Job URLs
          </button>
          <button
            type="button"
            className={inputMode === "manual" ? "input-mode active" : "input-mode"}
            aria-pressed={inputMode === "manual"}
            onClick={() => setInputMode("manual")}
            disabled={busy}
          >
            Paste job description
          </button>
        </div>

        <div className="section-head">
          <div>
            <h2>
              {inputMode === "urls" ? "Job URLs" : "Manual job description"}
            </h2>
            <p className="hint">
              {inputMode === "urls"
                ? "One link per line. Each package is saved as Company-Role.zip."
                : "Paste a complete JD to generate without a job URL or scraping."}
            </p>
          </div>
          {inputMode === "urls" && (
            <div className="link-count" aria-live="polite">
              {linkCount} link{linkCount === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {inputMode === "urls" ? (
          <textarea
            required
            rows={7}
            value={jobLinks}
            onChange={(e) => setJobLinks(e.target.value)}
            placeholder={
              "https://job-boards.greenhouse.io/…/jobs/123\nhttps://jobs.lever.co/…"
            }
            spellCheck={false}
          />
        ) : (
          <textarea
            required
            rows={11}
            value={manualJobDescription}
            onChange={(e) => setManualJobDescription(e.target.value)}
            placeholder="Paste the full job title, company, responsibilities, requirements, and preferred qualifications…"
          />
        )}

        <div className="composer-footer">
          <button
            type="submit"
            className="primary"
            disabled={
              busy ||
              (inputMode === "urls"
                ? linkCount === 0
                : manualJobDescription.trim().length < 80)
            }
          >
            {loading
              ? "Processing…"
              : inputMode === "urls"
                ? "Generate packages"
                : "Generate resume"}
          </button>
          {status && <p className="inline-status">{status}</p>}
        </div>

        {error && <p className="error">{error}</p>}
      </form>

      <section className="board">
        <div className="section-head">
          <div>
            <h2>Progress</h2>
            <p className="hint">
              {jobs.length === 0
                ? "Results appear here after you generate."
                : `${summary.done} done · ${summary.running} running · ${summary.failed} failed`}
            </p>
          </div>
          {completedDownloads.length > 0 && (
            <button
              type="button"
              className="download-all-btn"
              onClick={downloadAllZips}
            >
              <DownloadIcon />
              Download all ZIPs ({completedDownloads.length})
            </button>
          )}
        </div>

        {jobs.length === 0 ? (
          <div className="empty-board">
            <p>Add job URLs or paste a job description to start.</p>
            <ol>
              <li>Scrape posting</li>
              <li>Extract JD</li>
              <li>Write resume + cover letter</li>
              <li>Validate format and content</li>
              <li>Score ATS match</li>
              <li>Package downloads</li>
            </ol>
          </div>
        ) : (
          <ul className="job-list">
            {jobs.map((job) => (
              <li key={job.index} className={`job-row status-${job.status}`}>
                <div className="job-list-main">
                  <div className="job-list-head">
                    <span className="job-index">{job.index}</span>
                    <div className="job-identity">
                      <div className="job-title-row">
                        <strong>
                          {job.company ||
                            (job.status === "error"
                              ? "Failed"
                              : hostFromUrl(job.jobUrl))}
                        </strong>
                        <StatusBadge status={job.status} />
                        {typeof job.atsScore === "number" && (
                          <span
                            className={`ats-score ${
                              job.atsScore >= 85
                                ? "high"
                                : job.atsScore >= 70
                                  ? "mid"
                                  : "low"
                            }`}
                          >
                            ATS {job.atsScore}/100
                          </span>
                        )}
                      </div>
                      {job.jobTitle && (
                        <p className="job-role">{job.jobTitle}</p>
                      )}
                      {job.jobUrl === "Pasted job description" ? (
                        <p className="job-url">Pasted job description</p>
                      ) : (
                        <a
                          className="job-url"
                          href={job.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={job.jobUrl}
                        >
                          {job.jobUrl}
                        </a>
                      )}
                    </div>
                  </div>

                  <ol className="pipeline" aria-label="Processing steps">
                    {JOB_STEPS.map((step, i) => (
                      <li
                        key={step}
                        className={`pipe-step ${job.stepStatuses[step]}`}
                        title={JOB_STEP_LABELS[step]}
                      >
                        <span className="pipe-node">{i + 1}</span>
                        <span className="pipe-label">{STEP_SHORT[step]}</span>
                      </li>
                    ))}
                  </ol>

                  {job.status === "running" && (
                    <p className="job-live">{job.stepMessage}</p>
                  )}
                  {job.error && <p className="job-error">{job.error}</p>}

                  {job.status === "done" &&
                    job.downloads &&
                    job.zipName &&
                    job.resumeDocxName &&
                    job.coverLetterDocxName && (
                    <div className="download-row">
                      <span className="download-label">Downloads</span>
                      <div className="download-actions">
                        <a
                          className="download-btn"
                          href={job.downloads.resumeDocxUrl}
                          download={job.resumeDocxName}
                        >
                          <DownloadIcon />
                          {job.resumeDocxName}
                        </a>
                        <a
                          className="download-btn"
                          href={job.downloads.coverLetterDocxUrl}
                          download={job.coverLetterDocxName}
                        >
                          <DownloadIcon />
                          {job.coverLetterDocxName}
                        </a>
                        <a
                          className="download-btn zip"
                          href={job.downloads.zipUrl}
                          download={job.zipName}
                        >
                          <DownloadIcon />
                          {job.zipName}
                        </a>
                      </div>
                    </div>
                  )}

                  {job.status === "error" && (
                    <div className="manual-jd-panel">
                      <label className="manual-jd-label" htmlFor={`manual-jd-${job.index}`}>
                        {job.jobUrl === "Pasted job description"
                          ? "Edit the pasted job description and retry"
                          : "Paste job description (for blocked / captcha pages)"}
                      </label>
                      <textarea
                        id={`manual-jd-${job.index}`}
                        className="manual-jd-input"
                        rows={6}
                        value={manualJds[job.index] || ""}
                        onChange={(e) => setManualJd(job.index, e.target.value)}
                        placeholder="Paste the full job description text here, then generate with pasted JD…"
                        spellCheck={false}
                      />
                      <div className="retry-row">
                        {job.jobUrl !== "Pasted job description" && (
                          <button
                            type="button"
                            className="retry-btn"
                            disabled={Boolean(retryingIndices[job.index])}
                            onClick={() => void onRetry(job, false)}
                          >
                            <RetryIcon />
                            {retryingIndices[job.index]
                              ? "Retrying…"
                              : "Retry scrape"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="retry-btn primary-ghost"
                          disabled={
                            Boolean(retryingIndices[job.index]) ||
                            (manualJds[job.index] || "").trim().length < 80
                          }
                          onClick={() => void onRetry(job, true)}
                          title="Skip scraping and use the pasted JD"
                        >
                          <RetryIcon />
                          {retryingIndices[job.index]
                            ? "Generating…"
                            : "Generate with pasted JD"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
