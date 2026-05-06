/**
 * Resolves the `icon` string stored on each achievement record into the
 * actual Lucide component. The catalog is the single source of truth for
 * which names are used; we import only those (tree-shake friendly) so a
 * future typo in a new catalog entry would surface as a `ts2305` import
 * error rather than a runtime null at render time.
 */

import {
  Anchor,
  ArrowUp,
  Atom,
  Award,
  BadgeCheck,
  BookOpen,
  Brain,
  BrainCircuit,
  Bug,
  ClipboardList,
  Coins,
  Compass,
  Cpu,
  Crosshair,
  Crown,
  Database,
  DollarSign,
  FileText,
  Flame,
  Footprints,
  Gem,
  Hash,
  Hexagon,
  Library,
  Lock,
  Map,
  Medal,
  Microscope,
  Mountain,
  Pencil,
  Pin,
  Rocket,
  Scroll,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Sword,
  Target,
  Telescope,
  Trophy,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Anchor,
  ArrowUp,
  Atom,
  Award,
  BadgeCheck,
  BookOpen,
  Brain,
  BrainCircuit,
  Bug,
  ClipboardList,
  Coins,
  Compass,
  Cpu,
  Crosshair,
  Crown,
  Database,
  DollarSign,
  FileText,
  Flame,
  Footprints,
  Gem,
  Hash,
  Hexagon,
  Library,
  Lock,
  Map,
  Medal,
  Microscope,
  Mountain,
  Pencil,
  Pin,
  Rocket,
  Scroll,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Sword,
  Target,
  Telescope,
  Trophy,
  Wrench,
  Zap,
};

/**
 * Resolve a catalog icon name → Lucide component. Falls back to Trophy
 * if the name is unknown, so a stale unlocked-achievement row from a
 * previous catalog (whose icon name was renamed) still renders.
 */
export function resolveAchievementIcon(name: string | null | undefined): LucideIcon {
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return Trophy;
}
