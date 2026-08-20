import { useState } from "react";
import type { GenerationMetrics } from "../../services/recipeBuilder";
import type { Recipe } from "../../types/recipe";
import AppHeader from "../layout/AppHeader";
import AgentPanel from "./AgentPanel";
import IngredientsPanel from "./IngredientsPanel";
import InstructionsPanel from "./InstructionsPanel";
import RecipeHero from "./RecipeHero";
import RecipeMeta from "./RecipeMeta";

interface RecipeScreenProps {
  recipe: Recipe;
  isGenerating: boolean;
  generationMetrics: GenerationMetrics;
  rawRecipeJson: string;
  generationError?: string | null;
  onBack: () => void;
  className?: string;
}

export default function RecipeScreen({
  recipe,
  isGenerating,
  generationMetrics,
  rawRecipeJson,
  generationError = null,
  onBack,
  className = "",
}: RecipeScreenProps) {
  const [servingsOverride, setServingsOverride] = useState<number | null>(null);
  const servings = servingsOverride ?? recipe.servings;

  const scrollToStep = (stepNumber: number) => {
    const step = recipe.steps[stepNumber - 1];
    const element = step
      ? document.getElementById(`recipe-step-${step.id}`)
      : null;
    if (!element) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    element.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
    if (prefersReducedMotion) return;

    window.setTimeout(() => {
      element.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(10px)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 650, easing: "ease-out" }
      );
    }, 400);
  };

  return (
    <div className={`min-h-screen bg-cream-light ${className}`}>
      <AppHeader onHome={onBack} />
      <main className="mx-auto max-w-[1320px] px-5 pb-20 md:px-10 lg:px-14">
        <RecipeHero
          recipe={recipe}
          isGenerating={isGenerating}
          onBack={onBack}
          className="pt-8 md:pt-14"
        />
        {generationError && (
          <p className="mt-6 rounded-2xl border border-paprika/20 bg-paprika/8 px-4 py-3 text-sm text-paprika">
            Generation stopped: {generationError}
          </p>
        )}
        <RecipeMeta recipe={recipe} className="relative z-10 mt-8 max-w-4xl" />
        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="space-y-5 lg:sticky lg:top-5">
            <IngredientsPanel
              recipe={recipe}
              servings={servings}
              onServingsChange={setServingsOverride}
            />
            <AgentPanel
              isGenerating={isGenerating}
              generationMetrics={generationMetrics}
              rawRecipeJson={rawRecipeJson}
              servings={servings}
              onServingsChange={setServingsOverride}
              onScrollToStep={scrollToStep}
            />
          </div>
          <InstructionsPanel steps={recipe.steps} />
        </div>
      </main>
    </div>
  );
}
