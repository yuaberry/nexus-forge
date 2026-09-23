/**
 * Provider registry + robust JSON chat helper.
 *
 * chatJson(): asks the model for JSON, zod-validates it, and if invalid,
 * feeds the validation error back for ONE repair round. If the provider is
 * not configured, throws NotConfiguredError so callers can fall back to
 * deterministic templates (offline mode) — the pipeline never silently mocks.
 */
import type { z } from "zod";
import { getSetting } from "../settings";
import { DEFAULT_ASSIGNMENTS, ProviderError, type AIProvider, type ChatRequest } from "./types";
import { OpenRouterAdapter } from "./openrouter";

export class NotConfiguredError extends Error {
  constructor() { super("No AI provider configured."); }
}

const openrouter = new OpenRouterAdapter();

export function getProviderForRole(role: string): AIProvider | null {
  const assignments = getSetting("modelAssignments", DEFAULT_ASSIGNMENTS);
  const a = (assignments as Record<string, { provider: string } | undefined>)[role]
    ?? { provider: "openrouter" };
  if (a.provider === "openrouter") return openrouter.configured ? openrouter : null;
  return null; // other adapters land in later phases (honest)
}

export function aiConfigured(): boolean {
  return openrouter.configured;
}

/** Extracts the JSON object from a model reply (robust balanced-brace scanner). */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  // Prefer the longest valid object: scan from every '{' start (rarely more than one needed)
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "{") starts.push(i);
  let lastErr = "No JSON object found in reply.";
  for (const start of starts) {
    const end = matchBrace(text, start);
    if (end === -1) continue;
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

/** Returns the index of the '}' matching the '{' at [start], or -1. */
function matchBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export async function chatJson<T>(role: string, req: ChatRequest, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const provider = getProviderForRole(role);
  if (!provider) throw new NotConfiguredError();

  const attempt = async (extra: string): Promise<unknown> => {
    const raw = await provider.chat({
      ...req,
      messages: [...req.messages, { role: "system", content: extra }],
      json: true,
    });
    return extractJson(raw);
  };

  let data: unknown;
  let lastParseError = "";
  try {
    data = await attempt("Respond ONLY with a valid JSON object. No markdown, no prose.");
  } catch (e) {
    // One re-ask on unparseable output (models sometimes add preamble prose).
    lastParseError = e instanceof Error ? e.message : String(e);
    try {
      data = await attempt(
        `Your previous reply was NOT valid JSON (${lastParseError.slice(0, 120)}). Respond again with ONLY the JSON object — no prose, no markdown fences, no explanations.`,
      );
    } catch (e2) {
      throw new ProviderError(`Model reply was not parseable JSON after retry: ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;

  // One repair round with the exact validation error.
  data = await attempt(
    `Your previous JSON was invalid: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Respond with corrected valid JSON only.`,
  );
  const repaired = schema.safeParse(data);
  if (!repaired.success) {
    throw new ProviderError(`Model failed JSON validation twice: ${repaired.error.issues[0]?.message ?? "unknown"}`);
  }
  return repaired.data;
}

export { OpenRouterAdapter };
