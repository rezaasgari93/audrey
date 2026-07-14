"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] no-select";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-black hover:bg-[#e0b585] disabled:hover:bg-[var(--color-accent)]",
  secondary:
    "bg-[var(--color-surface-2)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[#262626]",
  ghost:
    "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-2)]",
  danger:
    "bg-transparent text-[var(--color-danger)] hover:bg-[#2a1414]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      fullWidth = false,
      className = "",
      type = "button",
      ...rest
    },
    ref,
  ) {
    const sizing = "px-3 py-2";
    const width = fullWidth ? "w-full" : "";
    return (
      <button
        ref={ref}
        type={type}
        className={`${base} ${variants[variant]} ${sizing} ${width} ${className}`}
        {...rest}
      />
    );
  },
);
