/**
 * Nexus Director — turns an idea into a buildable plan (Game DNA draft,
 * GDD, task graph). Two REAL paths:
 *  - LLM path (OpenRouter configured): validated-JSON planning grounded in
 *    the genre archetype knowledge base.
 *  - Offline path (no provider): deterministic archetype-driven planning.
 *    Honest: labeled "inferred" everywhere, no fake intelligence.
 */
import { z } from "zod";
import type { CreateProjectInput, EngineId } from "@nexus/shared";
import { chatJson, getProviderForRole } from "../providers/registry";
import { PERSONAS } from "../agents/prompts";
import { archetypeContext, matchArchetypes, type GenreArchetype } from "../knowledge/genres";

// --- validated planning contract -------------------------------------------

export const GamePlan = z.object({
  name: z.string().min(2).max(60),
  shortDescription: z.string().min(10).max(300),
  dimensions: z.enum(["2d", "3d", "2.5d", "hybrid"]),
  qualityTier: z.enum(["ps2-era", "indie", "aa", "aaa", "mobile-2d"]),
  engine: z.enum(["godot4", "unreal5", "unity", "custom"]),
  flavor: z.enum(["topdown", "platformer", "3d", "fps", "turnbattle"]),
  platforms: z.array(z.string()).min(1),
  genreTags: z.array(z.string()).default([]),
  coreLoop: z.string().min(20),
  pillars: z.array(z.string()).min(2).max(5),
  systems: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
    dependsOn: z.array(z.string()).default([]),
  })).min(3).max(14),
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    type: z.enum(["design", "architecture", "scaffold", "code", "assets", "audio", "ui", "validation", "build", "docs", "fix", "playtest"]),
    priority: z.number().int().min(1).max(9),
    risk: z.enum(["low", "medium", "high"]),
    dependsOn: z.number().int().min(-1).default(-1),
  })).min(3).max(16),
  openQuestions: z.array(z.string()).default([]),
});
export type GamePlan = z.infer<typeof GamePlan>;

/** Picks the best engine for the user's ask (2D→Godot, heavy 3D→UE5). */
function recommendEngine(dim: string, tier: string, requested?: EngineId): { engine: EngineId; reason: string } {
  if (requested) return { engine: requested, reason: "user-selected" };
  if (dim === "2d" || dim === "2.5d") return { engine: "godot4", reason: "2D focus — Godot 4 gives the fastest iteration and the Nexus validates Godot projects headless (fewer errors)." };
  if (tier === "aaa" || tier === "aa") return { engine: "unreal5", reason: "High-end 3D target — Unreal Engine 5." };
  return { engine: "godot4", reason: "Balanced 3D — Godot 4 keeps the autonomous loop fully verifiable on this machine." };
}

function pickFlavor(dim: string, archetype: GenreArchetype | undefined, idea: string): GamePlan["flavor"] {
  const t = idea.toLowerCase();
  if (dim === "3d" || dim === "hybrid") {
    if (t.includes("shooter") || t.includes("fps") || archetype?.id === "fps-multiplayer") return "fps";
    return "3d";
  }
  if (t.includes("platform") || archetype?.id === "metroidvania" || archetype?.id === "precision-platformer") return "platformer";
  if (archetype?.id === "jrpg-narrative") return "turnbattle";
  return "topdown";
}

