# PLAN.MD — NEXUS FORGE

> ⚡ **AI Autonomous Game Development Studio** — estúdio de desenvolvimento de jogos com IA: geração procedural de pixel-art, preview jogável real (Godot → WASM no site), Steam Publish Kit e templates profissionais.

- **Repo local:** `~/nexus-forge/` · **GitHub:** <https://github.com/yuaberry/nexus-forge>
- **Licença:** MIT · **Último commit:** 2026-09-25 (v0.4)

---

## 1. ARQUIVO DOS PROMPTS

> **Sem registro nesta máquina** — este projeto foi construído em sessões de outras ferramentas/assistentes, sem arquivamento dos prompts originais pelo agente que redige este arquivo. Para recompor: os commits abaixo carregam o escopo real de cada pedido. **Preencher abaixo ao retomar as sessões:**

```md
### [data] — sessão N
- prompt: «(cole aqui o pedido original)»
- resultado: (o que foi entregue)
```

## 2. CHATS DAS SESSÕES (cronologia real, extraída do git)

| Quando | Versão/commit | O que foi entregue |
|---|---|---|
| — | `3de82a3` | Site de download animado, README/LICENSE (MIT), STATUS honesto, launchers multi-OS |
| — | `13ff115` | Site movido para `docs/` (GitHub Pages) |
| — | `495a756` | **PRO GAME KIT**: templates pro (menu/pausa/SFX/save), Steam Publish Kit (copy via LLM + capsules/screenshots renderizados), builds standalone (.exe/.linux/.macos) dos jogos E do estúdio |
| — | `81415ab` | **LIVE PREVIEW**: ▶ Play real (export web do Godot → WASM servido na UI, pipeline assíncrono, auto-refresh pós-validação) |
| — | `c0e854a` | v0.2.1 — **jogo jogável no site** (demo WASM real), redesign top-tier, fix import-before-export |
| — | `acd32cf` | **SPRITE FORGE**: pixel-art procedural (PNG encoder próprio — big-endian/zlib/CRC corrigidos), sprites de IA com chroma-key e credit-ladder, galeria de assets na UI |
| 2026-09-25 | `01f7634` | **v0.4** — sprites ANIMADOS (walk/squash/pulse), fix `tex()` load-first (exports!), Steam Kit completo (21 arquivos: Steam Direct, press-release, IARC, legal, changelog), Game DNA como documento profissional |

## 3. AGENTES

- **Plataforma desta máquina:** OpenCode + configuração **Yua Devs** (`~/.config/opencode/AGENTS.md`).
- **Agentes disponíveis:** `architect` · `builder` · `game-dev` (natural para este projeto) · `reviewer` · `debugger` · `quick` — subagentes: `debugger`, `explore`, `general`, `reviewer`.
- **Histórico de atuação:** desconhecido para o agente que redige (sessões externas). Ao retomar: registrar aqui qual agente atuou e o que cada um entregou.

### Princípios da casa (Yua Devs — aplicáveis ao retomar)
1. Ler antes de alterar; causa raiz antes de consertar. 2. Zero dados falsos (o STATUS do projeto é honesto — manter assim). 3. Alterações pequenas, verificáveis, testadas. 4. Registrar erros próprios no arquivo. 5. Segredos nunca no repositório (varrer com `git log -p | grep -iE 'token|secret|key'` antes de publicar).

### Artefatos vivos
| Artefato | Onde |
|---|---|
| Código | `~/nexus-forge/` → GitHub (remoto configurado) |
| Site/download | `docs/` (GitHub Pages) |
| Docs de jogo | `docs/game-dna.md` (documento profissional Game DNA) |
| Builds | standalone do estúdio e dos jogos (.exe/.linux/.macos) |

_Rascunhado em 2026-09-26 pelo agente BUILDER (Yua Devs) — estrutura imposta pelo dono: Prompts · Chats das Sessões · Agentes._
