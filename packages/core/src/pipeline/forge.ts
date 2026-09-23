/**
 * Forge Pipeline — the autonomous "idea → playable game" flow.
 *
 * Stages: analyze → dna → gdd → architecture → scaffold → tasks → buildout → validate
 * Every stage emits events (real-time UI progress), commits at milestones and
 * is individually runnable (manual mode / API stage selection).
 * No stage pretends success: failures stop the pipeline with a clear reason
 * and everything done so far stays committed and auditable.
 */
import type { DnaSection, Dimension, EngineId, ForgeStage, GameBrief, Origin, QualityTier, ContentRating } from "@nexus/shared";
import { bus } from "../events";
import { Workspace } from "../workspace";
import { GitRepo } from "../git";
import { writeDnaField, recordDecision } from "../dna";
import { getAdapter, ensureGodot } from "../engines/manager";
import { planGame, generateGdd, type GamePlan } from "../orchestrator/director";
import { getProject, updateProject, insertTasks, listTasks, updateTask, nextRunnableTask, computeProgress, createProject, type ProjectRow } from "../orchestrator/store";
import { runCoderTask } from "../agents/runtime";
import { uid } from "../util";

export const ALL_STAGES: ForgeStage[] = ["analyze", "dna", "gdd", "architecture", "scaffold", "tasks", "buildout", "validate"];

const GIT_IDENTITY = { name: "Nexus Forge", email: "nexus@forge.local" };

export interface ForgeOptions {
  stages?: ForgeStage[];
  mode?: "manual" | "assisted" | "autonomous";
}

function stage(projectId: string, name: string, msg: string, level: "info" | "success" | "warning" | "error" = "info") {
  bus.emit({ projectId, agent: "director", stage: name, level, message: msg });
}

// --- stages -----------------------------------------------------------------

async function stageAnalyze(p: ProjectRow): Promise<GamePlan> {
  const brief: GameBrief = {
    idea: p.idea,
    name: p.name,
    dimensions: p.dimensions as Dimension | undefined,
    qualityTier: p.quality_tier as QualityTier | undefined,
    platforms: JSON.parse(p.platforms) as GameBrief["platforms"],
    engine: p.engine as EngineId,
    contentRating: p.content_rating as ContentRating | undefined,
  };
  const { plan, usedLLM, archetypes } = await planGame(brief);
  stage(p.id, "analyze", usedLLM
    ? `Plan ready (director agent): "${plan.name}" — ${plan.flavor} slice on ${plan.engine}.`
    : `Plan ready (deterministic${archetypes.length ? ` — archetypes: ${archetypes.map((a) => a.id).join(", ")}` : " — no AI provider configured"}).`, "info");
  updateProject(p.id, {
    name: plan.name.slice(0, 60),
    engine: plan.engine,
    dimensions: plan.dimensions,
    quality_tier: plan.qualityTier,
    platforms: JSON.stringify(plan.platforms),
  });
  return plan;
}

function stageDna(p: ProjectRow, plan: GamePlan, brief: GameBrief): void {
  const put = (section: DnaSection, key: string, value: unknown, origin: Origin, note?: string) =>
    writeDnaField(p.id, section, key, value, origin, note);

  put("vision", "statement", plan.shortDescription, "inferred", "Derived from the user's idea.");
  put("vision", "title", plan.name, brief.name ? "confirmed" : "inferred");
  put("coreFantasy", "primary", plan.pillars[0] ?? "To be defined", "inferred");
  put("designPillars", "pillars", plan.pillars, "inferred");
  put("genre", "tags", plan.genreTags, plan.genreTags.length ? "inferred" : "unknown");
  put("gameplayLoop", "coreLoop", plan.coreLoop, "inferred");
  put("mechanics", "systems", plan.systems, "inferred");
  put("world", "milestoneScope", plan.systems.map((s) => s.name).slice(0, 8), "inferred");
  put("progression", "prototype", "Vertical slice with escalating threat (see GDD).", "inferred");
  put("platforms", "targets", plan.platforms, brief.platforms ? "confirmed" : "inferred");
  put("engine", "choice", plan.engine, brief.engine ? "confirmed" : "inferred",
    brief.engine ? "User-selected engine." : "Recommended from dimensions/tier; user can change before scaffold.");
  put("engine", "flavor", plan.flavor, "inferred");
  put("performanceTargets", "tier", plan.qualityTier, brief.qualityTier ? "confirmed" : "inferred");
  put("artDirection", "prototype", "Code-built placeholder primitives in a coherent dark palette.", "confirmed", "Honest placeholder until the asset pipeline phase.");
  put("decisions", `d-${uid("").slice(0, 6)}`, { title: "Prototype slice scope", rationale: plan.coreLoop.slice(0, 180) }, "inferred");
  recordDecision(p.id, "Prototype slice scope", `Milestone 1 vertical slice based on: ${plan.coreLoop.slice(0, 160)}`);
  stage(p.id, "dna", "Game DNA written (each field carries confirmed/inferred origin).", "success");
}

