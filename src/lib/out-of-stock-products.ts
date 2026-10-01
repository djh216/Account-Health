export const OUT_OF_STOCK_CHANGE_EVENT = "cellar-pulse-out-of-stock-change";

const STORAGE_KEY = "cellar-pulse.out-of-stock-products";

export type OutOfStockProduct = {
  id: string;
  productName: string;
  markedAt: string;
};

function isOutOfStockProduct(value: unknown): value is OutOfStockProduct {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.productName === "string" &&
    typeof record.markedAt === "string"
  );
}

export function readOutOfStockProducts(): OutOfStockProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOutOfStockProduct);
  } catch {
    return [];
  }
}

function writeOutOfStockProducts(products: OutOfStockProduct[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    window.dispatchEvent(new Event(OUT_OF_STOCK_CHANGE_EVENT));
  } catch {
    // ignore storage write errors
  }
}

export function markProductOutOfStock(product: {
  id: string;
  productName: string;
}): void {
  const existing = readOutOfStockProducts().filter((item) => item.id !== product.id);
  writeOutOfStockProducts([
    ...existing,
    {
      id: product.id,
      productName: product.productName,
      markedAt: new Date().toISOString(),
    },
  ]);
}

export function restoreOutOfStockProduct(id: string): void {
  writeOutOfStockProducts(readOutOfStockProducts().filter((item) => item.id !== id));
}

export function excludeOutOfStock<T extends { id: string }>(
  alerts: T[],
  outOfStockIds: Set<string>,
): T[] {
  if (outOfStockIds.size === 0) return alerts;
  return alerts.filter((alert) => !outOfStockIds.has(alert.id));
}
