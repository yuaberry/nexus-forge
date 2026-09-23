/** Logs — full event history for the project (searchable). */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { api, type EventDto } from "../lib/api";
import { useNexus } from "../store";

const LEVEL_COLOR: Record<string, string> = {
  info: "text-nexus-soft",
  success: "text-good",
  warning: "text-warn",
  error: "text-bad",
};

export default function LogsView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { events } = useNexus();
  const [initial, setInitial] = useState<EventDto[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!id) return;
    void api.events(id, 300).then((r) => setInitial(r.events)).catch(() => nav("/"));
  }, [id, nav]);

  const all = useMemo(() => {
    const merged = [...events.filter((e) => e.project_id === id), ...initial];
    const seen = new Set<string>();
    return merged.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  }, [events, initial, id]);

  const filtered = useMemo(
    () => (q ? all.filter((e) => e.message.toLowerCase().includes(q.toLowerCase())) : all),
    [all, q],
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4 slide-in">
      <div className="flex items-center gap-3">
        <button className="btn" onClick={() => nav(`/project/${id}`)}><ArrowLeft size={14} /> voltar</button>
        <h1 className="text-sm font-bold tracking-wide">LOG CENTER</h1>
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input className="input pl-9" placeholder="buscar nos logs…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel p-4 max-h-[70vh] overflow-y-auto">
        {filtered.length === 0 && <div className="text-mute text-sm p-6 text-center">sem eventos</div>}
        {filtered.map((e) => (
          <div key={e.id} className="flex gap-3 py-1.5 border-b border-edge/40 last:border-0 font-mono text-[12px]">
            <span className="text-mute shrink-0">{new Date(e.ts).toLocaleTimeString()}</span>
            <span className={`shrink-0 w-14 ${LEVEL_COLOR[e.level] ?? "text-mute"}`}>{e.level}</span>
            <span className="text-mute shrink-0 w-28 truncate">{e.agent ?? "—"}</span>
            <span className="min-w-0">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
