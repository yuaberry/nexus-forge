/** Create Game — the wizard: one idea is enough; everything else is optional. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Rocket, Image, FileText, Info } from "lucide-react";
import { api } from "../lib/api";

const DIMENSIONS = [
  { id: "2d", label: "2D", hint: "Pixel / top-down / platformer" },
  { id: "3d", label: "3D", hint: "Mundos tridimensionais" },
];
const ENGINES = [
  { id: "godot4", label: "Godot 4", hint: "2D+3D · validação headless real" },
  { id: "unreal5", label: "Unreal 5", hint: "AAA 3D · scaffold real (compila com engine instalada)" },
];
const PLATFORMS = ["windows", "linux", "macos", "switch", "ps5", "xbox", "android", "ios", "web", "vr"];
const RATINGS = [
  { id: "everyone", label: "Livre" },
  { id: "teen", label: "Adolescente" },
  { id: "mature", label: "Maduro" },
  { id: "adult", label: "Adulto (+18)" },
];

export default function CreateGame() {
  const nav = useNavigate();
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [dimension, setDimension] = useState<string>("2d");
  const [engine, setEngine] = useState<string>("godot4");
  const [platforms, setPlatforms] = useState<string[]>(["windows", "linux"]);
  const [rating, setRating] = useState("teen");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePlatform = (p: string) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const create = async () => {
    if (idea.trim().length < 10) {
      setError("Descreva sua ideia com pelo menos 10 caracteres — é o único campo obrigatório.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.createProject({
        idea,
        name: name.trim() || undefined,
        dimensions: dimension,
        engine,
        platforms,
        contentRating: rating,
      });
      // Kick off the full autonomous pipeline — progress streams into the project view
      void api.forge(project.id).catch(() => undefined);
      nav(`/project/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar projeto");
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 slide-in">
      <div>
        <h1 className="text-xl font-bold">O que você quer criar?</h1>
        <p className="text-mute text-sm mt-1">
          Descreva o jogo em linguagem natural. A IA infere o resto — e marca cada decisão como
          confirmada, inferida ou duvidosa no Game DNA.
        </p>
      </div>

      <div className="panel p-5">
        <textarea
          className="input min-h-[120px]"
          placeholder='Ex.: "Quero criar um colony survival chamado NeoHaven, inspirado em RimWorld, com construção de cidades, sobrevivência, agricultura, colonos com necessidades, relações sociais, progressão tecnológica e mundo procedural…"'
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />
        <div className="flex items-center gap-2 mt-2 text-[11px] text-mute">
          <Info size={12} /> Anexos de referência (imagens, docs) podem ser importados dentro do projeto.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-4">
          <label className="text-[11px] font-bold text-mute tracking-wider">NOME (OPCIONAL)</label>
          <input className="input mt-2" placeholder="A IA sugere um título se vazio" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="panel p-4">
          <label className="text-[11px] font-bold text-mute tracking-wider">DIMENSÃO</label>
          <div className="flex gap-2 mt-2">
            {DIMENSIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDimension(d.id)}
                className={`btn flex-1 justify-center ${dimension === d.id ? "btn-primary" : ""}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <label className="text-[11px] font-bold text-mute tracking-wider">ENGINE</label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {ENGINES.map((e2) => (
            <button
              key={e2.id}
              onClick={() => setEngine(e2.id)}
              className={`btn justify-start ${engine === e2.id ? "btn-primary" : ""}`}
            >
              <div className="text-left">
                <div className="text-[13px]">{e2.label}</div>
                <div className="text-[10px] opacity-70">{e2.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_260px] gap-4">
        <div className="panel p-4">
          <label className="text-[11px] font-bold text-mute tracking-wider">PLATAformas</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`tag uppercase cursor-pointer transition-colors ${platforms.includes(p) ? "border-nexus text-nexus-soft bg-nexus/10" : ""}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="panel p-4">
          <label className="text-[11px] font-bold text-mute tracking-wider">CLASSIFICAÇÃO</label>
          <select className="input mt-2" value={rating} onChange={(e) => setRating(e.target.value)}>
            {RATINGS.map((r) => (
              <option key={r.id} value={r.id} className="bg-panel">{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="panel border-bad/40 bg-bad/10 p-3 text-sm text-bad">{error}</div>
      )}

      <button className="btn btn-primary w-full justify-center py-3 text-[14px]" disabled={busy} onClick={create}>
        <Rocket size={16} />
        {busy ? "Forjando…" : "Forjar o jogo — pipeline autônomo completo"}
      </button>

      <div className="flex items-center gap-4 justify-center text-[11px] text-mute pb-4">
        <span className="flex items-center gap-1.5"><FileText size={12} /> GDD + DNA gerados</span>
        <span className="flex items-center gap-1.5"><Image size={12} /> Referências no projeto</span>
        <span className="flex items-center gap-1.5"><Rocket size={12} /> Protótipo validado na engine</span>
      </div>
    </div>
  );
}
