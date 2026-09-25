/**
 * Sprite Forge — real asset generation so games are products, not skeletons.
 *
 * Tier 1 (always available, offline): procedural pixel-art painters with a
 * palette derived from the project's DNA (cohesive art direction per game).
 * Tier 2 (when an image model is configured): AI-generated art per slot with
 * background chroma-key removal, saved straight into the slot the game reads.
 *
 * PNGs are encoded in pure TS (IHDR/IDAT/IEND + fflate deflate + CRC32) —
 * no native image libraries, deterministic everywhere.
 */
import { zlibSync } from "fflate";

// ── PNG encoder ──────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]!) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  // PNG chunk length and CRC are BIG-ENDIAN (measured: little-endian breaks
  // every decoder — "ERR_FILE_CORRUPT" in Godot).
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** RGBA (4 bytes/px) → PNG (truecolor+alpha). */
export function encodePNG(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const a = chunk("IHDR", ihdr);
  const b = chunk("IDAT", zlibSync(raw, { level: 6 }));
  const c = chunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + a.length + b.length + c.length);
  out.set(sig, 0); out.set(a, sig.length); out.set(b, sig.length + a.length); out.set(c, sig.length + a.length + b.length);
  return out;
}

// ── Pixel canvas + painters ──────────────────────────────────────────────────

type RGB = [number, number, number];

class Px {
  data: Uint8Array;
  constructor(public w: number, public h: number) { this.data = new Uint8Array(w * h * 4); }
  set(x: number, y: number, c: RGB, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }
  circle(cx: number, cy: number, r: number, c: RGB, a = 255) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.set(cx + x, cy + y, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 255) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  png(): Uint8Array { return encodePNG(this.w, this.h, this.data); }
}

/** Mirrors left half onto right half (classic pixel-art symmetry trick). */
function mirrorX(p: Px) {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < Math.floor(p.w / 2); x++) {
      const i = (y * p.w + (p.w - 1 - x)) * 4, j = (y * p.w + x) * 4;
      p.data[i] = p.data[j]!; p.data[i + 1] = p.data[j + 1]!; p.data[i + 2] = p.data[j + 2]!; p.data[i + 3] = p.data[j + 3]!;
    }
  }
}

function hexRGB(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(c: RGB, f: number): RGB {
  return [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))] as RGB;
}

export interface ForgePalette { accent: string; bg: string; fg?: string }

/** Hero character sprite (16x16, mirrored, outlined, shaded). */
export function paintHero(pal: ForgePalette, size = 16, frame = 0): Uint8Array {
  const p = new Px(size, size);
  const skin: RGB = [232, 190, 160];
  const body = hexRGB(pal.accent);
  const dark = shade(body, 0.45);
  const mid = shade(body, 0.75);
  const outline: RGB = [16, 18, 26];
  const cx = Math.floor(size / 2);
  // walk cycle: 4 phases — leg stride, body bob, arm swing
  const LEGS: Array<[number, number]> = [[0, 0], [1, -1], [0, 0], [-1, 1]];
  const [ldx, ldy] = LEGS[frame % 4]!;
  const bob = frame % 2 === 1 ? -1 : 0;

  p.rect(cx - 4 + ldx, size - 5, 2, 5 + ldy, dark);
  p.rect(cx + 2 - ldx, size - 5, 2, 5 - ldy, dark);
  p.rect(cx - 3, 8 + bob, 6, size - 12, body);
  p.rect(cx - 3, 8 + bob, 6, 1, shade(body, 1.2));
  p.rect(cx - 3, size - 5, 6, 1, mid);
  p.rect(cx - 5, 9 + bob - (ldx > 0 ? 1 : 0), 2, 4, mid);
  p.rect(cx + 3, 9 + bob + (ldx > 0 ? 1 : 0), 2, 4, mid);
  p.circle(cx, 5 + bob, 3, skin);
  p.rect(cx - 3, 2 + bob, 7, 1, shade(body, 1.25));
  p.rect(cx - 3, 3 + bob, 7, 1, body);
  p.set(cx - 1, 5 + bob, [20, 24, 36]);
  p.line(cx + 4, 6 + bob, cx + 6, 3 + bob, [180, 235, 255]);
  mirrorX(p);
  const snapshot = new Uint8Array(p.data);
  const has = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    return (snapshot[(y * size + x) * 4 + 3] ?? 0) > 0;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!has(x, y) && (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1))) p.set(x, y, outline, 255);
  }
  return p.png();
}

