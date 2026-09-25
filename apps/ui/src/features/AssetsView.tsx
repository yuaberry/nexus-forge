/** Assets — sprite gallery with live previews, AI regeneration per slot. */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Wand2, RefreshCw, Sparkles } from "lucide-react";
import { api } from "../lib/api";

const SLOT_META: Record<string, { label: string; desc: string }> = {
  player: { label: "Herói", desc: "Sprite do personagem principal" },
  enemy: { label: "Criatura", desc: "Inimigos perseguidores" },
  shard: { label: "Shard", desc: "Coletável do objetivo" },
  tile_ground: { label: "Tile Chão", desc: "Textura do terreno" },
  tile_wall: { label: "Tile Parede", desc: "Paredes e plataformas" },
  sky: { label: "Céu", desc: "Fundo do mundo" },
  glow: { label: "Glow", desc: "VFX de brilho" },
};
const SLOTS = Object.keys(SLOT_META);

export default function AssetsView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadAll = async () => {
    if (!id) return;
    const next: Record<string, string> = {};
    await Promise.all(SLOTS.map(async (slot) => {
      try {
        const r = await fetch(`/api/projects/${id}/asset-file?path=assets/sprites/${slot}.png`);
        if (r.ok) {
          const d = (await r.json()) as { base64?: string };
          if (d.base64) next[slot] = `data:image/png;base64,${d.base64}`;
        }
      } catch { /* absent */ }
    }));
    setPreviews(next);
  };

  useEffect(() => { void loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const aiGen = async (slot: string) => {
    if (!id) return;
    setBusy(slot);
    setNote(`Gerando "${slot}" com IA de imagem… (pode levar ~30-60s)`);
    try {
      await api.aiSprite(id, slot);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const r = await fetch(`/api/projects/${id}/asset-file?path=assets/sprites/${slot}.png&t=${Date.now()}`);
          if (r.ok) {
            const d = (await r.json()) as { base64?: string };
            if (d.base64) {
              setPreviews((p) => ({ ...p, [slot]: `data:image/png;base64,${d.base64}` }));
              setNote(`"${slot}" regenerado por IA! Reexporte o Live Preview para ver no jogo.`);
              break;
            }
          }
        } catch { /* keep polling */ }
      }
    } catch (e) { setNote(e instanceof Error ? e.message : "erro"); }
    setBusy(null);
  };

  const regenProcedural = async (slot: string) => {
    if (!id) return;
    setBusy(slot);
    try {
      await api.regenSprite(id, slot);
      await new Promise((r) => setTimeout(r, 600));
      await loadAll();
      setNote(`"${slot}" restaurado (pixel forge procedural).`);
    } catch { /* ignore */ }
    setBusy(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5 slide-in">
      <div className="flex items-center gap-3">
        <button className="btn" onClick={() => nav(`/project/${id}`)}><ArrowLeft size={14} /> voltar</button>
        <h1 className="text-lg font-extrabold tracking-tight">Assets <span className="text-mute text-sm font-normal">— sprite forge do projeto</span></h1>
        <span className="live-dot ml-2" />
      </div>
      {note && <div className="panel p-3 text-sm text-violet border-violet/30">{note}</div>}

      <div className="grid grid-cols-4 gap-4">
        {SLOTS.map((slot) => (
          <div key={slot} className="panel panel-key overflow-hidden group">
            <div
              className="h-36 grid place-items-center relative"
              style={{
                backgroundImage: "linear-gradient(45deg, #161923 25%, transparent 25%), linear-gradient(-45deg, #161923 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #161923 75%), linear-gradient(-45deg, transparent 75%, #161923 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                backgroundColor: "#0d0e15",
              }}
            >
              {previews[slot] ? (
                <img
                  src={previews[slot]}
                  alt={slot}
                  className="max-h-28 max-w-[85%] object-contain"
                  style={{ imageRendering: slot.startsWith("tile") || slot === "sky" ? "auto" : "pixelated" }}
                />
              ) : (
                <span className="text-faint text-[11px]">gerando preview…</span>
              )}
            </div>
            <div className="p-3 border-t border-edge">
              <div className="text-[13px] font-bold">{SLOT_META[slot]?.label ?? slot}</div>
              <div className="text-[10.5px] text-faint mb-2.5">{SLOT_META[slot]?.desc}</div>
              <div className="flex gap-1.5">
                <button className="btn flex-1 justify-center py-1.5 px-2 text-[11px]" disabled={busy === slot} onClick={() => void aiGen(slot)} title="Gerar com IA de imagem real">
                  <Wand2 size={12} className="text-violet" /> IA
                </button>
                <button className="btn py-1.5 px-2 text-[11px]" disabled={busy === slot} onClick={() => void regenProcedural(slot)} title="Restaurar pixel forge procedural">
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel p-4 text-[12px] text-mute leading-relaxed">
        <Sparkles size={13} className="inline mr-1 text-nexus-soft" />
        Os sprites do jogo carregam de <code className="text-cyan-live">assets/sprites/</code> em tempo real (sem import).
        Gerou algo bonito com IA? Um clique em <b className="text-ink">▶ Live Preview</b> reexporta o jogo e o novo arte aparece.
        Os templates 2D usam esses slots; o estilo procedural usa a paleta do Game DNA.
      </div>
    </div>
  );
}
