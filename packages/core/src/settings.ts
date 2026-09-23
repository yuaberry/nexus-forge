/**
 * Settings + encrypted credential storage.
 *
 * SECURITY MODEL (MVP, honest):
 * - API keys are NEVER stored in the repo or in plaintext DB.
 * - Stored in ~/.nexusforge/secrets.enc, AES-256-GCM encrypted with a key
 *   derived (scrypt) from a machine-bound file ~/.nexusforge/machine.key
 *   (created with 0600 perms on first run).
 * - Limitation (documented in docs/STATUS.md): OS keyring integration lands
 *   with the Tauri shell (keyring crate). For now this is encrypted-at-rest.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataRoot } from "./util";
import { getDB } from "./db";

function machineKeyPath(): string {
  return join(dataRoot(), "machine.key");
}

function ensureMachineKey(): Buffer {
  mkdirSync(dataRoot(), { recursive: true });
  const p = machineKeyPath();
  if (!existsSync(p)) {
    writeFileSync(p, randomBytes(32));
    chmodSync(p, 0o600);
  }
  const raw = readFileSync(p);
  // Derive a 32-byte key from the machine file + fixed salt.
  return scryptSync(raw, "nexus-forge-v1", 32);
}

function secretsPath(): string {
  return join(dataRoot(), "secrets.enc");
}

function readSecrets(): Record<string, string> {
  const p = secretsPath();
  if (!existsSync(p)) return {};
  try {
    const blob = readFileSync(p);
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const data = blob.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", ensureMachineKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as Record<string, string>;
  } catch {
    return {}; // corrupted store → treat as empty; user must re-import keys
  }
}

function writeSecrets(secrets: Record<string, string>): void {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ensureMachineKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secrets), "utf8"), cipher.final()]);
  const blob = Buffer.concat([iv, cipher.getAuthTag(), data]);
  writeFileSync(secretsPath(), blob);
  chmodSync(secretsPath(), 0o600);
}

export function getCredential(provider: string): string | null {
  return readSecrets()[provider] ?? null;
}

export function hasCredential(provider: string): boolean {
  return getCredential(provider) != null;
}

/** Extracts an OpenRouter key from a file (first sk-or-v1-... match). */
export function importKeyFromFile(provider: string, path: string): { ok: boolean; hint: string; error?: string } {
  try {
    const text = readFileSync(path, "utf8");
    const m = text.match(/sk-or-v1-[A-Za-z0-9_-]+/);
    if (!m) return { ok: false, hint: "", error: "No OpenRouter key pattern (sk-or-v1-...) found in file." };
    const key = m[0];
    const secrets = readSecrets();
    secrets[provider] = key;
    writeSecrets(secrets);
    getDB().run(
      `INSERT INTO credentials (provider, hint, created_at) VALUES (?,?,?)
       ON CONFLICT(provider) DO UPDATE SET hint=excluded.hint`,
      provider, `${key.slice(0, 10)}…${key.slice(-4)}`, new Date().toISOString(),
    );
    return { ok: true, hint: `${key.slice(0, 10)}…${key.slice(-4)}` };
  } catch (e) {
    return { ok: false, hint: "", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Stores a raw key pasted by the user in Settings. */
export function storeCredential(provider: string, key: string): { ok: boolean; hint: string } {
  const secrets = readSecrets();
  secrets[provider] = key.trim();
  writeSecrets(secrets);
  getDB().run(
    `INSERT INTO credentials (provider, hint, created_at) VALUES (?,?,?)
     ON CONFLICT(provider) DO UPDATE SET hint=excluded.hint`,
    provider, `${key.slice(0, 10)}…${key.slice(-4)}`, new Date().toISOString(),
  );
  return { ok: true, hint: `${key.slice(0, 10)}…${key.slice(-4)}` };
}

// --- plain settings --------------------------------------------------------

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDB().get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key);
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function setSetting(key: string, value: unknown): void {
  getDB().run(
    `INSERT INTO settings (key, value) VALUES (?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    key, JSON.stringify(value),
  );
}
