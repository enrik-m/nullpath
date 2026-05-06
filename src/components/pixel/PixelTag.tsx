import type { PropsWithChildren } from "react";
import type { NodeDepth, NodeKind, NodeStatus } from "../../db/types";
import { cn } from "../../lib/cn";

const DEPTH_COLOR: Record<NodeDepth, string> = {
  intro: "var(--color-fg-2)",
  std: "var(--color-cyan)",
  adv: "var(--color-magenta)",
  res: "var(--color-rose)",
};

const STATUS_COLOR: Record<NodeStatus, string> = {
  available: "var(--color-fg-2)",
  in_progress: "var(--color-cyan)",
  complete: "var(--color-lime)",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  available: "OPEN",
  in_progress: "ACTIVE",
  complete: "DONE",
};

const KIND_LABEL: Record<NodeKind, string> = {
  foundation: "FNDN",
  tool: "TOOL",
  recon: "RCON",
  vuln: "VULN",
  defense: "DEF",
  methodology: "MTHD",
  capstone: "BOSS",
};

export function DepthTag({ depth, className }: { depth: NodeDepth; className?: string }) {
  return (
    <span className={cn("np-tag", className)} style={{ color: DEPTH_COLOR[depth] }}>
      {depth.toUpperCase()}
    </span>
  );
}

export function StatusTag({ status, className }: { status: NodeStatus; className?: string }) {
  return (
    <span className={cn("np-tag", className)} style={{ color: STATUS_COLOR[status] }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function KindTag({ kind, className }: { kind: NodeKind; className?: string }) {
  return (
    <span className={cn("np-tag", className)} style={{ color: "var(--color-fg-2)" }}>
      {KIND_LABEL[kind]}
    </span>
  );
}

export function Pill({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <span className={cn("np-tag", className)} style={{ color: "var(--color-fg-1)" }}>
      {children}
    </span>
  );
}
