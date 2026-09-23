/** Typed API client — talks to the Nexus Forge core on the same origin. */

export interface EngineStatusDto {
  engine: string;
  label: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  note: string;
}

export interface StatusDto {
  app: string;
  version: string;
  aiConfigured: boolean;
  uiBuilt: boolean;
  engines: EngineStatusDto[];
}

export interface ProjectDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  idea: string;
  engine: string;
  dimensions: string;
  quality_tier: string;
  content_rating: string;
  platforms: string;
  status: string;
  phase: string;
  progress: number;
  data_path: string;
  created_at: string;
  updated_at: string;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: number;
  status: string;
  dependsOn: string[];
  risk: string;
  requiresApproval: boolean;
  result: string | null;
  error: string | null;
}

export interface EventDto {
  id: string;
  project_id: string | null;
  task_id: string | null;
  agent: string | null;
  stage: string | null;
  level: "info" | "success" | "warning" | "error";
  message: string;
  data: string | null;
  ts: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  status: () => req<StatusDto>("/api/status"),
  projects: () => req<{ projects: ProjectDto[] }>("/api/projects"),
  project: (id: string) =>
    req<{ project: ProjectDto; tasks: TaskDto[]; events: EventDto[]; dna: Record<string, Record<string, { value: unknown; origin: string; note?: string; updatedAt: string }>> }>(`/api/projects/${id}`),
  createProject: (body: Record<string, unknown>) =>
    req<{ project: ProjectDto }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  forge: (id: string, body?: { stages?: string[] }) =>
    req<{ started: boolean }>(`/api/projects/${id}/forge`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  tree: (id: string) => req<{ tree: { path: string; type: "file" | "dir" }[] }>(`/api/projects/${id}/tree`),
  file: (id: string, path: string) =>
    req<{ path: string; content: string }>(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`),
  events: (id: string, limit = 100) => req<{ events: EventDto[] }>(`/api/projects/${id}/events?limit=${limit}`),
  git: (id: string) => req<{ log: { short: string; message: string; date: string; author: string }[]; status: { dirty: boolean; files: string[] }; diff: string }>(`/api/projects/${id}/git`),
  editor: (id: string) => req<{ started: boolean; note: string }>(`/api/projects/${id}/editor`, { method: "POST", body: "{}" }),
  validate: (id: string) =>
    req<{ validation: { ok: boolean; issues: { file: string; line?: number; message: string; severity: string }[]; durationMs: number; logExcerpt: string } }>(`/api/projects/${id}/validate`, { method: "POST", body: "{}" }),
  credentials: () => req<{ configured: boolean; hint: string | null }>("/api/credentials"),
  importKeyFile: (importPath: string) =>
    req<{ ok: boolean; hint?: string; error?: string }>("/api/credentials", { method: "POST", body: JSON.stringify({ importPath }) }),
  storeKey: (key: string) =>
    req<{ ok: boolean; hint: string }>("/api/credentials", { method: "POST", body: JSON.stringify({ key }) }),
  deleteKey: () => req<{ ok: boolean }>("/api/credentials", { method: "DELETE" }),
  installGodot: () => req<{ ok: boolean; note: string }>("/api/engines/godot/install", { method: "POST", body: "{}" }),
  settings: () => req<{ mode: string; autoEngineInstall: boolean; defaultModel: string }>("/api/settings"),
  setSettings: (body: Record<string, unknown>) => req<{ ok: boolean }>("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),
  approveTask: (id: string) => req<{ ok: boolean }>(`/api/tasks/${id}/approve`, { method: "POST", body: "{}" }),
  rejectTask: (id: string) => req<{ ok: boolean }>(`/api/tasks/${id}/reject`, { method: "POST", body: "{}" }),
};
