import { ChevronLeft } from "lucide-react";
import { Chip } from "../../theme";
import type { Recipe } from "../../types/recipe";

interface RecipeHeroProps {
  recipe: Recipe;
  isGenerating?: boolean;
  onBack: () => void;
  className?: string;
}

export default function RecipeHero({
  recipe,
  isGenerating = false,
  onBack,
  className = "",
}: RecipeHeroProps) {
  return (
    <section className={`border-b border-ink/10 pb-12 md:pb-16 ${className}`}>
      <button
        onClick={onBack}
        className="mb-10 flex w-fit items-center gap-1 text-sm font-semibold text-ink/55 transition hover:text-paprika"
      >
        <ChevronLeft size={17} /> Back to builder
      </button>
      <div>
        <Chip tone="sage" className="w-fit">
          {isGenerating ? "Writing your recipe" : "Freshly generated"}
        </Chip>
        <h1 className="mt-5 max-w-4xl font-display text-5xl font-semibold leading-[0.94] tracking-[-0.055em] sm:text-6xl md:text-8xl">
          {recipe.title || (isGenerating ? "Creating..." : "Untitled recipe")}
        </h1>
      </div>
      <p className="mt-7 max-w-2xl text-base leading-relaxed text-ink/58 md:text-lg">
        {recipe.description ||
          (isGenerating ? "The details are taking shape." : "")}
      </p>
    </section>
  );
}
