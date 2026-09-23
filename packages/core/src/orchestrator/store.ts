/**
 * Project & task store — typed persistence over SQLite.
 */
import type { CreateProjectInput, Task, TaskStatus, TaskType, TaskRisk, AgentRole } from "@nexus/shared";
import { getDB } from "../db";
import { now, projectsRoot, ensureDirs, uid } from "../util";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export interface ProjectRow {
  id: string; slug: string; name: string; description: string; idea: string;
  engine: string; engine_version: string | null; dimensions: string; quality_tier: string;
  content_rating: string; platforms: string; status: string; phase: string;
  progress: number; data_path: string; forge_mode: string; created_at: string; updated_at: string;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "game";
}

export function createProject(input: CreateProjectInput & { slug?: string }): ProjectRow {
  const db = getDB();
  ensureDirs(projectsRoot());
  // Unique slug: if taken, append -2, -3, … (never crash on re-runs)
  let slug = input.slug ?? slugify(input.name ?? `game-${uid("").slice(0, 6)}`);
  let n = 2;
  while (getProjectBySlug(slug)) {
    slug = `${(input.slug ?? slugify(input.name ?? "game"))}-${n++}`;
  }
  const id = uid("prj");
  const path = join(projectsRoot(), slug);
  mkdirSync(path, { recursive: true });
  const ts = now();
  db.run(
    `INSERT INTO projects (id, slug, name, description, idea, engine, engine_version, dimensions, quality_tier,
     content_rating, platforms, status, phase, progress, data_path, forge_mode, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'planning', 'Foundation', 0, ?, 'assisted', ?, ?)`,
    id, slug, input.name ?? slug, input.idea.slice(0, 400), input.idea,
    input.engine ?? "godot4", null, input.dimensions ?? "2d", input.qualityTier ?? "indie",
    input.contentRating ?? "teen", JSON.stringify(input.platforms ?? ["windows", "linux"]),
    path, ts, ts,
  );
  return getProject(id)!;
}

export function getProject(id: string): ProjectRow | null {
  return getDB().get<ProjectRow>(`SELECT * FROM projects WHERE id = ?`, id);
}

export function getProjectBySlug(slug: string): ProjectRow | null {
  return getDB().get<ProjectRow>(`SELECT * FROM projects WHERE slug = ?`, slug);
}

export function listProjects(): ProjectRow[] {
  return getDB().all<ProjectRow>(`SELECT * FROM projects ORDER BY created_at DESC`);
}

export function updateProject(id: string, patch: Partial<Record<string, unknown>>): void {
  const cols = Object.keys(patch).filter((k) => ["status", "phase", "progress", "name", "engine", "engine_version", "description", "forge_mode", "platforms", "dimensions", "quality_tier", "content_rating"].includes(k));
  if (cols.length === 0) return;
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => (patch as Record<string, unknown>)[c]) as never[];
  getDB().run(`UPDATE projects SET ${sets}, updated_at = ? WHERE id = ?`, ...values, now(), id);
}

// --- tasks -----------------------------------------------------------------

export function insertTasks(projectId: string, tasks: Array<{
  title: string; description: string; type?: TaskType; priority?: number;
  dependsOn?: string[]; assignedAgent?: AgentRole | null; risk?: TaskRisk;
  requiresApproval?: boolean; files?: string[];
}>): Task[] {
  const db = getDB();
  const ts = now();
  const out: Task[] = [];
  for (const t of tasks) {
    const id = uid("task");
    db.run(
      `INSERT INTO tasks (id, project_id, title, description, type, priority, status, depends_on,
       assigned_agent, risk, requires_approval, files, result, error, created_at, updated_at)
       VALUES (?,?,?,?,?,?, 'pending', ?,?,?,?,?, NULL, NULL, ?, ?)`,
      id, projectId, t.title, t.description, t.type ?? "code", t.priority ?? 5,
      JSON.stringify(t.dependsOn ?? []), t.assignedAgent ?? null, t.risk ?? "low",
      t.requiresApproval ? 1 : 0, JSON.stringify(t.files ?? []), ts, ts,
    );
    out.push({
      id, projectId, title: t.title, description: t.description, type: t.type ?? "code",
      priority: t.priority ?? 5, status: "pending", dependsOn: t.dependsOn ?? [],
      assignedAgent: t.assignedAgent ?? null, risk: t.risk ?? "low",
      requiresApproval: t.requiresApproval ?? false, files: t.files ?? [],
      result: null, error: null, createdAt: ts, updatedAt: ts,
    });
  }
  return out;
}

type TaskRow = Task & Record<string, unknown>;

export function listTasks(projectId: string): Task[] {
  return getDB().all<TaskRow>(
    `SELECT id, project_id as projectId, title, description, type, priority, status,
     depends_on as dependsOn, assigned_agent as assignedAgent, risk, requires_approval as requiresApproval,
     files, result, error, created_at as createdAt, updated_at as updatedAt
     FROM tasks WHERE project_id = ? ORDER BY priority ASC, created_at ASC`,
    projectId,
  ).map((r) => ({ ...r, dependsOn: JSON.parse(String(r.dependsOn ?? "[]")), files: JSON.parse(String(r.files ?? "[]")), requiresApproval: Boolean(r.requiresApproval) })) as unknown as Task[];
}

export function updateTask(id: string, patch: { status?: TaskStatus; result?: string | null; error?: string | null; files?: string[] }): void {
  const db = getDB();
  if (patch.status) db.run(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`, patch.status, now(), id);
  if (patch.result !== undefined) db.run(`UPDATE tasks SET result = ?, updated_at = ? WHERE id = ?`, patch.result, now(), id);
  if (patch.error !== undefined) db.run(`UPDATE tasks SET error = ?, updated_at = ? WHERE id = ?`, patch.error, now(), id);
  if (patch.files) db.run(`UPDATE tasks SET files = ?, updated_at = ? WHERE id = ?`, JSON.stringify(patch.files), now(), id);
}

/** Next runnable task: pending, all dependencies completed, approval honored. */
export function nextRunnableTask(projectId: string): Task | null {
  const tasks = listTasks(projectId);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    if (t.status !== "pending" && t.status !== "approved") continue;
    // tasks flagged for approval must be explicitly approved first
    if (t.requiresApproval && t.status !== "approved") continue;
    const depsOk = (t.dependsOn as string[]).every((d) => byId.get(d)?.status === "completed");
    if (!depsOk) continue;
    return t;
  }
  return null;
}

export function computeProgress(projectId: string): number {
  const tasks = listTasks(projectId);
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "completed").length;
  return Math.round((done / tasks.length) * 100);
}
