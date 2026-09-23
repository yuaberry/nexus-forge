/** Game DNA viewer — every field with its provenance (confirmed/inferred/…). */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";

type DnaBundle = Record<string, Record<string, { value: unknown; origin: string; note?: string; updatedAt: string }>>;

const ORIGIN_STYLE: Record<string, string> = {
  confirmed: "border-good/40 text-good bg-good/10",
  inferred: "border-nexus/40 text-nexus-soft bg-nexus/10",
  unknown: "border-edge text-mute",
  requires_decision: "border-warn/40 text-warn bg-warn/10",
};

export default function DnaView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [dna, setDna] = useState<DnaBundle>({});

  useEffect(() => {
    if (!id) return;
    void api.project(id).then((d) => setDna(d.dna)).catch(() => nav("/"));
  }, [id, nav]);

  const sections = Object.entries(dna).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4 slide-in">
      <button className="btn" onClick={() => nav(`/project/${id}`)}>
        <ArrowLeft size={14} /> voltar ao projeto
      </button>
      <h1 className="text-xl font-bold">GAME DNA <span className="text-mute text-sm font-normal">— memória estrutural permanente</span></h1>

      {sections.length === 0 ? (
        <div className="panel p-8 text-center text-mute text-sm">
          DNA ainda não gerado. Execute o pipeline no dashboard do projeto.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {sections.map(([section, fields]) => (
            <div key={section} className="panel p-4">
              <h2 className="text-[12px] font-bold tracking-[0.15em] text-nexus-soft mb-3 uppercase">{section}</h2>
              <div className="space-y-3">
                {Object.entries(fields).map(([key, f]) => (
                  <div key={key} className="border-l-2 border-edge pl-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold">{key}</span>
                      <span className={`tag ${ORIGIN_STYLE[f.origin] ?? ""}`}>{f.origin}</span>
                    </div>
                    <div className="text-[12px] text-mute mt-0.5 break-words">
                      {typeof f.value === "string" ? f.value : JSON.stringify(f.value)}
                    </div>
                    {f.note && <div className="text-[10px] text-mute mt-0.5 italic">{f.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
