export interface FoodProduct {
  barcode?: string;
  name: string;
  brand?: string;
  per100g: {
    kcal: number;
    proteins: number;
    fats: number;
    saturatedFats?: number;
    carbs: number;
    sugars?: number;
    fibers?: number;
    salt?: number;
  };
  isCustom?: boolean;
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  product: FoodProduct;
  quantity: number; // grammes
  mealType: 'petit-dejeuner' | 'dejeuner' | 'diner' | 'collation';
}

export interface RepasState {
  entries: MealEntry[];
  customProducts: FoodProduct[];
  recentFoods?: FoodProduct[]; // 10 derniers aliments ajoutés
}

export const MEAL_TYPE_LABELS: Record<MealEntry['mealType'], string> = {
  'petit-dejeuner': '🌅 Petit-déjeuner',
  dejeuner: '☀️ Déjeuner',
  diner: '🌙 Dîner',
  collation: '🍎 Collation',
};

function r1(v: number) { return Math.round(v * 10) / 10; }

export function computeNutrition(product: FoodProduct, grams: number) {
  const ratio = grams / 100;
  const p = product.per100g;
  return {
    kcal: Math.round(p.kcal * ratio),
    proteins: r1(p.proteins * ratio),
    fats: r1(p.fats * ratio),
    saturatedFats: p.saturatedFats !== undefined ? r1(p.saturatedFats * ratio) : undefined,
    carbs: r1(p.carbs * ratio),
    sugars: p.sugars !== undefined ? r1(p.sugars * ratio) : undefined,
    fibers: p.fibers !== undefined ? r1(p.fibers * ratio) : undefined,
    salt: p.salt !== undefined ? r1(p.salt * ratio) : undefined,
  };
}
