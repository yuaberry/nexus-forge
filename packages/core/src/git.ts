/**
 * Git integration — real git via CLI (never a library that could invent behavior).
 * One branch per task: task/<id>-<slug>. Snapshot commits before risky changes.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Workspace } from "./workspace";

const exec = promisify(execFile);

export class GitRepo {
  constructor(readonly ws: Workspace) {}

  private git(args: string[], cwd = this.ws.root) {
    return exec("git", ["-C", cwd, ...args], { maxBuffer: 20_000_000 });
  }

  async init(identity?: { name: string; email: string }): Promise<void> {
    await this.git(["init", "-b", "main"]);
    const cfg = identity ? ["-c", `user.name=${identity.name}`, "-c", `user.email=${identity.email}`] : [];
    if (identity) {
      // persist per-repo identity so commits work in sandboxes without global git config
      await exec("git", ["-C", this.ws.root, "config", "user.name", identity.name]);
      await exec("git", ["-C", this.ws.root, "config", "user.email", identity.email]);
    }
    void cfg;
  }

  async isRepo(): Promise<boolean> {
    try {
      const { stdout } = await exec("git", ["-C", this.ws.root, "rev-parse", "--is-inside-work-tree"]);
      return stdout.trim() === "true";
    } catch { return false; }
  }

  async addAll(): Promise<void> { await this.git(["add", "-A"]); }

  async commit(message: string, allowEmpty = false): Promise<string | null> {
    await this.git(["add", "-A"]);
    const args = ["commit", "-m", message];
    if (allowEmpty) args.push("--allow-empty");
    try {
      const { stdout } = await this.git(args);
      const m = stdout.match(/\[main[^\s]* (\w+)/) ?? stdout.match(/\[\S+ (\w+)/);
      return m?.[1] ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("nothing to commit")) return null;
      throw e;
    }
  }

  async createTaskBranch(taskSlug: string): Promise<void> {
    const slug = taskSlug.replace(/[^\w-]/g, "-").slice(0, 40);
    await this.git(["checkout", "-B", `task/${slug}`]);
  }

  async checkoutMain(): Promise<void> { await this.git(["checkout", "main"]); }

  async log(limit = 30): Promise<Array<{ hash: string; short: string; message: string; date: string; author: string }>> {
    try {
      const { stdout } = await this.git(["log", `--max-count=${limit}`, "--pretty=format:%H%x1f%h%x1f%s%x1f%aI%x1f%an"]);
      return stdout.trim().split("\n").filter(Boolean).map((l) => {
        const [hash, short, message, date, author] = l.split("\x1f");
        return { hash: hash ?? "", short: short ?? "", message: message ?? "", date: date ?? "", author: author ?? "" };
      });
    } catch { return []; }
  }

  async status(): Promise<{ dirty: boolean; files: string[] }> {
    try {
      const { stdout } = await this.git(["status", "--porcelain"]);
      const files = stdout.trim().split("\n").filter(Boolean).map((l) => l.slice(3));
      return { dirty: files.length > 0, files };
    } catch { return { dirty: false, files: [] }; }
  }

  /** Unified diff of working tree vs HEAD. */
  async diff(maxChars = 4000): Promise<string> {
    try {
      const { stdout } = await this.git(["diff", "HEAD"]);
      return stdout.slice(0, maxChars);
    } catch { return ""; }
  }

  async ensureCommitted(message: string): Promise<void> {
    const s = await this.status();
    if (s.dirty) await this.commit(message);
  }
}
