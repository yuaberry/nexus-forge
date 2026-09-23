/**
 * OpenRouter adapter — REAL implementation against https://openrouter.ai/api/v1.
 * Free-tier models are used by default to keep autonomous runs cheap.
 */
import { getCredential, getSetting } from "../settings";
import { ChatRequest, ProviderError, type AIProvider } from "./types";

const API = "https://openrouter.ai/api/v1";

export class OpenRouterAdapter implements AIProvider {
  readonly id = "openrouter";

  get configured(): boolean {
    return getCredential("openrouter") != null;
  }

  async chat(req: ChatRequest): Promise<string> {
    const key = getCredential("openrouter");
    if (!key) throw new ProviderError("OpenRouter key not configured. Import it in Settings.");
    const model = getSetting<string>("providers.openrouter.defaultModel", "z-ai/glm-5.3-flash");

    let lastErr: unknown = null;
    // 2 attempts: long generations (full-file codegen) legitimately take minutes,
    // but a stalled request must never hang the pipeline forever.
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 300_000); // 5 min hard cap per call
      try {
        const res = await fetch(`${API}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://nexus-forge.local",
            "X-Title": "Nexus Forge",
          },
          body: JSON.stringify({
            model,
            messages: req.messages,
            max_tokens: req.maxTokens ?? 4096,
            temperature: req.temperature ?? 0.7,
            ...(req.json ? { response_format: { type: "json_object" } } : {}),
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // 4xx (except 429) will not succeed on retry — fail fast, honest
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw new ProviderError(`OpenRouter HTTP ${res.status}`, res.status, body.slice(0, 400));
          }
          throw new ProviderError(`OpenRouter HTTP ${res.status} (retryable)`, res.status, body.slice(0, 400));
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new ProviderError("Empty completion from OpenRouter.");
        return content;
      } catch (e) {
        lastErr = e;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 4000));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ProviderError(`OpenRouter request failed after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  /** Lists model ids visible with this key (never prints the key). */
  static async listModels(): Promise<string[]> {
    const key = getCredential("openrouter");
    if (!key) throw new ProviderError("Key not configured.");
    const res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new ProviderError(`Models HTTP ${res.status}`);
    const data = (await res.json()) as { data: Array<{ id: string }> };
    return data.data.map((m) => m.id);
  }
}