/** Creature sprite (imp: round body, horns, eyes). */
export function paintCreature(pal: ForgePalette, size = 16, frame = 0): Uint8Array {
  const p = new Px(size, size);
  const body: RGB = [180, 60, 72];
  const dark = shade(body, 0.55);
  const outline: RGB = [18, 12, 16];
  const cx = Math.floor(size / 2);
  // squash cycle: body rises/falls, eyes drift — feels alive
  const rise = [0, -1, 1][frame % 3] ?? 0;
  p.circle(cx, 9 + rise, 5, body);
  p.circle(cx, 11 + rise, 3, dark);
  p.line(cx - 4, 4 + rise, cx - 5, 1 + rise, [230, 220, 200]);
  p.line(cx + 4, 4 + rise, cx + 5, 1 + rise, [230, 220, 200]);
  p.set(cx - 2, 8 + rise, [255, 240, 90]);
  p.set(cx + 2, 8 + rise, [255, 240, 90]);
  p.rect(cx - 4, 13, 2, 2 - (rise > 0 ? 1 : 0), dark);
  p.rect(cx + 2, 13, 2, 2 - (rise > 0 ? 1 : 0), dark);
  mirrorX(p);
  const snapshot = new Uint8Array(p.data);
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && (snapshot[(y * size + x) * 4 + 3] ?? 0) > 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!has(x, y) && (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1))) p.set(x, y, outline);
  }
  return p.png();
}

/** Collectible shard (diamond gem with facets). */
export function paintShard(pal: ForgePalette, size = 12, frame = 0): Uint8Array {
  const p = new Px(size, size);
  const gem = hexRGB(pal.accent);
  const lite = shade(gem, 1.35);
  const dark = shade(gem, 0.5);
  const outline: RGB = [10, 14, 24];
  const cx = size / 2;
  const pulse = [1.0, 1.18, 1.0, 0.86][frame % 4] ?? 1.0;
  for (let y = 0; y < size - 2; y++) {
    let w = y < size / 2 ? (y * 2 + 1) : ((size - 2 - y) * 2 + 1);
    w = Math.max(1, Math.round(w * pulse));
    const x0 = Math.floor(cx - w / 2);
    p.rect(x0, y + 1, w, 1, y < size / 2 ? lite : gem);
    p.set(x0, y + 1, dark); p.set(x0 + w - 1, y + 1, dark);
  }
  // sparkle orbits the gem across frames
  const sp: Array<[number, number]> = [[Math.floor(cx) - 1, 3], [Math.floor(cx) + 2, 4], [Math.floor(cx), 8], [Math.floor(cx) - 3, 6]];
  const [sx, sy] = sp[frame % 4]!;
  p.set(sx, sy, [255, 255, 255], 235);
  const snapshot = new Uint8Array(p.data);
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && (snapshot[(y * size + x) * 4 + 3] ?? 0) > 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!has(x, y) && (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1))) p.set(x, y, outline);
  }
  return p.png();
}

/** Ground tile (32x32, speckled). */
export function paintGroundTile(pal: ForgePalette, size = 32): Uint8Array {
  const p = new Px(size, size);
  const base = shade(hexRGB(pal.bg), 1.6);
  p.rect(0, 0, size, size, base);
  const lite = shade(base, 1.14);
  const dark = shade(base, 0.82);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * size), y = Math.floor(rnd() * size);
    p.set(x, y, rnd() > 0.5 ? lite : dark);
  }
  for (let x = 0; x < size; x++) { p.set(x, 0, lite); p.set(x, size - 1, dark); }
  return p.png();
}

/** Wall tile (32x32, brick pattern). */
export function paintWallTile(pal: ForgePalette, size = 32): Uint8Array {
  const p = new Px(size, size);
  const base = shade(hexRGB(pal.bg), 2.1);
  const mortar = shade(hexRGB(pal.bg), 1.2);
  p.rect(0, 0, size, size, base);
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    p.rect(0, y + 7, size, 1, mortar);
    const off = row % 2 === 0 ? 0 : 8;
    for (let x = off; x < size; x += 16) p.rect(x === 0 ? 0 : x - 1, y, 1, 8, mortar);
  }
  p.rect(0, 0, size, 1, shade(base, 1.2));
  return p.png();
}

