/** Global live state: WS event stream + status polling. */
import { create } from "zustand";
import type { EventDto, StatusDto } from "./lib/api";

interface NexusState {
  ws: WebSocket | null;
  connected: boolean;
  events: EventDto[];
  status: StatusDto | null;
  connect: () => void;
  refreshStatus: () => Promise<void>;
  pushEvent: (e: EventDto) => void;
}

export const useNexus = create<NexusState>((set, get) => ({
  ws: null,
  connected: false,
  events: [],
  status: null,

  connect: () => {
    if (get().ws) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => set({ connected: true });
    ws.onclose = () => {
      set({ connected: false });
      setTimeout(() => get().connect(), 2500); // auto-reconnect
    };
    ws.onmessage = (m) => {
      try {
        const msg = JSON.parse(m.data as string) as { type: string; event: EventDto };
        if (msg.type === "event") get().pushEvent(msg.event);
      } catch { /* malformed frame — ignore */ }
    };
    set({ ws });
  },

  refreshStatus: async () => {
    try {
      const { api } = await import("./lib/api");
      set({ status: await api.status() });
    } catch { /* server offline */ }
  },

  pushEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 250) })),
}));
