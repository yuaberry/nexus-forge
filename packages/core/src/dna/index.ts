/**
 * Game DNA — the permanent structured memory of a game project.
 * Every field carries origin (confirmed/inferred/unknown/requires_decision)
 * so the user always knows what the AI decided vs. what they said.
 * Agents must consult DNA before acting (enforced by agent context packs).
 */
import type { DnaSection, DnaSectionData, Origin } from "@nexus/shared";
import { getDB } from "../db";
import { now } from "../util";

export function readDna(projectId: string): Record<DnaSection, DnaSectionData> {
  const rows = getDB().all<{
    section: string; key: string; value_json: string; origin: Origin; note: string | null; version: number; updated_at: string;
  }>(`SELECT * FROM dna WHERE project_id = ?`, projectId);
  const out = {} as Record<DnaSection, DnaSectionData>;
  for (const r of rows) {
    (out[r.section as DnaSection] ??= {})[r.key] = {
      value: JSON.parse(r.value_json),
      origin: r.origin,
      note: r.note ?? undefined,
      updatedAt: r.updated_at,
    };
  }
  return out;
}

export function readDnaSection(projectId: string, section: DnaSection): DnaSectionData {
  const rows = getDB().all<{ key: string; value_json: string; origin: Origin; note: string | null; updated_at: string }>(
    `SELECT key, value_json, origin, note, updated_at FROM dna WHERE project_id = ? AND section = ?`,
    projectId, section,
  );
  const out: DnaSectionData = {};
  for (const r of rows) {
    out[r.key] = { value: JSON.parse(r.value_json), origin: r.origin, note: r.note ?? undefined, updatedAt: r.updated_at };
  }
  return out;
}

export function writeDnaField(
  projectId: string, section: DnaSection, key: string,
  value: unknown, origin: Origin, note?: string,
): void {
  const db = getDB();
  const existing = db.get<{ version: number }>(
    `SELECT version FROM dna WHERE project_id=? AND section=? AND key=?`, projectId, section, key,
  );
  db.run(
    `INSERT INTO dna (project_id, section, key, value_json, origin, note, version, updated_at)
     VALUES (?,?,?,?,?,?,1,?)
     ON CONFLICT(project_id, section, key) DO UPDATE SET
       value_json=excluded.value_json, origin=excluded.origin, note=excluded.note,
       version=version+1, updated_at=excluded.updated_at`,
    projectId, section, key, JSON.stringify(value), origin, note ?? null, now(),
  );
}

export function writeDnaSection(
  projectId: string, section: DnaSection, data: DnaSectionData, origin: Origin,
): void {
  for (const [key, field] of Object.entries(data)) {
    writeDnaField(projectId, section, key, field.value ?? field, field.origin ?? origin, field.note);
  }
}

/** Compact DNA summary injected into agent context packs. */
export function dnaContext(projectId: string, sections: DnaSection[], maxChars = 6000): string {
  const dna = readDna(projectId);
  const parts: string[] = [];
  for (const s of sections) {
    const data = dna[s];
    if (!data || Object.keys(data).length === 0) continue;
    const body = Object.entries(data)
      .map(([k, f]) => `- ${k}: ${JSON.stringify(f.value)} (${f.origin})`)
      .join("\n");
    parts.push(`### ${s}\n${body}`);
  }
  const text = parts.join("\n\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(DNA truncated)` : text;
}

/** Records a design decision (contradicting approved decisions requires review). */
export function recordDecision(projectId: string, title: string, rationale: string): string {
  const id = `dec_${crypto.randomUUID().slice(0, 12)}`;
  getDB().run(
    `INSERT INTO decisions (id, project_id, title, rationale, status, created_at) VALUES (?,?,?,?,?,?)`,
    id, projectId, title, rationale, "open", now(),
  );
  return id;
}
