/**
 * Agent runtime — the execution loop for code tasks.
 *
 * LLM path: coder plans file ops (JSON-validated) → ops applied as surgical
 * diffs → REAL engine validation (headless) → on errors, fixer repairs with
 * exact error context → re-validate. Max 3 repair rounds, then honest failure.
 *
 * Every file touch is event-logged; nothing is silent.
 */
import { z } from "zod";
import type { Task } from "@nexus/shared";
import { chatJson, getProviderForRole } from "../providers/registry";
import { PERSONAS } from "./prompts";
import { dnaContext } from "../dna";
import type { Workspace } from "../workspace";
import { bus } from "../events";
import type { EngineAdapter, ValidationResult } from "../engines/types";

const FileOp = z.object({
  path: z.string().min(1),
  action: z.enum(["create", "edit"]),
  content: z.string().optional(),
  search: z.string().optional(),
  replace: z.string().optional(),
});

const CoderPlan = z.object({
  thinking: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  files: z.array(FileOp).min(1).max(12),
});

export interface CoderResult {
  ok: boolean;
  rounds: number;
  touchedFiles: string[];
  validation: ValidationResult | null;
  notes: string[];
}

/** Applies one planned op safely; returns error string on failure. */
function applyOp(ws: Workspace, op: z.infer<typeof FileOp>): string | null {
  if (op.action === "create") {
    if (!op.content) return `create op for ${op.path} missing "content"`;
    ws.write(op.path, op.content);
    return null;
  }
  // edit
  if (!op.search || op.replace === undefined) return `edit op for ${op.path} missing "search"/"replace"`;
  if (!ws.exists(op.path)) return `edit target does not exist: ${op.path}`;
  const current = ws.read(op.path);
  if (!current.includes(op.search)) return `search text not found in ${op.path}: "${op.search.slice(0, 80)}"`;
  ws.write(op.path, current.replace(op.search, op.replace));
  return null;
}

function applyPlan(ws: Workspace, plan: z.infer<typeof CoderPlan>): { applied: string[]; errors: string[] } {
  const applied: string[] = [];
  const errors: string[] = [];
  for (const op of plan.files) {
    const err = applyOp(ws, op);
    if (err) errors.push(err);
    else applied.push(op.path);
  }
  return { applied, errors };
}

