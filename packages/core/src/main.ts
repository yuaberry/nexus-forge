/**
 * Nexus Forge entrypoint.
 *
 *   bun run src/main.ts                 → start the studio server (default)
 *   bun run src/main.ts detect          → print engine detection report
 *   bun run src/main.ts forge --idea "…" [--name X] [--json]
 *                                        → headless full pipeline (CI/tests)
 */
import { detectEngines, ensureGodot } from "./engines/manager";
import { startServer } from "./server";
import { forge, forgeNew } from "./pipeline/forge";
import type { Dimension, EngineId, PlatformId, QualityTier } from "@nexus/shared";

const args = process.argv.slice(2);
const cmd = args[0] ?? "serve";

function arg(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
}

switch (cmd) {
  case "serve": {
    startServer();
    break;
  }
  case "detect": {
    const engines = await detectEngines();
    console.log("=== Nexus Forge — Engine Detection ===");
    for (const e of engines) {
      console.log(`${e.installed ? "✔" : "✖"} ${e.label} ${e.version ?? ""} ${e.installed ? `(at ${e.path})` : "— " + e.note}`);
    }
    const godot = await ensureGodot(true);
    console.log(`Godot ensure: ${godot.available ? "available" : "unavailable"} — ${godot.note}`);
    break;
  }
  case "forge": {
    const resume = arg("resume");
    if (resume) {
      // Resume an existing project's pipeline (crash recovery resets running tasks)
      const result = await forge(resume, { mode: (arg("mode") as "manual" | "assisted" | "autonomous") ?? "assisted" });
      console.log(`\nForge resume result: ${result.ok ? "SUCCESS" : `FAILED at ${result.failedAt}`}`);
      process.exit(result.ok ? 0 : 1);
      break;
    }
    const idea = arg("idea");
    if (!idea) {
      console.error("Usage: forge --idea \"<game idea>\" [--name Title] [--2d|--3d] [--engine godot4|unreal5] [--json]");
      console.error("   or: forge --resume <projectId>");
      process.exit(1);
    }
    const dim = (args.includes("--2d") ? "2d" : args.includes("--3d") ? "3d" : undefined) as Dimension | undefined;
    const engine = arg("engine") as EngineId | undefined;
    const name = arg("name");
    const platforms = (arg("platforms")?.split(",") ?? undefined) as PlatformId[] | undefined;
    const qualityTier = arg("tier") as QualityTier | undefined;

    const result = await forgeNew({
      idea,
      name,
      dimensions: dim,
      engine,
      platforms,
      qualityTier,
    });
    if (args.includes("--json")) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`\nForge result: ${result.ok ? "SUCCESS" : `FAILED at ${result.failedAt}`}`);
      console.log(`Project ID: ${result.projectId}`);
    }
    process.exit(result.ok ? 0 : 1);
    break;
  }
  default: {
    console.error(`Unknown command: ${cmd}. Use: serve | detect | forge`);
    process.exit(1);
  }
}