function offlinePlan(input: CreateProjectInput, archetypes: GenreArchetype[]): GamePlan {
  const primary = archetypes[0];
  const dim = input.dimensions ?? (primary && primary.dimension === "3d" ? "3d" : primary?.dimension === "2.5d" ? "2.5d" : "2d");
  const engineRec = recommendEngine(dim, input.qualityTier ?? "indie", input.engine);
  const flavor = pickFlavor(dim, primary, input.idea);
  const tier = input.qualityTier ?? "indie";
  const baseSystems: Array<{ name: string; purpose: string; dependsOn: string[] }> = [
    { name: "PlayerController", purpose: "Core movement & feel (the fantasy carrier).", dependsOn: [] },
    { name: "WorldSetup", purpose: "Arena/level layout with cover and landmarks.", dependsOn: [] },
    { name: "Interaction", purpose: "Collectibles/objectives and pickups.", dependsOn: ["PlayerController"] },
    { name: "Hostiles", purpose: "Enemies with chase/attack behaviors + difficulty ramp.", dependsOn: ["PlayerController"] },
    { name: "HUD", purpose: "Objective, vitals and world clock UI.", dependsOn: ["Interaction"] },
    { name: "GameState", purpose: "Win/lose conditions, scoring, run restart.", dependsOn: ["Interaction", "Hostiles"] },
  ];
  return {
    name: input.name ?? (primary ? `${primary.label.split("/")[0]!.trim()} Prototype` : "Nexus Prototype"),
    shortDescription: input.idea.slice(0, 220),
    dimensions: dim as GamePlan["dimensions"],
    qualityTier: tier as GamePlan["qualityTier"],
    engine: engineRec.engine,
    flavor,
    platforms: input.platforms ?? ["windows", "linux"],
    genreTags: (input.genreTags ?? archetypes.map((a) => a.id)).slice(0, 4),
    coreLoop: primary?.coreLoop ?? "Explore, gather, survive escalating threats, and complete the objective.",
    pillars: primary?.pillars.slice(0, 4) ?? ["Loop clarity", "Juicy feedback", "Survival pressure"],
    systems: baseSystems,
    tasks: [
      { title: "Scaffold engine project", description: `Create the ${engineRec.engine} project with the code-first starter (${flavor}).`, type: "scaffold", priority: 1, risk: "low", dependsOn: -1 },
      { title: "Player controller tuning", description: "Tune movement values (speed, accel) to match the core fantasy.", type: "code", priority: 2, risk: "low", dependsOn: 0 },
      { title: "World layout & pacing", description: "Adjust arena size, obstacles and collectible spread for pacing.", type: "code", priority: 3, risk: "low", dependsOn: 0 },
      { title: "Hostile behavior & threat curve", description: "Tune enemy speed, damage and raid timing.", type: "code", priority: 4, risk: "medium", dependsOn: 1 },
      { title: "HUD clarity pass", description: "Ensure objective/vitals/clock read clearly at a glance.", type: "ui", priority: 5, risk: "low", dependsOn: 2 },
      { title: "Headless validation + QA report", description: "Run engine validation, fix errors, record QA findings.", type: "validation", priority: 6, risk: "low", dependsOn: 3 },
    ],
    openQuestions: [
      ...(input.name ? [] : ["Game name was not provided — a working title was inferred."]),
      ...(input.platforms ? [] : ["Target platforms not specified — defaulted to desktop."]),
      ...(input.qualityTier ? [] : ["Quality tier not specified — assumed 'indie'."]),
    ],
  };
}

