/**
 * Toaster — renders the global toast queue in a fixed bottom-right stack.
 *
 * Mounted once at the App root. Reads from the lib/toast store and stays
 * out of the way of the rest of the UI.
 */

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useToasts, type ToastKind } from "../lib/toast";

const KIND_META: Record<ToastKind, { color: string; bg: string; icon: typeof Info }> = {
  info: { color: "var(--color-cyan)", bg: "var(--color-cyan-dim)", icon: Info },
  success: { color: "var(--color-lime)", bg: "var(--color-lime-dim)", icon: CheckCircle2 },
  warn: { color: "var(--color-amber)", bg: "var(--color-amber-dim)", icon: AlertTriangle },
  error: { color: "var(--color-rose)", bg: "var(--color-rose-dim)", icon: XCircle },
};

export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-[360px] pointer-events-none">
      <AnimatePresence>
        {items.map((t) => {
          const meta = KIND_META[t.kind];
          const Icon = meta.icon;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              role="status"
              aria-live="polite"
              className="np-pixel rounded px-3 py-2 flex items-start gap-2 pointer-events-auto"
              style={{
                background: "var(--color-bg-2)",
                borderColor: meta.bg,
              }}
            >
              <Icon size={14} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1 min-w-0 text-[13px] leading-snug text-[var(--color-fg-0)]">
                {t.message}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-[var(--color-fg-3)] hover:text-[var(--color-fg-0)] flex-shrink-0"
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
