/**
 * Achievements engine.
 *
 * On every DB mutation (debounced) we evaluate the milestone catalog
 * and unlock anything newly qualified. Each unlock raises a modal
 * celebration via the UI store.
 *
 * The catalog is intentionally broad — first-step gimmes, volume tiers,
 * depth/kind specializations, skill-mastery, streaks, levels, big-day
 * pushes, codex/notes, refresher discipline, bounty milestones,
 * endgame. The mix is meant to give the user something to chase at
 * every stage from "just installed" through "burned through every node."
 *
 * Spec shape: every achievement defines a `target` number and a
 * `value(ctx)` accessor. The check is derived (`value >= target`) and
 * the gallery uses the same data to draw a live progress bar on
 * locked tiles ("18/25 nodes"). One source of truth, no drift.
 */

import * as db from "../db";
import type { NodeRow } from "../db/types";
import { useUi, computeOperatorXp, levelForXp } from "../store";
import { sfx } from "./sfx";

export interface AchievementSpec {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Numeric threshold the user must reach. Use 1 for binary "first X" achievements. */
  target: number;
  /** Returns the user's current progress toward `target`. */
  value: (ctx: AchievementCtx) => number;
}

export interface AchievementCtx {
  // Volume
  totalCompletedNodes: number;
  /** Map: node depth → count completed. */
  depthCounts: { intro: number; std: number; adv: number; res: number };
  /** Map: node kind → count completed. */
  kindCounts: Record<string, number>;
  /** Top-level nodes whose every sub-node is complete. */
  topLevelsMastered: number;

  // Zones
  zonesCompleted: number;
  zonesTouched: number;

  // Streak / level
  streak: number;
  level: number;
  xp: number;

  // Big-day push (peak completions on any single day)
  maxNodesInOneDay: number;

  // Codex / notes / refreshers
  totalResources: number;
  pinnedResources: number;
  totalNotes: number;
  longestNoteLength: number;
  totalRefresherAcks: number;
  maxRefresherStreak: number;

  // Bounties
  bountiesAccepted: number;
  bountiesPayout: number;
  bountiesCves: number;
}

/** Derived helper — true when the user has reached the achievement target. */
export function isUnlocked(spec: AchievementSpec, ctx: AchievementCtx): boolean {
  return spec.value(ctx) >= spec.target;
}

/**
 * The full catalog, in display order. Exposed so views (e.g. the gallery)
 * can render every entry — including the ones the user hasn't unlocked
 * yet — without rebuilding the list.
 */
