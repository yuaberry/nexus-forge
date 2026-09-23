/** Settings — AI provider (key import), engine install, forge mode. */
import { useEffect, useState } from "react";
import { KeyRound, Trash2, Download, Cpu, ShieldCheck, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import { useNexus } from "../store";

export default function SettingsView() {
  const { refreshStatus } = useNexus();
  const [cred, setCred] = useState<{ configured: boolean; hint: string | null }>({ configured: false, hint: null });
  const [keyInput, setKeyInput] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [settings, setSettings] = useState<{ mode: string; autoEngineInstall: boolean }>({ mode: "assisted", autoEngineInstall: true });
  const [godotBusy, setGodotBusy] = useState(false);

  useEffect(() => {
    void api.credentials().then(setCred).catch(() => undefined);
    void api.settings().then(setSettings).catch(() => undefined);
  }, []);

  const importFile = async () => {
    if (!pathInput.trim()) return;
    try {
      const r = await api.importKeyFile(pathInput.trim());
      if (r.ok) { setMsg({ kind: "ok", text: `Chave importada: ${r.hint}` }); void refreshStatus(); }
      else setMsg({ kind: "err", text: r.error ?? "falha na importação" });
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "erro" }); }
  };

  const storeKey = async () => {
    if (keyInput.trim().length < 20) return;
    try {
      const r = await api.storeKey(keyInput.trim());
      setMsg({ kind: "ok", text: `Chave armazenada: ${r.hint}` });
      setKeyInput("");
      void refreshStatus();
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "erro" }); }
  };

  const removeKey = async () => {
    await api.deleteKey().catch(() => undefined);
    setCred({ configured: false, hint: null });
    setMsg({ kind: "ok", text: "Credencial removida." });
    void refreshStatus();
  };

  const installGodot = async () => {
    setGodotBusy(true);
    setMsg({ kind: "ok", text: "Baixando Godot 4.3 oficial (~50MB)…" });
    try {
      const r = await api.installGodot();
      setMsg({ kind: r.ok ? "ok" : "err", text: r.note });
      void refreshStatus();
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "erro" }); }
    setGodotBusy(false);
  };

  const setMode = async (mode: string) => {
    setSettings((s) => ({ ...s, mode }));
    await api.setSettings({ mode }).catch(() => undefined);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5 slide-in">
      <h1 className="text-xl font-bold">Settings</h1>

      {msg && (
        <div className={`panel p-3 text-sm flex items-center gap-2 ${msg.kind === "ok" ? "border-good/40 text-good" : "border-bad/40 text-bad"}`}>
          {msg.kind === "ok" ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />} {msg.text}
        </div>
      )}

      {/* AI provider */}
      <section className="panel p-5">
        <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
          <Cpu size={15} className="text-nexus" /> AI PROVIDER — OPENROUTER
        </h2>
        <p className="text-[12px] text-mute mt-1.5 leading-relaxed">
          A chave é armazenada criptografada (AES-256-GCM, chave derivada da máquina) em
          ~/.nexusforge — nunca em texto plano, nunca no repositório. Sem chave, o Nexus roda em
          modo determinístico (templates reais, sem LLM).
        </p>
        <div className="mt-4 space-y-3">
          <div className={`tag ${cred.configured ? "border-good/40 text-good" : "border-warn/40 text-warn"}`}>
            {cred.configured ? `CONFIGURADA: ${cred.hint}` : "NÃO CONFIGURADA — MODO OFFLINE ATIVO"}
          </div>
          <div className="flex gap-2">
            <input className="input" type="password" placeholder="Cole a chave (sk-or-v1-…)" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
            <button className="btn btn-primary shrink-0" onClick={storeKey}><KeyRound size={14} /> Salvar</button>
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="…ou importe de um arquivo (ex.: ~/Key Openrouter Free)" value={pathInput} onChange={(e) => setPathInput(e.target.value)} />
            <button className="btn shrink-0" onClick={importFile}>Importar do arquivo</button>
          </div>
          {cred.configured && (
            <button className="btn text-bad border-bad/30" onClick={removeKey}><Trash2 size={14} /> Remover credencial</button>
          )}
        </div>
      </section>

      {/* Engine */}
      <section className="panel p-5">
        <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
          <Download size={15} className="text-cyan-live" /> ENGINE
        </h2>
        <p className="text-[12px] text-mute mt-1.5">
          O Nexus baixa o binário oficial do Godot 4.3 (GitHub Releases) para ~/.nexusforge/engines
          quando necessário — usado para gerar, validar e rodar os jogos localmente.
        </p>
        <button className="btn mt-3" onClick={installGodot} disabled={godotBusy}>
          <Download size={14} /> {godotBusy ? "Baixando…" : "Instalar / verificar Godot 4.3 agora"}
        </button>
      </section>

      {/* Forge mode */}
      <section className="panel p-5">
        <h2 className="text-sm font-bold tracking-wide mb-3">FORGE MODE</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["manual", "assisted", "autonomous"] as const).map((m) => (
            <button
              key={m}
              className={`btn justify-center ${settings.mode === m ? "btn-primary" : ""}`}
              onClick={() => void setMode(m)}
            >
              {m === "manual" ? "Manual" : m === "assisted" ? "Assisted" : "Autonomous"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-mute mt-2">
          Manual: nada roda sem você apertar o botão de cada estágio. Assisted (padrão): pipeline
          completo com eventos ao vivo. Autonomous: igual, com auto-install de engine ligado.
        </p>
      </section>
    </div>
  );
}
