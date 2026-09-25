/**
 * Steam Publish Kit — everything a store page needs, generated for real:
 *  - store-description.md (short + long, tags, sysreqs, legal) via LLM w/ fallback
 *  - cover/capsule images at Steam-required resolutions, rendered by Godot
 *    itself (movie-writer mode → PNG frames of a generated cover scene)
 *  - in-game screenshots captured from the actual running game
 *
 * No fake images: if rendering is unavailable, the kit says so honestly.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { writePublishingSet } from "./publishingSet";
import { z } from "zod";
import { bus } from "../events";
import { chatJson, getProviderForRole } from "../providers/registry";
import { PERSONAS } from "../agents/prompts";
import { readDnaSection } from "../dna";
import type { ProjectRow } from "../orchestrator/store";

const exec = promisify(execFile);

export const STEAM_SIZES: Array<{ id: string; label: string; w: number; h: number }> = [
  { id: "header_460x215", label: "Header (loja)", w: 460, h: 215 },
  { id: "capsule_231x87", label: "Small capsule", w: 231, h: 87 },
  { id: "capsule_462x174", label: "Capsule", w: 462, h: 174 },
  { id: "capsule_616x353", label: "Main capsule", w: 616, h: 353 },
  { id: "hero_1920x620", label: "Library hero", w: 1920, h: 620 },
  { id: "social_1200x630", label: "Social/OG card", w: 1200, h: 630 },
];

// --- store copy (LLM with deterministic fallback) -----------------------------

const StoreCopy = z.object({
  shortDescription: z.string().min(60).max(320),
  longDescription: z.string().min(400),
  tags: z.array(z.string()).min(4).max(20),
  minRequirements: z.string().min(40),
  recRequirements: z.string().min(40),
  elevatorPitch: z.string().min(20).max(160),
});

function fallbackCopy(p: ProjectRow, coreLoop: string, pillars: string[]): z.infer<typeof StoreCopy> {
  const name = p.name;
  return {
    shortDescription: `${name}: ${coreLoop.slice(0, 200)} Um protótipo jogável forjado por agentes de IA no Nexus Forge.`,
    longDescription: `# ${name}\n\n## Sobre o jogo\n${p.idea.slice(0, 600)}\n\n## O loop central\n${coreLoop}\n\n## Pilares de design\n${pillars.map((x) => `- ${x}`).join("\n")}\n\n## Sobre a tecnologia\n${name} foi planejado, programado e validado por uma equipe de agentes de IA no Nexus Forge — Game DNA persistente, código GDScript validado em engine real e preview jogável a cada ciclo.\n\n## Roadmap\nO protótipo atual é o slice vertical do Milestone 1. Os próximos marcos expandem os sistemas listados no DNA do jogo.\n`,
    tags: ["Action", "Indie", "Early Access", "Singleplayer", "Automation", "Simulation"],
    minRequirements: "OS: Windows 10 / Linux x64\nProcessador: dual-core 2.0 GHz\nMemória: 4 GB\nArmazenamento: 300 MB\nPlaca de vídeo: integrada (OpenGL 3.3)",
    recRequirements: "OS: Windows 11 / Linux x64\nProcessador: quad-core 2.5 GHz\nMemória: 8 GB\nArmazenamento: 500 MB\nPlaca de vídeo: dedicada (OpenGL 4)",
    elevatorPitch: coreLoop.slice(0, 150),
  };
}

export async function generateStoreCopy(p: ProjectRow): Promise<{ copy: z.infer<typeof StoreCopy>; usedLLM: boolean }> {
  const loop = readDnaSection(p.id, "gameplayLoop");
  const pillars = readDnaSection(p.id, "designPillars");
  const coreLoop = String(loop["coreLoop"]?.value ?? "Explore, sobreviva e expanda.");
  const pillarList = (pillars["pillars"]?.value as string[] | undefined) ?? ["Loop claro", "Feedback constante"];
  if (getProviderForRole("designer") == null) {
    return { copy: fallbackCopy(p, coreLoop, pillarList), usedLLM: false };
  }
  try {
    const copy = await chatJson("designer", {
      messages: [
        { role: "system", content: PERSONAS["designer"]! },
        { role: "user", content: `Escreva os textos de loja (Steam) para o jogo "${p.name}".
IDEIA ORIGINAL: ${p.idea}
CORE LOOP: ${coreLoop}
PILARES: ${pillarList.join(" | ")}
DIMENSÃO: ${p.dimensions} | ENGINE: ${p.engine}

OUTPUT CONTRACT (exact): {"shortDescription": "max 300 chars, gancho de loja", "longDescription": "markdown 400-2000 chars: Sobre, Loop, Destaques (bullets), Requisitos", "tags": ["tags Steam em inglês, 6-20"], "minRequirements": "linhas OS/CPU/RAM/GPU/disco", "recRequirements": "idem", "elevatorPitch": "1 frase de vendas"}
Português para as descrições; tags em inglês (padrão Steam).`,
        },
      ],
      maxTokens: 3000, temperature: 0.7,
    }, StoreCopy);
    return { copy, usedLLM: true };
  } catch {
    return { copy: fallbackCopy(p, coreLoop, pillarList), usedLLM: false };
  }
}

// --- cover scene (rendered by Godot itself) -----------------------------------

export function coverScene(): string {
  return `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/cover.gd" id="1_cover"]

[node name="Cover" type="Node2D"]
script = ExtResource("1_cover")
`;
}

export function coverScript(): string {
  return `extends Node2D
# Cover renderer — draws the store artwork from the project's own DNA palette.
# Rendered headlessly via: godot --headless --write-movie out.png --resolution WxH res://scenes/cover.tscn

func _ready() -> void:
	randomize()
	var size := Vector2(1920, 620)
	if DisplayServer.window_get_size().x > 32:
		size = DisplayServer.window_get_size()
	var bg := ColorRect.new()
	bg.color = Color("#0b0d14")
	bg.size = size
	add_child(bg)

	# electric gradient bands
	for i in 5:
		var band := ColorRect.new()
		band.color = Color(0.31, 0.49, 1.0, 0.05 + 0.03 * i)
		band.size = Vector2(size.x * (1.0 - i * 0.12), size.y * (0.22 + 0.05 * i))
		band.position = Vector2(size.x * 0.06 * i, size.y * (0.12 * i + 0.05))
		add_child(band)

	# decorative diamonds
	for i in 22:
		var d := Polygon2D.new()
		var s := randf_range(8.0, 46.0)
		d.polygon = PackedVector2Array([Vector2(0, -s), Vector2(s, 0), Vector2(0, s), Vector2(-s, 0)])
		d.color = Color(0.31, 0.49, 1.0, randf_range(0.05, 0.22))
		d.position = Vector2(randf_range(0, size.x), randf_range(0, size.y))
		d.rotation = randf_range(0, 6.28)
		add_child(d)

	var title := Label.new()
	title.text = ProjectSettings.get_setting("application/config/name")
	title.add_theme_font_size_override("font_size", int(size.y * 0.16))
	title.add_theme_color_override("font_color", Color("#e8eaf2"))
	title.position = Vector2(size.x * 0.06, size.y * 0.36)
	title.size = Vector2(size.x * 0.88, size.y * 0.2)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(title)

	var tag := Label.new()
	tag.text = "FORGED BY NEXUS AI AGENTS"
	tag.add_theme_font_size_override("font_size", int(size.y * 0.045))
	tag.add_theme_color_override("font_color", Color(0.47, 0.6, 1.0, 0.9))
	tag.position = Vector2(size.x * 0.06, size.y * 0.62)
	tag.size = Vector2(size.x * 0.88, size.y * 0.1)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(tag)

func _process(_delta: float) -> void:
	pass
`;
}

async function tryMovieRender(godotBin: string, wsPath: string, outDir: string, w: number, h: number, scene: string, frames = 2): Promise<string | null> {
  mkdirSync(outDir, { recursive: true });
  const modes: string[][] = [
    ["--headless"],  // works on setups with swiftshader/CPU raster
    [],             // display path (X11/Win) — brief window
  ];
  for (const mode of modes) {
    try {
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      await exec(godotBin, [...mode, "--path", ".", "--write-movie", join(outDir, "frame.png"), "--resolution", `${w}x${h}`, scene, "--quit-after", String(frames)], { cwd: wsPath, timeout: 60_000 });
      const pngs = readdirSync(outDir).filter((f) => f.endsWith(".png")).sort();
      if (pngs.length > 0) return join(outDir, pngs[pngs.length - 1]!);
    } catch { /* try next mode */ }
  }
  return null;
}

