/**
 * Genre archetype knowledge base.
 *
 * Distilled from the user's reference list (RimWorld, Dying Light, Spider-Man 2,
 * Hogwarts Legacy, Genshin, ZZZ, Hollow Knight, Celeste, Hades, Diablo, ETS2,
 * R.E.P.O., Rucoy, and ~110 others). These are ABSTRACT design patterns —
 * core loops, system decompositions, MVP slices and known pitfalls.
 * They contain NO copyrighted content, assets or code: patterns only.
 * The Director injects relevant archetypes to ground planning; templates
 * use them to drive deterministic (offline) project generation.
 */

export interface GenreArchetype {
  id: string;
  label: string;
  examples: string[];
  dimension: "2d" | "3d" | "2.5d";
  coreLoop: string;
  pillars: string[];
  keySystems: string[];
  mvpSlice: string[];
  pitfalls: string[];
  engineFit: { godot4: number; unreal5: number }; // 0..1 suitability
}

export const GENRE_ARCHETYPES: GenreArchetype[] = [
  {
    id: "colony-survival",
    label: "Colony Survival / City Builder",
    examples: ["RimWorld", "Farthest Frontier", "Necesse", "Oxygen Not Included", "NeoHaven-style"],
    dimension: "2.5d",
    coreLoop: "Land settlers -> gather resources -> build shelter -> satisfy needs (food/sleep/safety) -> assign jobs -> survive threats (weather/raids) -> grow population -> research tech -> expand territory.",
    pillars: ["Emergent story from simulation", "Needs & mood systems", "Base building as expression", "Escalating threat curve"],
    keySystems: ["colonist needs (hunger/sleep/joy)", "job assignment & priorities", "construction grid", "resource stockpiles", "food & farming", "raids/events", "research tree", "seasons & weather", "pathfinding", "save/load"],
    mvpSlice: ["tile-based world", "place walls/beds/farm plots", "3 colonists with needs draining", "harvest wood/berries", "day/night cycle", "one threat event", "win/lose conditions"],
    pitfalls: ["pathfinding bugs in closed doors", "needs starvation spirals (hard fun-killer)", "save corruption", "UI overload before depth"],
    engineFit: { godot4: 0.9, unreal5: 0.55 },
  },
  {
    id: "survival-craft",
    label: "Survival & Crafting",
    examples: ["Rust", "DayZ", "Project Zomboid", "7 Days to Die", "Don't Starve", "Sons of the Forest", "Raft", "Palworld"],
    dimension: "3d",
    coreLoop: "Spawn with nothing -> scavenge -> craft tools -> build shelter -> manage hunger/thirst/temperature -> fight or flee fauna/enemies -> tech up -> secure a home.",
    pillars: ["Scarcity pressure", "Meaningful crafting tree", "Territory & safety", "Risk gradient day vs night"],
    keySystems: ["vitals (hunger/thirst/warmth)", "item crafting recipes", "resource nodes & respawn", "durability", "enemy AI aggression states", "base building (snap grids)", "inventory & hotbar", "day/night", "map generation"],
    mvpSlice: ["island/terrain", "punch trees / pick stones", "campfire + cooked food", "hunger + health", "one hostile at night", "crafting menu", "backpack"],
    pitfalls: ["inventory UX death", "empty-world syndrome", "grind without goals", "multiplayer sync (defer MP)"],
    engineFit: { godot4: 0.75, unreal5: 0.9 },
  },
  {
    id: "open-world-action",
    label: "Open-World Action Adventure",
    examples: ["Spider-Man 2", "Hogwarts Legacy", "Batman Arkham Knight", "Ghost of Tsushima", "God of War", "RDR2", "Horizon", "Far Cry", "Days Gone", "Assassin's Creed series", "Where Winds Meet", "Crimson Desert"],
    dimension: "3d",
    coreLoop: "Explore district -> find activity (camp/collection/mystery) -> combat or stealth encounter -> rewards (gear/XP/lore) -> traversal to next landmark -> story beats unlock regions.",
    pillars: ["Traversal is fun", "Readable combat with depth", "Landmark-driven exploration", "Power fantasy growth"],
    keySystems: ["third-person controller (camera, lock-on)", "melee/ranged combat (hitboxes, combos, dodge)", "enemy AI (squad behaviors, aggro)", "quest system (main/side)", "open-world streaming (chunks)", "loot & upgrades", "dialogue/cinematics", "map & fast travel", "minimap/waypoints"],
    mvpSlice: ["1 km2 island", "third-person movement (run/jump/climb)", "1 weapon light+heavy+dash", "3 enemy types with basic AI", "1 quest chain", "XP + level ups", "day cycle"],
    pitfalls: ["empty open world", "camera fighting the player", "quest flag state hell", "scope explosion - prototype ONE loop first"],
    engineFit: { godot4: 0.6, unreal5: 1.0 },
  },
  {
    id: "soulslike",
    label: "Souls-like Action RPG",
    examples: ["Dark Souls", "Lies of P", "Remnant 2", "Blasphemous (2D take)", "Hades (roguelite take)"],
    dimension: "3d",
    coreLoop: "Enter zone -> learn enemy patterns -> collect souls -> die -> respawn at bonfire -> spend souls -> push deeper -> unlock shortcut -> boss -> repeat.",
    pillars: ["Punishing but fair", "Bonfire checkpoint economy", "Bosses as exams", "Atmosphere over exposition"],
    keySystems: ["stamina combat (light/heavy/dodge/parry)", "poise & stagger", "bonfire checkpoints", "soul currency + level-up stats", "weapon movesets", "boss patterns/phases", "shortcut world design", "invaders/summons (defer MP)"],
    mvpSlice: ["3 interconnected rooms", "stamina system", "light/heavy/dodge", "2 enemy types with telegraphs", "1 bonfire", "1 boss with 2 phases", "souls + stats"],
    pitfalls: ["unfair hitboxes destroy trust", "input buffering issues", "boss too complex for MVP"],
    engineFit: { godot4: 0.7, unreal5: 1.0 },
  },
  {
    id: "metroidvania",
    label: "Metroidvania",
    examples: ["Hollow Knight", "Rain World", "Dead Cells (roguelite hybrid)", "Blasphemous"],
    dimension: "2d",
    coreLoop: "Explore interconnected map -> hit ability wall -> backtrack with new ability -> unlock region -> find boss/gateway -> repeat.",
    pillars: ["Interconnected map with shortcuts", "Ability-gated progression", "Atmospheric solitude", "Tight combat & movement"],
    keySystems: ["room-based level map", "ability unlocks (double-jump/dash/wall-climb)", "map & cartographer", "bench checkpoints", "enemy bestiary", "charm/relic builds", "secret walls"],
    mvpSlice: ["12-room handcrafted map", "tight platformer controller", "1 melee attack + dash unlock", "2 enemies", "1 mini-boss", "bench save", "map screen"],
    pitfalls: ["ability gating unclear", "backtracking without fast-travel tedium", "floaty controls"],
    engineFit: { godot4: 1.0, unreal5: 0.3 },
  },
  {
    id: "precision-platformer",
    label: "Precision Platformer",
    examples: ["Celeste", "Cuphead (run-and-gun hybrid)", "Super Meat Boy lineage"],
    dimension: "2d",
    coreLoop: "Attempt screen -> die -> learn spacing -> clear -> chase strawberries/B-sides -> assist options widen audience.",
    pillars: ["Pixel-perfect controls", "Death is cheap & instant restart", "Screen-sized challenges", "Assist accessibility"],
    keySystems: ["coyote time + jump buffering", "dash/wall mechanics", "screen restart < 0.5s", "collectibles", "chapter select", "assist mode", "leaderboards"],
    mvpSlice: ["30-tile physics (coyote/buffer)", "walk/jump/dash/climb", "spikes + moving platforms", "3 chapters x 6 screens", "deaths counter", "instant respawn"],
    pitfalls: ["input latency kills it", "unclear hazards", "frustration without assist"],
    engineFit: { godot4: 1.0, unreal5: 0.1 },
  },
  {
    id: "cozy-life-sim",
    label: "Cozy Life/Farm Sim",
    examples: ["Stardew Valley", "Graveyard Keeper", "Dave the Diver", "Moonlighter", "Sky: Children of the Light"],
    dimension: "2d",
    coreLoop: "Daily routine (farm/dive/shop) -> seasonal cycles -> relationships & town events -> economic upgrades -> cozy expansion.",
    pillars: ["Ritual & routine comfort", "Seasonal content variety", "Relationship warmth", "No-fail pacing"],
    keySystems: ["clock & seasons", "crop growth & watering", "tool stamina", "NPC schedules & gifts", "friendship events", "shop economy", "crafting", "fishing/minigames"],
    mvpSlice: ["64x64 farm", "4 crops & seasons", "day clock + sleep", "1 NPC with gifts", "shipping bin economy", "watering can", "energy bar"],
    pitfalls: ["energy punishing too early", "content gates by season blocking", "inventory friction"],
    engineFit: { godot4: 1.0, unreal5: 0.25 },
  },
  {
    id: "anime-action",
    label: "Anime Action RPG (Gacha-style)",
    examples: ["Genshin Impact", "Zenless Zone Zero", "Wuthering Waves lineage"],
    dimension: "3d",
    coreLoop: "Team of 3 swap combos -> elemental reactions -> open-world puzzles -> character gacha -> ascend gear -> abyss/rogue events.",
    pillars: ["Swappable team combat", "Elemental reaction depth", "Anime polish & style", "Session-based events"],
    keySystems: ["3-character swap combat", "elemental reaction matrix", "stamina (sprint/glide)", "open-world puzzles", "wish/gacha economy", "artifact/relic stats", "event scheduling", "co-op"],
    mvpSlice: ["1 arena + 3 playable heroes", "swap combo + 1 elemental reaction", "light attack chain", "1 boss", "wish screen (with local currency)"],
    pitfalls: ["balancing gacha vs fairness", "element matrix combinatorial bugs", "style ceiling high without VFX budget"],
    engineFit: { godot4: 0.65, unreal5: 0.95 },
  },
  {
    id: "arpg-loot",
    label: "Action RPG / Loot Grinder",
    examples: ["Diablo series", "Last Epoch", "Hades", "Minecraft Dungeons", "Hero Siege", "Cult of the Lamb (colony hybrid)"],
    dimension: "2.5d",
    coreLoop: "Clear zone -> loot drops -> build crafting (skills/gear) -> tougher zone -> boss -> ascend tiers.",
    pillars: ["Loot dopamine", "Build expression", "Readable power curve", "Endgame loop"],
    keySystems: ["affix/rarity itemization", "skill tree", "procedural zones", "elites & bosses", "stash & inventory", "difficulty tiers", "status effects", "gold economy"],
    mvpSlice: ["1 procedural dungeon floor", "4 skills", "rarity loot with 2 affixes", "1 boss", "town hub with stash/merchant", "harder NG+ tier"],
    pitfalls: ["drop rates economic suicide", "skill synergies OP on day 1", "inventory full 24/7"],
    engineFit: { godot4: 0.9, unreal5: 0.7 },
  },
  {
    id: "fps-multiplayer",
    label: "FPS / Military Multiplayer",
    examples: ["COD: Warzone", "Battlefield 2042", "Hell Let Loose", "World War Z (co-op)", "Dead Island", "Dying Light (parkour hybrid)"],
    dimension: "3d",
    coreLoop: "Squad up -> objective/zombies -> gunplay rounds -> unlocks -> next round.",
    pillars: ["Gunfeel first", "Objective design", "Squad interdependence", "Netcode fairness"],
    keySystems: ["hitscan/projectile shooting", "recoil & TTK", "loadouts", "objective modes", "netcode (rollback/anticheat later)", "AI hordes", "scoreboard"],
    mvpSlice: ["1 arena map", "1 rifle full recoil curve", "aim & hit markers", "target dummies + 1 bot", "deathmatch score", "killfeed"],
    pitfalls: ["netcode underestimated", "TTK tuning rage", "MVP: build gunfeel sandbox first"],
    engineFit: { godot4: 0.6, unreal5: 1.0 },
  },
  {
    id: "session-horror",
    label: "Co-op Session Horror",
    examples: ["R.E.P.O.", "Hellmart", "Escape the Backrooms", "Lethal Company lineage", "Miside", "Backrooms"],
    dimension: "3d",
    coreLoop: "Drop into run-down zone -> scavenge quota loot -> physics-y co-op chaos -> entity hunts you -> extract or die -> sell -> buy gear -> scarier zone.",
    pillars: ["Physics co-op comedy", "Dread escalation", "Quota economy", "Proximity voice moments"],
    keySystems: ["physics grab & carry", "procedural level tiles", "monster AI with senses", "quota & shop", "proximity audio", "extraction", "permadeath per run"],
    mvpSlice: ["1 tiled level", "physics pickup & drop", "1 monster (patrol -> chase)", "quota of 6 items", "shop between rounds", "2-player local co-op"],
    pitfalls: ["monster AI stuck", "physics jank funny once then annoying", "netcode for physics"],
    engineFit: { godot4: 0.75, unreal5: 0.85 },
  },
  {
    id: "psychological-horror",
    label: "Atmospheric / Psychological Horror",
    examples: ["Silent Hill F", "Mimesis", "Detroit: Become Human (narrative)", "Stray (atmosphere adventure)"],
    dimension: "3d",
    coreLoop: "Explore unsettling space -> environmental storytelling -> chase/hide setpieces -> narrative branches -> endings.",
    pillars: ["Dread over jump scares", "Sound design leads", "Narrative weight", "Safe rooms contrast"],
    keySystems: ["tension director (audio/creature staging)", "hide & seek AI", "dialogue/branch states", "puzzle scenes", "endings tracker"],
    mvpSlice: ["1 apartment block", "flashlight + notes", "1 stalking entity", "2 puzzles", "3 endings from choices", "ambient audio bed"],
    pitfalls: ["repeated deaths kill fear", "over-dark unreadable scenes", "branch logic bugs"],
    engineFit: { godot4: 0.7, unreal5: 0.9 },
  },
  {
    id: "rts",
    label: "Real-Time Strategy",
    examples: ["Age of Empires", "Age of Mythology"],
    dimension: "2.5d",
    coreLoop: "Gather -> build base -> tech up -> army production -> map control -> decisive battle.",
    pillars: ["Economic decisions under pressure", "Counter-unit depth", "Map vision warfare", "Macro/micro balance"],
    keySystems: ["resource gatherers", "production queues", "unit counters & fog of war", "formation & control groups", "tech ages", "AI opponent (scripted then search)"],
    mvpSlice: ["1 map", "3 resource nodes", "5 units + 3 buildings", "drag-select + commands", "1 scripted enemy wave", "win by destroying HQ"],
    pitfalls: ["pathfinding traffic jams", "AI cheating accusations", "UI click overload"],
    engineFit: { godot4: 0.8, unreal5: 0.5 },
  },
  {
    id: "racing-sim",
    label: "Racing / Driving",
    examples: ["Forza Horizon", "Need for Speed (Unbound)", "Euro Truck Simulator 2", "American Truck Simulator", "Rocket League (sport hybrid)"],
    dimension: "3d",
    coreLoop: "Pick route/car -> drive loop -> earn currency -> upgrade/tune -> harder events -> livery expression.",
    pillars: ["Handling feel", "Route variety", "Progression garage", "Sound of speed"],
    keySystems: ["vehicle physics (suspension/grip)", "AI traffic/racers", "event & race modes", "career progression", "livery editor", "cops/patrol (NFS)", "cargo & trailer physics (truck sim)"],
    mvpSlice: ["1 circuit + 1 car", "arcade handling model", "3 AI racers on spline", "lap timing", "1 upgrade (tires)"],
    pitfalls: ["physics jello cars", "AI rubber-banding rage", "track collision seams"],
    engineFit: { godot4: 0.7, unreal5: 0.95 },
  },
  {
    id: "physics-coop",
    label: "Physics Party / Puzzle",
    examples: ["Poly Bridge", "Golf With Your Friends", "Party Machine", "Fall Guys lineage"],
    dimension: "3d",
    coreLoop: "Present puzzle/course -> attempt with physics -> fail hilariously -> retry -> next round with friends.",
    pillars: ["Emergent comedy", "Readable physics", "Quick rounds", "Spectatorability"],
    keySystems: ["rigidbody physics", "constraints (rope/bridge)", "win conditions & courses", "local co-op hotseat", "level editor (later)", "turn timers"],
    mvpSlice: ["3 bridge puzzles", "stress simulation", "budget system", "pass/fail with collapse", "replay ghost"],
    pitfalls: ["physics determinism across machines", "difficulty wall", "content throughput"],
    engineFit: { godot4: 0.8, unreal5: 0.7 },
  },
  {
    id: "pixel-mmorpg",
    label: "2D Pixel MMORPG (Mobile)",
    examples: ["Rucoy Online", "Tibia-likes", "Old-school mobile MMOs"],
    dimension: "2d",
    coreLoop: "Grind mobs -> loot & levels -> party dungeons -> PvP zones -> trade economy -> guild wars.",
    pillars: ["Grind with payoff", "Social pressure/alliances", "Economy as endgame", "Low-end device reach"],
    keySystems: ["tile movement & combat", "XP/skill progression", "loot & trading", "chat & parties", "guild system", "server persistence", "mobile touch UI"],
    mvpSlice: ["1 overworld map", "melee combat", "5 monsters with respawns", "inventory & equipment", "local chat", "save persistence"],
    pitfalls: ["server architecture early", "economy dupes/exploits", "content treadmill"],
    engineFit: { godot4: 0.9, unreal5: 0.2 },
  },
  {
    id: "jrpg-narrative",
    label: "Turn-based / Narrative RPG",
    examples: ["Clair Obscur: Expedition 33", "Sea of Stars", "Baldur's Gate 3", "Detroit: Become Human"],
    dimension: "3d",
    coreLoop: "Story beat -> party management -> tactical turn combat -> explore -> next narrative act.",
    pillars: ["Combat as puzzle", "Party synergy depth", "Story choices matter", "Rhythm & timing flair"],
    keySystems: ["turn order & action economy", "elements/status matrix", "party builds", "branching narrative states", "exploration encounters", "save slots"],
    mvpSlice: ["3 characters with 3 skills", "turn battle vs 3 enemy types", "weakness system", "2 story choices with outcomes", "1 boss"],
    pitfalls: ["choice consequences unsatisfying", "combat pacing drag", "null builds"],
    engineFit: { godot4: 0.8, unreal5: 0.8 },
  },
  {
    id: "zombie-openworld",
    label: "Zombie Parkour Open-World (Dying Light-style)",
    examples: ["Dying Light 1 & 2", "Dead Island", "World War Z"],
    dimension: "3d",
    coreLoop: "Day: scavenge & quests -> night: hunter becomes hunted -> parkour escape/combat -> safe house -> skill trees -> territory",
    pillars: ["Parkour flow", "Day/night risk inversion", "Melee brutality", "Progression hooks"],
    keySystems: ["parkour movement (climb/vault/grapple)", "melee weapons & durability", "night volatility/volatiles", "safe zones & sleep", "quests & reputation", "co-op drop-in (later)"],
    mvpSlice: ["1 district rooftops", "parkour moves", "1 melee weapon tree", "day/night with faster night zombies", "1 safehouse quest", "skill XP"],
    pitfalls: ["parkour getting stuck on geometry", "night too punishing early", "combat vs flow balance"],
    engineFit: { godot4: 0.55, unreal5: 1.0 },
  },
  {
    id: "sandbox-voxel",
    label: "Voxel / Sandbox Adventure",
    examples: ["Minecraft-likes", "Necesse", "Minecraft Dungeons (dungeon-crawler take)"],
    dimension: "3d",
    coreLoop: "Punch world -> craft -> build home -> explore caves -> gear up -> boss dimension -> automation.",
    pillars: ["World is the toybox", "Crafting discovery", "Building pride", "Danger at depth"],
    keySystems: ["voxel chunk meshing", "block place/break", "crafting grids", "mobs & spawning rules", "cave/ore generation", "hunger & health", "day cycle"],
    mvpSlice: ["chunked voxel terrain", "break/place 6 block types", "craft table + 5 recipes", "2 mobs", "ore at depth", "save/load"],
    pitfalls: ["chunk meshing perf", "greedy meshing premature", "inventory UX"],
    engineFit: { godot4: 0.8, unreal5: 0.6 },
  },
  {
    id: "sports-arcade",
    label: "Sports / Arcade Competition",
    examples: ["eFootball", "Rocket League", "Golf With Your Friends"],
    dimension: "3d",
    coreLoop: "Match -> performance -> ranking/coins -> team building -> next match.",
    pillars: ["Match pacing", "Skill expression", "Fairness & anti-cheat", "Live-team content cadence"],
    keySystems: ["match rules & referee", "player/vehicle physics", "AI opponents difficulty bands", "ranking & matchmaking (later)", "team/collection meta", "replays"],
    mvpSlice: ["1 arena, 1v1 local", "core physics & scoring", "3-min matches", "1 AI difficulty", "scoreboard"],
    pitfalls: ["online infra scope", "meta exploits", "licensing (use fictional teams)"],
    engineFit: { godot4: 0.7, unreal5: 0.85 },
  },
];

