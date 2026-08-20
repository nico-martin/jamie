import { useState } from "react";
import BuilderScreen from "./components/builder/BuilderScreen";
import RecipeScreen from "./components/recipe/RecipeScreen";
import { prepareAppModels } from "./services/modelManager";
import {
  generateRecipe,
  parseRecipeResponse,
  type GenerationMetrics,
} from "./services/recipeBuilder";
import type { Recipe } from "./types/recipe";

const INITIAL_METRICS: GenerationMetrics = {
  generatedTokens: 0,
  tokensPerSecond: 0,
};

export default function App() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMetrics, setGenerationMetrics] =
    useState<GenerationMetrics>(INITIAL_METRICS);
  const [rawRecipeJson, setRawRecipeJson] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);

  const handleGenerate = async (prompt: string) => {
    const recipeId = crypto.randomUUID();
    setIsGenerating(true);
    setGenerationMetrics(INITIAL_METRICS);
    setRawRecipeJson("");
    setGenerationError(null);

    try {
      const modelsReady = prepareAppModels();
      const rawResponse = await generateRecipe(prompt, {
        onFirstToken: (rawJson, metrics) => {
          setRecipe(parseRecipeResponse(rawJson, recipeId));
          setGenerationMetrics(metrics);
          setRawRecipeJson(rawJson);
          window.scrollTo({ top: 0 });
        },
        onUpdate: (rawJson, metrics) => {
          setRecipe(parseRecipeResponse(rawJson, recipeId));
          setGenerationMetrics(metrics);
          setRawRecipeJson(rawJson);
        },
      });
      await modelsReady;
      setRawRecipeJson(rawResponse);
      setRecipe(parseRecipeResponse(rawResponse, recipeId));
    } catch (error) {
      console.error(error);
      setGenerationError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (recipe) {
    return (
      <RecipeScreen
        recipe={recipe}
        isGenerating={isGenerating}
        generationMetrics={generationMetrics}
        rawRecipeJson={rawRecipeJson}
        generationError={generationError}
        onBack={() => setRecipe(null)}
      />
    );
  }

  return (
    <BuilderScreen
      isGenerating={isGenerating}
      generationError={generationError}
      onGenerate={handleGenerate}
    />
  );
}
