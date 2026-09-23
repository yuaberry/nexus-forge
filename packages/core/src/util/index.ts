/** Small utilities: ids, paths, time, fs helpers. */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function uid(prefix = ""): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${raw}` : raw;
}

export function now(): string {
  return new Date().toISOString();
}

/** Root data dir: ~/.nexusforge (never inside repo). */
export function dataRoot(): string {
  return join(homedir(), ".nexusforge");
}

export function projectsRoot(): string {
  return join(dataRoot(), "projects");
}

export function ensureDirs(...paths: string[]): void {
  for (const p of paths) mkdirSync(p, { recursive: true });
}
