/** Shared contract types for the Nexus Forge. Used by core service and UI. */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Platform & quality targets (elevated goal: 2D AND 3D, indie → AAA-comparable)
// ---------------------------------------------------------------------------

export const Platforms = z.enum([
  "windows", "linux", "macos", "ps5", "ps4", "xbox", "switch", "switch2",
  "ios", "android", "web", "vr",
]);
export type PlatformId = z.infer<typeof Platforms>;

export const Dimensions = z.enum(["2d", "3d", "2.5d", "hybrid"]);
export type Dimension = z.infer<typeof Dimensions>;

/** Quality tiers used to calibrate scope, systems and perf budgets. */
export const QualityTiers = z.enum(["ps2-era", "indie", "aa", "aaa", "mobile-2d"]);
export type QualityTier = z.infer<typeof QualityTiers>;

export const ContentRatings = z.enum(["everyone", "teen", "mature", "adult"]);
export type ContentRating = z.infer<typeof ContentRatings>;

// ---------------------------------------------------------------------------
// Game DNA — permanent structured memory of a game project
// ---------------------------------------------------------------------------

export const Origin = z.enum(["confirmed", "inferred", "unknown", "requires_decision"]);
export type Origin = z.infer<typeof Origin>;

export const DNA_SECTIONS = [
  "vision", "coreFantasy", "designPillars", "genre", "gameplayLoop", "mechanics",
  "world", "lore", "characters", "factions", "economy", "progression",
  "artDirection", "audioDirection", "uxPrinciples", "technicalArchitecture",
  "performanceTargets", "platforms", "engine", "codingStandards", "assetRules",
  "namingConventions", "developmentRules", "decisions",
] as const;
export type DnaSection = (typeof DNA_SECTIONS)[number];

/** Every DNA field carries provenance so humans know what was inferred. */
export const DnaField = z.object({
  value: z.unknown(),
  origin: Origin.default("unknown"),
  note: z.string().optional(),
  updatedAt: z.string(),
});

/** A DNA section is a bag of typed fields with provenance. */
export const DnaSectionData = z.record(z.string(), DnaField);
export type DnaSectionData = z.infer<typeof DnaSectionData>;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const EngineId = z.enum(["godot4", "unreal5", "unity", "custom"]);
export type EngineId = z.infer<typeof EngineId>;

export const ProjectStatus = z.enum(["draft", "planning", "prototyping", "building", "playable", "shipped", "paused", "failed"]);

export const GameBrief = z.object({
  /** Free-form natural language idea. The single required input. */
  idea: z.string().min(10),
  name: z.string().optional(),
  dimensions: Dimensions.optional(),
  qualityTier: QualityTiers.optional(),
  platforms: z.array(Platforms).optional(),
  engine: EngineId.optional(),
  genreTags: z.array(z.string()).optional(),
  contentRating: ContentRatings.optional(),
  /** Paths/metadata of attached reference files (copied into the project). */
  attachments: z.array(z.object({
    name: z.string(),
    kind: z.enum(["image", "document", "text", "other"]),
    note: z.string().optional(),
  })).optional(),
});
export type GameBrief = z.infer<typeof GameBrief>;

// ---------------------------------------------------------------------------
// Tasks & orchestration
// ---------------------------------------------------------------------------

export const TaskStatus = z.enum([
  "pending", "planning", "running", "waiting", "blocked", "review",
  "approved", "failed", "completed",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskRisk = z.enum(["low", "medium", "high"]);
export type TaskRisk = z.infer<typeof TaskRisk>;
export const TaskType = z.enum([
  "design", "architecture", "scaffold", "code", "assets", "audio", "ui",
  "validation", "build", "docs", "fix", "playtest",
]);
export type TaskType = z.infer<typeof TaskType>;

export const AgentRole = z.enum([
  "director", "designer", "architect", "coder", "qa", "fixer", "reviewer",
  "reference_analyst", "art_director", "world_builder", "audio", "docs",
]);
export type AgentRole = z.infer<typeof AgentRole>;

export const Task = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  type: TaskType,
  priority: z.number().int().default(5),
  status: TaskStatus.default("pending"),
  dependsOn: z.array(z.string()).default([]),
  assignedAgent: AgentRole.nullable().default(null),
  risk: TaskRisk.default("low"),
  requiresApproval: z.boolean().default(false),
  files: z.array(z.string()).default([]),
  result: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof Task>;

// ---------------------------------------------------------------------------
// Events / activity feed / logs
// ---------------------------------------------------------------------------

export const EventLevel = z.enum(["info", "success", "warning", "error"]);
export type EventLevel = z.infer<typeof EventLevel>;

export const ForgeEvent = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  agent: z.string().nullable(),
  stage: z.string().nullable(),
  level: EventLevel,
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  ts: z.string(),
});
export type ForgeEvent = z.infer<typeof ForgeEvent>;

// ---------------------------------------------------------------------------
// AI provider system
// ---------------------------------------------------------------------------

export const ProviderId = z.enum(["openrouter", "openai-compat", "ollama", "offline"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const ModelAssignment = z.object({
  /** agent role → provider + model */
  role: AgentRole,
  provider: ProviderId,
  model: z.string(),
});
export type ModelAssignment = z.infer<typeof ModelAssignment>;

// ---------------------------------------------------------------------------
// Engine status
// ---------------------------------------------------------------------------

export const EngineStatus = z.object({
  engine: EngineId,
  installed: z.boolean(),
  version: z.string().nullable(),
  path: z.string().nullable(),
  note: z.string(),
});

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export const CreateProjectInput = GameBrief;
export type CreateProjectInput = z.infer<typeof GameBrief>;

export const ForgeStage = z.enum([
  "analyze", "dna", "gdd", "architecture", "scaffold", "tasks", "buildout", "validate",
]);
export type ForgeStage = z.infer<typeof ForgeStage>;

export const ForgeCommand = z.object({
  /** What the user wants. Empty = run full default pipeline. */
  command: z.string().default(""),
  stages: z.array(ForgeStage).optional(),
  /** manual | assisted | autonomous */
  mode: z.enum(["manual", "assisted", "autonomous"]).default("assisted"),
});
export type ForgeCommand = z.infer<typeof ForgeCommand>;