function taskPrompt(task: Task, ws: Workspace, dna: string, extra: string): string {
  const tree = ws.treeText(300);
  return `## TASK
Title: ${task.title}
Description: ${task.description}
${extra ? `\n## VALIDATION FEEDBACK\n${extra}\n` : ""}
## GAME DNA (authoritative)
${dna}

## CURRENT PROJECT TREE
${tree}

## OUTPUT CONTRACT (exact)
Return a JSON object with EXACTLY this shape:
{"thinking": "<one short paragraph of rationale>", "files": [{"path": "<project-relative path>", "action": "create" | "edit", ...}]}
- For "create": include "content" with the COMPLETE file content.
- For "edit": include "search" (an EXACT substring currently present in the file) and "replace" (the corrected substring). Keep edits surgical.
- 1 to 12 file operations. New scripts must follow the code-first pattern (minimal .tscn, visuals built in _ready()).
- Never touch project.godot unless the task explicitly requires it.`;
}

function fixerPrompt(task: Task, ws: Workspace, issues: { file: string; message: string; line?: number }[], touched: string[]): string {
  const fileBodies = touched
    .filter((f) => ws.exists(f))
    .map((f) => `--- ${f} ---\n${ws.read(f, 30_000).slice(0, 30_000)}`)
    .join("\n\n");
  return `## TASK
${task.title}: ${task.description}

## ENGINE VALIDATION ERRORS (exact)
${issues.map((i) => `- [${i.file}${i.line ? `:${i.line}` : ""}] ${i.message}`).join("\n")}

## FILES INVOLVED (current contents)
${fileBodies.slice(0, 24_000)}

## OUTPUT CONTRACT (exact)
Return JSON: {"thinking": "<short>", "files": [{"path": "...", "action": "edit" (or "create" for new files), "search": "<exact current text>", "replace": "<fixed text>", "content": "<for create: full file>"}]}
Fix ONLY what the errors require. Minimal edits.`;
}

/** Runs one code task end-to-end (LLM codegen + validation + fix loop). */
export async function runCoderTask(opts: {
  projectId: string;
  task: Task;
  ws: Workspace;
  adapter: EngineAdapter;
  dnaSections: Parameters<typeof dnaContext>[1];
}): Promise<CoderResult> {
  const { projectId, task, ws, adapter, dnaSections } = opts;
  const notes: string[] = [];
  const touchedAll = new Set<string>();
  let validation: ValidationResult | null = null;
  let rounds = 0;
  const MAX_ROUNDS = 3;

  const hasLLM = getProviderForRole("coder") != null;
  if (!hasLLM) {
    return {
      ok: false, rounds: 0, touchedFiles: [], validation: null,
      notes: ["No AI provider configured — code generation tasks are skipped in offline mode (base template project remains playable)."],
    };
  }

  const dna = dnaContext(projectId, dnaSections);
  let extra = "";
  let lastIssues: { file: string; message: string; line?: number }[] = [];

  while (rounds < MAX_ROUNDS) {
    rounds++;
    const role = rounds === 1 ? "coder" : "fixer";
    const prompt = role === "coder"
      ? taskPrompt(task, ws, dna, "")
      : fixerPrompt(task, ws, lastIssues, [...touchedAll]);

    bus.emit({ projectId, taskId: task.id, agent: role, stage: "buildout", level: "info", message: `Round ${rounds}: ${role === "coder" ? "planning file operations" : "repairing validation errors"}…` });

    let plan: z.infer<typeof CoderPlan>;
    try {
      plan = await chatJson(role, { messages: [{ role: "system", content: PERSONAS[role] ?? PERSONAS["coder"]! }, { role: "user", content: prompt }], maxTokens: 12000, temperature: 0.4 }, CoderPlan);
    } catch (e) {
      notes.push(`LLM round ${rounds} failed: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }

    const { applied, errors } = applyPlan(ws, plan);
    for (const f of applied) touchedAll.add(f);
    for (const e of errors) {
      bus.emit({ projectId, taskId: task.id, agent: role, stage: "buildout", level: "warning", message: e });
    }

      if (adapter.validate) {
        bus.emit({ projectId, taskId: task.id, agent: "qa", stage: "buildout", level: "info", message: `Validating project (headless engine check)…` });
        validation = await adapter.validate(ws.root);
        lastIssues = validation.issues.filter((i) => i.severity === "error");
        if (validation.ok) {
          bus.emit({ projectId, taskId: task.id, agent: "qa", stage: "buildout", level: "success", message: `Validation PASS (round ${rounds})` });
          return { ok: true, rounds, touchedFiles: [...touchedAll], validation, notes };
        }
        bus.emit({ projectId, taskId: task.id, agent: "qa", stage: "buildout", level: "error", message: `Validation errors: ${lastIssues.length} (round ${rounds})` });
        extra = lastIssues.map((i) => `- [${i.file}] ${i.message}`).join("\n");
        if (rounds >= MAX_ROUNDS) {
          // Honest failure WITH the evidence of what still fails.
          notes.push(`Still failing after ${MAX_ROUNDS} rounds: ${lastIssues.slice(0, 3).map((i) => `[${i.file}] ${i.message.slice(0, 140)}`).join(" | ")}`);
        }
      } else {
      return { ok: true, rounds, touchedFiles: [...touchedAll], validation: null, notes: [...notes, "Engine adapter has no validator — applied without engine check (honest note)."] };
    }
  }

  return { ok: false, rounds, touchedFiles: [...touchedAll], validation, notes };
}
