/**
 * Tiny toast store. Standalone zustand instance so any code path —
 * including non-component lib code — can call `toast.error(...)` without
 * dragging in the main UI store.
 *
 * The `<Toaster />` component (mounted once in App) renders the queue.
 * Toasts auto-dismiss; the user can also click to dismiss early.
 */

import { create } from "zustand";

export type ToastKind = "info" | "success" | "warn" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  items: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastStore>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = nextId++;
    set((s) => ({ items: [...s.items, { id, kind, message }] }));
    // Auto-dismiss after 4s for info/success, 6s for warn/error
    const ttl = kind === "info" || kind === "success" ? 4000 : 6000;
    window.setTimeout(() => {
      set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
    }, ttl);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/** Convenience helpers — `toast.error("oops")` reads cleanly at call sites. */
export const toast = {
  info: (m: string) => useToasts.getState().push("info", m),
  success: (m: string) => useToasts.getState().push("success", m),
  warn: (m: string) => useToasts.getState().push("warn", m),
  error: (m: string) => useToasts.getState().push("error", m),
};
