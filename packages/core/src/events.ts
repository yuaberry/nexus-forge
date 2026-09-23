/**
 * Event bus: persists every event and broadcasts to subscribed WS clients.
 * Single source of truth for the Activity Feed and Log Center.
 */
import type { ForgeEvent } from "@nexus/shared";
import { getDB } from "./db";

type EmitPayload = Partial<Omit<ForgeEvent, "id" | "ts" | "message" | "level">> &
  Pick<ForgeEvent, "message" | "level">;

class EventBus {
  private listeners = new Set<(e: ForgeEvent) => void>();

  subscribe(fn: (e: ForgeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(input: EmitPayload): ForgeEvent {
    const db = getDB();
    const e: EmitPayload & { taskId?: string | null } = { taskId: null, ...input };
    const { id, ts } = db.insertEvent({
      projectId: e.projectId ?? null,
      taskId: e.taskId ?? null,
      agent: e.agent ?? null,
      stage: e.stage ?? null,
      level: e.level,
      message: e.message,
      data: e.data,
    });
    const full: ForgeEvent = {
      id, ts,
      projectId: e.projectId ?? null,
      taskId: e.taskId ?? null,
      agent: e.agent ?? null,
      stage: e.stage ?? null,
      level: e.level,
      message: e.message,
      data: e.data,
    };
    for (const fn of this.listeners) {
      try { fn(full); } catch { /* listener errors must never break the bus */ }
    }
    return full;
  }
}

export const bus = new EventBus();
