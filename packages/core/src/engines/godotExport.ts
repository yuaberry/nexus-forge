/**
 * Godot Web Export Manager — turns generated games into browser-playable
 * WASM builds, enabling the LIVE PREVIEW (the "▶ Play" of the studio):
 *
 *   1. ensureExportTemplates(): downloads the official Godot 4.3 export
 *      templates (.tpz, a ZIP) once and installs them where Godot expects.
 *   2. exportWeb(): injects a Web export preset (if missing) and runs the
 *      REAL headless exporter: `godot --headless --export-release "Web"`.
 *   3. The server serves the build under /preview/<slug>/ for the UI iframe.
 *
 * No fakes: every failure path returns an honest error.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bus } from "../events";
import { bus as events } from "../events";

const exec = promisify(execFile);

const TPZ_URL = "https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_export_templates.tpz";
const STAGING = join(homedir(), ".nexusforge", "engines", "godot", "templates-dl");

/** Where Godot looks for export templates on each OS. */
export function templatesTargetDir(): string {
  if (process.platform === "win32") return join(homedir(), "AppData", "Roaming", "Godot", "export_templates", "4.3.stable");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Godot", "export_templates", "4.3.stable");
  return join(homedir(), ".local", "share", "godot", "export_templates", "4.3.stable");
}

export function templatesInstalled(): boolean {
  const dir = templatesTargetDir();
  if (!existsSync(dir)) return false;
  try { return readdirSync(dir).some((f) => f.startsWith("web_")); } catch { return false; }
}

/** Streams a large download directly to disk (never buffers whole file in RAM). */
async function downloadToFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Templates download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body) throw new Error("Empty download body.");
  const writer = Bun.file(dest).writer();
  const reader = res.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    await writer.write(value);
    received += value.length;
    if (total > 0 && onProgress && received % (12 * 1024 * 1024) < value.length) {
      onProgress(Math.round((received / total) * 100));
    }
  }
  await writer.end();
}

/** Extracts a zip to destDir via system tools (streaming, low memory). */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const candidates: Array<[string, string[]]> = [
    ["unzip", ["-o", zipPath, "-d", destDir]],
    ["tar", ["-xf", zipPath, "-C", destDir]],
    ["python3", ["-c", "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zipPath, destDir]],
  ];
  let lastErr = "";
  for (const [bin, args] of candidates) {
    try {
      await exec(bin, args, { timeout: 600_000, maxBuffer: 10_000_000 });
      return;
    } catch (e) {
      lastErr = `${bin}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(`No zip extractor available (${lastErr})`);
}

/** Downloads + installs official export templates (idempotent). */
export async function ensureExportTemplates(onProgress?: (pct: number) => void): Promise<{ installed: boolean; note: string }> {
  if (templatesInstalled()) return { installed: true, note: "Export templates already installed." };
  mkdirSync(STAGING, { recursive: true });
  const tpzPath = join(STAGING, "templates.tpz");

  if (!existsSync(tpzPath) || Bun.file(tpzPath).size < 100_000_000) {
    bus.emit({ projectId: null, agent: "engine-manager", stage: "preview", level: "info", message: "Downloading Godot 4.3 export templates (~1GB, official)…" });
    await downloadToFile(TPZ_URL, tpzPath, (pct) => onProgress?.(pct));
    bus.emit({ projectId: null, agent: "engine-manager", stage: "preview", level: "info", message: "Templates downloaded — extracting…" });
  }

  // Streaming extraction via system tools: an in-memory unzip of the 1GB
  // .tpz OOMs on 8GB machines (measured), so we never buffer it.
  bus.emit({ projectId: null, agent: "engine-manager", stage: "preview", level: "info", message: "Extracting export templates…" });
  const extractDir = join(STAGING, "extracted");
  mkdirSync(extractDir, { recursive: true });
  await extractZip(tpzPath, extractDir);

  const target = templatesTargetDir();
  mkdirSync(target, { recursive: true });
  const srcDir = join(extractDir, "templates");
  let count = 0;
  for (const f of readdirSync(srcDir)) {
    copyFileSync(join(srcDir, f), join(target, f));
    count++;
  }
  // One-shot installer: free the staging disk space
  rmSync(extractDir, { recursive: true, force: true });
  rmSync(tpzPath, { force: true });

  bus.emit({ projectId: null, agent: "engine-manager", stage: "preview", level: "success", message: `Export templates installed (${count} files).` });
  return { installed: templatesInstalled(), note: `Installed ${count} template files.` };
}

/** Web export preset (no SharedArrayBuffer → runs in a plain iframe). */
export const WEB_EXPORT_PRESET = `[preset.0]

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
`;

export interface ExportWebResult {
  ok: boolean;
  files: string[];
  outDir: string;
  error?: string;
  logExcerpt?: string;
}

/**
 * Exports the project at wsPath as a web build into outDir (served as the
 * live preview). Runs the REAL Godot exporter headless.
 */
export async function exportWeb(wsPath: string, godotBin: string, outDir: string): Promise<ExportWebResult> {
  // Inject preset if missing (also covers projects scaffolded before this feature)
  const presetPath = join(wsPath, "export_presets.cfg");
  if (!existsSync(presetPath)) writeFileSync(presetPath, WEB_EXPORT_PRESET);

  mkdirSync(outDir, { recursive: true });
  const outHtml = join(outDir, "index.html");
  try {
    const r = await exec(godotBin, ["--headless", "--path", ".", "--export-release", "Web", outHtml], {
      cwd: wsPath, timeout: 300_000, maxBuffer: 20_000_000,
    });
    const produced = readdirSync(outDir);
    const ok = produced.includes("index.html") && produced.some((f) => f.endsWith(".wasm"));
    return {
      ok,
      files: produced,
      outDir,
      logExcerpt: `${r.stdout}${r.stderr}`.slice(0, 4000),
      error: ok ? undefined : "Exporter finished but no wasm/html produced.",
    };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return {
      ok: false, files: [], outDir,
      error: err.message?.slice(0, 300) ?? "export failed",
      logExcerpt: `${err.stdout ?? ""}${err.stderr ?? ""}`.slice(0, 4000),
    };
  }
}

void events;
