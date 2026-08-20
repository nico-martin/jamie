import type { RecipeStep } from "../../types/recipe";
import InstructionStep from "./InstructionStep";

interface InstructionsPanelProps {
  steps: RecipeStep[];
  className?: string;
}

export default function InstructionsPanel({
  steps,
  className = "",
}: InstructionsPanelProps) {
  return (
    <section className={`px-1 py-5 md:px-4 ${className}`}>
      <span className="text-xs font-bold uppercase tracking-[0.17em] text-paprika">
        Make
      </span>
      <h2 className="mt-1 font-display text-4xl font-bold tracking-[-0.04em]">
        Method
      </h2>
      <ol className="mt-8">
        {steps.map((step, index) => (
          <InstructionStep key={step.id} step={step} number={index + 1} />
        ))}
      </ol>
    </section>
  );
}
