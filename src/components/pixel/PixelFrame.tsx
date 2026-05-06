import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../../lib/cn";

type Variant = "raised" | "inset" | "flat";

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  glow?: "cyan" | "magenta" | "lime" | null;
  /** Optional banner row at top with a title and optional accent. */
  title?: string;
  titleAccent?: string;
}

/**
 * PixelFrame — chunky beveled panel like an NES dialog box.
 *
 * `raised` = looks raised off the surface (default)
 * `inset` = looks recessed (good for input wells)
 * `flat` = sharp border, no bevel
 */
export function PixelFrame({
  variant = "raised",
  glow = null,
  title,
  titleAccent,
  className,
  children,
  ...rest
}: PropsWithChildren<Props>) {
  const cls =
    variant === "raised"
      ? "np-pixel"
      : variant === "inset"
        ? "np-pixel-inset"
        : "np-pixel-flat";
  const glowCls =
    glow === "cyan"
      ? "np-glow-cyan"
      : glow === "magenta"
        ? "np-glow-magenta"
        : glow === "lime"
          ? "np-glow-lime"
          : "";
  return (
    <div className={cn(cls, glowCls, className)} {...rest}>
      {title && (
        <div
          className="np-screen text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 border-b-2 flex items-center gap-2"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-3)",
            color: titleAccent ?? "var(--color-fg-1)",
          }}
        >
          <span className="inline-block w-2 h-2 bg-[currentColor]" />
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
