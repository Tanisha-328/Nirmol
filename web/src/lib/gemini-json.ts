/** Shared fixed-endpoint Gemini transport for F06 and F08. No tool calls or retries. */
export type GeminiConfig = { key: string; model: string; timeoutMs?: number; signal?: AbortSignal };
export class GeminiError extends Error { constructor(public code: "unavailable" | "invalid" | "timeout" | "quota", public status: number) { super(code); } }
export async function geminiJson(body: unknown, config: GeminiConfig, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!config.key || !/^gemini-[a-z0-9.-]{1,60}$/.test(config.model)) throw new GeminiError("unavailable", 503);
  if (config.signal?.aborted) throw new GeminiError("timeout", 504);
  const abort = new AbortController(); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let parentAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    parentAbort = () => { abort.abort(); void reader?.cancel().catch(() => {}); reject(new GeminiError("timeout", 504)); };
    config.signal?.addEventListener("abort", parentAbort, { once: true });
  });
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); void reader?.cancel().catch(() => {}); reject(new GeminiError("timeout", 504)); }, Math.min(config.timeoutMs ?? 12000, 12000)); });
  try {
    return await Promise.race([deadline, cancelled, (async () => {
      const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`, {
        method: "POST", cache: "no-store", signal: abort.signal, redirect: "error",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.key }, body: JSON.stringify(body),
      });
      if (abort.signal.aborted) throw new GeminiError("timeout", 504);
      if (response.status === 429) throw new GeminiError("quota", 429);
      if (!response.ok) throw new GeminiError("unavailable", 503);
      reader = response.body?.getReader(); if (!reader) throw new GeminiError("invalid", 502);
      const chunks: Uint8Array[] = []; let length = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 16384) { await reader.cancel(); throw new GeminiError("invalid", 502); } chunks.push(part.value); } }
      finally { reader.releaseLock(); reader = undefined; }
      const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      const candidate = data?.candidates?.length === 1 ? data.candidates[0] : null, parts = candidate?.content?.parts;
      if (candidate?.finishReason !== "STOP" || !Array.isArray(parts)) throw new GeminiError("invalid", 502);
      const text = parts.filter((p: { thought?: unknown; text?: unknown }) => p.thought !== true && typeof p.text === "string").map((p: { text: string }) => p.text).join("");
      return JSON.parse(text);
    })()]);
  } catch (e) { if (e instanceof GeminiError) throw e; throw new GeminiError("invalid", 502); }
  finally { clearTimeout(timer!); config.signal?.removeEventListener("abort", parentAbort); abort.abort(); }
}