export async function planGame(input: CreateProjectInput): Promise<{ plan: GamePlan; usedLLM: boolean; archetypes: GenreArchetype[] }> {
  const archetypes = matchArchetypes(`${input.idea} ${input.genreTags?.join(" ") ?? ""}`, 3);
  const hasLLM = getProviderForRole("director") != null;

  if (!hasLLM) {
    return { plan: offlinePlan(input, archetypes), usedLLM: false, archetypes };
  }

  const userFields = [
    input.name && `name: ${input.name}`,
    input.dimensions && `dimensions: ${input.dimensions}`,
    input.qualityTier && `quality tier: ${input.qualityTier}`,
    input.platforms && `platforms: ${input.platforms.join(", ")}`,
    input.engine && `engine preference: ${input.engine}`,
    input.contentRating && `content rating: ${input.contentRating}`,
  ].filter(Boolean).join("; ");

  const prompt = `## USER IDEA (the only required input)
"${input.idea}"
${userFields ? `\n## EXPLICIT USER FIELDS (respect as confirmed)\n${userFields}` : ""}

${archetypes.length > 0 ? `## RELEVANT GENRE ARCHETYPES (patterns from comparable games — grounding, not copying)\n${archetypeContext(archetypes)}` : ""}

## YOUR JOB
Produce the prototype plan for the FIRST MILESTONE: a playable vertical slice that proves the core fantasy.

## OUTPUT CONTRACT (exact — reply ONLY with this JSON)
{
  "name": "string 2-60 chars",
  "shortDescription": "string 10-300 chars",
  "dimensions": "2d" | "3d" | "2.5d" | "hybrid",
  "qualityTier": "ps2-era" | "indie" | "aa" | "aaa" | "mobile-2d",
  "engine": "godot4" | "unreal5",
  "flavor": "topdown" | "platformer" | "3d" | "fps" | "turnbattle",
  "platforms": ["windows", "linux", "macos", "switch", "ps5", "xbox", "android", "ios", "web", "vr"],
  "genreTags": ["short-tags"],
  "coreLoop": "string, 20+ chars, one full loop sentence",
  "pillars": ["2-5 pillars"],
  "systems": [{"name": "PascalCase", "purpose": "one sentence", "dependsOn": ["OtherSystemName"]}],
  "tasks": [{"title": "string", "description": "concrete code/ui/validation work", "type": "design"|"architecture"|"scaffold"|"code"|"assets"|"audio"|"ui"|"validation"|"build"|"docs"|"fix"|"playtest", "priority": 1-9, "risk": "low"|"medium"|"high", "dependsOn": index of earlier task or -1}],
  "openQuestions": ["questions for the creative director"]
}

Rules:
- "flavor" selects the starter template: topdown | platformer | 3d | fps | turnbattle (2D games must use topdown/platformer/turnbattle).
- "engine": godot4 unless the user demands heavy 3D/AAA (then unreal5).
- "systems" 4-8 for the slice; "tasks" 4-8 with dependsOn as the index of an earlier task (-1 = none).
- Tasks must be concrete code/UI/validation work — no vague "make it fun".
- Match the user's language (write name/descriptions in the idea's language).`;

  try {
    const plan = await chatJson("director", {
      messages: [
        { role: "system", content: PERSONAS["director"]! },
        { role: "user", content: prompt },
      ],
      maxTokens: 6000,
      temperature: 0.6,
    }, GamePlan);
    // honor explicit user fields over LLM drift
    if (input.name) plan.name = input.name;
    if (input.dimensions) plan.dimensions = input.dimensions;
    if (input.engine) plan.engine = input.engine;
    if (input.platforms && plan.platforms.length === 0) plan.platforms = input.platforms;
    return { plan, usedLLM: true, archetypes };
  } catch (e) {
    // Honest fallback: LLM planning failed → deterministic archetype plan
    const fallback = offlinePlan(input, archetypes);
    fallback.openQuestions.unshift(`LLM planning failed (${e instanceof Error ? e.message : String(e)}) — used deterministic archetype planning.`);
    return { plan: fallback, usedLLM: false, archetypes };
  }
}

// --- GDD --------------------------------------------------------------------

export function offlineGdd(name: string, plan: GamePlan): string {
  return `# ${name} — Game Design Document (v0 draft)

> Generated by Nexus Forge. Sections marked *inferred* were derived from the idea and genre archetypes; review and confirm in the Game DNA view.

## Vision
${plan.shortDescription}

## Core Fantasy
${plan.pillars[0] ?? "To be defined with the creative director."}

## Design Pillars
${plan.pillars.map((p) => `- ${p}`).join("\n")}

## Core Loop
${plan.coreLoop}

## Systems (prototype milestone)
${plan.systems.map((s) => `- **${s.name}** — ${s.purpose}${s.dependsOn.length ? ` (needs: ${s.dependsOn.join(", ")})` : ""}`).join("\n")}

## Platforms
${plan.platforms.join(", ")} (dimension: ${plan.dimensions}, tier: ${plan.qualityTier})

## Open Questions (require creative director decision)
${plan.openQuestions.length ? plan.openQuestions.map((q) => `- ${q}`).join("\n") : "- None at this stage."}
`;
}

export async function generateGdd(name: string, plan: GamePlan, idea: string): Promise<{ markdown: string; usedLLM: boolean }> {
  if (getProviderForRole("designer") == null) return { markdown: offlineGdd(name, plan), usedLLM: false };
  try {
    const md = await chatJson("designer", {
      messages: [
        { role: "system", content: PERSONAS["designer"]! },
        {
          role: "user",
          content: `Write a compact GDD (markdown) as JSON {"markdown": "..."} for the game "${name}".
Idea: "${idea}"
Core loop: ${plan.coreLoop}
Pillars: ${plan.pillars.join(" | ")}
Systems: ${plan.systems.map((s) => s.name).join(", ")}
Include: Vision, Core Fantasy, Pillars, Core Loop, Systems breakdown with numbers (damage/speed/durations), Progression sketch, Open Questions. Write in the idea's language. Keep under 700 words.`,
        },
      ],
      maxTokens: 4000,
      temperature: 0.7,
    }, z.object({ markdown: z.string().min(200) }));
    return { markdown: md.markdown, usedLLM: true };
  } catch {
    return { markdown: offlineGdd(name, plan), usedLLM: false };
  }
}
