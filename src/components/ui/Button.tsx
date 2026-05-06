/**
 * Legacy Button — now a thin shim over PixelButton.
 *
 * Kept for back-compat with existing call sites. New code should import
 * `PixelButton` from `components/pixel/PixelButton` directly.
 */

import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { PixelButton } from "../pixel/PixelButton";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger" | "lime";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: PropsWithChildren<ButtonProps>) {
  // Map legacy variants to pixel variants
  const pixelVariant =
    variant === "primary"
      ? "primary"
      : variant === "ghost"
        ? "ghost"
        : variant === "outline"
          ? "ghost"
          : variant === "danger"
            ? "danger"
            : variant === "lime"
              ? "success"
              : "default";
  return (
    <PixelButton variant={pixelVariant} size={size} className={className} {...rest}>
      {children}
    </PixelButton>
  );
}
