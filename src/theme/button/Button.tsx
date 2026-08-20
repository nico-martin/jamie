import type { ButtonHTMLAttributes } from "react";
import cn from "../../utils/classnames";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "quiet" | "outline";
  className?: string;
}

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paprika disabled:cursor-not-allowed disabled:opacity-50",
        {
          "bg-ink text-cream shadow-[0_7px_20px_rgba(36,34,29,0.18)] hover:-translate-y-0.5 hover:bg-paprika":
            variant === "primary",
          "bg-transparent text-ink hover:bg-ink/5": variant === "quiet",
          "border border-ink/15 bg-white/50 text-ink hover:border-ink/35 hover:bg-white":
            variant === "outline",
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
