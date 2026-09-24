/**
 * Game Build Manager — real standalone executables via Godot's exporter:
 * Windows .exe and Linux binaries with embedded PCK, zipped for distribution
 * (ready for Steam Direct depots, itch.io or any launcher).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { bus } from "../events";
import type { ProjectRow } from "../orchestrator/store";

const exec = promisify(execFile);

/** Full export presets: Web + Windows Desktop + Linux/X11 (PCK embedded). */
export function exportPresetsFull(): string {
  return `[preset.0]

name="Web"
platform="Web"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="builds/web/index.html"
patches=PackedStringArray()
encryption_include_filters=""
encryption_exclude_filters=""
seed=0
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.0.options]

custom_template/debug=""
custom_template/release=""
variant/extension_support_mode=1
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell=""
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false

[preset.1]

name="Windows Desktop"
platform="Windows Desktop"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="builds/windows/game.exe"
patches=PackedStringArray()
encryption_include_filters=""
encryption_exclude_filters=""
seed=0
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.1.options]

custom_template/debug=""
custom_template/release=""
binary_format/embed_pck=true
texture_format/bptc=false
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
texture_format/no_bptc_fallbacks=true
codesign/enable=false
application/modify_resources=false

[preset.2]

name="Linux/X11"
platform="Linux/X11"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="builds/linux/game.x86_64"
patches=PackedStringArray()
encryption_include_filters=""
encryption_exclude_filters=""
seed=0
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.2.options]

custom_template/debug=""
custom_template/release=""
binary_format/embed_pck=true
texture_format/bptc=false
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
texture_format/no_bptc_fallbacks=true
ssh_remote_deploy/enabled=false
`;
}

export interface BuildResult {
  ok: boolean;
  platform: "windows" | "linux";
  zipName: string;
  files: string[];
  error?: string;
  logExcerpt?: string;
}

export function buildsDir(slug: string): string {
  return join(homedir(), ".nexusforge", "builds", slug);
}

export function listBuilds(slug: string): Array<{ name: string; size: number }> {
  const dir = buildsDir(slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => ({ name: f, size: statSync(join(dir, f)).size }));
}

/** Exports the game as a standalone executable and zips it for distribution. */
export async function buildExecutable(p: ProjectRow, wsPath: string, godotBin: string, platform: "windows" | "linux"): Promise<BuildResult> {
  // Ensure the 3-preset file exists (covers projects scaffolded before this feature)
  const presetPath = join(wsPath, "export_presets.cfg");
  const current = existsSync(presetPath) ? await Bun.file(presetPath).text() : "";
  if (!current.includes('name="Windows Desktop"')) {
    await Bun.write(presetPath, exportPresetsFull());
  }

  const presetName = platform === "windows" ? "Windows Desktop" : "Linux/X11";
  const outName = platform === "windows" ? `${p.slug}.exe` : p.slug;
  const buildDir = join(wsPath, "builds", platform === "windows" ? "windows" : "linux");
  mkdirSync(buildDir, { recursive: true });
  const outPath = join(buildDir, outName);

  bus.emit({ projectId: p.id, agent: "build-manager", stage: "build", level: "info", message: `Exporting ${presetName} executable (real Godot exporter)…` });
  try {
    const r = await exec(godotBin, ["--headless", "--path", ".", "--export-release", presetName, outPath], {
      cwd: wsPath, timeout: 300_000, maxBuffer: 20_000_000,
    });
    if (!existsSync(outPath)) {
      return { ok: false, platform, zipName: "", files: [], error: "Exporter finished but no binary was produced.", logExcerpt: `${r.stdout}${r.stderr}`.slice(0, 3000) };
    }
    // zip for distribution (single executable with embedded PCK + readme)
    const bin = new Uint8Array(await Bun.file(outPath).arrayBuffer());
    const readme = `# ${p.name}\n\nExecutavel gerado pelo Nexus Forge (Godot 4.3, PCK embutido).\nExecute ${outName} — sem instalador.\n\nEngine: Godot 4.3 (MIT). Direcao criativa: voce. Engenharia: agentes Nexus Forge.\n`;
    const zipped = zipSync({ [outName]: bin, "README.txt": new TextEncoder().encode(readme) }, { level: 6 });
    const outRoot = buildsDir(p.slug);
    mkdirSync(outRoot, { recursive: true });
    const zipName = `${p.slug}-${platform === "windows" ? "win64" : "linux64"}.zip`;
    await Bun.write(join(outRoot, zipName), zipped);

    bus.emit({ projectId: p.id, agent: "build-manager", stage: "build", level: "success", message: `${platform === "windows" ? "Windows .exe" : "Linux binary"} ready: ${zipName} (${(zipped.length / 1048576).toFixed(1)} MB).` });
    return { ok: true, platform, zipName, files: [outName] };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    const msg = `${err.stdout ?? ""}${err.stderr ?? ""}` || err.message;
    bus.emit({ projectId: p.id, agent: "build-manager", stage: "build", level: "error", message: `Export ${presetName} failed: ${msg.slice(0, 160)}` });
    return { ok: false, platform, zipName: "", files: [], error: msg.slice(0, 300), logExcerpt: msg.slice(0, 3000) };
  }
}
