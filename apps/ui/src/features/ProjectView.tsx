/** ProjectView — live dashboard: progress, stages, tasks, activity feed, actions. */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play, Dna, Code2, ScrollText, ExternalLink, ShieldCheck, RefreshCw, Terminal, MonitorPlay, Store, Package,
} from "lucide-react";
import { api, type ProjectDto, type TaskDto, type EventDto } from "../lib/api";
import { useNexus } from "../store";

const STAGES = ["analyze", "dna", "gdd", "architecture", "scaffold", "tasks", "buildout", "validate"];

const LEVEL_DOT: Record<string, string> = {
  info: "bg-nexus",
  success: "bg-good",
  warning: "bg-warn",
  error: "bg-bad",
};

const TASK_STATUS_STYLE: Record<string, string> = {
  pending: "text-mute border-edge",
  running: "text-cyan-live border-cyan-live/50",
  completed: "text-good border-good/40",
  failed: "text-bad border-bad/40",
  blocked: "text-warn border-warn/40",
  approved: "text-violet border-violet/40",
};

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { events } = useNexus();
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [initialEvents, setInitialEvents] = useState<EventDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [templatesReady, setTemplatesReady] = useState<boolean | null>(null);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubNote, setPubNote] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Array<{ name: string; size: number }>>([]);

  useEffect(() => { if (id) void api.builds(id).then((r) => setDownloads(r.builds)).catch(() => undefined); }, [id]);

  const makeStoreKit = async () => {
    if (!id) return;
    setPubBusy(true);
    setPubNote("Gerando Steam Kit (descrição da loja + capsulas renderizadas + screenshots)…");
    try {
      await api.storeKit(id);
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const st = await api.storeKitStatus(id);
        if (st.ready) { setPubNote(`Steam Kit pronto: ${st.images} capsule(s) + ${st.screenshots} screenshot(s) em docs/store-kit/ (abra em Código).`); break; }
      }
    } catch (e) { setPubNote(e instanceof Error ? e.message : "erro"); }
    setPubBusy(false);
  };

  const makeGameBuild = async (platform: "windows" | "linux") => {
    if (!id) return;
    setPubBusy(true);
    setPubNote(`Exportando executável ${platform === "windows" ? "Windows .exe" : "Linux"} (Godot real)…`);
    try {
      await api.buildGame(id, platform);
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await api.builds(id);
        const found = st.builds.find((b) => b.name.includes(platform === "windows" ? "win64" : "linux64"));
        if (found) { setPubNote(`Build pronto: ${found.name} (${(found.size / 1048576).toFixed(0)} MB) — /download via botão abaixo.`); break; }
      }
      const st = await api.builds(id);
      setDownloads(st.builds);
    } catch (e) { setPubNote(e instanceof Error ? e.message : "erro"); }
    setPubBusy(false);
  };
  const [validation, setValidation] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const d = await api.project(id);
      setProject(d.project);
      setTasks(d.tasks);
      setInitialEvents(d.events);
    } catch {
      nav("/");
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const liveEvents = useMemo(() => {
    const projEvents = events.filter((e) => e.project_id === id);
    const merged = [...projEvents, ...initialEvents];
    const seen = new Set<string>();
    return merged.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).slice(0, 60);
  }, [events, initialEvents, id]);

  const stagesDone = useMemo(() => {
    const stages = new Set<string>();
    for (const e of liveEvents) if (e.stage) stages.add(e.stage);
    return stages;
  }, [liveEvents]);

  const runForge = async () => {
    if (!id) return;
    setBusy(true);
    try { await api.forge(id); } catch { /* already running */ }
    setTimeout(() => setBusy(false), 800);
  };

  const validateNow = async () => {
    if (!id) return;
    setValidation("validando…");
    try {
      const r = await api.validate(id);
      setValidation(r.validation.ok ? `PASS (${r.validation.durationMs}ms, 0 erros)` : `FAIL — ${r.validation.issues.length} issue(s)`);
    } catch (e) {
      setValidation(e instanceof Error ? e.message : "erro");
    }
  };

  const openEditor = async () => {
    if (!id) return;
    try { await api.editor(id); } catch { /* engine missing */ }
  };

  const buildPreview = async () => {
    if (!id) return;
    setPreviewBusy(true);
    setPreviewNote(null);
    try {
      // instant check: existing build?
      const status0 = await api.previewStatus(id);
      if (status0.ready && status0.url) {
        // still trigger a fresh export in the background (latest agent work)
        void api.exportWeb(id).catch(() => undefined);
        setPreviewUrl(`${status0.url}?t=${Date.now()}`);
        setPreviewNote(null);
        setPreviewBusy(false);
        return;
      }
      const r = await api.exportWeb(id);
      if ((r as { started?: boolean }).started) {
        setPreviewNote("Exportando build web (Godot real — a primeira exportação pode levar alguns minutos)…");
        // poll until ready
        for (let i = 0; i < 90; i++) {
          await new Promise((res) => setTimeout(res, 2500));
          const st = await api.previewStatus(id);
          if (st.ready && st.url) {
            setPreviewUrl(`${st.url}?t=${Date.now()}`);
            setPreviewNote(null);
            setPreviewBusy(false);
            return;
          }
        }
        setPreviewNote("A exportação ainda está rodando — acompanhe o Activity Feed.");
      } else if ((r as { templatesMissing?: boolean }).templatesMissing) {
        setPreviewNote("Templates de export não instalados — instale abaixo (download único oficial, ~1GB).");
        setTemplatesReady(false);
      } else {
        setPreviewNote((r as { error?: string }).error ?? "Falha no export web.");
      }
    } catch (e) {
      setPreviewNote(e instanceof Error ? e.message : "erro no export");
    }
    setPreviewBusy(false);
  };

  const installTemplates = async () => {
    setPreviewBusy(true);
    setPreviewNote("Baixando templates oficiais (~570MB)… acompanhe no Activity Feed.");
    try {
      const r = await api.installTemplates();
      setTemplatesReady(r.installed);
      setPreviewNote(r.installed ? "Templates instalados! Clique em ▶ Live Preview." : r.note);
    } catch (e) {
      setPreviewNote(e instanceof Error ? e.message : "falha no download");
    }
    setPreviewBusy(false);
  };

  if (!project) return <div className="p-8 text-mute text-center">carregando projeto…</div>;

  const running = liveEvents.some((e) => e.stage && !stagesDone.has("validate") && tasks.some((t) => t.status === "running"));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5 slide-in">
      {/* header */}
      <div className="panel p-5 flex items-center gap-5 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold truncate">{project.name}</h1>
            <span className={`tag ${project.status === "playable" ? "border-good/40 text-good bg-good/10" : ""}`}>
              {project.status.toUpperCase()}
            </span>
            {running && <span className="tag border-cyan-live/40 text-cyan-live">AGENTES TRABALHANDO</span>}
          </div>
          <div className="text-[12px] text-mute mt-1">
            {project.engine} · {project.dimensions} · {project.phase} · {project.slug}
          </div>
        </div>
        <div className="w-56">
          <div className="flex justify-between text-[11px] text-mute mb-1">
            <span>PROGRESSO</span><span>{project.progress}%</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${project.progress}%` }} /></div>
        </div>
      </div>

      {/* stage pipeline */}
      <div className="panel p-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STAGES.map((s, i) => {
            const done = stagesDone.has(s) && project.progress >= (i + 1) * 10;
            const active = liveEvents.some((e) => e.stage === s) && !done;
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`tag ${done ? "border-good/50 text-good" : active ? "border-cyan-live text-cyan-live" : ""}`}>
                  {done ? <ShieldCheck size={11} /> : active ? <span className="live-dot" style={{ width: 6, height: 6 }} /> : null}
                  {s}
                </span>
                {i < STAGES.length - 1 && <span className="text-edge text-[10px]">──</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* actions */}
      <div className="flex gap-2 flex-wrap">
        <button className="btn btn-primary" onClick={buildPreview} disabled={previewBusy} title="Exporta o jogo para web (Godot real) e roda embutido aqui">
          <MonitorPlay size={14} /> {previewBusy ? "Exportando…" : "▶ Live Preview"}
        </button>
        {templatesReady === false && (
          <button className="btn text-cyan-live border-cyan-live/40" onClick={installTemplates} disabled={previewBusy}>
            Instalar templates de export
          </button>
        )}
        <button className="btn" onClick={runForge} disabled={busy}>
          <Play size={14} /> {busy ? "Pipeline em execução…" : "Executar pipeline"}
        </button>
        <button className="btn" onClick={validateNow}><Terminal size={14} /> Validar agora</button>
        <button className="btn" onClick={openEditor}><ExternalLink size={14} /> Abrir na engine</button>
        <button className="btn" onClick={() => void makeStoreKit()} disabled={pubBusy}><Store size={14} /> Steam Kit</button>
        <button className="btn" onClick={() => void makeGameBuild("windows")} disabled={pubBusy}><Package size={14} /> .exe (Windows)</button>
        <button className="btn" onClick={() => void makeGameBuild("linux")} disabled={pubBusy}><Package size={14} /> Linux</button>
        <button className="btn" onClick={() => nav(`/project/${id}/dna`)}><Dna size={14} /> Game DNA</button>
        <button className="btn" onClick={() => nav(`/project/${id}/code`)}><Code2 size={14} /> Código</button>
        <button className="btn" onClick={() => nav(`/project/${id}/logs`)}><ScrollText size={14} /> Logs</button>
        <button className="btn" onClick={() => void load()}><RefreshCw size={14} /></button>
      </div>
      {validation && <div className="panel p-3 text-sm font-mono">{validation}</div>}
      {previewNote && <div className="panel p-3 text-sm text-cyan-live border-cyan-live/30">{previewNote}</div>}
      {pubNote && <div className="panel p-3 text-sm text-violet border-violet/30">{pubNote}</div>}
      {downloads.length > 0 && (
        <div className="panel p-4 flex gap-3 flex-wrap items-center">
          <span className="text-[12px] font-bold tracking-wider text-mute">BUILDS PARA DISTRIBUIÇÃO:</span>
          {downloads.map((d) => (
            <a key={d.name} className="btn" href={`/download/${(project as { slug?: string }).slug}/${d.name}`} download>{d.name} · {(d.size / 1048576).toFixed(0)} MB</a>
          ))}
        </div>
      )}

      {/* LIVE PREVIEW — the game runs INSIDE the studio, like an engine's Play panel */}
      {previewUrl && (
        <div className="panel p-0 overflow-hidden slide-in">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-edge">
            <span className="live-dot" />
            <span className="text-[12px] font-bold tracking-wider text-cyan-live">LIVE PREVIEW</span>
            <span className="text-[11px] text-mute">— o jogo roda aqui dentro (export Web real do Godot)</span>
            <button className="btn ml-auto py-1.5 px-3" onClick={buildPreview} disabled={previewBusy}>
              <RefreshCw size={13} /> {previewBusy ? "Re-exportando…" : "Atualizar preview"}
            </button>
          </div>
          <iframe
            src={previewUrl}
            className="w-full"
            style={{ height: 560, background: "#000", display: "block", border: "none" }}
            allow="autoplay; fullscreen; gamepad"
          />
        </div>
      )}

      <div className="grid grid-cols-[1fr_380px] gap-5">
        {/* tasks */}
        <div className="panel p-5">
          <h2 className="text-sm font-bold tracking-wide mb-4">TASK GRAPH</h2>
          {tasks.length === 0 ? (
            <div className="text-mute text-sm py-6 text-center">Nenhuma task ainda — execute o pipeline.</div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className={`border rounded-xl p-3 bg-panel-2/30 ${TASK_STATUS_STYLE[t.status] ?? ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`tag ${TASK_STATUS_STYLE[t.status] ?? ""}`}>{t.status}</span>
                    <span className="font-semibold text-[13px] flex-1 truncate">{t.title}</span>
                    <span className="text-[10px] text-mute">P{t.priority} · {t.type}</span>
                  </div>
                  <div className="text-[12px] text-mute mt-1">{t.description}</div>
                  {t.result && <div className="text-[11px] text-good mt-1.5 truncate">{t.result}</div>}
                  {t.error && <div className="text-[11px] text-bad mt-1.5">{t.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* activity feed */}
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold tracking-wide">ACTIVITY FEED</h2>
            <span className="live-dot ml-auto" />
          </div>
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {liveEvents.length === 0 && <div className="text-mute text-sm py-6 text-center">aguardando eventos…</div>}
            {liveEvents.map((e) => (
              <div key={e.id} className="slide-in flex gap-2.5 items-start">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${LEVEL_DOT[e.level] ?? "bg-mute"}`} />
                <div className="min-w-0">
                  <div className="text-[12px] leading-snug">{e.message}</div>
                  <div className="text-[10px] text-mute">
                    {new Date(e.ts).toLocaleTimeString()} {e.agent ? `· ${e.agent}` : ""} {e.stage ? `· ${e.stage}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
