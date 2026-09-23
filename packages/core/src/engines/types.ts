/**
 * GameEngineAdapter — the abstract interface every engine integration
 * implements (Godot 4 first, Unreal 5 scaffold, Unity/Godot later).
 * Methods are honest: if an engine is not installed, detect() says so and
 * build() throws a clear error instead of pretending.
 */
import type { Dimension, EngineId, QualityTier } from "@nexus/shared";

/** Parameters that drive project generation (from Game DNA). */
export interface GameSpec {
  title: string;
  slug: string;
  dimension: Dimension;
  qualityTier: QualityTier;
  /** Flavor drives which starter template is used. */
  flavor: "topdown" | "platformer" | "3d" | "fps" | "turnbattle";
  palette: { primary: string; accent: string; bg: string; fg: string };
  playerSpeed: number;
  shortDescription: string;
}

export interface ScaffoldResult {
  files: string[];
  mainScene?: string;
  notes: string[];
}

export interface EngineAdapter {
  readonly id: EngineId;
  readonly label: string;
  detect(): Promise<{ installed: boolean; version: string | null; path: string | null; note: string }>;
  /** Creates a new engine project inside the workspace. */
  createProject(wsPath: string, spec: GameSpec): Promise<ScaffoldResult>;
  /** Headless validation: parse-check scripts + smoke-run frames. */
  validate?(wsPath: string, opts?: { frames?: number }): Promise<ValidationResult>;
  openEditor?(wsPath: string): Promise<{ started: boolean; note: string }>;
}

export interface ValidationIssue {
  file: string;
  line?: number;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  logExcerpt: string;
  durationMs: number;
}
