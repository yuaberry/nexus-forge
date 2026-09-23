/**
 * Workspace — project file operations, ALWAYS scoped to the project dir.
 * This is the filesystem sandbox: no API in this module may escape the
 * project root (path traversal is rejected). Agents never touch the OS
 * outside this scope; general terminal access is a separate permission.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync, renameSync, unlinkSync, rmSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Resolves a relative path inside the sandbox or throws. */
  private safe(rel: string): string {
    const p = resolve(this.root, rel);
    const normRoot = this.root.endsWith(sep) ? this.root : this.root + sep;
    if (!p.startsWith(normRoot) || p === this.root) {
      throw new Error(`Path escapes workspace sandbox: ${rel}`);
    }
    return p;
  }

  exists(rel: string): boolean {
    try { return existsSync(this.safe(rel)); } catch { return false; }
  }

  read(rel: string, maxBytes = 512_000): string {
    const p = this.safe(rel);
    const st = statSync(p);
    if (st.size > maxBytes) throw new Error(`File too large to read in one call (${st.size} bytes): ${rel}`);
    return readFileSync(p, "utf8");
  }

  write(rel: string, content: string): void {
    const p = this.safe(rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, "utf8");
  }

  listTree(rel = "", maxEntries = 2000): Array<{ path: string; type: "file" | "dir" }> {
    const out: Array<{ path: string; type: "file" | "dir" }> = [];
    const walk = (dirRel: string) => {
      if (out.length >= maxEntries) return;
      const abs = dirRel ? this.safe(dirRel) : this.root;
      let entries: string[];
      try { entries = readdirSync(abs); } catch { return; }
      // Skip heavy/noise dirs
      const SKIP = new Set([".git", ".godot", "node_modules", "__pycache__", ".vs", "Binaries", "Intermediate", "DerivedDataCache", "Saved", "Content/Collections"]);
      for (const name of entries) {
        if (SKIP.has(name)) continue;
        if (out.length >= maxEntries) return;
        const rel = dirRel ? `${dirRel}/${name}` : name;
        try {
          const st = statSync(join(abs, name));
          if (st.isDirectory()) {
            out.push({ path: rel, type: "dir" });
            walk(rel);
          } else {
            out.push({ path: rel, type: "file" });
          }
        } catch { /* broken symlink — ignore */ }
      }
    };
    walk("");
    return out;
  }

  /** Human/AI-readable tree string for context packs. */
  treeText(maxEntries = 400): string {
    const entries = this.listTree("", maxEntries);
    return entries.map((e) => `${e.type === "dir" ? "[D]" : "    "} ${e.path}`).join("\n");
  }

  remove(rel: string): void {
    rmSync(this.safe(rel), { recursive: true, force: true });
  }

  /** Copy raw uploaded bytes into references folder. Returns relative path. */
  saveReference(fileName: string, bytes: Uint8Array): string {
    const rel = `references/${fileName.replace(/[^\w.\-() ]/g, "_")}`;
    const p = this.safe(rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
    return rel;
  }
}
