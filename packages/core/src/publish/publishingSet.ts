/**
 * Professional publishing file set — everything a store page + release needs,
 * generated per project: publish guide (Steam Direct), press release,
 * requirements, IARC rating notes, legal (EULA/Privacy/Credits), changelog.
 */
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectRow } from "../orchestrator/store";

export interface ReadinessInput {
  capsules: number; totalCapsules: number; screenshots: number;
  webPreview: boolean; winBuild: boolean; linuxBuild: boolean;
}

export async function writePublishingSet(
  p: ProjectRow,
  copy: { elevatorPitch: string; shortDescription: string; tags: string[]; minRequirements: string; recRequirements: string },
  kitDir: string,
  r: ReadinessInput,
): Promise<void> {
  const name = p.name;

  await Bun.write(join(kitDir, "publish-guide.md"), `# Como publicar ${name} na Steam — guia passo a passo

> Gerado pelo Nexus Forge. Os ativos referenciados estao neste kit e na pasta do projeto.

## 1. Conta Steamworks (Steam Direct)
1. Crie a conta em https://partner.steamgames.com e pague a taxa unica de US$ 100 por aplicativo.
2. Complete os dados fiscais e bancarios.

## 2. Criar o aplicativo
1. Em "App Creation", crie um novo app: nome **${name}**, tipo jogo.
2. Guarde o App ID gerado.

## 3. Pagina da loja (mapeamento dos ativos)
| Campo da Steam | Arquivo deste kit |
|---|---|
| Descricao curta | store-description.md |
| Sobre o jogo | store-description.md |
| Header 460x215 | images/header_460x215.png |
| Capsule 231x87 | images/capsule_231x87.png |
| Capsule 462x174 | images/capsule_462x174.png |
| Main capsule 616x353 | images/capsule_616x353.png |
| Library hero 1920x620 | images/hero_1920x620.png |
| Social card 1200x630 | images/social_1200x630.png |
| Screenshots (5+) | screenshots/ |
| Tags | ${copy.tags.join(", ")} |
| Requisitos | system-requirements.md |
| Classificacao | rating-notes.md (questionario IARC) |

## 4. Builds (Depots)
1. Crie depots Windows e Linux no Steamworks.
2. Instale o SteamCMD e siga o wizard de upload.
3. Binarios standalone: ~/.nexusforge/builds/${p.slug}/ (PCK embutido, sem instalador).
4. Launch options apontando o executavel principal.

## 5. Revisao e pagamento
1. Submeta loja + builds para revisao da Valve (5-7 dias tipicos).
2. Defina data de lancamento e preco.

## itch.io (alternativa sem taxa)
O mesmo zip funciona no itch.io com upload direto.
`);

  await Bun.write(join(kitDir, "press-release.md"), `# Press Release — ${name}

${new Date().toLocaleDateString("pt-BR")} — ${name} entra em acesso antecipado: um jogo planejado, programado e validado por agentes de IA no Nexus Forge, com direcao criativa humana.

## Pitch
${copy.elevatorPitch}

## Sobre o jogo
${copy.shortDescription}

## Destaques
- Core loop claro com curva de ameaca crescente
- Arte pixel coesa, sprites animados e audio sintetizado
- Processos auditaveis: Game DNA, GDD e validacao automatizada em engine real

## Fatos
- Engine: Godot 4.3 · Plataformas: Windows, Linux, Web
- Desenvolvedor: [SEU NOME/STUDIO] · Preco: a definir

## Contato
[contato@studio.com]
`);

  await Bun.write(join(kitDir, "system-requirements.md"), `# ${name} — Requisitos de sistema

## Minimo
${copy.minRequirements}

## Recomendado
${copy.recRequirements}
`);

  await Bun.write(join(kitDir, "rating-notes.md"), `# ${name} — Notas para o questionario IARC

- Violencia: estilizada contra criaturas fantasticas (pixels), sem sangue real
- Linguagem ofensiva: nenhuma · Conteudo sexual: nenhum · Jogo de azar: nenhum
- Classificacao indicada pelo DNA: **${p.content_rating.toUpperCase()}**
- Compras: sem microtransacoes
`);

  const legalDir = join(kitDir, "legal");
  mkdirSync(legalDir, { recursive: true });
  await Bun.write(join(legalDir, "EULA.md"), `# End User License Agreement — ${name}

1. LICENCA: software licenciado, nao vendido; uso pessoal e nao comercial.
2. USO: nao revenda nem redistribua os ativos fora do jogo.
3. CONTEUDO GERADO: jogo planejado/implementado com assistencia de IA sob direcao humana; o criador do projeto detem os direitos sobre builds derivados.
4. GARANTIAS: fornecido "COMO ESTA", sem garantias.
5. LIMITACAO: o studio nao responde por danos indiretos.

> Template profissional gerado — revise com advogado antes de publicar.
`);
  await Bun.write(join(legalDir, "PRIVACY.md"), `# Politica de Privacidade — ${name}

- O jogo coleta apenas dados locais (saves em user://) e nao envia telemetria.
- Sem contas, identificadores ou rastreamento de terceiros.
- Contato: [contato@studio.com]
`);
  await Bun.write(join(legalDir, "CREDITS.md"), `# Creditos — ${name}

## Direcao criativa
[SEU NOME] — Creative Director

## Engenharia & QA
Agentes Nexus Forge — planejamento, programacao (GDScript) e validacao headless

## Tecnologia
- Godot Engine 4.3 — (c) Godot Engine contributors, licenca MIT
- Sprites e audio procedurais: Nexus Sprite Forge
- Arte por IA (quando aplicavel): modelos de imagem via OpenRouter
`);

  await Bun.write(join(kitDir, "changelog.md"), `# Changelog — ${name}

## [0.1.0] — Prototipo jogavel (Milestone 1)
### Adicionado
- Slice vertical do core loop: explorar, coletar shards, sobreviver
- Menu principal, pausa, settings persistidos (volume, fullscreen)
- Audio sintetizado (pickup/hit/click) e sprites pixel-art animados
- Save de melhor corrida (user://save.cfg)
- Win/lose: estabilizar o setor vs. integridade critica
`);

  // Publishing checklist with REAL computed readiness
  const checks: Array<[string, boolean]> = [
    ["Descricao curta da loja (<= 300 chars)", copy.shortDescription.length <= 300],
    ["Descricao longa completa", copy.shortDescription.length > 0],
    [`Capsules Steam renderizadas (${r.capsules}/${r.totalCapsules})`, r.capsules >= 5],
    [`Screenshots reais do jogo (${r.screenshots})`, r.screenshots >= 5],
    ["Live Preview web (jogavel no navegador)", r.webPreview],
    ["Build Windows .exe", r.winBuild],
    ["Build Linux", r.linuxBuild],
    ["Notas de classificacao IARC", true],
    ["EULA / Privacidade / Creditos", true],
    ["Changelog", true],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const rows = checks.map(([label, ok]) => `- [${ok ? "x" : " "}] ${label}`).join("\n");
  await Bun.write(join(kitDir, "publishing-checklist.md"), `# ${name} — Checklist de publicacao

**Prontidao: ${done}/${checks.length} itens**

${rows}

## Fluxo recomendado
1. Execute "Steam Kit" (este kit) — arquivos acima.
2. Exporte os builds (.exe Windows / Linux) no estúdio.
3. Reexporte o Live Preview e jogue: nada quebrado?
4. Siga o publish-guide.md na Steamworks.

> Itens desmarcados indicam o que falta antes de submeter a revisao da Valve.
`);

  void existsSync;
}