async function stageGdd(p: ProjectRow, ws: Workspace, git: GitRepo, plan: GamePlan): Promise<void> {
  const { markdown, usedLLM } = await generateGdd(plan.name, plan, p.idea);
  ws.write("docs/game-design.md", markdown);
  await git.ensureCommitted("docs: game design document v0");
  stage(p.id, "gdd", usedLLM ? "GDD generated (designer agent)." : "GDD generated (deterministic template — no AI provider).", "success");
}

async function stageArchitecture(p: ProjectRow, ws: Workspace, git: GitRepo, plan: GamePlan): Promise<void> {
  const md = `# ${plan.name} — Technical Architecture (prototype milestone)

Engine: **${plan.engine}** (starter flavor: ${plan.flavor})
Dimension: ${plan.dimensions} — quality tier: ${plan.qualityTier}
Platforms (target): ${plan.platforms.join(", ")}

## System Map
${plan.systems.map((s) => `- **${s.name}** — ${s.purpose}${s.dependsOn.length ? ` → depends on: ${s.dependsOn.join(", ")}` : ""}`).join("\n")}

## Structure (code-first pattern)
- \`scenes/*.tscn\` — minimal root-node scenes (script attached)
- \`scripts/*.gd\` — all behavior and visuals built in code
- \`scripts/game_state.gd\` — autoload (single source of truth)
- \`docs/\` — GDD, architecture

## Validation Contract (error-reduction loop)
1. \`godot --headless --check-only --script <file>\` per script (parse)
2. \`godot --headless --path . --quit-after 2\` smoke run (runtime)
3. Fix agent repairs exact errors (max 3 rounds)

## Honest Scope Notes
- Multiplayer: deferred (netcode phase)
- Binary assets: placeholder primitives only (asset pipeline phase)
`;
  ws.write("docs/tech-architecture.md", md);
  await git.ensureCommitted("docs: technical architecture");
  stage(p.id, "architecture", "Technical architecture written.", "success");
}

async function stageScaffold(p: ProjectRow, ws: Workspace, git: GitRepo, plan: GamePlan): Promise<void> {
  const adapter = getAdapter(plan.engine as EngineId);
  if (!adapter) throw new Error(`No adapter for engine '${plan.engine}'.`);
  const spec = {
    title: plan.name,
    slug: p.slug,
    dimension: plan.dimensions,
    qualityTier: plan.qualityTier,
    flavor: plan.flavor,
    palette: { primary: "#4f7cff", accent: "#4f7cff", bg: "#12131a", fg: "#e8eaf2" },
    playerSpeed: plan.flavor === "platformer" ? 240 : 200,
    shortDescription: plan.shortDescription,
  };
  const result = await adapter.createProject(ws.root, spec);
  await git.ensureCommitted(`scaffold: ${plan.engine} project (${plan.flavor} starter)`);
  stage(p.id, "scaffold", `Engine project created: ${result.files.length} files on ${adapter.label}.`, "success");
  for (const n of result.notes) stage(p.id, "scaffold", n, "info");
}

function stageTasks(p: ProjectRow, plan: GamePlan): number {
  const createdIds: string[] = [];
  const tasks = plan.tasks.map((t, i) => ({
    title: t.title,
    description: t.description,
    type: t.type,
    priority: t.priority,
    risk: t.risk,
    dependsOn: t.dependsOn >= 0 && createdIds[t.dependsOn] ? [createdIds[t.dependsOn]!] : [],
  }));
  const inserted = insertTasks(p.id, tasks);
  plan.tasks.forEach((_t, i) => { createdIds[i] = inserted[i]?.id ?? ""; });
  stage(p.id, "tasks", `Task graph created: ${inserted.length} tasks with dependencies.`, "success");
  return inserted.length;
}

