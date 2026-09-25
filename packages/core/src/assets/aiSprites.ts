/**
 * AI Sprite generation (Tier 2) — real image models via OpenRouter.
 * Generated art gets a magenta chroma-key pass (prompt asks for #FF00FF bg)
 * then is written straight into the slot the game reads — instant reskin.
 */
import { unzlibSync } from "fflate";
import { getCredential, getSetting } from "../settings";
import { encodePNG } from "./spriteForge";
import { slotPrompt, type SpriteSlot } from "./spriteForge";

const API = "https://openrouter.ai/api/v1/chat/completions";

// ── minimal PNG decode (truecolor/RGBA) for the chroma-key pass ──────────────

function decodePNG(bytes: Uint8Array): { w: number; h: number; rgba: Uint8Array } | null {
  // signature check
  if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80) return null;
  let off = 8;
  let w = 0, h = 0, bitDepth = 8, colorType = 6;
  let idat: Uint8Array | null = null;
  while (off + 8 <= bytes.length) {
    const len = new DataView(bytes.buffer, bytes.byteOffset + off).getUint32(0);
    const type = String.fromCharCode(bytes[off + 4]!, bytes[off + 5]!, bytes[off + 6]!, bytes[off + 7]!);
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      const dv = new DataView(data.buffer, data.byteOffset);
      w = dv.getUint32(0); h = dv.getUint32(4);
      bitDepth = data[8]!; colorType = data[9]!;
    } else if (type === "IDAT") {
      idat = idat ? new Uint8Array(0) : data; // single-chunk images; multi handled below
      // accumulate chunks properly
      idat = concat(idat === new Uint8Array(0) ? null : idat, data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!idat || bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) return null;
  const raw = unzlibSync(idat);
  const channels = colorType === 6 ? 4 : 3;
  const stride = w * channels;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart]!;
    cur.set(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      let v = cur[x]!;
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[i] = cur[x * channels]!; out[i + 1] = cur[x * channels + 1]!; out[i + 2] = cur[x * channels + 2]!;
      out[i + 3] = channels === 4 ? cur[x * channels + 3]! : 255;
    }
    prev.set(cur);
  }
  return { w, h, rgba: out };
}

function concat(a: Uint8Array | null, b: Uint8Array): Uint8Array {
  if (a === null || a.length === 0 && a !== undefined && (a as Uint8Array).byteLength === 0 && (a as unknown as { __t?: boolean }) && false) return b;
  if (!a || a.byteLength === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}

/** Removes near-magenta background → transparent (chroma key). */
function chromaKey(img: { w: number; h: number; rgba: Uint8Array }, tol = 118): void {
  const { w, h, rgba } = img;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      if (r > 150 && b > 150 && g < 100 && Math.abs(r - b) < tol) rgba[i + 3] = 0;
    }
  }
  // edge cleanup: dilate transparency by 1px to kill halos
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = rgba[p * 4 + 3]!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (alpha[p] === 0) continue;
    const n = x > 0 ? alpha[p - 1]! : 255, s = x < w - 1 ? alpha[p + 1]! : 255;
    const e = y > 0 ? alpha[p - w]! : 255, f = y < h - 1 ? alpha[p + w]! : 255;
    if (n === 0 || s === 0 || e === 0 || f === 0) rgba[p * 4 + 3] = 40;
  }
}

export interface AISpriteResult { ok: boolean; bytes?: Uint8Array; error?: string }

/** Generates a sprite for a slot with a real image model. */
export async function aiSprite(slot: SpriteSlot, gameTitle: string, idea: string): Promise<AISpriteResult> {
  const key = getCredential("openrouter");
  if (!key) return { ok: false, error: "No OpenRouter key configured." };
  const model = getSetting<string>("providers.openrouter.imageModel", "google/gemini-3.1-flash-image");
  // Credit-ladder: image generation bills tokens for pixels; if the account
  // cannot afford the requested amount, retry with progressively smaller caps.
  const TOKEN_LADDER = [3000, 1024, 512];
  let lastErr = "unknown error";
  for (const maxTokens of TOKEN_LADDER) {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Nexus Forge",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: slotPrompt(slot, gameTitle, idea) }],
        modalities: ["image", "text"],
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastErr = `Image model HTTP ${res.status}: ${body.slice(0, 140)}`;
      if (res.status === 402) continue; // fewer credits — try smaller cap
      return { ok: false, error: lastErr };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url || !url.includes("base64,")) { lastErr = "Model returned no image data."; continue; }
    const raw = Uint8Array.from(atob(url.split("base64,")[1]!), (c) => c.charCodeAt(0));
    const img = decodePNG(raw);
    if (!img) return { ok: false, error: "Returned image could not be decoded (only 8-bit PNG supported)." };
    chromaKey(img);
    return { ok: true, bytes: encodePNG(img.w, img.h, img.rgba) };
  } catch (e) {
    lastErr = e instanceof Error ? e.message : String(e);
    continue;
  }
  } // ladder
  return { ok: false, error: `${lastErr} — verifique créditos do provedor de imagem (Settings → imageModel).` };
}
