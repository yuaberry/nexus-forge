/** Code browser — workspace file tree + viewer. */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, File, Folder } from "lucide-react";
import { api } from "../lib/api";

export default function CodeView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [tree, setTree] = useState<{ path: string; type: "file" | "dir" }[]>([]);
  const [current, setCurrent] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.tree(id).then((t) => {
      setTree(t.tree);
      const main = t.tree.find((f) => f.path === "scripts/main.gd") ?? t.tree.find((f) => f.type === "file" && f.path.endsWith(".gd"));
      if (main) void open(main.path);
    }).catch(() => nav("/"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const open = async (path: string) => {
    if (!id) return;
    try { setCurrent(await api.file(id, path)); } catch { /* unreadable */ }
  };

  return (
    <div className="h-full flex flex-col slide-in">
      <div className="p-4 pb-2 flex items-center gap-3">
        <button className="btn" onClick={() => nav(`/project/${id}`)}><ArrowLeft size={14} /> voltar</button>
        <h1 className="text-sm font-bold tracking-wide">CODE WORKSPACE</h1>
      </div>
      <div className="flex-1 grid grid-cols-[300px_1fr] gap-4 px-4 pb-4 min-h-0">
        <div className="panel p-3 overflow-y-auto">
          {tree.length === 0 && <div className="text-mute text-xs p-4">vazio</div>}
          {tree.map((f) => (
            <button
              key={f.path}
              onClick={() => f.type === "file" && void open(f.path)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] hover:bg-panel-2 text-left ${current?.path === f.path ? "bg-nexus/15 text-nexus-soft" : "text-mute"}`}
            >
              {f.type === "dir" ? <Folder size={13} className="shrink-0" /> : <File size={13} className="shrink-0" />}
              <span className="truncate font-mono">{f.path}</span>
            </button>
          ))}
        </div>
        <div className="panel p-0 overflow-hidden min-h-0 flex flex-col">
          {current ? (
            <>
              <div className="px-4 py-2.5 border-b border-edge text-[12px] font-mono text-nexus-soft shrink-0">
                {current.path}
              </div>
              <pre className="flex-1 overflow-auto p-4 text-[12px] leading-relaxed font-mono text-ink/90 whitespace-pre">
                {current.content}
              </pre>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-mute text-sm">selecione um arquivo</div>
          )}
        </div>
      </div>
    </div>
  );
}
