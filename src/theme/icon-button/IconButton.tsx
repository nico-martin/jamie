import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import cn from "../../utils/classnames";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
}

export default function IconButton({
  label,
  children,
  ref,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      ref={ref}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border border-ink/10 bg-white/70 text-ink transition hover:-translate-y-0.5 hover:border-ink/25 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paprika",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
