/** Nexus Forge — application shell: sidebar + topbar + routed views. */
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Hammer, Sparkles, Dna, Boxes, Code2, ScrollText,
  Settings2, ChevronRight, Cpu,
} from "lucide-react";
import { useNexus } from "./store";
import Home from "./features/Home";
import CreateGame from "./features/CreateGame";
import ProjectView from "./features/ProjectView";
import DnaView from "./features/DnaView";
import CodeView from "./features/CodeView";
import LogsView from "./features/LogsView";
import SettingsView from "./features/SettingsView";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/create", label: "Create Game", icon: Sparkles },
];

function Sidebar() {
  return (
    <aside className="w-[220px] shrink-0 border-r border-edge bg-panel/60 backdrop-blur-xl flex flex-col z-10">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nexus to-violet grid place-items-center shadow-[0_0_24px_rgba(79,124,255,0.45)]">
            <Hammer size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold tracking-wide text-[15px] leading-none">NEXUS FORGE</div>
            <div className="text-[10px] text-mute mt-1 tracking-[0.18em]">AI GAME STUDIO</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} label={n.label} icon={<n.icon size={15} />} />
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-edge text-[10px] text-mute leading-relaxed">
        Imagine. Direct. Build.<br />
        <span className="text-nexus-soft">v0.1.0 — MVP</span>
      </div>
    </aside>
  );
}

function NavLink({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={to}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-mute hover:text-ink hover:bg-panel-2 transition-colors"
    >
      {icon} {label}
    </a>
  );
}

function Topbar() {
  const { status, connected } = useNexus();
  return (
    <header className="h-12 shrink-0 border-b border-edge bg-panel/50 backdrop-blur-xl flex items-center gap-4 px-5 z-10">
      <div className="flex items-center gap-2 text-[12px]">
        {connected ? <span className="live-dot" /> : <span className="w-2 h-2 rounded-full bg-bad" />}
        <span className={connected ? "text-cyan-live" : "text-bad"}>{connected ? "LIVE" : "OFFLINE"}</span>
      </div>
      <div className="flex-1" />
      {status && (
        <>
          <div className="tag">
            <Cpu size={11} /> AI: {status.aiConfigured ? <span className="text-good">ONLINE</span> : <span className="text-warn">OFFLINE</span>}
          </div>
          <div className="tag">Godot: {status.engines.find((e) => e.engine === "godot4")?.installed ? <span className="text-good">READY</span> : <span className="text-bad">MISSING</span>}</div>
        </>
      )}
    </header>
  );
}

export default function App() {
  const { connect, refreshStatus, events } = useNexus();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    connect();
    void refreshStatus();
    const t = setInterval(() => void refreshStatus(), 15_000);
    setBooted(true);
    return () => clearInterval(t);
  }, [connect, refreshStatus]);

  if (!booted) return <div className="h-full grid place-items-center text-mute">booting nexus…</div>;

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

void Boxes; void Code2; void ScrollText; void Settings2; void ChevronRight; void Dna; void useNavigate;
