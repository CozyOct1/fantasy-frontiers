import { z } from "zod";

const completionResponseSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.string().nullable(), message: z.object({ content: z.string().nullable() }) })).min(1),
});

export class DeepSeekError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); this.name = "DeepSeekError"; }
}

export interface JsonCompletionRequest { systemPrompt: string; userInput: unknown; maxTokens?: number }
export interface JsonModel { completeJson(request: JsonCompletionRequest): Promise<unknown> }

export class DeepSeekClient implements JsonModel {
  constructor(private readonly options: { apiKey?: string; baseUrl?: string; model?: string; timeoutMs?: number } = {}) {}

  async completeJson(request: JsonCompletionRequest): Promise<unknown> {
    const apiKey = this.options.apiKey ?? process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new DeepSeekError("DeepSeek API key is not configured", false);
    const baseUrl = (this.options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, "");
    const model = this.options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `${request.systemPrompt}\n\nReturn valid JSON only. The requested response format is JSON.` },
            { role: "user", content: JSON.stringify(request.userInput) },
          ],
          response_format: { type: "json_object" },
          max_tokens: request.maxTokens ?? 1800,
          temperature: 0.35,
          stream: false,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 45_000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new DeepSeekError(timedOut ? "DeepSeek request timed out" : "DeepSeek request failed", true);
    }
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new DeepSeekError(`DeepSeek returned HTTP ${response.status}`, retryable);
    }
    let raw: unknown;
    try { raw = await response.json(); } catch { throw new DeepSeekError("DeepSeek returned invalid JSON envelope", true); }
    const parsed = completionResponseSchema.safeParse(raw);
    if (!parsed.success) throw new DeepSeekError("DeepSeek response did not match the chat-completion shape", true);
    const choice = parsed.data.choices[0]!;
    if (choice.finish_reason === "length") throw new DeepSeekError("DeepSeek output was truncated", true);
    if (choice.finish_reason !== "stop") throw new DeepSeekError(`DeepSeek stopped with finish_reason=${choice.finish_reason ?? "unknown"}`, true);
    if (!choice.message.content?.trim()) throw new DeepSeekError("DeepSeek returned empty JSON content", true);
    try { return JSON.parse(choice.message.content) as unknown; }
    catch { throw new DeepSeekError("DeepSeek content was not valid JSON", true); }
  }
}
