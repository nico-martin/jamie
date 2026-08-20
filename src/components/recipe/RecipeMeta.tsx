import { ListChecks, ShoppingBasket, Users } from "lucide-react";
import type { Recipe } from "../../types/recipe";

interface RecipeMetaProps {
  recipe: Recipe;
  className?: string;
}

export default function RecipeMeta({
  recipe,
  className = "",
}: RecipeMetaProps) {
  const items = [
    { icon: Users, label: "Serves", value: recipe.servings.toString() },
    {
      icon: ShoppingBasket,
      label: "Ingredients",
      value: recipe.ingredients.length.toString(),
    },
    {
      icon: ListChecks,
      label: "Steps",
      value: recipe.steps.length.toString(),
    },
  ];

  return (
    <dl
      className={`grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 ${className}`}
    >
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="bg-cream-light px-4 py-4 md:px-5">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-ink/45">
            <Icon size={14} /> {label}
          </dt>
          <dd className="mt-1 text-sm font-bold text-ink md:text-base">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
