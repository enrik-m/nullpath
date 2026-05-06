/**
 * PixelBar — segmented retro progress bar.
 *
 * Renders as discrete 4px-wide cells separated by 1px gaps so it reads as
 * pixel art rather than a smooth progress bar. Like a Pokémon HP bar.
 */

import { cn } from "../../lib/cn";

interface Props {
  value: number; // 0-1
  segments?: number; // how many cells across (default 20)
  color?: string; // CSS color of filled cells
  trackColor?: string; // CSS color of empty cells
  height?: number; // px
  className?: string;
}

export function PixelBar({
  value,
  segments = 20,
  color = "var(--color-cyan)",
  trackColor = "var(--color-bg-3)",
  height = 8,
  className,
}: Props) {
  const v = Math.max(0, Math.min(1, value));
  const filled = Math.round(v * segments);
  return (
    <div
      className={cn("flex gap-[1px] np-pixel-inset p-[2px]", className)}
      style={{ height: height + 8 }}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="flex-1"
          style={{
            background: i < filled ? color : trackColor,
            transition: "background 100ms steps(2)",
          }}
        />
      ))}
    </div>
  );
}
