export interface Ingredient {
  id: string;
  amount: number;
  unit: string;
  name: string;
  note?: string;
}

export interface RecipeStep {
  id: string;
  title: string;
  instruction: string;
  durationMinutes?: number;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  servings: number;
  ingredients: Ingredient[];
  steps: RecipeStep[];
}
