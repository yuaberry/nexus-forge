/**
 * Engine Manager — adapter registry, detection and managed downloads.
 * The Nexus NEVER pretends an engine exists: status reflects reality.
 */
import type { EngineId } from "@nexus/shared";
import type { EngineAdapter } from "./types";
import { Godot4Adapter, downloadGodot, managedGodotPath } from "./godot";
import { Unreal5Adapter } from "./unreal";
import { bus } from "../events";
import { existsSync } from "node:fs";

export const adapters: Record<string, EngineAdapter> = {
  godot4: new Godot4Adapter(),
  unreal5: new Unreal5Adapter(),
};

export function getAdapter(id: EngineId): EngineAdapter | null {
  return adapters[id] ?? null;
}

export async function detectEngines() {
  const out = [];
  for (const a of Object.values(adapters)) {
    out.push({ engine: a.id, ...(await a.detect()), label: a.label });
  }
  return out;
}

/** Downloads the official Godot binary into the managed dir (with events). */
export async function installManagedGodot(): Promise<{ path: string; version: string }> {
  bus.emit({ projectId: null, agent: "engine-manager", level: "info", stage: "engine", message: "Downloading official Godot 4.3 (linux x86_64)…" });
  const result = await downloadGodot((pct) => {
    if (pct % 20 === 0) bus.emit({ projectId: null, agent: "engine-manager", level: "info", stage: "engine", message: `Godot download ${pct}%` });
  });
  bus.emit({ projectId: null, agent: "engine-manager", level: "success", stage: "engine", message: `Godot installed at ${result.path}` });
  return result;
}

/** Ensures Godot exists (auto-install allowed by default; honest events). */
export async function ensureGodot(autoInstall = true): Promise<{ available: boolean; note: string }> {
  const det = await adapters["godot4"]!.detect();
  if (det.installed) return { available: true, note: `Using Godot ${det.version}` };
  if (!autoInstall) return { available: false, note: "Godot not installed and auto-install disabled." };
  if (!existsSync(managedGodotPath())) {
    try {
      await installManagedGodot();
    } catch (e) {
      return { available: false, note: `Auto-install failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const recheck = await adapters["godot4"]!.detect();
  return { available: recheck.installed, note: recheck.note };
}
