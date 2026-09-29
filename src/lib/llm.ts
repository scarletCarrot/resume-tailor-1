import OpenAI from "openai";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
/** Fail the OpenRouter call before Vercel's Hobby 300s wall-clock limit. */
const LLM_TIMEOUT_MS = 90_000;
const EMPTY_RETRIES = 2;

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

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterChatParams = Parameters<
  ReturnType<typeof getLlmClient>["chat"]["completions"]["create"]
>[0] & {
  reasoning?: {
    enabled?: boolean;
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
    exclude?: boolean;
    max_tokens?: number;
  };
};

/**
 * deepseek/deepseek-v4-flash currently defaults to reasoning.effort=high.
 * That burns most of the completion budget (and wall-clock time) on hidden
 * thinking tokens — empty content or Vercel 300s timeouts. Force reasoning off.
 */
function withReasoningOff(
  params: OpenRouterChatParams,
): OpenRouterChatParams {
  return {
    ...params,
    reasoning: {
      enabled: false,
      effort: "none",
      exclude: true,
    },
  };
}

export async function chatJson(options: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens: number;
  emptyError: string;
}): Promise<string> {
  const client = getLlmClient();
  const model = getLlmModel();
  let lastError: Error | null = null;

  const baseParams: OpenRouterChatParams = {
    model,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens,
    response_format: { type: "json_object" },
    messages: options.messages,
  };

  for (let attempt = 0; attempt <= EMPTY_RETRIES; attempt++) {
    const useReasoningOff = attempt < EMPTY_RETRIES;
    try {
      const completion = (await client.chat.completions.create(
        (useReasoningOff
          ? withReasoningOff(baseParams)
          : baseParams) as Parameters<
          typeof client.chat.completions.create
        >[0],
        {
          // Hard abort even if the SDK timeout fails to fire on a hung socket.
          signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        },
      )) as OpenAI.Chat.Completions.ChatCompletion;

      const choice = completion.choices[0];
      const content = choice?.message?.content;
      if (content?.trim()) return content;

      const finish = choice?.finish_reason || "unknown";
      const usage = completion.usage as
        | {
            completion_tokens?: number;
            completion_tokens_details?: { reasoning_tokens?: number };
          }
        | undefined;
      const reasoningTokens =
        usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      lastError = new Error(
        `${options.emptyError} (finish_reason=${finish}` +
          (reasoningTokens
            ? `, reasoning_tokens=${reasoningTokens}/${usage?.completion_tokens ?? "?"}`
            : "") +
          `). Attempt ${attempt + 1}/${EMPTY_RETRIES + 1}.`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "OpenRouter request failed.";
      if (/abort|timeout/i.test(message)) {
        throw new Error(
          `OpenRouter timed out after ${LLM_TIMEOUT_MS / 1000}s while calling ${model}. Try again or set OPENROUTER_MODEL to a faster non-reasoning model.`,
        );
      }
      lastError = err instanceof Error ? err : new Error(message);
    }
  }

  throw lastError || new Error(options.emptyError);
}
