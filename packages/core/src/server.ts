/**
 * Nexus Forge server — Bun.serve HTTP + WebSocket, local-only (127.0.0.1).
 * Serves the REST API, the live event stream (WS) and the built UI (static).
 */
import { join, dirname } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { ForgeStage, GameBrief } from "@nexus/shared";
import { bus } from "./events";
import { bus as eventBus } from "./events";
import { getDB } from "./db";
import { getSetting, setSetting, storeCredential, importKeyFromFile, hasCredential, getCredential } from "./settings";
import { detectEngines, ensureGodot } from "./engines/manager";
import { getAdapter } from "./engines/manager";
import { OpenRouterAdapter } from "./providers/openrouter";
import { aiConfigured } from "./providers/registry";
import { createProject, getProject, listProjects, updateProject, listTasks, updateTask } from "./orchestrator/store";
import { readDna, writeDnaField } from "./dna";
import { Workspace } from "./workspace";
import { GitRepo } from "./git";
import { forge } from "./pipeline/forge";
import { UI_EMBED } from "./ui-embed.generated";
import { ensureExportTemplates, exportWeb, templatesInstalled, templatesTargetDir } from "./engines/godotExport";
import { generateStoreKit } from "./publish/storeKit";
import { buildExecutable, listBuilds, buildsDir } from "./publish/builds";
import { Godot4Adapter } from "./engines/godot";
import { join as pathJoin } from "node:path";
import { homedir } from "node:os";

const PORT = Number(getSetting("server.port", 5180));
const UI_DIST = join(import.meta.dir, "..", "..", "..", "apps", "ui", "dist");

/** One forge run per project at a time. */
const runningForge = new Set<string>();
const wsUnsubscribers = new Map<unknown, () => void>();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function body<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