async function stageBuildout(p: ProjectRow, ws: Workspace, git: GitRepo, plan: GamePlan): Promise<void> {
  const adapter = getAdapter(plan.engine as EngineId)!;
  let guard = 0;
  for (;;) {
    if (guard++ > 40) break; // hard bound: never loop forever
    const task = nextRunnableTask(p.id);
    if (!task) break;
    updateTask(task.id, { status: "running" });
    stage(p.id, "buildout", `Task running: ${task.title}`, "info");
    try {
      if (task.type === "scaffold") {
        updateTask(task.id, { status: "completed", result: "Engine project scaffolded in the scaffold stage." });
      } else if (task.type === "validation") {
        if (!adapter.validate) throw new Error("Adapter has no validator.");
        const v = await adapter.validate(ws.root);
        if (v.ok) {
          updateTask(task.id, { status: "completed", result: `Validation PASS (${v.durationMs}ms).` });
        } else {
          updateTask(task.id, { status: "failed", error: v.issues.map((i) => `${i.file}: ${i.message}`).join(" | ").slice(0, 400) });
          stage(p.id, "buildout", `Validation found ${v.issues.length} issue(s).`, "warning");
          break;
        }
      } else {
        // code / ui / assets / audio → coder agent (LLM) with validation loop
        const res = await runCoderTask({
          projectId: p.id, task, ws, adapter,
          dnaSections: ["vision", "coreFantasy", "designPillars", "gameplayLoop", "mechanics", "engine", "artDirection"],
        });
        if (res.ok) {
          updateTask(task.id, { status: "completed", result: `Done in ${res.rounds} round(s); files: ${res.touchedFiles.join(", ").slice(0, 200)}`, files: res.touchedFiles });
          await git.ensureCommitted(`task(${task.type}): ${task.title}`);
          stage(p.id, "buildout", `Task completed: ${task.title}`, "success");
        } else {
          updateTask(task.id, { status: "blocked", error: res.notes.join(" | ").slice(0, 400) });
          stage(p.id, "buildout", `Task blocked: ${task.title} — ${res.notes[0] ?? "unknown"}`, "warning");
        }
      }
    } catch (e) {
      updateTask(task.id, { status: "failed", error: e instanceof Error ? e.message : String(e) });
      stage(p.id, "buildout", `Task failed: ${task.title}`, "error");
      break; // stop the run — honest failure, human reviews
    }
    updateProject(p.id, { progress: computeProgress(p.id) });
  }
  const remaining = listTasks(p.id).filter((t) => t.status === "pending" || t.status === "blocked").length;
  stage(p.id, "buildout", remaining === 0 ? "All tasks resolved." : `${remaining} task(s) blocked/pending — review in Tasks view.`, remaining === 0 ? "success" : "warning");
}

async function stageValidate(p: ProjectRow, ws: Workspace, git: GitRepo, plan: GamePlan): Promise<boolean> {
  const adapter = getAdapter(plan.engine as EngineId)!;
  if (!adapter.validate) {
    stage(p.id, "validate", `${adapter.label} has no local validator — project left as scaffolded (honest state).`, "warning");
    updateProject(p.id, { status: "prototyping", phase: "Scaffold" });
    return true;
  }
  stage(p.id, "validate", "Running headless validation (parse + smoke run)…", "info");
  const v = await adapter.validate(ws.root);
  if (v.ok) {
    ws.write("docs/validation-report.md", `# Validation Report\n\nResult: **PASS** (${v.durationMs}ms)\n\nChecks: per-script parse + 2-frame smoke run.\nIssues: none.\n`);
    await git.ensureCommitted("validate: PASS");
    updateProject(p.id, { status: "playable", phase: "Prototype", progress: 100 });
    stage(p.id, "validate", `Validation PASS — prototype is playable (${v.durationMs}ms).`, "success");
    return true;
  }
  ws.write("docs/validation-report.md", `# Validation Report\n\nResult: **FAIL**\n\n${v.issues.map((i) => `- [${i.file}${i.line ? `:${i.line}` : ""}] ${i.message}`).join("\n")}\n`);
  await git.ensureCommitted("validate: FAIL (report)");
  updateProject(p.id, { status: "building", phase: "Prototype" });
  stage(p.id, "validate", `Validation FAIL — ${v.issues.length} issue(s). See docs/validation-report.md.`, "error");
  return false;
}