/** Keyword matcher: maps a free-form idea to the most relevant archetypes. */
export function matchArchetypes(text: string, limit = 3): GenreArchetype[] {
  const t = text.toLowerCase();
  const scored = GENRE_ARCHETYPES.map((a) => {
    let score = 0;
    for (const ex of a.examples) {
      const e = ex.toLowerCase().split(/[\s-]/)[0] ?? "";
      if (e.length > 3 && t.includes(e)) score += 3;
    }
    for (const s of a.keySystems) {
      const frag = s.toLowerCase().split(/[\s(/]/)[0] ?? "";
      if (frag.length > 4 && t.includes(frag)) score += 1;
    }
    if (t.includes(a.label.toLowerCase().split("/")[0]!.trim())) score += 4;
    return { a, score };
  });
  return scored.filter((s) => s.score > 0).sort((x, y) => y.score - x.score).slice(0, limit).map((s) => s.a);
}

export function archetypeContext(archetypes: GenreArchetype[]): string {
  return archetypes
    .map((a) =>
      `## ${a.label} (examples: ${a.examples.slice(0, 4).join(", ")})
Core loop: ${a.coreLoop}
Pillars: ${a.pillars.join(" | ")}
Key systems: ${a.keySystems.join(", ")}
MVP slice: ${a.mvpSlice.join(" -> ")}
Pitfalls to avoid: ${a.pitfalls.join("; ")}`
    )
    .join("\n\n");
}
