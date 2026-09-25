/** Nexus Forge — application shell: sidebar hub + topbar + routed views. */
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Hammer, Sparkles, Settings2, ChevronRight, Cpu, Boxes, Star,
} from "lucide-react";
import { useNexus } from "./store";
import { api, type ProjectDto } from "./lib/api";
import Home from "./features/Home";
import CreateGame from "./features/CreateGame";
import ProjectView from "./features/ProjectView";
import DnaView from "./features/DnaView";
import CodeView from "./features/CodeView";
import LogsView from "./features/LogsView";
import SettingsView from "./features/SettingsView";

function Sidebar() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  useEffect(() => {
    void api.projects().then((r) => setProjects(r.projects.slice(0, 5))).catch(() => undefined);
    const t = setInterval(() => void api.projects().then((r) => setProjects(r.projects.slice(0, 5))).catch(() => undefined), 6000);
    return () => clearInterval(t);
  }, []);

  const Item = ({ to, label, icon, active }: { to: string; label: string; icon: React.ReactNode; active?: boolean }) => (
    <a
      href={to}
      onClick={(e) => { e.preventDefault(); nav(to); }}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
        active ? "bg-nexus/15 text-nexus-soft border border-nexus/25" : "text-mute hover:text-ink hover:bg-panel-2 border border-transparent"
      }`}
    >
      {icon} {label}
    </a>
  );

  return (
    <aside className="w-[228px] shrink-0 border-r border-edge glass flex flex-col z-10">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="logo-mark w-9 h-9 rounded-xl bg-gradient-to-br from-nexus to-violet grid place-items-center shrink-0">
            <Hammer size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold tracking-[0.12em] text-[14px] leading-none">NEXUS FORGE</div>
            <div className="text-[9px] text-faint mt-1 tracking-[0.22em]">AI GAME STUDIO</div>
          </div>
        </div>
      </div>

      <div className="px-3">
        <div className="kicker px-2 pt-2 pb-1.5">Estúdio</div>
        <nav className="space-y-1">
          <Item to="/" label="Dashboard" icon={<LayoutGrid size={15} />} />
          <Item to="/create" label="Create Game" icon={<Sparkles size={15} />} />
        </nav>
      </div>

      {projects.length > 0 && (
        <div className="px-3 mt-5 flex-1 min-h-0 flex flex-col">
          <div className="kicker px-2 pb-1.5 flex items-center justify-between">
            Projetos <Boxes size={11} className="text-faint" />
          </div>
          <nav className="space-y-0.5 overflow-y-auto">
            {projects.map((p) => (
              <a
                key={p.id}
                href={`/project/${p.id}`}
                onClick={(e) => { e.preventDefault(); nav(`/project/${p.id}`); }}
                className="group flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] text-mute hover:text-ink hover:bg-panel-2 transition-colors"
              >
                <Star size={11} className="text-faint group-hover:text-nexus-soft shrink-0" />
                <span className="truncate flex-1">{p.name}</span>
                <span className={`text-[9.5px] shrink-0 ${p.status === "playable" ? "text-good" : p.status === "failed" ? "text-bad" : "text-cyan-live"}`}>
                  {p.progress}%
                </span>
              </a>
            ))}
          </nav>
        </div>
      )}

      <div className="px-3 mt-auto">
        <nav className="space-y-1 pt-3">
          <Item to="/settings" label="Settings" icon={<Settings2 size={15} />} />
        </nav>
      </div>
      <div className="px-5 py-4 border-t border-edge text-[10px] text-faint leading-relaxed">
        Imagine. <span className="text-nexus-soft">Direct.</span> Build.<br />
        <span className="text-mute">v0.2.1 — Live Preview</span>
      </div>
    </aside>
  );
}

function Topbar() {
  const { status, connected } = useNexus();
  return (
    <header className="h-12 shrink-0 border-b border-edge glass flex items-center gap-4 px-5 z-10">
      <div className="flex items-center gap-2 text-[12px]">
        {connected ? <span className="live-dot" /> : <span className="w-2 h-2 rounded-full bg-bad" />}
        <span className={connected ? "text-cyan-live font-semibold tracking-wide" : "text-bad"}>{connected ? "LIVE" : "OFFLINE"}</span>
      </div>
      <div className="flex-1" />
      {status && (
        <>
          <div className="tag gap-1.5"><Cpu size={11} /> AI <span className={status.aiConfigured ? "text-good" : "text-warn"}>{status.aiConfigured ? "ONLINE" : "OFFLINE"}</span></div>
          <div className="tag gap-1.5">Godot <span className={status.engines.find((e) => e.engine === "godot4")?.installed ? "text-good" : "text-bad"}>{status.engines.find((e) => e.engine === "godot4")?.installed ? "READY" : "—"}</span></div>
          <div className="tag gap-1.5">UE5 <span className={status.engines.find((e) => e.engine === "unreal5")?.installed ? "text-good" : "text-faint"}>{status.engines.find((e) => e.engine === "unreal5")?.installed ? "READY" : "—"}</span></div>
        </>
      )}
    </header>
  );
}

export default function App() {
  const { connect, refreshStatus } = useNexus();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    connect();
    void refreshStatus();
    const t = setInterval(() => void refreshStatus(), 15_000);
    setBooted(true);
    return () => clearInterval(t);
  }, [connect, refreshStatus]);

  if (!booted) return <div className="h-full grid place-items-center text-mute kicker">booting nexus…</div>;

  return (
    <BrowserRouter>
      <div className="h-full flex nexus-bg">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          <Topbar />
          <main className="flex-1 overflow-y-auto relative z-[1]">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<CreateGame />} />
              <Route path="/project/:id" element={<ProjectView />} />
              <Route path="/project/:id/dna" element={<DnaView />} />
              <Route path="/project/:id/code" element={<CodeView />} />
              <Route path="/project/:id/logs" element={<LogsView />} />
              <Route path="/settings" element={<SettingsView />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
void ChevronRight;