export function getAchievementCatalog(): readonly AchievementSpec[] {
  return CATALOG;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
const CATALOG: AchievementSpec[] = [
  // ── First steps ────────────────────────────────────────────────────────
  {
    id: "first-node",
    name: "First Move",
    description: "Mark your first node complete. The path begins.",
    icon: "Footprints",
    target: 1,
    value: (c) => c.totalCompletedNodes,
  },
  {
    id: "first-zone",
    name: "Zone Cleared",
    description: "Every node in a zone — done. The constellation glows.",
    icon: "Trophy",
    target: 1,
    value: (c) => c.zonesCompleted,
  },
  {
    id: "first-resource",
    name: "Pack Rat",
    description: "Attach your first resource to a node. Build the library.",
    icon: "BookOpen",
    target: 1,
    value: (c) => c.totalResources,
  },
  {
    id: "first-note",
    name: "Field Notes",
    description: "Wrote your first node note. Synthesis beats re-reading.",
    icon: "Pencil",
    target: 1,
    value: (c) => c.totalNotes,
  },

  // ── Volume / nodes cleared ─────────────────────────────────────────────
  {
    id: "ten-nodes",
    name: "Operator In Training",
    description: "10 nodes complete. Your kit is taking shape.",
    icon: "Zap",
    target: 10,
    value: (c) => c.totalCompletedNodes,
  },
  {
    id: "twenty-five-nodes",
    name: "Pattern Forming",
    description: "25 nodes. The vocabulary is starting to click.",
    icon: "Hexagon",
    target: 25,
    value: (c) => c.totalCompletedNodes,
  },
  {
    id: "fifty-nodes",
    name: "Tradecraft",
    description: "50 nodes. You're done with foundations — now hunt.",
    icon: "Target",
    target: 50,
    value: (c) => c.totalCompletedNodes,
  },
  {
    id: "hundred-nodes",
    name: "Specialist",
    description: "100 nodes complete. Most pentesters never get here.",
    icon: "Award",
    target: 100,
    value: (c) => c.totalCompletedNodes,
  },
  {
    id: "two-fifty-nodes",
    name: "Senior Operator",
    description: "250 nodes. Real depth across the discipline.",
    icon: "Medal",
    target: 250,
    value: (c) => c.totalCompletedNodes,
  },
  {
    id: "five-hundred-nodes",
    name: "Encyclopedic",
    description: "500 nodes. You can teach this.",
    icon: "Library",
    target: 500,
    value: (c) => c.totalCompletedNodes,
  },

  // ── Zone progress ──────────────────────────────────────────────────────
  {
    id: "five-zones-touched",
    name: "Wide Surface",
    description: "Started progress in 5 different zones.",
    icon: "Map",
    target: 5,
    value: (c) => c.zonesTouched,
  },
  {
    id: "ten-zones-touched",
    name: "Cartographer",
    description: "10 zones with at least one node touched.",
    icon: "Compass",
    target: 10,
    value: (c) => c.zonesTouched,
  },
  {
    id: "five-zones",
    name: "Five Constellations",
    description: "Five zones cleared. The atlas is filling in.",
    icon: "Star",
    target: 5,
    value: (c) => c.zonesCompleted,
  },
  {
    id: "ten-zones-cleared",
    name: "Half the Sky",
    description: "Ten zones fully cleared. Specialist territory.",
    icon: "Telescope",
    target: 10,
    value: (c) => c.zonesCompleted,
  },
  {
    id: "all-zones-web",
    name: "Web Master",
    description: "Every zone in the Web region cleared. Senior territory.",
    icon: "Crown",
    target: 23,
    value: (c) => c.zonesCompleted,
  },

  // ── Depth specialization ───────────────────────────────────────────────
  {
    id: "intro-graduate",
    name: "Foundations Laid",
    description: "25 intro-tier nodes complete. The basics are in your bones.",
    icon: "BookOpen",
    target: 25,
    value: (c) => c.depthCounts.intro,
  },
  {
    id: "std-operator",
    name: "Standard Issue",
    description: "25 standard-tier nodes complete. Day-to-day operator chops.",
    icon: "ShieldCheck",
    target: 25,
    value: (c) => c.depthCounts.std,
  },
  {
    id: "adv-tradecraft",
    name: "Advanced Tradecraft",
    description: "10 advanced-tier nodes complete. Senior-level techniques.",
    icon: "Sword",
    target: 10,
    value: (c) => c.depthCounts.adv,
  },
  {
    id: "research-tier",
    name: "Researcher",
    description: "5 research-tier nodes complete. You're chasing the edges.",
    icon: "Microscope",
    target: 5,
    value: (c) => c.depthCounts.res,
  },

  // ── Kind specialization ────────────────────────────────────────────────
  {
    id: "bedrock",
    name: "Bedrock",
    description: "10 foundation nodes complete. Theory before tooling.",
    icon: "Anchor",
    target: 10,
    value: (c) => c.kindCounts.foundation ?? 0,
  },
  {
    id: "toolsmith",
    name: "Toolsmith",
    description: "10 tool nodes complete. Burp, ffuf, sqlmap — comfortable.",
    icon: "Wrench",
    target: 10,
    value: (c) => c.kindCounts.tool ?? 0,
  },
  {
    id: "recon-master",
    name: "Reconnaissance",
    description: "10 recon nodes complete. You see the attack surface clearly.",
    icon: "Search",
    target: 10,
    value: (c) => c.kindCounts.recon ?? 0,
  },
  {
    id: "vuln-hunter",
    name: "Vuln Hunter",
    description: "15 vulnerability nodes complete. Finding bugs is muscle memory.",
    icon: "Bug",
    target: 15,
    value: (c) => c.kindCounts.vuln ?? 0,
  },
  {
    id: "blue-aware",
    name: "Blue-Team Aware",
    description: "5 defense nodes complete. You know what gets you caught.",
    icon: "Shield",
    target: 5,
    value: (c) => c.kindCounts.defense ?? 0,
  },
  {
    id: "methodologist",
    name: "Methodologist",
    description: "5 methodology nodes complete. Process beats vibes.",
    icon: "ClipboardList",
    target: 5,
    value: (c) => c.kindCounts.methodology ?? 0,
  },
  {
    id: "capstone-climber",
    name: "Capstone Climber",
    description: "3 capstone nodes complete. You're chaining attacks end-to-end.",
    icon: "Mountain",
    target: 3,
    value: (c) => c.kindCounts.capstone ?? 0,
  },

  // ── Skill mastery (top-level fully cleared) ────────────────────────────
  {
    id: "first-mastery",
    name: "Signature Move",
    description: "Cleared every sub-technique under one top-level skill.",
    icon: "Sparkles",
    target: 1,
    value: (c) => c.topLevelsMastered,
  },
  {
    id: "five-masteries",
    name: "Polymath",
    description: "Mastered 5 top-level skills end-to-end.",
    icon: "BrainCircuit",
    target: 5,
    value: (c) => c.topLevelsMastered,
  },
  {
    id: "ten-masteries",
    name: "Generalist",
    description: "10 mastered top-level skills. Few pivots stop you now.",
    icon: "Atom",
    target: 10,
    value: (c) => c.topLevelsMastered,
  },
  {
    id: "twenty-five-masteries",
    name: "Apex Generalist",
    description: "25 mastered top-level skills. Real range.",
    icon: "Gem",
    target: 25,
    value: (c) => c.topLevelsMastered,
  },

  // ── Streaks ────────────────────────────────────────────────────────────
  {
    id: "streak-3",
    name: "Three Sun Cycles",
    description: "3-day streak. The habit is forming.",
    icon: "Flame",
    target: 3,
    value: (c) => c.streak,
  },
  {
    id: "streak-7",
    name: "A Week Unbroken",
    description: "7-day streak. You showed up every day.",
    icon: "Flame",
    target: 7,
    value: (c) => c.streak,
  },
  {
    id: "streak-14",
    name: "Fortnight",
    description: "14-day streak. Two weeks straight, no excuses.",
    icon: "Flame",
    target: 14,
    value: (c) => c.streak,
  },
  {
    id: "streak-30",
    name: "Month of Mondays",
    description: "30-day streak. Discipline made visible.",
    icon: "Flame",
    target: 30,
    value: (c) => c.streak,
  },
  {
    id: "streak-100",
    name: "Centurion",
    description: "100-day streak. This is who you are now.",
    icon: "Crown",
    target: 100,
    value: (c) => c.streak,
  },

  // ── Levels ─────────────────────────────────────────────────────────────
  {
    id: "level-5",
    name: "Operator Tier 5",
    description: "Level 5 reached. First major bracket cleared.",
    icon: "ArrowUp",
    target: 5,
    value: (c) => c.level,
  },
  {
    id: "level-10",
    name: "Operator Tier 10",
    description: "Level 10 reached. Solid mid-game.",
    icon: "ArrowUp",
    target: 10,
    value: (c) => c.level,
  },
  {
    id: "level-15",
    name: "Operator Tier 15",
    description: "Level 15 reached. Late-mid territory.",
    icon: "ArrowUp",
    target: 15,
    value: (c) => c.level,
  },
  {
    id: "level-25",
    name: "Operator Tier 25",
    description: "Level 25 reached. Few make it this far.",
    icon: "ArrowUp",
    target: 25,
    value: (c) => c.level,
  },
  {
    id: "level-50",
    name: "Apex Operator",
    description: "Level 50. You've gone past the curve into the long tail.",
    icon: "Crown",
    target: 50,
    value: (c) => c.level,
  },

  // ── Big-day pushes ─────────────────────────────────────────────────────
  {
    id: "five-in-a-day",
    name: "Productive Day",
    description: "Completed 5 nodes in a single day.",
    icon: "Sun",
    target: 5,
    value: (c) => c.maxNodesInOneDay,
  },
  {
    id: "ten-in-a-day",
    name: "Crunch Mode",
    description: "Completed 10 nodes in a single day. Lock-in achieved.",
    icon: "Cpu",
    target: 10,
    value: (c) => c.maxNodesInOneDay,
  },
  {
    id: "twenty-in-a-day",
    name: "Marathon",
    description: "Completed 20 nodes in a single day. Touch grass after this one.",
    icon: "Rocket",
    target: 20,
    value: (c) => c.maxNodesInOneDay,
  },

  // ── Codex / resources ──────────────────────────────────────────────────
  {
    id: "ten-resources",
    name: "Library Card",
    description: "10 resources attached across the graph.",
    icon: "BookOpen",
    target: 10,
    value: (c) => c.totalResources,
  },
  {
    id: "fifty-resources",
    name: "Stack Builder",
    description: "50 resources attached. Your codex is loaded.",
    icon: "Library",
    target: 50,
    value: (c) => c.totalResources,
  },
  {
    id: "hundred-resources",
    name: "Reference Operator",
    description: "100 resources attached. Source-of-truth grade.",
    icon: "Database",
    target: 100,
    value: (c) => c.totalResources,
  },
  {
    id: "five-pinned",
    name: "Curated",
    description: "Pinned 5 resources. The cream of the codex.",
    icon: "Pin",
    target: 5,
    value: (c) => c.pinnedResources,
  },

  // ── Notes / writing ────────────────────────────────────────────────────
  {
    id: "ten-notes",
    name: "Operator's Journal",
    description: "Wrote notes on 10 different nodes.",
    icon: "Scroll",
    target: 10,
    value: (c) => c.totalNotes,
  },
  {
    id: "fifty-notes",
    name: "Field Researcher",
    description: "50 nodes documented in your own words.",
    icon: "FileText",
    target: 50,
    value: (c) => c.totalNotes,
  },
  {
    id: "long-note",
    name: "Deep Dive",
    description: "Wrote a 2,000+ character note on a single topic.",
    icon: "Pencil",
    target: 2000,
    value: (c) => c.longestNoteLength,
  },

  // ── Refreshers / spaced repetition ─────────────────────────────────────
  {
    id: "ten-refresher-acks",
    name: "Recall Trained",
    description: "Cleanly recalled 10 refresher prompts. Memory is sharpening.",
    icon: "Brain",
    target: 10,
    value: (c) => c.totalRefresherAcks,
  },
  {
    id: "fifty-refresher-acks",
    name: "Long-Term Storage",
    description: "Cleanly recalled 50 refreshers. You don't lose what you learn.",
    icon: "Brain",
    target: 50,
    value: (c) => c.totalRefresherAcks,
  },
  {
    id: "refresher-streak-5",
    name: "Steel Trap",
    description: "Hit a 5-deep recall streak on a single node. It's fully internalized.",
    icon: "Lock",
    target: 5,
    value: (c) => c.maxRefresherStreak,
  },

  // ── Bounties / real-world ──────────────────────────────────────────────
  {
    id: "first-bounty",
    name: "Live Fire",
    description: "First bug bounty submission accepted. Real-world.",
    icon: "Crosshair",
    target: 1,
    value: (c) => c.bountiesAccepted,
  },
  {
    id: "first-payout",
    name: "Paid",
    description: "First bounty payout in the ledger.",
    icon: "DollarSign",
    target: 1,
    value: (c) => c.bountiesPayout,
  },
  {
    id: "first-cve",
    name: "Etched in CVE",
    description: "First CVE assigned to your name.",
    icon: "Hash",
    target: 1,
    value: (c) => c.bountiesCves,
  },
  {
    id: "five-bounties",
    name: "Repeat Offender",
    description: "5 bounties accepted. Pattern recognition pays.",
    icon: "Crosshair",
    target: 5,
    value: (c) => c.bountiesAccepted,
  },
  {
    id: "ten-bounties",
    name: "Bounty Veteran",
    description: "10 bounties accepted. Programs know your handle.",
    icon: "BadgeCheck",
    target: 10,
    value: (c) => c.bountiesAccepted,
  },
  {
    id: "payout-1k",
    name: "$1k Club",
    description: "Total bounty payouts crossed $1,000.",
    icon: "DollarSign",
    target: 1000,
    value: (c) => c.bountiesPayout,
  },
  {
    id: "payout-10k",
    name: "Five-Figure Hunter",
    description: "Total bounty payouts crossed $10,000.",
    icon: "Coins",
    target: 10_000,
    value: (c) => c.bountiesPayout,
  },
  {
    id: "five-cves",
    name: "Vulnerability Disclosed",
    description: "5 CVEs in your ledger. Public-record security work.",
    icon: "ShieldAlert",
    target: 5,
    value: (c) => c.bountiesCves,
  },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

let evaluating = false;
let pendingLevelCheck = { last: -1, init: false };

/**
 * Run all checks once. Newly qualified achievements unlock and raise modals
 * (queued one at a time so they don't stack).
 */
export async function evaluateAchievements(): Promise<void> {
  if (evaluating) return;
  evaluating = true;
  try {
    const ctx = await buildCtx();
    const showModal = useUi.getState().showModal;
    const existing = await db.getAchievements();
    const unlockedSet = new Set(existing.filter((a) => a.unlocked_at).map((a) => a.id));

    const newly: AchievementSpec[] = [];
    for (const spec of CATALOG) {
      if (unlockedSet.has(spec.id)) continue;
      if (isUnlocked(spec, ctx)) {
        await db.unlockAchievement({
          id: spec.id,
          name: spec.name,
          description: spec.description,
          icon: spec.icon,
        });
        newly.push(spec);
      }
    }

    // Raise modals one at a time. We subscribe to the zustand store
    // and advance the queue whenever the current modal becomes null —
    // far more reliable than the old setInterval poll, and zero work
    // between dismissals.
    if (newly.length > 0) {
      const queue = [...newly];
      const showNext = () => {
        const a = queue.shift();
        if (!a) {
          unsubscribe?.();
          unsubscribe = null;
          return;
        }
        sfx.success();
        showModal({
          kind: "achievement",
          id: a.id,
          name: a.name,
          description: a.description,
          icon: a.icon,
        });
      };
      let unsubscribe: (() => void) | null = useUi.subscribe((state, prev) => {
        // Only fire on the closing transition (something → null)
        if (prev.modal !== null && state.modal === null) {
          // Small delay so the close animation completes before the next
          window.setTimeout(showNext, 200);
        }
      });
      showNext();
    }

    // Level-up detection
    const newLevel = ctx.level;
    if (!pendingLevelCheck.init) {
      pendingLevelCheck.last = newLevel;
      pendingLevelCheck.init = true;
    } else if (newLevel > pendingLevelCheck.last) {
      const old = pendingLevelCheck.last;
      pendingLevelCheck.last = newLevel;
      // Stack on top of any achievement queue
      window.setTimeout(
        () => {
          showModal({ kind: "level-up", oldLevel: old, newLevel });
        },
        1500 + newly.length * 1500,
      );
    }
  } finally {
    evaluating = false;
  }
}

/**
 * Build the context object the catalog consumes. Exposed (`export`) so
 * `AchievementsView` can render live progress on locked tiles using the
 * exact same numbers the engine sees.
 */
export async function buildCtx(): Promise<AchievementCtx> {
  const all = await db.getAllNodes();
  const completed = all.filter((n) => n.status === "complete");
  const xp = computeOperatorXp(all);
  const level = levelForXp(xp);

  // Depth + kind tallies in one pass over the completed list.
  const depthCounts = { intro: 0, std: 0, adv: 0, res: 0 };
  const kindCounts: Record<string, number> = {};
  for (const n of completed) {
    if (n.depth in depthCounts) {
      depthCounts[n.depth as keyof typeof depthCounts]++;
    }
    kindCounts[n.kind] = (kindCounts[n.kind] ?? 0) + 1;
  }

  // Top-level mastery — a top-level node is "mastered" when it has at
  // least one child and every child is `complete`. Single pass over the
  // children-by-parent index.
  const childrenByParent = new Map<string, NodeRow[]>();
  for (const n of all) {
    if (n.parent_id) {
      const arr = childrenByParent.get(n.parent_id);
      if (arr) arr.push(n);
      else childrenByParent.set(n.parent_id, [n]);
    }
  }
  let topLevelsMastered = 0;
  for (const top of all) {
    if (top.parent_id) continue;
    const kids = childrenByParent.get(top.id);
    if (!kids || kids.length === 0) continue;
    if (kids.every((k) => k.status === "complete")) topLevelsMastered++;
  }

  // Streak + zone stats
  const streak = await db.currentStreak();
  const stats = await db.getZoneStats("web");
  const zonesCompleted = stats.filter(
    (z) => z.total_nodes > 0 && z.completed_nodes === z.total_nodes,
  ).length;
  const zonesTouched = stats.filter((z) => z.completed_nodes > 0 || z.in_progress_nodes > 0).length;

  // Big-day push — peak `sessions` across the streak ledger.
  const days = await db.getStreakDays(365);
  let maxNodesInOneDay = 0;
  for (const d of days) {
    if (d.sessions > maxNodesInOneDay) maxNodesInOneDay = d.sessions;
  }

  // Codex / notes / refresher aggregates — go straight to the connection
  // for the count queries to avoid pulling the full tables into JS.
  const conn = await db.db();
  const [resAgg] = await conn.select<Array<{ total: number; pinned: number }>>(
    "SELECT COUNT(*) AS total, COALESCE(SUM(pinned), 0) AS pinned FROM node_resource",
  );
  const [noteAgg] = await conn.select<Array<{ total: number; longest: number }>>(
    "SELECT COUNT(*) AS total, COALESCE(MAX(LENGTH(body_md)), 0) AS longest FROM node_note",
  );
  const [refAgg] = await conn.select<Array<{ acks: number; max_streak: number }>>(
    "SELECT COALESCE(SUM(streak), 0) AS acks, COALESCE(MAX(streak), 0) AS max_streak FROM refresher",
  );

  const bountyTotals = await db.bountyTotals();

  return {
    totalCompletedNodes: completed.length,
    depthCounts,
    kindCounts,
    topLevelsMastered,

    zonesCompleted,
    zonesTouched,

    streak,
    level,
    xp,

    maxNodesInOneDay,

    totalResources: resAgg?.total ?? 0,
    pinnedResources: resAgg?.pinned ?? 0,
    totalNotes: noteAgg?.total ?? 0,
    longestNoteLength: noteAgg?.longest ?? 0,
    totalRefresherAcks: refAgg?.acks ?? 0,
    maxRefresherStreak: refAgg?.max_streak ?? 0,

    bountiesAccepted: bountyTotals.accepted,
    bountiesPayout: bountyTotals.payout,
    bountiesCves: bountyTotals.cves,
  };
}

/**
 * Initialize on boot — sets the "last seen level" baseline so we don't
 * fire a level-up modal on first launch when XP is rehydrated.
 */
export async function primeAchievementEngine(): Promise<void> {
  const ctx = await buildCtx();
  pendingLevelCheck = { last: ctx.level, init: true };
  // Don't raise modals on prime — just sync state.
}

/**
 * Subscribe the engine to every DB mutation so achievements unlock the
 * moment their trigger condition is met — adding a resource, saving a
 * note, acking a refresher, completing a node, settings change, etc.
 *
 * Calls are debounced because a single user action can fire several
 * mutations back-to-back (markComplete: setNodeStatus + setNodeXp +
 * scheduleRefresher + recordCompletionDay) and we only want one
 * evaluation pass for the burst.
 *
 * Returns the unsubscribe function so App.tsx can clean up on unmount.
 */
export function startAchievementWatcher(): () => void {
  let timer: number | null = null;
  const off = db.onMutation(() => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      // Evaluate is async + idempotent; fire-and-forget is safe because
      // the engine has its own `evaluating` re-entry guard.
      void evaluateAchievements();
    }, 350);
  });
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    off();
  };
}
