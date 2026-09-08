import OpenAI from "openai";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
/** Per-request ceiling so a hung OpenRouter call fails instead of idling forever. */
const LLM_TIMEOUT_MS = 120_000;

export function getLlmModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

export function getLlmClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: LLM_TIMEOUT_MS,
    defaultHeaders: {
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Resume Tailor",
    },
  });
}
