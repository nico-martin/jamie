import { Check } from "lucide-react";
import type { Ingredient } from "../../types/recipe";
import cn from "../../utils/classnames";

interface IngredientRowProps {
  ingredient: Ingredient;
  amount: number;
  checked: boolean;
  onToggle: () => void;
  className?: string;
}

export default function IngredientRow({
  ingredient,
  amount,
  checked,
  onToggle,
  className = "",
}: IngredientRowProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 border-b border-ink/8 py-4 text-left transition last:border-0",
        { "opacity-45": checked },
        className
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md border border-ink/20",
          { "border-sage bg-sage text-white": checked }
        )}
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      <span className={cn("flex-1 text-sm", { "line-through": checked })}>
        <strong className="font-bold">
          {Number(amount.toFixed(1))} {ingredient.unit}
        </strong>{" "}
        {ingredient.name}
        {ingredient.note && (
          <span className="text-ink/45">, {ingredient.note}</span>
        )}
      </span>
    </button>
  );
}
