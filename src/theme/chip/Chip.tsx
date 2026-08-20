import type { ReactNode } from "react";
import cn from "../../utils/classnames";

interface ChipProps {
  children: ReactNode;
  tone?: "sage" | "cream";
  className?: string;
}

export default function Chip({
  children,
  tone = "cream",
  className = "",
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
        {
          "bg-sage/15 text-sage-dark": tone === "sage",
          "border border-ink/10 bg-cream/90 text-ink/65": tone === "cream",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
