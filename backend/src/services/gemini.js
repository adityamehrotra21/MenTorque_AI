/**
 * Resilient Gemini client.
 *
 * Free-tier Gemini models sometimes answer 503 "model is experiencing high demand" or 429 rate limits.
 * Every call therefore:
 *   1. retries the same model with exponential backoff on temporary errors, and
 *   2. falls back to other models (GEMINI_FALLBACK_MODELS) if one model stays unavailable,
 * all within a total time budget that fits inside the Vercel function limit.
 */

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_FALLBACKS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const ATTEMPTS_PER_MODEL = 3;
const ATTEMPT_TIMEOUT_MS = 20_000;
const TOTAL_BUDGET_MS = 50_000;

export class GeminiUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "GeminiUnavailableError";
    this.status = 503;
    this.cause = cause;
  }
}

function modelChain() {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || DEFAULT_FALLBACKS.join(","))
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(model, apiKey, options, timeoutMs) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        generationConfig: options.jsonSchema
          ? {
              temperature: options.temperature ?? 0.35,
              responseMimeType: "application/json",
              responseJsonSchema: options.jsonSchema,
              ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
            }
          : { temperature: options.temperature ?? 0.65, maxOutputTokens: options.maxOutputTokens ?? 220 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    const error = new Error("Gemini returned an empty response.");
    error.status = 503; // treat as temporary
    throw error;
  }
  return text;
}

function isRetryable(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return true;
  if (error instanceof TypeError) return true; // network failure
  return RETRYABLE_STATUS.has(error?.status);
}

/**
 * @param {{ systemInstruction: string, prompt: string, jsonSchema?: object, temperature?: number, maxOutputTokens?: number }} options
 */
export async function generateWithGemini(options) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError;

  for (const model of modelChain()) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 3_000) break;

      try {
        return await callModel(model, apiKey, options, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
      } catch (error) {
        lastError = error;
        console.warn(`[gemini] ${model} attempt ${attempt + 1} failed: ${error?.status || error?.name} ${error?.message}`);
        // Unknown/unsupported model (404/400): skip straight to the next model.
        if (!isRetryable(error)) break;
        // Last attempt on this model: move on to the next model immediately.
        if (attempt === ATTEMPTS_PER_MODEL - 1) break;
        const backoff = Math.min(600 * 2 ** attempt + Math.random() * 300, Math.max(0, deadline - Date.now() - 3_000));
        await sleep(backoff);
      }
    }
    if (deadline - Date.now() < 3_000) break;
  }

  // Auth/config problems should stay visible to the developer.
  if (lastError?.status === 400 || lastError?.status === 401 || lastError?.status === 403) {
    if (/api key/i.test(lastError.message)) throw new Error("The Gemini API key is invalid or missing permissions.");
  }

  throw new GeminiUnavailableError(
    "Ava's AI service is busy right now. Your answer is safe — tap Retry in a few seconds to continue.",
    lastError,
  );
}
