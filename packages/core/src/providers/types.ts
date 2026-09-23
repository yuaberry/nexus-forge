/**
 * AIProvider — provider-agnostic LLM access layer.
 *
 * Contracts:
 * - Providers NEVER read API keys from code/env implicitly; keys come from
 *   the encrypted credential store (src/settings.ts).
 * - All structured outputs are zod-validated; parse failures are fed back
 *   to the model for one repair round before giving up.
 * - Model-per-agent assignment lives in settings (assignModel).
 */
import type { AgentRole } from "@nexus/shared";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Expected JSON schema hint appended to the prompt + validated after. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  readonly id: string;
  readonly configured: boolean;
  chat(req: ChatRequest): Promise<string>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
  }
}

// --- default model assignments (small/fast for planning; tuned per role) ---

export const DEFAULT_ASSIGNMENTS: Record<AgentRole, { provider: string; model: string }> = {
  director: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  designer: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  architect: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  coder: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  qa: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  fixer: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  reviewer: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  reference_analyst: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  art_director: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  world_builder: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  audio: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
  docs: { provider: "openrouter", model: "z-ai/glm-5.3-flash" },
};