// --- orchestrator -------------------------------------------------------------

export async function forge(projectId: string, opts: ForgeOptions = {}): Promise<{ ok: boolean; failedAt: ForgeStage | null }> {
  const p = getProject(projectId);
  if (!p) throw new Error(`Project ${projectId} not found.`);
  const ws = new Workspace(p.data_path);
  const git = new GitRepo(ws);
  if (!(await git.isRepo())) await git.init(GIT_IDENTITY);

  // Crash recovery: a previous interrupted run may have left tasks "running".
  for (const t of listTasks(p.id)) {
    if (t.status === "running") {
      updateTask(t.id, { status: "pending", error: "Recovered: reset from interrupted run." });
      stage(p.id, "buildout", `Task '${t.title}' reset to pending (interrupted run).`, "warning");
    }
  }

  const stages = opts.stages && opts.stages.length > 0 ? opts.stages : ALL_STAGES;
  let plan: GamePlan | null = null;

  for (const s of stages) {
    try {
      switch (s) {
        case "analyze": {
          plan = await stageAnalyze(p);
          updateProject(p.id, { progress: 10 });
          break;
        }
        case "dna": {
          if (!plan) plan = await stageAnalyze(p);
          stageDna(p, plan, {
            idea: p.idea,
            name: p.name === p.slug ? undefined : p.name,
            dimensions: p.dimensions as Dimension,
            qualityTier: p.quality_tier as QualityTier,
            platforms: JSON.parse(p.platforms) as GameBrief["platforms"],
            engine: p.engine as EngineId,
            contentRating: p.content_rating as ContentRating,
          });
          updateProject(p.id, { progress: 20 });
          break;
        }
        case "gdd": {
          if (!plan) plan = await stageAnalyze(p);
          await stageGdd(p, ws, git, plan);
          updateProject(p.id, { progress: 30 });
          break;
        }
        case "architecture": {
          if (!plan) plan = await stageAnalyze(p);
          await stageArchitecture(p, ws, git, plan);
          updateProject(p.id, { progress: 35 });
          break;
        }
        case "scaffold": {
          if (!plan) plan = await stageAnalyze(p);
          if (plan.engine === "godot4") {
            const autoInstall = opts.mode !== "manual";
            const ensured = await ensureGodot(autoInstall);
            stage(p.id, "scaffold", `Godot engine check: ${ensured.note}`, ensured.available ? "info" : "warning");
            if (!ensured.available) {
              updateProject(p.id, { status: "failed" });
              return { ok: false, failedAt: "scaffold" };
            }
          }
          await stageScaffold(p, ws, git, plan);
          updateProject(p.id, { progress: 55, status: "prototyping" });
          break;
        }
        case "tasks": {
          if (!plan) plan = await stageAnalyze(p);
          stageTasks(p, plan);
          updateProject(p.id, { progress: 60 });
          break;
        }
        case "buildout": {
          if (!plan) plan = await stageAnalyze(p);
          await stageBuildout(p, ws, git, plan);
          break;
        }
        case "validate": {
          if (!plan) plan = await stageAnalyze(p);
          const ok = await stageValidate(p, ws, git, plan);
          return { ok, failedAt: ok ? null : "validate" };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stage(p.id, s, `Stage failed: ${msg}`, "error");
      updateProject(p.id, { status: "failed" });
      return { ok: false, failedAt: s };
    }
  }
  return { ok: true, failedAt: null };
}

/** Creates a project and runs the full pipeline (API + CLI + tests). */
export async function forgeNew(input: GameBrief, opts: ForgeOptions = {}): Promise<{ projectId: string; ok: boolean; failedAt: ForgeStage | null }> {
  const p = createProject({
    idea: input.idea,
    name: input.name,
    dimensions: input.dimensions,
    qualityTier: input.qualityTier,
    platforms: input.platforms,
    engine: input.engine,
    genreTags: input.genreTags,
    contentRating: input.contentRating,
  });
  stage(p.id, "analyze", `Project created: ${p.name} (${p.slug}).`, "success");
  const result = await forge(p.id, opts);
  return { projectId: p.id, ...result };
}
