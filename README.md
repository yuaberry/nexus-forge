<div align="center">


# ⚡ NEXUS FORGE

### AI Autonomous Game Development Studio

**Imagine. Direct. Build.**

Descreva um jogo. Agentes de IA planejam o design, escrevem a documentação,
geram o projeto na engine, programam os sistemas em GDScript — e o resultado
é **validado de verdade numa engine headless** antes de chegar até você.

</div>

---

## O que isto faz (comprovado, não prometido)

Você escreve:

> *"Um colony survival chamado NeoHaven, com construção, colonos com
> necessidades, agricultura, relações sociais, progressão tecnológica e
> mundo procedural."*

E o Nexus Forge executa, de ponta a ponta:

```
IDEIA → INTENT → GAME DNA → GDD → ARQUITETURA → SCAFFOLD GODOT
      → TASK GRAPH → AGENTES LLM (coder/qa/fixer) → VALIDAÇÃO HEADLESS
      → PROTÓTIIPO JOGÁVEL (commit a commit, auditável)
```

| Capacidade | Status |
|---|---|
| Planejamento por LLM (OpenRouter) com fallback determinístico | ✅ Funcional |
| Game DNA persistente com procedência (confirmado/inferido/duvidoso) | ✅ Funcional |
| GDD + arquitetura técnica gerados | ✅ Funcional |
| Scaffold real de projeto **Godot 4.3** (topdown · platformer · 3D) | ✅ Funcional |
| Codegen de sistemas + loop de correção (3 rodadas) com validação headless | ✅ Funcional |
| Scaffold real de projeto **Unreal 5** (C++ uproject/Source/Config) | ✅ Funcional (compilação requer UE5 instalado) |
| Auto-download oficial do Godot 4.3 | ✅ Linux x64 verificado · Win/macOS código pronto |
| Playtesting autônimo · Asset pipeline · Unity · Multiplayer | 🚧 Próximas fases (arquitetura pronta) |

## Quickstart

```bash
# 1) Requisito único: Bun — https://bun.sh
curl -fsSL https://bun.sh/install | bash

# 2) Clone e inicie (instala deps, compila a UI, baixa o Godot 4.3 se faltar)
git clone https://github.com/yuaberry/nexus-forge.git
cd nexus-forge
./scripts/start.sh          # Linux    (Windows: scripts\start.bat · macOS: ./scripts/start.command)

# 3) Abra o estúdio
# http://127.0.0.1:5180
```

Sem chave de API o Nexus roda em **modo determinístico** (templates reais de
jogos jogáveis). Com uma chave **OpenRouter** (importada em Settings →
armazenada cifrada em AES-256-GCM fora do repositório), os agentes LLM ganham
o comando: planejamento autoral, codegen de sistemas e loop de correção.

### CLI (headless / CI)

```bash
bun run packages/core/src/main.ts forge --idea "Seu jogo aqui" --name MeuJogo --2d
bun run packages/core/src/main.ts forge --resume <projectId>   # retomar após interrupção
bun run packages/core/src/main.ts detect                       # status das engines
```

## Arquitetura

```
nexus-forge/
├── apps/
│   ├── ui/                  # React 18 + Vite + Tailwind v4 (dark-first)
│   └── desktop/             # (fase 2) shell Tauri
├── packages/
│   ├── shared/              # contratos zod (UI ↔ core)
│   └── core/                # Bun runtime — TODO o estúdio
│       └── src/
│           ├── pipeline/    # forge: analyze→dna→gdd→arch→scaffold→tasks→buildout→validate
│           ├── orchestrator/# director (LLM JSON validado) + task graph + store
│           ├── agents/      # personas, runtime coder/qa/fixer com loop de validação
│           ├── providers/   # AIProvider + OpenRouter (timeout, retry, JSON repair)
│           ├── engines/     # GameEngineAdapter + Godot4 (full) + Unreal5 (scaffold)
│           │   └── templates/# starters 2D topdown · platformer · 3D (code-first scenes)
│           ├── dna/         # Game DNA versionado com proveniência
│           ├── knowledge/   # 20 arquétipos de gênero (RimWorld→Diablo→Genshin→Celeste…)
│           ├── workspace/   # sandbox de filesystem por projeto
│           ├── git/         # branch/commit por task
│           ├── db/          # SQLite real (WAL) — projetos, tasks, eventos, DNA
│           └── server.ts    # HTTP + WebSocket (localhost) + UI estática
├── scripts/                 # start.sh · start.bat · start.command
├── docs/                     # site de download (GitHub Pages) + STATUS.md
```

**Decisões de arquitetura que importam:**

- **Code-first scenes** — todo `.tscn` gerado é mínimo; visual e colisão nascem
  em GDScript. Cenas são a maior fonte de erro em geração de projetos Godot;
  assim cada artefato é validável de forma determinística.
- **Validação autoritária** — `godot --headless --path . --quit-after N` é o
  juiz de "funciona ou não". Nada de sucesso fingido: se o smoke-run reprova,
  a task bloqueia com o erro exato.
- **Zero segredos no repo** — a chave OpenRouter vive cifrada em
  `~/.nexusforge/secrets.enc` (AES-256-GCM, chave derivada por scrypt de um
  arquivo de máquina com permissão 0600).
- **Provider-agnóstico** — a interface `AIProvider` já isola OpenRouter;
  Ollama/OpenAI-compat entram sem tocar no pipeline.

## Base de conhecimento de gêneros

O Director planeja com **20 arquétipos destilados de ~120 jogos de referência**
(RimWorld, Dying Light, Hollow Knight, Celeste, Hades, Diablo, Genshin, ZZZ,
ETS2, R.E.P.O., Rucoy, Project Zomboid, Forza, Age of Empires…) — core loop,
pillars, sistemas-chave, MVP slice e armadilhas conhecidas. **Padrões abstratos
de design, nunca conteúdo protegido.**

## Segurança

- Sandbox de filesystem: agentes operam apenas dentro do workspace do projeto
  (travessia de path é rejeitada).
- Chaves API: nunca em código, nunca em plaintext, nunca em logs.
- Servidor local em `127.0.0.1` apenas.
- Comandos de engine invocados via CLI documentada — sem shell injection.

## Roadmap

- **Fase 1 — Foundation** ✅ *(atual)*
- **Fase 2** — Shell desktop Tauri + empacotamento por OS
- **Fase 3** — Autonomous coding ampliado (módulos multi-arquivo, refactors)
- **Fase 4** — Reference Intelligence (análise de imagens, Visual Bible)
- **Fase 5** — Autonomous QA (playtesting headless com métricas)
- **Fase 6** — Asset Intelligence (pipeline de importação/generação)
- **Fase 7** — Multi-engine (Unity + validação Unreal com engine instalada)

## Licença

MIT — © Yua Devs. O Godot Engine é © Godot Engine contributors (MIT).

Detalhes honestos do que está pronto e do que falta: [docs/STATUS.md](docs/STATUS.md)
