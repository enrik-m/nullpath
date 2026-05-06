import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../../lib/cn";
import { sfx, unlockAudio } from "../../lib/sfx";

type Variant = "default" | "primary" | "success" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * PixelButton — chunky raised button with NES-style 3-pixel drop shadow.
 * Pressing physically translates the button down 3px to look "depressed".
 */
export function PixelButton({
  variant = "default",
  size = "md",
  className,
  onClick,
  children,
  ...rest
}: PropsWithChildren<Props>) {
  const variantCls =
    variant === "primary"
      ? "np-btn-primary"
      : variant === "success"
        ? "np-btn-success"
        : variant === "danger"
          ? "np-btn-danger"
          : variant === "ghost"
            ? "np-btn-ghost"
            : "";
  const sizeCls = `np-btn-${size}`;
  return (
    <button
      className={cn("np-btn", variantCls, sizeCls, className)}
      onClick={(e) => {
        unlockAudio();
        sfx.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
