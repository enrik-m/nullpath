/**
 * Single source of truth for the per-ResourceKind label and accent color.
 * Both the NodePanel "add resource" form and the Codex filter UI consume
 * these tables — keeping them in one file means renaming a kind or
 * tweaking a color is a one-edit change.
 */

import type { ResourceKind } from "../db/types";

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  video: "Video",
  blog: "Blog",
  writeup: "Writeup",
  lab: "Lab",
  tool: "Tool",
  misc: "Misc",
};

export const RESOURCE_KIND_COLOR: Record<ResourceKind, string> = {
  video: "#fb7185",
  blog: "#22d3ee",
  writeup: "#a3e635",
  lab: "#e879f9",
  tool: "#fbbf24",
  misc: "#6b7088",
};

/** Display order used by the Codex filter row and the NodePanel chip set. */
export const RESOURCE_KINDS: ResourceKind[] = [
  "video",
  "blog",
  "writeup",
  "lab",
  "tool",
  "misc",
];
