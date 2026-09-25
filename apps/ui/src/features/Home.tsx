/** Dashboard — engine-hub grade: hero, live status, projects, activity. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight, HardDrive, Cpu, Boxes, Activity, MonitorPlay } from "lucide-react";
import { api, type ProjectDto } from "../lib/api";
import { useNexus } from "../store";

const STATUS_COLORS: Record<string, string> = {
  playable: "text-good border-good/40 bg-good/10",
  planning: "text-mute",
  prototyping: "text-cyan-live border-cyan-live/40 bg-cyan-live/10",
  building: "text-warn border-warn/40 bg-warn/10",
  failed: "text-bad border-bad/40 bg-bad/10",
  draft: "text-mute",
  shipped: "text-violet border-violet/40 bg-violet/10",
};

const PHRASES = [
  "Imagine. Direct. Build.",
  "Descreva o jogo — a IA forja o resto.",
  "Seu jogo. Rodando aqui. Agora.",
  "Do conceito ao .exe sem sair do estúdio.",
];

export default function Home() {
  const nav = useNavigate();
  const { status, events } = useNexus();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [phrase, setPhrase] = useState(0);

  useEffect(() => {
    void (async () => {
      try { setProjects((await api.projects()).projects); } catch { /* offline */ }
      setLoading(false);
    })();
    const t = setInterval(async () => {
      try { setProjects((await api.projects()).projects); } catch { /* keep old */ }
    }, 5000);
    const p = setInterval(() => setPhrase((x) => (x + 1) % PHRASES.length), 4200);
    return () => { clearInterval(t); clearInterval(p); };
  }, []);

  const playable = projects.filter((p) => p.status === "playable").length;

  return (
    <div className="p-7 max-w-6xl mx-auto space-y-6">
      {/* ── Hero ── */}
      <section className="panel panel-key panel-lift p-8 relative overflow-hidden rise-in">
        <div className="absolute -right-24 -top-32 w-96 h-96 rounded-full bg-nexus/12 blur-3xl" />
        <div className="absolute -left-16 -bottom-24 w-72 h-72 rounded-full bg-violet/10 blur-3xl" />
        <div className="relative">
          <div className="kicker">NEXUS FORGE · AI AUTONOMOUS GAME STUDIO</div>
          <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-tight mt-3">
            {PHRASES[phrase] && <span key={phrase} className="rise-in inline-block grad-text">{PHRASES[phrase]}</span>}
          </h1>
          <p className="text-mute text-[14.5px] mt-3 max-w-xl leading-relaxed">
            Uma equipe de agentes de IA planeja o design, escreve o GDD, programa em GDScript,
            valida no Godot de verdade e entrega — <span className="text-ink font-semibold">jogável dentro do estúdio</span>,
            kit Steam completo e executável <span className="text-nexus-soft">.exe</span> pronto para publicar.
          </p>
          <div className="flex gap-3 mt-6 flex-wrap">
            <button className="btn btn-primary py-3 px-6 text-[14px]" onClick={() => nav("/create")}>
              <Sparkles size={16} /> Criar um jogo agora
            </button>
            {projects[0] && (
              <button className="btn btn-play py-3 px-6" onClick={() => nav(`/project/${projects[0]!.id}`)}>
                <MonitorPlay size={16} /> Continuar: {projects[0].name}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Status strip ── */}
      <section className="grid grid-cols-4 gap-4">
        {[
          { icon: <Cpu size={17} />, color: "text-nexus", label: "AI PROVIDER", value: status?.aiConfigured ? "Online" : "Modo offline", tone: status?.aiConfigured ? "text-good" : "text-warn" },
          { icon: <HardDrive size={17} />, color: "text-cyan-live", label: "GODOT 4.3", value: status?.engines.find((e) => e.engine === "godot4")?.installed ? "Instalado" : "Ausente", tone: status?.engines.find((e) => e.engine === "godot4")?.installed ? "text-good" : "text-bad" },
          { icon: <Boxes size={17} />, color: "text-violet", label: "PROJETOS", value: `${projects.length} no workspace`, tone: "text-ink" },
          { icon: <Activity size={17} />, color: "text-good", label: "JOGÁVEIS", value: `${playable} validados`, tone: playable > 0 ? "text-good" : "text-mute" },
        ].map((s, i) => (
          <div key={s.label} className="panel panel-lift p-4 flex items-center gap-3 rise-in" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={s.color}>{s.icon}</span>
            <div className="min-w-0">
              <div className="text-[10px] text-faint font-bold tracking-[0.16em]">{s.label}</div>
              <div className={`text-[13.5px] font-semibold truncate ${s.tone}`}>{s.value}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Projects + Activity ── */}
      <section className="grid grid-cols-[1fr_300px] gap-5">
        <div className="panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="kicker">Projetos</h2>
            <button className="btn py-1.5 px-3 text-[12px]" onClick={() => nav("/create")}>+ Novo</button>
          </div>
          {loading ? (
            <div className="text-mute text-sm py-8 text-center">carregando…</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-mute text-sm">Nenhum projeto ainda.</div>
              <div className="text-faint text-[12px] mt-1">Descreva sua ideia — o pipeline entrega um protótipo jogável.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => nav(`/project/${p.id}`)}
                  className="w-full flex items-center gap-4 p-3.5 rounded-xl border border-edge bg-panel-2/40 hover:border-nexus/60 hover:bg-panel-2/70 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-nexus/30 to-violet/20 border border-nexus/25 grid place-items-center font-extrabold text-[13px] text-nexus-soft shrink-0">
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[13.5px] truncate group-hover:text-white transition-colors">{p.name}</div>
                    <div className="text-[10.5px] text-faint truncate">{p.engine} · {p.dimensions} · {p.phase}</div>
                  </div>
                  <div className="w-24 hidden sm:block">
                    <div className="progress-bar"><div className="progress-fill" style={{ width: `${p.progress}%` }} /></div>
                  </div>
                  <span className={`tag shrink-0 ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</span>
                  <ChevronRight size={15} className="text-faint group-hover:text-nexus-soft transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Activity mini-feed */}
        <div className="panel p-5 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="kicker">Atividade</h2>
            <span className="live-dot ml-auto" />
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[340px] pr-1">
            {events.length === 0 && <div className="text-faint text-[12px] py-6 text-center">aguardando eventos…</div>}
            {events.slice(0, 12).map((e) => (
              <div key={e.id} className="slide-in flex gap-2.5 items-start">
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  e.level === "success" ? "bg-good" : e.level === "error" ? "bg-bad" : e.level === "warning" ? "bg-warn" : "bg-nexus"
                }`} />
                <div className="min-w-0">
                  <div className="text-[11.5px] leading-snug text-mute">{e.message}</div>
                  <div className="text-[9.5px] text-faint">{new Date(e.ts).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
