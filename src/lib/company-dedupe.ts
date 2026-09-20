import { Redis } from "@upstash/redis";

/** Keep each entry only long enough to catch a resubmission window. */
const DEDUPE_WINDOW_SECONDS = 14 * 24 * 60 * 60;
const KEY_PREFIX = "resume-tailor:dupe:company:";

/** Placeholders the extractor falls back to when it can't identify a real employer. */
const SKIP_KEYS = new Set(["", "unknown", "unknown company"]);

const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "group",
  "holdings",
]);

/**
 * Lowercase, strip punctuation, and drop up to two trailing legal-entity
 * words so "Google, LLC." and "Google Inc" collapse to the same key as
 * "Google". Best-effort — unrelated companies that happen to share a
 * stripped name are an accepted trade-off for staying dependency-free.
 */
export function normalizeCompanyKey(rawName: string): string {
  let name = rawName
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (let i = 0; i < 2; i++) {
    const words = name.split(" ");
    if (words.length <= 1) break;
    const last = words[words.length - 1];
    if (!LEGAL_SUFFIXES.has(last)) break;
    words.pop();
    name = words.join(" ").trim();
  }

  return name;
}

let redis: Redis | null | undefined;

/** Lazily built so a missing config only warns once, on first use. */
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  try {
    redis = Redis.fromEnv();
  } catch {
    console.warn(
      "[company-dedupe] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — duplicate detection is disabled.",
    );
    redis = null;
  }
  return redis;
}

export type DuplicateCheck =
  | { isDuplicate: true; firstSeenAt: number }
  | { isDuplicate: false };

/**
 * Best-effort lookup: infra hiccups (missing config, Upstash outage) fail
 * OPEN so resume generation never blocks on the dedupe store.
 */
export async function checkDuplicateCompany(
  companyName: string,
): Promise<DuplicateCheck> {
  const key = normalizeCompanyKey(companyName);
  if (SKIP_KEYS.has(key)) return { isDuplicate: false };

  const client = getRedis();
  if (!client) return { isDuplicate: false };

  try {
    const firstSeenAt = await client.get<number>(KEY_PREFIX + key);
    if (firstSeenAt == null) return { isDuplicate: false };
    return { isDuplicate: true, firstSeenAt };
  } catch (err) {
    console.warn("[company-dedupe] lookup failed, allowing job:", err);
    return { isDuplicate: false };
  }
}

/**
 * Record a successfully generated company so later submissions within the
 * window are caught. NX preserves the original timestamp if two requests
 * for a brand-new company race each other.
 */
export async function recordCompany(companyName: string): Promise<void> {
  const key = normalizeCompanyKey(companyName);
  if (SKIP_KEYS.has(key)) return;

  const client = getRedis();
  if (!client) return;

  try {
    await client.set(KEY_PREFIX + key, Date.now(), {
      ex: DEDUPE_WINDOW_SECONDS,
      nx: true,
    });
  } catch (err) {
    console.warn("[company-dedupe] failed to record company:", err);
  }
}
