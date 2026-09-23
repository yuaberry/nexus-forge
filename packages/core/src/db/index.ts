/**
 * SQLite persistence layer (real, file-backed, via bun:sqlite).
 * Manual migrations in SCHEMA; every table has a purpose in the product.
 */
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { join } from "node:path";
import { dataRoot, ensureDirs, now, uid } from "../util";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  idea TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT 'godot4',
  engine_version TEXT,
  dimensions TEXT NOT NULL DEFAULT '2d',
  quality_tier TEXT NOT NULL DEFAULT 'indie',
  content_rating TEXT NOT NULL DEFAULT 'teen',
  platforms TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  phase TEXT NOT NULL DEFAULT 'Foundation',
  progress INTEGER NOT NULL DEFAULT 0,
  data_path TEXT NOT NULL,
  forge_mode TEXT NOT NULL DEFAULT 'assisted',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dna (
  project_id TEXT NOT NULL,
  section TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'unknown',
  note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, section, key)
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  decided_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'code',
  priority INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending',
  depends_on TEXT NOT NULL DEFAULT '[]',
  assigned_agent TEXT,
  risk TEXT NOT NULL DEFAULT 'low',
  requires_approval INTEGER NOT NULL DEFAULT 0,
  files TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  agent TEXT,
  stage TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  data TEXT,
  ts TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'visual',
  name TEXT NOT NULL,
  path TEXT,
  meta TEXT,
  analysis TEXT,
  status TEXT NOT NULL DEFAULT 'imported',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  agent TEXT,
  reason TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credentials (
  provider TEXT PRIMARY KEY,
  hint TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, ts);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
`;

export class DB {
  private db: Database;

  constructor(path?: string) {
    ensureDirs(dataRoot());
    this.db = new Database(path ?? join(dataRoot(), "nexus.db"));
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  prepare(sql: string) { return this.db.prepare(sql); }

  // --- generic helpers -----------------------------------------------------
  get<T = unknown>(sql: string, ...args: SQLQueryBindings[]): T | null {
    return this.db.prepare(sql).get(...args) as T | null;
  }
  all<T = unknown>(sql: string, ...args: SQLQueryBindings[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }
  run(sql: string, ...args: SQLQueryBindings[]): void {
    this.db.prepare(sql).run(...args);
  }

  // --- events --------------------------------------------------------------
  insertEvent(e: {
    projectId?: string | null; taskId?: string | null; agent?: string | null;
    stage?: string | null; level: string; message: string; data?: unknown;
  }) {
    const id = uid("ev");
    const ts = now();
    this.run(
      `INSERT INTO events (id, project_id, task_id, agent, stage, level, message, data, ts)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id, e.projectId ?? null, e.taskId ?? null, e.agent ?? null, e.stage ?? null,
      e.level, e.message, e.data ? JSON.stringify(e.data) : null, ts,
    );
    return { id, ts };
  }

  close() { this.db.close(); }
}

let _db: DB | null = null;
export function getDB(): DB {
  if (!_db) _db = new DB();
  return _db;
}
