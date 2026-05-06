/**
 * PixelSprite — tiny pixel-art icons drawn as SVG rect grids.
 *
 * Each sprite is an array of rows of strings; each char is a pixel.
 *   ' ' = transparent
 *   '#' = primary color
 *   '.' = secondary color
 *   '@' = highlight color
 */

import { useMemo } from "react";

const SPRITES = {
  star: [
    "  #  ",
    " ### ",
    "#####",
    " ### ",
    "  #  ",
  ],
  diamond: [
    "  #  ",
    " ### ",
    "#####",
    " ### ",
    "  #  ",
  ],
  shrine: [
    "  ##  ",
    " #..# ",
    "#....#",
    "#.##.#",
    "#.##.#",
    "######",
  ],
  skull: [
    " #### ",
    "#####@",
    "#@##@#",
    "######",
    " #### ",
    " #  # ",
  ],
  shield: [
    " #### ",
    "######",
    "#@##@#",
    "######",
    " #### ",
    "  ##  ",
  ],
  bug: [
    " # # ",
    "#####",
    "#@.@#",
    "#####",
    "#####",
    " # # ",
  ],
  key: [
    "####  ",
    "#@@#  ",
    "####  ",
    "  ##  ",
    "  ##  ",
    "  ###",
  ],
  crown: [
    "# # # ",
    "######",
    "#@@@@#",
    "######",
  ],
  pkt: [
    "######",
    "#....#",
    "#.##.#",
    "#.##.#",
    "#....#",
    "######",
  ],
  arrow_right: [
    "##    ",
    "####  ",
    "######",
    "######",
    "####  ",
    "##    ",
  ],
  cursor: [
    "#     ",
    "##    ",
    "###   ",
    "####  ",
    "##### ",
    "######",
  ],
  heart: [
    "## ## ",
    "######",
    "######",
    " #### ",
    "  ##  ",
    "      ",
  ],
  bolt: [
    "  ## ",
    " ##  ",
    "#### ",
    " ## #",
    "  ##  ",
    " #   ",
  ],
  flame: [
    "  #   ",
    " ###  ",
    " ##.# ",
    "##..##",
    "##..##",
    " #### ",
  ],
  brain: [
    " #### ",
    "######",
    "#@##@#",
    "######",
    " #### ",
    " #  # ",
  ],
  link: [
    "  ####",
    " #@@@#",
    "#@@   ",
    "   @@#",
    "#@@@@ ",
    "####  ",
  ],
  cog: [
    " #  # ",
    "######",
    "#@##@#",
    "##  ##",
    "#@##@#",
    "######",
  ],
} as const;

export type SpriteName = keyof typeof SPRITES;

interface Props {
  name: SpriteName;
  size?: number;
  color?: string;
  secondary?: string;
  highlight?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PixelSprite({
  name,
  size = 16,
  color = "currentColor",
  secondary,
  highlight,
  className,
  style,
}: Props) {
  const sprite = SPRITES[name];
  const cols = sprite[0].length;
  const rows = sprite.length;
  const aspect = cols / rows;
  const w = size * aspect;
  const h = size;

  const cells = useMemo(() => {
    const out: { x: number; y: number; c: string }[] = [];
    for (let y = 0; y < rows; y++) {
      const row = sprite[y];
      for (let x = 0; x < cols; x++) {
        const ch = row[x];
        if (ch === "#") out.push({ x, y, c: color });
        else if (ch === ".") out.push({ x, y, c: secondary ?? color });
        else if (ch === "@") out.push({ x, y, c: highlight ?? secondary ?? color });
      }
    }
    return out;
  }, [sprite, cols, rows, color, secondary, highlight]);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      className={className}
      style={{ display: "inline-block", ...style }}
    >
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={1} height={1} fill={c.c} />
      ))}
    </svg>
  );
}
