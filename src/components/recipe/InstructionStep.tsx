import { Timer } from "lucide-react";
import type { RecipeStep } from "../../types/recipe";

interface InstructionStepProps {
  step: RecipeStep;
  number: number;
  className?: string;
}

export default function InstructionStep({
  step,
  number,
  className = "",
}: InstructionStepProps) {
  return (
    <li
      id={`recipe-step-${step.id}`}
      className={`grid grid-cols-[42px_1fr] gap-4 pb-9 last:pb-0 ${className}`}
    >
      <div className="relative flex justify-center">
        <span className="relative z-10 grid size-10 place-items-center rounded-full bg-ink font-display text-lg font-bold text-cream">
          {number}
        </span>
        <span className="absolute bottom-[-2.25rem] top-10 w-px bg-ink/12 last:hidden" />
      </div>
      <div className="pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-2xl font-bold tracking-[-0.025em]">
            {step.title}
          </h3>
          {step.durationMinutes && (
            <span className="flex items-center gap-1 text-xs font-semibold text-ink/45">
              <Timer size={13} /> {step.durationMinutes} min
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-7 text-ink/60 md:text-base">
          {step.instruction}
        </p>
      </div>
    </li>
  );
}