async function handleApi(req: Request, path: string, url: URL): Promise<Response> {
  const parts = path.split("/").filter(Boolean); // ["api", ...]

  // --- status -------------------------------------------------------------
  if (req.method === "GET" && path === "/api/status") {
    const engines = await detectEngines();
    return json({
      app: "Nexus Forge",
      version: "0.1.0",
      aiConfigured: aiConfigured(),
      engines,
      uiBuilt: existsSync(join(UI_DIST, "index.html")),
    });
  }

  // --- credentials ----------------------------------------------------------
  if (req.method === "GET" && path === "/api/credentials") {
    const row = getDB().get<{ hint: string }>(`SELECT hint FROM credentials WHERE provider='openrouter'`);
    return json({ configured: hasCredential("openrouter"), hint: row?.hint ?? null });
  }
  if (req.method === "DELETE" && path === "/api/credentials") {
    // remove key: overwrite store with empty
    storeCredential("openrouter", "");
    getDB().run(`DELETE FROM credentials WHERE provider='openrouter'`);
    return json({ ok: true });
  }
  if (req.method === "POST" && path === "/api/credentials") {
    const b = await body<{ key?: string; importPath?: string }>(req);
    if (b.importPath) {
      const r = importKeyFromFile("openrouter", b.importPath);
      return json(r, r.ok ? 200 : 400);
    }
    if (b.key && b.key.trim().length > 20) {
      const r = storeCredential("openrouter", b.key.trim());
      return json({ ok: true, hint: r.hint });
    }
    return json({ ok: false, error: "Provide 'key' or 'importPath'." }, 400);
  }
  if (req.method === "GET" && path === "/api/models") {
    try {
      const models = await OpenRouterAdapter.listModels();
      return json({ ok: true, count: models.length, sample: models.slice(0, 12) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  // --- settings ---------------------------------------------------------------
  if (req.method === "GET" && path === "/api/settings") {
    return json({
      mode: getSetting<string>("forge.mode", "assisted"),
      autoEngineInstall: getSetting<boolean>("engines.autoInstall", true),
      defaultModel: getSetting<string>("providers.openrouter.defaultModel", "z-ai/glm-5.3-flash"),
    });
  }
  if (req.method === "PATCH" && path === "/api/settings") {
    const b = await body<{ mode?: string; autoEngineInstall?: boolean; defaultModel?: string }>(req);
    if (b.mode) setSetting("forge.mode", b.mode);
    if (b.autoEngineInstall !== undefined) setSetting("engines.autoInstall", b.autoEngineInstall);
    if (b.defaultModel) setSetting("providers.openrouter.defaultModel", b.defaultModel);
    return json({ ok: true });
  }

  // --- engines -----------------------------------------------------------------
  if (req.method === "GET" && path === "/api/engines") {
    return json({ engines: await detectEngines() });
  }
  if (req.method === "POST" && path === "/api/engines/godot/install") {
    const r = await ensureGodot(true);
    const det = await detectEngines();
    return json({ ok: r.available, note: r.note, engines: det });
  }
  if (req.method === "GET" && path === "/api/engines/godot/templates-status") {
    return json({ installed: templatesInstalled(), target: templatesTargetDir() });
  }
  if (req.method === "POST" && path === "/api/engines/godot/templates-install") {
    try {
      const r = await ensureExportTemplates((pct) => {
        if (pct % 10 === 0) bus.emit({ projectId: null, agent: "engine-manager", stage: "preview", level: "info", message: `Export templates download: ${pct}%` });
      });
      return json({ ok: r.installed, note: r.note, installed: templatesInstalled() });
    } catch (e) {
      return json({ ok: false, note: e instanceof Error ? e.message : String(e), installed: false }, 500);
    }
  }

  // --- projects -----------------------------------------------------------------
  if (req.method === "GET" && path === "/api/projects") {
    return json({ projects: listProjects() });
  }
  if (req.method === "POST" && path === "/api/projects") {
    const b = await body<GameBrief>(req);
    if (!b?.idea || b.idea.length < 10) return json({ error: "idea is required (min 10 chars)" }, 400);
    const p = createProject({
      idea: b.idea,
      name: b.name,
      dimensions: b.dimensions,
      qualityTier: b.qualityTier,
      platforms: b.platforms,
      engine: b.engine,
      genreTags: b.genreTags,
      contentRating: b.contentRating,
    });
    bus.emit({ projectId: p.id, agent: "user", level: "success", stage: "analyze", message: `Project created: ${p.name}` });
    return json({ project: p }, 201);
  }

  // /api/projects/:id[/...]
  const pid = parts[2];
  if (pid && parts[1] === "projects") {
    const p = getProject(pid);
    if (!p) return json({ error: "project not found" }, 404);
    const ws = new Workspace(p.data_path);
    const git = new GitRepo(ws);

    if (req.method === "GET" && parts.length === 3) {
      const tasks = listTasks(p.id);
      const events = getDB().all(`SELECT * FROM events WHERE project_id = ? ORDER BY ts DESC LIMIT 60`, p.id);
      const dna = readDna(p.id);
      return json({ project: p, tasks, events, dna });
    }

    if (req.method === "POST" && parts[3] === "forge") {
      if (runningForge.has(p.id)) return json({ error: "forge already running for this project" }, 409);
      let b: { stages?: ForgeStage[]; mode?: "manual" | "assisted" | "autonomous" } = {};
      try { b = (await req.json()) as typeof b; } catch { /* no body = all stages */ }
      runningForge.add(p.id);
      // Run async — progress flows over WS + events API
      void (async () => {
        try {
          await forge(p.id, { stages: b?.stages, mode: b?.mode });
        } finally {
          runningForge.delete(p.id);
        }
      })();
      return json({ started: true });
    }

    if (req.method === "GET" && parts[3] === "tree") {
      return json({ tree: ws.listTree("", 1500) });
    }
    if (req.method === "GET" && parts[3] === "file") {
      const rel = url.searchParams.get("path") ?? "";
      if (!ws.exists(rel)) return json({ error: "not found" }, 404);
      try { return json({ path: rel, content: ws.read(rel, 300_000) }); }
      catch (e) { return json({ error: e instanceof Error ? e.message : "read failed" }, 400); }
    }
    if (req.method === "GET" && parts[3] === "events") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const events = getDB().all(`SELECT * FROM events WHERE project_id = ? ORDER BY ts DESC LIMIT ?`, p.id, limit);
      return json({ events });
    }
    if (req.method === "GET" && parts[3] === "tasks") {
      return json({ tasks: listTasks(p.id) });
    }
    if (req.method === "GET" && parts[3] === "git") {
      return json({ log: await git.log(50), status: await git.status(), diff: await git.diff(6000) });
    }
    if (req.method === "POST" && parts[3] === "editor") {
      const adapter = getAdapter(p.engine as "godot4" | "unreal5");
      if (!adapter?.openEditor) return json({ error: "adapter cannot open editor" }, 400);
      const r = await adapter.openEditor(p.data_path);
      return json(r);
    }
    if (req.method === "POST" && parts[3] === "validate") {
      const adapter = getAdapter(p.engine as "godot4" | "unreal5");
      if (!adapter?.validate) return json({ error: "adapter cannot validate" }, 400);
      const v = await adapter.validate(p.data_path);
      return json({ validation: v });
    }
    if (req.method === "GET" && parts[3] === "dna") {
      return json({ dna: readDna(p.id) });
    }
    if (req.method === "PATCH" && parts[3] === "dna") {
      const b = await body<{ section: string; key: string; value: unknown; note?: string }>(req);
      writeDnaField(p.id, b.section as never, b.key, b.value, "confirmed", b.note ?? "Confirmed by user");
      return json({ ok: true });
    }
    if (req.method === "POST" && parts[3] === "export-web") {
      // LIVE PREVIEW: export the current game as a web build (real Godot exporter).
      // Async (first export can take minutes — full project import): the UI
      // polls preview-status; completion is announced via events.
      const det = await new Godot4Adapter().detect();
      if (!det.installed || !det.path) return json({ ok: false, error: "Godot 4 not installed." }, 400);
      if (!templatesInstalled()) {
        return json({ ok: false, error: "Export templates not installed — click 'Install templates' first (one-time, ~1GB official download).", templatesMissing: true }, 400);
      }
      const outDir = pathJoin(homedir(), ".nexusforge", "previews", p.slug);
      const bin = det.path;
      const projPath = p.data_path;
      const projId = p.id;
      const projSlug = p.slug;
      bus.emit({ projectId: p.id, agent: "engine-manager", stage: "preview", level: "info", message: "Exporting web build for live preview…" });
      void (async () => {
        const result = await exportWeb(projPath, bin, outDir);
        if (result.ok) {
          bus.emit({ projectId: projId, agent: "engine-manager", stage: "preview", level: "success", message: `Live preview ready: /preview/${projSlug}/ (${result.files.length} files).` });
        } else {
          bus.emit({ projectId: projId, agent: "engine-manager", stage: "preview", level: "error", message: `Web export failed: ${result.error}` });
        }
      })();
      return json({ started: true });
    }
    if (req.method === "GET" && parts[3] === "preview-status") {
    const outDir = pathJoin(homedir(), ".nexusforge", "previews", p.slug);
    let ready = false;
    try {
      ready = existsSync(pathJoin(outDir, "index.html")) && readdirSync(outDir).some((f) => f.endsWith(".wasm"));
    } catch { ready = false; }
    return json({ ready, url: ready ? `/preview/${p.slug}/` : null });
    }
    if (req.method === "POST" && parts[3] === "store-kit") {
      // STEAM PUBLISH KIT: store copy + real rendered capsules + screenshots
      const det = await new Godot4Adapter().detect();
      if (!det.installed || !det.path) return json({ ok: false, error: "Godot 4 not installed." }, 400);
      const projId = p.id;
      void (async () => {
        try {
          await generateStoreKit(p, p.data_path, det.path!);
        } catch (e) {
          bus.emit({ projectId: projId, agent: "store-kit", stage: "publish", level: "error", message: `Store kit failed: ${e instanceof Error ? e.message : String(e)}` });
        }
      })();
      return json({ started: true });
    }
    if (req.method === "GET" && parts[3] === "store-kit-status") {
      const kit = pathJoin(p.data_path, "docs", "store-kit");
      const ready = existsSync(pathJoin(kit, "store-description.md"));
      let images = 0, screenshots = 0;
      try { images = readdirSync(pathJoin(kit, "images")).length; } catch { /* none */ }
      try { screenshots = readdirSync(pathJoin(kit, "screenshots")).length; } catch { /* none */ }
      return json({ ready, images, screenshots });
    }
    if (req.method === "GET" && parts[3] === "builds") {
      return json({ builds: listBuilds(p.slug) });
    }
    if (req.method === "POST" && parts[3] === "build-game") {
      const b = await body<{ platform?: "windows" | "linux" }>(req).catch(() => ({}) as { platform?: "windows" | "linux" });
      const platform = b.platform === "linux" ? "linux" : "windows";
      const det = await new Godot4Adapter().detect();
      if (!det.installed || !det.path) return json({ ok: false, error: "Godot 4 not installed." }, 400);
      if (!templatesInstalled()) return json({ ok: false, error: "Export templates missing — install first.", templatesMissing: true }, 400);
      const proj = p; const bin = det.path; const ws2 = p.data_path; const pid2 = p.id;
      void (async () => { await buildExecutable(proj, ws2, bin, platform); })();
      return json({ started: true, platform });
    }
    if (req.method === "GET" && parts[3] === "preview-status") {
      const outDir = pathJoin(homedir(), ".nexusforge", "previews", p.slug);
      let ready = false;
      try {
        ready = existsSync(pathJoin(outDir, "index.html")) && readdirSync(outDir).some((f) => f.endsWith(".wasm"));
      } catch { ready = false; }
      return json({ ready, url: ready ? `/preview/${p.slug}/` : null });
    }
    if (req.method === "POST" && parts[3] === "refs" && req.method === "POST") {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "file missing" }, 400);
      if (file.size > 25_000_000) return json({ error: "file too large (max 25MB)" }, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rel = ws.saveReference(file.name, bytes);
      const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("text/") ? "text" : /\.(md|txt)$/i.test(file.name) ? "text" : /\.(pdf|docx?|odt)$/i.test(file.name) ? "document" : "other";
      const id = `ref_${crypto.randomUUID().slice(0, 12)}`;
      getDB().run(
        `INSERT INTO project_references (id, project_id, kind, category, name, path, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
        id, p.id, kind, String(form.get("category") ?? "visual"), file.name, rel, "imported", new Date().toISOString(),
      );
      bus.emit({ projectId: p.id, agent: "user", level: "success", message: `Reference imported: ${file.name}` });
      return json({ ok: true, path: rel, kind });
    }
  }

  // --- tasks --------------------------------------------------------------------
  const tid = parts[2];
  if (parts[1] === "tasks" && tid && req.method === "POST" && parts[3] === "approve") {
    const t = getDB().get<{ project_id: string }>(`SELECT project_id FROM tasks WHERE id = ?`, tid);
    if (!t) return json({ error: "task not found" }, 404);
    updateTask(tid, { status: "approved" });
    bus.emit({ projectId: t.project_id, taskId: tid, agent: "user", level: "success", message: "Task approved by user." });
    return json({ ok: true });
  }
  if (parts[1] === "tasks" && tid && req.method === "POST" && parts[3] === "reject") {
    const t = getDB().get<{ project_id: string }>(`SELECT project_id FROM tasks WHERE id = ?`, tid);
    if (!t) return json({ error: "task not found" }, 404);
    updateTask(tid, { status: "blocked", error: "Rejected by user" });
    bus.emit({ projectId: t.project_id, taskId: tid, agent: "user", level: "warning", message: "Task rejected by user." });
    return json({ ok: true });
  }

  return json({ error: `unknown API route: ${req.method} ${path}` }, 404);
}

// --- static UI ---------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".map": "application/json",
};

function serveStatic(path: string): Response | null {
  const rel = path === "/" ? "index.html" : path.slice(1);
  const abs = join(UI_DIST, rel);
  if (existsSync(abs)) {
    const ext = rel.slice(rel.lastIndexOf("."));
    return new Response(readFileSync(abs), { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
  }
  // Compiled standalone executable: UI embedded at build time (base64)
  const b64 = UI_EMBED[rel];
  if (b64) {
    const ext = rel.slice(rel.lastIndexOf("."));
    return new Response(Buffer.from(b64, "base64"), { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
  }
  return null;
}

// --- server -------------------------------------------------------------------

export async function startServer(): Promise<void> {
  Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/ws") {
        const upgraded = (this as unknown as { upgrade: (r: Request, o?: unknown) => boolean }).upgrade(req, {});
        return upgraded ? new Response(null, { status: 101 }) : new Response("upgrade failed", { status: 500 });
      }

      if (path.startsWith("/api/")) return handleApi(req, path, url);

      // Build downloads: /download/<slug>/<zip>
      const dm = path.match(/^\/download\/([\w-]+)\/([\w.-]+\.zip)$/);
      if (dm) {
        const slug = dm[1]!.replace(/[^\w-]/g, "");
        const file = dm[2]!.replace(/[^\w.-]/g, "");
        const abs = pathJoin(buildsDir(slug), file);
        if (abs.startsWith(buildsDir(slug)) && existsSync(abs)) {
          return new Response(readFileSync(abs), {
            headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${file}"` },
          });
        }
        return json({ error: "build not found" }, 404);
      }

      // LIVE PREVIEW static route: /preview/<slug>/<file> → ~/.nexusforge/previews/<slug>/
      const pm = path.match(/^\/preview\/([\w-]+)\/(.*)$/);
      if (pm) {
        const slug = pm[1]!.replace(/[^\w-]/g, "");
        const rel = pm[2]!.replace(/\.{2,}/g, "").replace(/^\/+/, "");
        const base = pathJoin(homedir(), ".nexusforge", "previews", slug);
        const abs = pathJoin(base, rel || "index.html");
        if (abs.startsWith(base) && existsSync(abs)) {
          const ext = rel.slice(rel.lastIndexOf(".") + 1);
          const PREVIEW_MIME: Record<string, string> = {
            html: "text/html; charset=utf-8",
            js: "text/javascript; charset=utf-8",
            wasm: "application/wasm",
            pck: "application/octet-stream",
            png: "image/png",
            svg: "image/svg+xml",
            json: "application/json",
            worker: "text/javascript; charset=utf-8",
            side: "application/wasm",
          };
          return new Response(readFileSync(abs), {
            headers: {
              "content-type": PREVIEW_MIME[ext] ?? "application/octet-stream",
              "cross-origin-opener-policy": "same-origin",
              "cross-origin-embedder-policy": "require-corp",
              "cache-control": "no-store",
            },
          });
        }
        return new Response("preview not built yet", { status: 404 });
      }

      const staticRes = serveStatic(path);
      if (staticRes) return staticRes;
      if (!path.startsWith("/api")) {
        const index = serveStatic("/");
        if (index) return index; // SPA fallback
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>Nexus Forge</title>
           <body style="background:#0a0b10;color:#e8eaf2;font-family:system-ui;display:grid;place-items:center;height:100vh">
           <div style="text-align:center"><h1>NEXUS FORGE</h1>
           <p>API is running on port ${PORT}. UI not built yet — run <code style="color:#4f7cff">pnpm ui:build</code>.</p></div></body>`,
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
      return json({ error: "not found" }, 404);
    },
    websocket: {
      open(ws) {
        const unsubscribe = eventBus.subscribe((e) => {
          try { ws.send(JSON.stringify({ type: "event", event: e })); } catch { /* closed */ }
        });
        wsUnsubscribers.set(ws, unsubscribe);
      },
      close(ws) {
        const unsub = wsUnsubscribers.get(ws);
        if (unsub) {
          wsUnsubscribers.delete(ws);
          unsub();
        }
      },
      message(_ws, _msg) { /* client → server messages not needed for MVP */ },
    },
  });
  console.log(`[nexus-forge] server on http://127.0.0.1:${PORT}  (UI: ${existsSync(join(UI_DIST, "index.html")) || Object.keys(UI_EMBED).length > 0 ? "ready" : "not built"})`);
  // Professional app feel: open the studio in the default browser
  if (!process.env.NEXUS_NO_OPEN) {
    const url = `http://127.0.0.1:${PORT}`;
    try {
      const { spawn } = await import("node:child_process");
      const opener = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
      const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
      const child = spawn(opener, args, { detached: true, stdio: "ignore" });
      child.unref();
    } catch { /* opening the browser is best-effort */ }
  }
}

void dirname;
