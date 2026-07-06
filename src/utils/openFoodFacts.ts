import { FoodProduct } from '../types/repas';

const BASE = 'https://world.openfoodfacts.org';

function parseProduct(p: any): FoodProduct | null {
  const n = p.nutriments;
  if (!n) return null;
  const kcalFallback = n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0;
  const def = (v: any) => (v !== undefined && v !== null ? Number(v) : undefined);
  return {
    barcode: p.code,
    name: p.product_name || p.product_name_fr || 'Produit inconnu',
    brand: p.brands ?? undefined,
    per100g: {
      kcal: n['energy-kcal_100g'] ?? kcalFallback,
      proteins: n['proteins_100g'] ?? 0,
      fats: n['fat_100g'] ?? 0,
      saturatedFats: def(n['saturated-fat_100g']),
      carbs: n['carbohydrates_100g'] ?? 0,
      sugars: def(n['sugars_100g']),
      fibers: def(n['fiber_100g']),
      salt: def(n['salt_100g']),
    },
  };
}

export async function fetchByBarcode(barcode: string): Promise<FoodProduct | null> {
  try {
    const res = await fetch(`${BASE}/api/v0/product/${barcode}.json?fields=code,product_name,product_name_fr,brands,nutriments`);
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    return parseProduct(json.product);
  } catch {
    return null;
  }
}

export async function searchByName(query: string): Promise<FoodProduct[]> {
  try {
    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `${BASE}/cgi/search.pl?search_terms=${encoded}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,product_name_fr,brands,nutriments&lc=fr`
    );
    const json = await res.json();
    return (json.products ?? [])
      .map(parseProduct)
      .filter((p: FoodProduct | null): p is FoodProduct => p !== null && p.per100g.kcal > 0);
  } catch {
    return [];
  }
}
