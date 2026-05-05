import type { PropsWithChildren } from "react";
import type { NodeDepth, NodeKind, NodeStatus } from "../../db/types";
import { cn } from "../../lib/cn";

const DEPTH_STYLE: Record<NodeDepth, string> = {
  intro: "text-[var(--color-fg-2)] border-[var(--color-fg-3)]",
  std: "text-[var(--color-cyan)] border-[var(--color-cyan-dim)]",
  adv: "text-[var(--color-magenta)] border-[var(--color-magenta-dim)]",
  res: "text-[var(--color-rose)] border-[var(--color-rose)]",
};

const STATUS_STYLE: Record<NodeStatus, string> = {
  available: "text-[var(--color-fg-2)] border-[var(--color-fg-3)]",
  in_progress: "text-[var(--color-cyan)] border-[var(--color-cyan-dim)] np-pulse",
  complete: "text-[var(--color-lime)] border-[var(--color-lime-dim)]",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  available: "AVAILABLE",
  in_progress: "IN PROGRESS",
  complete: "COMPLETE",
};

const KIND_LABEL: Record<NodeKind, string> = {
  foundation: "FOUNDATION",
  tool: "TOOL",
  recon: "RECON",
  vuln: "VULN",
  defense: "DEFENSE",
  methodology: "METHOD",
  capstone: "CAPSTONE",
};

export function DepthTag({ depth, className }: { depth: NodeDepth; className?: string }) {
  return (
    <span
      className={cn(
        "np-mono text-[9px] tracking-[0.2em] uppercase border px-1.5 py-0.5 rounded-sm",
        DEPTH_STYLE[depth],
        className,
      )}
    >
      {depth}
    </span>
  );
}

export function StatusTag({ status, className }: { status: NodeStatus; className?: string }) {
  return (
    <span
      className={cn(
        "np-mono text-[9px] tracking-[0.2em] border px-1.5 py-0.5 rounded-sm",
        STATUS_STYLE[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function KindTag({ kind, className }: { kind: NodeKind; className?: string }) {
  return (
    <span
      className={cn(
        "np-mono text-[9px] tracking-[0.2em] text-[var(--color-fg-2)] border border-[var(--color-border-default)] px-1.5 py-0.5 rounded-sm",
        className,
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

export function Pill({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        "np-mono text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full bg-[var(--color-bg-3)] text-[var(--color-fg-1)] border border-[var(--color-border-default)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
