/**
 * Achievements engine.
 *
 * On every node-complete or session-end, evaluate the milestone catalog and
 * unlock anything newly qualified. Each unlock raises a modal celebration via
 * the UI store.
 */

import * as db from "../db";
import { useUi, levelForXp, xpForLevel } from "../store";
import { sfx } from "./sfx";

interface AchievementSpec {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Returns true if the user qualifies. */
  check: (ctx: AchievementCtx) => Promise<boolean> | boolean;
}

interface AchievementCtx {
  totalCompletedNodes: number;
  totalSeconds: number;
  streak: number;
  zonesCompleted: number;
  bountiesAccepted: number;
  bountiesPayout: number;
  xp: number;
  level: number;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
const CATALOG: AchievementSpec[] = [
  {
    id: "first-node",
    name: "First Move",
    description: "Mark your first node complete. The path begins.",
    icon: "Sparkles",
    check: ({ totalCompletedNodes }) => totalCompletedNodes >= 1,
  },
  {
    id: "ten-nodes",
    name: "Operator In Training",
    description: "10 nodes complete. Your kit is taking shape.",
    icon: "Zap",
    check: ({ totalCompletedNodes }) => totalCompletedNodes >= 10,
  },
  {
    id: "fifty-nodes",
    name: "Tradecraft",
    description: "50 nodes. You're done with foundations — now hunt.",
    icon: "Target",
    check: ({ totalCompletedNodes }) => totalCompletedNodes >= 50,
  },
  {
    id: "hundred-nodes",
    name: "Specialist",
    description: "100 nodes complete. Most pentesters never get here.",
    icon: "Award",
    check: ({ totalCompletedNodes }) => totalCompletedNodes >= 100,
  },
  {
    id: "first-zone",
    name: "Zone Cleared",
    description: "Every node in a zone — done. The constellation glows.",
    icon: "Trophy",
    check: ({ zonesCompleted }) => zonesCompleted >= 1,
  },
  {
    id: "five-zones",
    name: "Five Constellations",
    description: "Five zones cleared. The atlas is filling in.",
    icon: "Trophy",
    check: ({ zonesCompleted }) => zonesCompleted >= 5,
  },
  {
    id: "all-zones-web",
    name: "Web Master",
    description: "Every zone in the Web region cleared. Senior territory.",
    icon: "Crown",
    check: ({ zonesCompleted }) => zonesCompleted >= 23,
  },
  {
    id: "first-hour",
    name: "Hour One",
    description: "First focused hour logged.",
    icon: "Clock",
    check: ({ totalSeconds }) => totalSeconds >= 3600,
  },
  {
    id: "ten-hours",
    name: "Compound Time",
    description: "10 hours logged. Not lucky — committed.",
    icon: "Clock",
    check: ({ totalSeconds }) => totalSeconds >= 36000,
  },
  {
    id: "hundred-hours",
    name: "Centurion",
    description: "100 hours logged. The kind of time that builds careers.",
    icon: "Clock",
    check: ({ totalSeconds }) => totalSeconds >= 360000,
  },
  {
    id: "streak-3",
    name: "Three Sun Cycles",
    description: "3-day streak. The habit is forming.",
    icon: "Flame",
    check: ({ streak }) => streak >= 3,
  },
  {
    id: "streak-7",
    name: "A Week Unbroken",
    description: "7-day streak. You showed up every day.",
    icon: "Flame",
    check: ({ streak }) => streak >= 7,
  },
  {
    id: "streak-30",
    name: "Month of Mondays",
    description: "30-day streak. Discipline made visible.",
    icon: "Flame",
    check: ({ streak }) => streak >= 30,
  },
  {
    id: "first-bounty",
    name: "Live Fire",
    description: "First bug bounty submission accepted. Real-world.",
    icon: "Crosshair",
    check: ({ bountiesAccepted }) => bountiesAccepted >= 1,
  },
  {
    id: "first-payout",
    name: "Paid",
    description: "First bounty payout in the ledger.",
    icon: "DollarSign",
    check: ({ bountiesPayout }) => bountiesPayout >= 1,
  },
  {
    id: "level-5",
    name: "Operator Tier 5",
    description: "Level 5 reached.",
    icon: "ArrowUp",
    check: ({ level }) => level >= 5,
  },
  {
    id: "level-10",
    name: "Operator Tier 10",
    description: "Level 10 reached.",
    icon: "ArrowUp",
    check: ({ level }) => level >= 10,
  },
  {
    id: "level-25",
    name: "Operator Tier 25",
    description: "Level 25 reached. Few make it this far.",
    icon: "ArrowUp",
    check: ({ level }) => level >= 25,
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
      const ok = await spec.check(ctx);
      if (ok) {
        await db.unlockAchievement({
          id: spec.id,
          name: spec.name,
          description: spec.description,
          icon: spec.icon,
        });
        newly.push(spec);
      }
    }

    // Raise modals one at a time
    if (newly.length > 0) {
      const queue = [...newly];
      const showNext = () => {
        const a = queue.shift();
        if (!a) return;
        sfx.success();
        showModal({
          kind: "achievement",
          id: a.id,
          name: a.name,
          description: a.description,
        });
        // After user dismisses (modal is null again), show next
        const checker = setInterval(() => {
          if (useUi.getState().modal === null) {
            clearInterval(checker);
            window.setTimeout(showNext, 200);
          }
        }, 200);
      };
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
      window.setTimeout(() => {
        showModal({ kind: "level-up", oldLevel: old, newLevel });
      }, 1500 + newly.length * 1500);
    }
  } finally {
    evaluating = false;
  }
}

async function buildCtx(): Promise<AchievementCtx> {
  // Sum across all kinds
  const groups = (
    ["foundation", "tool", "recon", "vuln", "defense", "methodology", "capstone"] as const
  ).map((k) => db.nodesByKind(k));
  const all = (await Promise.all(groups)).flat();

  const completed = all.filter((n) => n.status === "complete");
  const completedXp = completed.reduce((s, n) => s + (n.user_xp || 0), 0);
  const totalSeconds = await db.totalStudySeconds();
  const minuteXp = Math.floor(totalSeconds / 60) * 4;
  const xp = completedXp + minuteXp;
  const level = levelForXp(xp);
  // Suppress unused-fn warning while keeping import live for future tweaks
  void xpForLevel;

  const streak = await db.currentStreak();

  // Zones cleared = zones where all nodes are complete
  const stats = await db.getZoneStats("web");
  const zonesCompleted = stats.filter(
    (z) => z.total_nodes > 0 && z.completed_nodes === z.total_nodes,
  ).length;

  const bountyTotals = await db.bountyTotals();

  return {
    totalCompletedNodes: completed.length,
    totalSeconds,
    streak,
    zonesCompleted,
    bountiesAccepted: bountyTotals.accepted,
    bountiesPayout: bountyTotals.payout,
    xp,
    level,
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