/** Sky backdrop (256x144 gradient + stars). */
export function paintSky(pal: ForgePalette, w = 256, h = 144): Uint8Array {
  const p = new Px(w, h);
  const top = shade(hexRGB(pal.bg), 1.05);
  const mid = shade(hexRGB(pal.bg), 0.7);
  const bot = shade(hexRGB(pal.accent), 0.28);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const c: RGB = t < 0.55
      ? [top[0] + (mid[0] - top[0]) * (t / 0.55), top[1] + (mid[1] - top[1]) * (t / 0.55), top[2] + (mid[2] - top[2]) * (t / 0.55)]
      : [mid[0] + (bot[0] - mid[0]) * ((t - 0.55) / 0.45), mid[1] + (bot[1] - mid[1]) * ((t - 0.55) / 0.45), mid[2] + (bot[2] - mid[2]) * ((t - 0.55) / 0.45)];
    p.rect(0, y, w, 1, [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
  }
  let seed = 777;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h * 0.6);
    p.set(x, y, [255, 255, 255], Math.round(90 + rnd() * 150));
  }
  return p.png();
}

/** Radial glow sprite (VFX/particles). */
export function paintGlow(pal: ForgePalette, size = 32, frame = 0): Uint8Array {
  const p = new Px(size, size);
  const c = hexRGB(pal.accent);
  const cx = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - cx + 0.5, y - cx + 0.5) / (size / 2);
    const beat = 1 + 0.12 * Math.sin((frame / 3) * Math.PI * 2);
    if (d < 1) p.set(x, y, c, Math.round(255 * Math.pow(Math.max(0, 1 - d * beat), 2.2)));
  }
  return p.png();
}

export const SPRITE_SLOTS = ["player", "enemy", "shard", "tile_ground", "tile_wall", "sky", "glow"] as const;
export type SpriteSlot = (typeof SPRITE_SLOTS)[number];

export const ANIM_SPECS: Array<{ base: string; frames: number }> = [
  { base: "player", frames: 4 },   // walk cycle
  { base: "enemy", frames: 3 },    // squash/hover
  { base: "shard", frames: 4 },    // pulse + sparkle
  { base: "glow", frames: 3 },     // beat pulse
];

export function forgeDefaultSprites(pal: ForgePalette): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {
    "assets/sprites/tile_ground.png": paintGroundTile(pal),
    "assets/sprites/tile_wall.png": paintWallTile(pal),
    "assets/sprites/sky.png": paintSky(pal),
  };
  for (const { base, frames } of ANIM_SPECS) {
    for (let f = 0; f < frames; f++) {
      const bytes =
        base === "player" ? paintHero(pal, 16, f)
        : base === "enemy" ? paintCreature(pal, 16, f)
        : base === "shard" ? paintShard(pal, 12, f)
        : paintGlow(pal, 32, f);
      out[`assets/sprites/${base}_${f}.png`] = bytes;
    }
  }
  // legacy single-frame files (older scripts reference these)
  out["assets/sprites/player.png"] = paintHero(pal);
  out["assets/sprites/enemy.png"] = paintCreature(pal);
  out["assets/sprites/shard.png"] = paintShard(pal);
  out["assets/sprites/glow.png"] = paintGlow(pal);
  return out;
}

/** Prompt per slot for Tier-2 AI generation. */
export function slotPrompt(slot: SpriteSlot, gameTitle: string, idea: string): string {
  const base = `Pixel art game asset for the game "${gameTitle}" (${idea.slice(0, 120)}). Dark indie palette, crisp pixels, clean silhouette, single object centered, plain solid magenta background (#FF00FF) for chroma keying, no text, no watermark.`;
  switch (slot) {
    case "player": return `${base} A small hero adventurer character from a 3/4 top-down view, standing pose, holding a glowing weapon.`;
    case "enemy": return `${base} A menacing small monster creature from a 3/4 top-down view, ready to attack.`;
    case "shard": return `${base} A glowing crystal shard collectible, radiant gemstone.`;
    case "tile_ground": return `${base} A seamless dark stone ground tile texture, top-down.`;
    case "tile_wall": return `${base} A seamless dark stone brick wall tile texture, top-down.`;
    case "sky": return `${base} A moody 2D game sky backdrop with stars, dark gradient, wide landscape.`;
    case "glow": return `${base} A soft radial magic glow sprite, centered.`;
  }
}
