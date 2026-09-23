/** Dashboard — status of the studio + project list. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight, HardDrive, Cpu, Boxes } from "lucide-react";
import { api, type ProjectDto } from "../lib/api";
import { useNexus } from "../store";

const STATUS_COLORS: Record<string, string> = {
  playable: "text-good border-good/40 bg-good/10",
  planning: "text-mute",
  prototyping: "text-cyan-live border-cyan-live/40 bg-cyan-live/10",
  building: "text-warn border-warn/40 bg-warn/10",
  failed: "text-bad border-bad/40 bg-bad/10",
  draft: "text-mute",
  paused: "text-mute",
  shipped: "text-violet border-violet/40 bg-violet/10",
};

export default function Home() {
  const nav = useNavigate();
  const { status } = useNexus();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try { setProjects((await api.projects()).projects); } catch { /* offline */ }
      setLoading(false);
    })();
    const t = setInterval(async () => {
      try { setProjects((await api.projects()).projects); } catch { /* keep old */ }
    }, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 slide-in">
      <section className="panel p-6 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-nexus/10 blur-3xl" />
        <div className="text-[11px] tracking-[0.25em] text-nexus-soft font-semibold">NEXUS FORGE</div>
        <h1 className="text-2xl font-bold mt-2">Imagine. Direct. Build.</h1>
        <p className="text-mute text-sm mt-2 max-w-xl leading-relaxed">
          Descreva o jogo que você quer. O Nexus planeja, gera Game DNA, escreve a documentação,
          cria o projeto na engine, programa, valida e entrega um protótipo jogável — com todo o
          processo auditável em tempo real.
        </p>
        <button className="btn btn-primary mt-5" onClick={() => nav("/create")}>
          <Sparkles size={15} /> Criar um jogo agora
        </button>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="panel p-4 flex items-center gap-3">
          <Cpu size={18} className="text-nexus" />
          <div>
            <div className="text-[11px] text-mute">AI PROVIDER</div>
            <div className={`text-sm font-semibold ${status?.aiConfigured ? "text-good" : "text-warn"}`}>
              {status?.aiConfigured ? "Configurado" : "Modo offline"}
            </div>
          </div>
        </div>
        <div className="panel p-4 flex items-center gap-3">
          <HardDrive size={18} className="text-cyan-live" />
          <div>
            <div className="text-[11px] text-mute">GODOT 4</div>
            <div className={`text-sm font-semibold ${status?.engines.find((e) => e.engine === "godot4")?.installed ? "text-good" : "text-bad"}`}>
              {status?.engines.find((e) => e.engine === "godot4")?.installed ? "Instalado & pronto" : "Não instalado"}
            </div>
          </div>
        </div>
        <div className="panel p-4 flex items-center gap-3">
          <Boxes size={18} className="text-violet" />
          <div>
            <div className="text-[11px] text-mute">PROJETOS</div>
            <div className="text-sm font-semibold">{projects.length} no workspace</div>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-bold tracking-wide mb-4">PROJETOS</h2>
        {loading ? (
          <div className="text-mute text-sm py-6 text-center">carregando…</div>
        ) : projects.length === 0 ? (
          <div className="text-mute text-sm py-8 text-center">
            Nenhum projeto ainda. Crie o primeiro com o wizard.
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => nav(`/project/${p.id}`)}
                className="w-full flex items-center gap-4 p-3 rounded-xl border border-edge bg-panel-2/40 hover:border-nexus/60 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-[11px] text-mute truncate">{p.engine} · {p.dimensions} · {p.phase}</div>
                </div>
                <div className="w-28">
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${p.progress}%` }} /></div>
                  <div className="text-[10px] text-mute mt-1 text-right">{p.progress}%</div>
                </div>
                <span className={`tag ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</span>
                <ChevronRight size={15} className="text-mute" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
