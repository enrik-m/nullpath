import { type ButtonHTMLAttributes, type PropsWithChildren } from "react";
import { cn } from "../../lib/cn";
import { sfx, unlockAudio } from "../../lib/sfx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger" | "lime";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  glow = false,
  className,
  onClick,
  children,
  ...rest
}: PropsWithChildren<ButtonProps>) {
  const base =
    "np-mono uppercase tracking-[0.15em] inline-flex items-center justify-center gap-2 transition-all select-none rounded-md font-medium disabled:opacity-40";
  const sizes = {
    sm: "text-[10px] px-2.5 py-1.5",
    md: "text-[11px] px-4 py-2",
    lg: "text-xs px-6 py-3",
  };
  const variants = {
    primary:
      "bg-[var(--color-cyan-dim)] text-[var(--color-bg-0)] hover:bg-[var(--color-cyan)] active:scale-[0.98]",
    ghost:
      "bg-transparent text-[var(--color-fg-1)] hover:bg-[var(--color-bg-3)] hover:text-[var(--color-fg-0)]",
    outline:
      "bg-transparent text-[var(--color-cyan)] border border-[var(--color-cyan-dim)] hover:border-[var(--color-cyan)] hover:bg-[color-mix(in_oklab,var(--color-cyan)_8%,transparent)]",
    danger:
      "bg-transparent text-[var(--color-rose)] border border-[var(--color-rose)] hover:bg-[color-mix(in_oklab,var(--color-rose)_10%,transparent)]",
    lime:
      "bg-[var(--color-lime-dim)] text-[var(--color-bg-0)] hover:bg-[var(--color-lime)] active:scale-[0.98]",
  };
  return (
    <button
      className={cn(base, sizes[size], variants[variant], glow && "np-glow-cyan", className)}
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
