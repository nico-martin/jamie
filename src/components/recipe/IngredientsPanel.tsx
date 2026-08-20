import { useState } from "react";
import type { Recipe } from "../../types/recipe";
import IngredientRow from "./IngredientRow";
import ServingsControl from "./ServingsControl";

interface IngredientsPanelProps {
  recipe: Recipe;
  servings: number;
  onServingsChange: (servings: number) => void;
  className?: string;
}

export default function IngredientsPanel({
  recipe,
  servings,
  onServingsChange,
  className = "",
}: IngredientsPanelProps) {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const multiplier = servings / recipe.servings;

  const toggleIngredient = (id: string) => {
    setCheckedIds((current) =>
      current.includes(id)
        ? current.filter((checkedId) => checkedId !== id)
        : [...current, id]
    );
  };

  return (
    <section
      className={`rounded-[1.75rem] bg-white p-5 shadow-[0_18px_50px_rgba(74,58,38,0.08)] md:p-7 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.17em] text-paprika">
            Gather
          </span>
          <h2 className="mt-1 font-display text-3xl font-bold tracking-[-0.03em]">
            Ingredients
          </h2>
        </div>
        <ServingsControl servings={servings} onChange={onServingsChange} />
      </div>
      <div className="mt-1">
        {recipe.ingredients.map((ingredient) => (
          <IngredientRow
            key={ingredient.id}
            ingredient={ingredient}
            amount={ingredient.amount * multiplier}
            checked={checkedIds.includes(ingredient.id)}
            onToggle={() => toggleIngredient(ingredient.id)}
          />
        ))}
      </div>
    </section>
  );
}
