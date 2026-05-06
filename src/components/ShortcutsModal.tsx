/**
 * ShortcutsModal — keyboard shortcuts cheat sheet, summoned with `?`.
 */

import { motion } from "framer-motion";
import { Command, X } from "lucide-react";
import { sfx } from "../lib/sfx";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string[]; label: string; group: string }> = [
  { keys: ["⌘", "K"], label: "Open search", group: "Navigation" },
  { keys: ["/"], label: "Open search", group: "Navigation" },
  { keys: ["1"], label: "Atlas", group: "Navigation" },
  { keys: ["2"], label: "Codex", group: "Navigation" },
  { keys: ["3"], label: "Stats", group: "Navigation" },
  { keys: ["4"], label: "Bounties", group: "Navigation" },
  { keys: ["Esc"], label: "Back from zone / region", group: "Navigation" },
  { keys: ["?"], label: "Show this help", group: "Navigation" },
];

export function ShortcutsModal({ open, onClose }: Props) {
  if (!open) return null;
  const groups = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
    if (!acc[s.group]) acc[s.group] = [];
    acc[s.group].push(s);
    return acc;
  }, {});
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[55] flex items-center justify-center px-4"
      style={{
        background: "color-mix(in oklab, #06070b 65%, transparent)",
        backdropFilter: "blur(8px)",
      }}
      onClick={() => {
        sfx.click();
        onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="np-pixel rounded-lg w-[480px] max-w-full p-6 border-[var(--color-cyan-dim)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Command size={14} className="text-[var(--color-cyan)]" />
            <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-cyan)]">
              SHORTCUTS
            </div>
          </div>
          <button
            onClick={() => {
              sfx.click();
              onClose();
            }}
            className="text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-5 space-y-5">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="np-mono text-[10px] tracking-[0.25em] uppercase text-[var(--color-fg-3)] mb-2">
                // {group.toLowerCase()}
              </div>
              <div className="space-y-1.5">
                {items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[12.5px] text-[var(--color-fg-1)]">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="np-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border-default)] text-[var(--color-fg-1)] bg-[var(--color-bg-3)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