export interface StoreKitResult {
  ok: boolean;
  assets: Array<{ id: string; label: string; path: string; rendered: boolean }>;
  screenshots: string[];
  notes: string[];
}

/** Generates the full store kit for a project (real renders). */
export async function generateStoreKit(p: ProjectRow, wsPath: string, godotBin: string): Promise<StoreKitResult> {
  const kitDir = join(wsPath, "docs", "store-kit");
  const imgDir = join(kitDir, "images");
  const shotDir = join(kitDir, "screenshots");
  mkdirSync(imgDir, { recursive: true });
  mkdirSync(shotDir, { recursive: true });
  const notes: string[] = [];

  // 1) store copy
  const { copy, usedLLM } = await generateStoreCopy(p);
  const legal = `## Legal (templates — revise com um advogado antes de publicar)\n- **EULA**: por usar este software você aceita os termos do jogo "${p.name}" (template Nexus Forge; substitua pelo seu EULA final).\n- **Privacidade**: o jogo coleta ${"apenas dados locais (saves). Sem telemetria"}.\n- **Créditos**: Direção criativa: você · Engenharia & QA: agentes Nexus Forge (Nexus Forge Studio) · Engine: Godot 4.3 (MIT).\n`;
  const md = `# ${p.name} — Steam Store Kit\n\n> Gerado pelo Nexus Forge${usedLLM ? " (designer agent + revisão humana recomendada)" : " (modo determinístico — sem LLM configurado)"}.\n\n## Elevator pitch\n${copy.elevatorPitch}\n\n## Descrição curta (≤ 300 chars)\n${copy.shortDescription}\n\n## Descrição longa\n${copy.longDescription}\n\n## Tags (Steam, EN)\n${copy.tags.join(", ")}\n\n## Requisitos — Mínimo\n\`\`\`\n${copy.minRequirements}\n\`\`\`\n\n## Requisitos — Recomendado\n\`\`\`\n${copy.recRequirements}\n\`\`\`\n\n${legal}\n## Assets gerados\nVeja \`images/\` (capsules/header em resoluções Steam) e \`screenshots/\` (capturas reais do jogo).\n`;
  await Bun.write(join(kitDir, "store-description.md"), md);

  // 2) cover images at Steam sizes (rendered by the engine itself)
  wsSafeWrite(wsPath, "scenes/cover.tscn", coverScene());
  wsSafeWrite(wsPath, "scripts/cover.gd", coverScript());
  const assets: StoreKitResult["assets"] = [];
  for (const s of STEAM_SIZES) {
    const tmp = join(wsPath, ".nexusforge-tmp", s.id);
    const png = await tryMovieRender(godotBin, wsPath, tmp, s.w, s.h, "res://scenes/cover.tscn", 2);
    const dest = join(imgDir, `${s.id}.png`);
    let rendered = false;
    if (png) {
      copyFileSync(png, dest);
      rendered = true;
    }
    assets.push({ id: s.id, label: s.label, path: `docs/store-kit/images/${s.id}.png`, rendered });
    rmSync(join(wsPath, ".nexusforge-tmp"), { recursive: true, force: true });
  }
  const anyRendered = assets.some((a) => a.rendered);
  if (!anyRendered) notes.push("Cover rendering unavailable in this environment (no raster driver) — store-description.md is complete; generate capsules in the Godot editor via scenes/cover.tscn.");

  // 3) real screenshots of the game
  const shotsTmp = join(wsPath, ".nexusforge-tmp", "shots");
  const shotPng = await tryMovieRender(godotBin, wsPath, shotsTmp, 1280, 720, "res://scenes/main.tscn", 48);
  const screenshots: string[] = [];
  if (shotPng) {
    const dir = shotPng.slice(0, shotPng.lastIndexOf("/"));
    const all = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    const picks = [8, 16, 24, 32, 40, 46].filter((i) => (all[i] ?? "").endsWith(".png"));
    for (let n = 0; n < picks.length; n++) {
      const idx = picks[n]!;
      const shotFile = all[idx];
      if (!shotFile) continue;
      const dest = join(shotDir, `screenshot-${String(n + 1).padStart(2, "0")}.png`);
      copyFileSync(join(dir, shotFile), dest);
      screenshots.push(`docs/store-kit/screenshots/screenshot-${String(n + 1).padStart(2, "0")}.png`);
    }
    rmSync(join(wsPath, ".nexusforge-tmp"), { recursive: true, force: true });
  }
  if (screenshots.length === 0) notes.push("Screenshots unavailable here — capture via the Live Preview or the Godot editor if rendering is not supported headless on this machine.");
  else notes.push(`${screenshots.length} real screenshots captured from the running game.`);

  await writePublishingSet(p, copy, kitDir, {
    capsules: assets.filter((a) => a.rendered).length,
    totalCapsules: assets.length,
    screenshots: screenshots.length,
    webPreview: existsSync(join(homedir(), ".nexusforge", "previews", p.slug, "index.html")),
    winBuild: existsSync(join(homedir(), ".nexusforge", "builds", p.slug, `${p.slug}-win64.zip`)),
    linuxBuild: existsSync(join(homedir(), ".nexusforge", "builds", p.slug, `${p.slug}-linux64.zip`)),
  });

  bus.emit({ projectId: p.id, agent: "store-kit", stage: "publish", level: "success", message: `Steam kit pronto: copy ${usedLLM ? "(LLM)" : "(deterministico)"}, ${assets.filter((a) => a.rendered).length}/${assets.length} capsules, ${screenshots.length} screenshots, guia de publicacao + legal + checklist.` });
  return { ok: true, assets, screenshots, notes };
}

function wsSafeWrite(wsPath: string, rel: string, content: string): void {
  const abs = join(wsPath, rel);
  mkdirSync(abs.slice(0, abs.lastIndexOf("/")), { recursive: true });
  Bun.write(abs, content);
}

void existsSync;
