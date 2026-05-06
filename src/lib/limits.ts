/**
 * Input length caps. Single source of truth so the UI `maxLength` prop and
 * the underlying SQL inserts agree on what's "too long". Values are
 * deliberate: titles fit one row of UI, URLs match common browser caps,
 * notes give plenty of room for prose without unbounded growth.
 */

export const LIMITS = {
  /** App-wide operator handle (display + card + filename). */
  handle: 32,
  /** Resource card title — single-line UI element. */
  resourceTitle: 200,
  /** URL field, generous but bounded. RFC says >2k may break some servers. */
  resourceUrl: 2048,
  /** Inline resource note — short caption, not the full markdown body. */
  resourceNote: 500,
  /** Markdown freeform body for a node's notes. */
  noteBody: 100_000,
  /** Bounty submission fields. */
  bountyProgram: 80,
  bountyTitle: 200,
  bountyCveId: 32,
  bountyRelatedNode: 32,
  bountyNotes: 2000,
} as const;
