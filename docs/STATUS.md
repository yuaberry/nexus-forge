# Nexus Forge — Status Real (MVP Fase 1)

> Regra da casa: nada de "Coming Soon" falso. Este documento distingue
> **verificado por teste**, **implementado sem teste** e **arquitetura pronta**.

## ✅ Verificado por teste (nesta máquina: Linux Mint 22, Bun 1.4.2)

- **Pipeline completo offline (sem LLM):** ideia → plano determinístico →
  Game DNA → GDD → arquitetura → scaffold Godot → task graph → validação
  headless → **playable**. Testado nos 3 starters (topdown, platformer, 3D).
- **Pipeline com LLM (OpenRouter + z-ai/glm-5.3-flash):** planejamento autoral
  em PT-BR (tasks específicas da ideia), codegen de sistemas GDScript novos
  (`day_night_cycle.gd`, `night_creature.gd`) com **validação PASS na 1ª
  rodada** e commit git por task.
- **Download oficial do Godot 4.3** (GitHub Releases → ~/.nexusforge/engines)
  e detecção de engine existente.
- **Servidor HTTP+WS** (127.0.0.1:5180): API REST completa + feed de eventos
  em tempo real + UI construída (React/Vite/Tailwind v4).
- **Importação de chave via arquivo ou colagem** (armazenada AES-256-GCM).
- **Typecheck estrito (tsc --noEmit)** do core e da UI: 0 erros.

## 🟡 Implementado, ainda não testado nesta máquina

- **Windows:** `scripts/start.bat`, download do Godot `win64.exe`,
  detecção em caminhos do Windows. Bun roda nativamente em Windows; o core
  usa apenas APIs multi-OS (`os.homedir`, `path.join`). NÃO executamos o
  teste aqui (máquina de dev é Linux). Reporte issues.
- **macOS:** `start.command`, download do binário `universal`,
  detecção em /Applications. Mesmo acima.
- **Unreal 5 scaffold:** gera .uproject/Source/Config corretos (texto
  puro); a **compilação** exige UE5 instalado e não foi executada aqui.

## 🟠 Limitações conhecidas (honestas)

- A validação headless compila **a cadeia main-scene + autoloads**. Scripts
  fora da cadeia (ainda não conectados) só são compilados quando conectados.
  (O `--check-only` do Godot não registra autoloads e produz falso-positivo —
  medido; por isso não é usado como gate.)
- Playtesting autônomo com métricas: **Fase 5** (hooks existem, loop não).
- Asset pipeline / geração de assets: **Fase 6** (tipos no schema, UI não).
- Unity adapter: **Fase 7** (interface pronta, implementação não).
- O deploy "app desktop empacotado" (Tauri) é Fase 2; hoje o studio roda
  como servidor local + browser — 100% funcional.

## Contratos de segurança mantidos

- Chaves: `~/.nexusforge/secrets.enc` (AES-256-GCM, scrypt, 0600). Repo limpo
  (verificado com grep — zero ocorrências de chaves).
- Servidor bindado em localhost; uploads limitados a 25MB.
- Paths dos agentes contidos ao workspace (fuga de path é exceção).
