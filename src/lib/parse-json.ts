import { jsonrepair } from "jsonrepair";

export function parseModelJson<T>(raw: string): T {
  const candidates = buildCandidates(raw);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      try {
        return JSON.parse(jsonrepair(candidate)) as T;
      } catch (repairErr) {
        lastError =
          repairErr instanceof Error ? repairErr : new Error(String(repairErr));
      }
    }
  }

  throw new Error(
    `Failed to parse model JSON: ${lastError?.message || "unknown error"}`,
  );
}

function buildCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const candidates = new Set<string>();

  candidates.add(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.add(fenced[1].trim());
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.add(trimmed.slice(start, end + 1));
  }

  return Array.from(candidates).map(sanitizeJsonText);
}

function sanitizeJsonText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}
