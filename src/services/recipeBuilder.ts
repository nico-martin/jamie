import { TextStreamer } from "@huggingface/transformers";
import {
  StructuredOutputProcessor,
  type ResponseFormat,
} from "@huggingface/transformers-structured-output";
import jaison from "jaison";
import type { Ingredient, Recipe, RecipeStep } from "../types/recipe";
import { getTextGenerationPipeline } from "./shared";

const recipeResponseFormat: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    type: "object",
    properties: {
      recipe: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short descriptive recipe title",
          },
          description: {
            type: "string",
            description: "One-sentence description of the finished dish",
          },
          servings: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "Number of people served",
          },
          ingredients: {
            type: "array",
            minItems: 3,
            items: {
              type: "object",
              properties: {
                amount: {
                  type: "number",
                  minimum: 0,
                  description: "Metric quantity as a number",
                },
                unit: {
                  type: "string",
                  description: "Metric unit such as g, kg, ml, or l",
                },
                name: {
                  type: "string",
                  description: "Ingredient name",
                },
                note: {
                  type: "string",
                  description: "Preparation note or empty string",
                },
              },
              required: ["amount", "unit", "name", "note"],
              additionalProperties: false,
            },
          },
          steps: {
            type: "array",
            minItems: 2,
            items: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Short step title",
                },
                instruction: {
                  type: "string",
                  description: "Complete cooking instruction",
                },
                durationMinutes: {
                  type: "integer",
                  minimum: 0,
                  description: "Duration in minutes or zero",
                },
              },
              required: ["title", "instruction", "durationMinutes"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "description", "servings", "ingredients", "steps"],
        additionalProperties: false,
      },
    },
    required: ["recipe"],
    additionalProperties: false,
  },
};

interface PartialIngredient {
  amount?: unknown;
  unit?: unknown;
  name?: unknown;
  note?: unknown;
}

interface PartialRecipeStep {
  title?: unknown;
  instruction?: unknown;
  durationMinutes?: unknown;
}

interface PartialRecipe {
  title?: unknown;
  description?: unknown;
  servings?: unknown;
  ingredients?: unknown;
  steps?: unknown;
}

export interface GenerationMetrics {
  generatedTokens: number;
  tokensPerSecond: number;
}

export interface GenerateRecipeOptions {
  onFirstToken?: (rawResponse: string, metrics: GenerationMetrics) => void;
  onUpdate?: (rawResponse: string, metrics: GenerationMetrics) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const asPositiveNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

function normalizeIngredient(value: unknown, index: number): Ingredient | null {
  if (!isRecord(value)) return null;
  const ingredient = value as PartialIngredient;

  return {
    id: `ingredient-${index}`,
    amount: asPositiveNumber(ingredient.amount),
    unit: asString(ingredient.unit),
    name: asString(ingredient.name),
    ...(asString(ingredient.note) ? { note: asString(ingredient.note) } : {}),
  };
}

function normalizeStep(value: unknown, index: number): RecipeStep | null {
  if (!isRecord(value)) return null;
  const step = value as PartialRecipeStep;
  const durationMinutes = asPositiveNumber(step.durationMinutes);

  return {
    id: `step-${index}`,
    title: asString(step.title),
    instruction: asString(step.instruction),
    ...(durationMinutes > 0 ? { durationMinutes } : {}),
  };
}

function normalizeRecipe(value: unknown, recipeId: string): Recipe {
  const container = isRecord(value) ? value.recipe : undefined;
  const recipe: PartialRecipe = isRecord(container) ? container : {};
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients
        .map(normalizeIngredient)
        .filter((item): item is Ingredient => item !== null)
    : [];
  const steps = Array.isArray(recipe.steps)
    ? recipe.steps
        .map(normalizeStep)
        .filter((item): item is RecipeStep => item !== null)
    : [];

  return {
    id: recipeId,
    title: asString(recipe.title),
    description: asString(recipe.description),
    servings: Math.max(1, Math.round(asPositiveNumber(recipe.servings, 1))),
    ingredients,
    steps,
  };
}

export function parseRecipeResponse(
  rawResponse: string,
  recipeId: string
): Recipe {
  if (!rawResponse.trim()) return normalizeRecipe({}, recipeId);

  try {
    return normalizeRecipe(jaison(rawResponse) as unknown, recipeId);
  } catch {
    return normalizeRecipe({}, recipeId);
  }
}

export async function generateRecipe(
  prompt: string,
  options: GenerateRecipeOptions = {}
): Promise<string> {
  const generator = await getTextGenerationPipeline();
  const messages = [
    {
      role: "system" as const,
      content: [
        "You are an expert European recipe developer. Create a practical, complete recipe from the user's request.",
        "Use European metric measurements throughout: grams (g), kilograms (kg), millilitres (ml), litres (l), centimetres (cm), and Celsius (°C). Express small quantities in grams or millilitres. Do not use cups, teaspoons (tsp), tablespoons (tbsp), ounces, pounds, fluid ounces, inches, or Fahrenheit unless the user explicitly requests them.",
        "Keep the title short. Populate every requested field with meaningful recipe content.",
        "Ingredients should always be in English",
        "make sure you follow this JSON scheme: " +
          JSON.stringify(recipeResponseFormat),
      ].join("\n\n"),
    },
    { role: "user" as const, content: prompt },
  ];
  let generatedTokens = 0;
  let firstTokenAt: number | null = null;
  let streamedOutput = "";
  const processor = new StructuredOutputProcessor(
    generator.tokenizer,
    recipeResponseFormat
  );

  const getMetrics = (): GenerationMetrics => {
    const elapsedSeconds =
      firstTokenAt === null ? 0 : (performance.now() - firstTokenAt) / 1000;
    return {
      generatedTokens,
      tokensPerSecond:
        elapsedSeconds > 0
          ? Math.max(0, generatedTokens - 1) / elapsedSeconds
          : 0,
    };
  };

  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    token_callback_function: (tokenIds) => {
      const isFirstToken = firstTokenAt === null;
      firstTokenAt ??= performance.now();
      generatedTokens += tokenIds.length;

      if (isFirstToken) options.onFirstToken?.(streamedOutput, getMetrics());
    },
    callback_function: (text) => {
      streamedOutput += text;
      options.onUpdate?.(streamedOutput, getMetrics());
    },
  });

  try {
    await generator(messages, {
      max_new_tokens: 1256,
      do_sample: true,
      top_k: 1,
      logits_processor: processor,
      streamer,
    });
  } catch (error) {
    console.error("constrained_recipe_generation_failed", {
      error,
      generatedTokens,
      streamedOutput,
    });
    throw error;
  }

  options.onUpdate?.(streamedOutput, getMetrics());
  return streamedOutput;
}
