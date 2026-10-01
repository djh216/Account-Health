"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OUT_OF_STOCK_CHANGE_EVENT,
  markProductOutOfStock,
  readOutOfStockProducts,
  restoreOutOfStockProduct,
  type OutOfStockProduct,
} from "@/lib/out-of-stock-products";

export function useOutOfStockProducts() {
  const [marks, setMarks] = useState<OutOfStockProduct[]>([]);

  useEffect(() => {
    const sync = () => setMarks(readOutOfStockProducts());
    sync();
    window.addEventListener(OUT_OF_STOCK_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(OUT_OF_STOCK_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const ids = useMemo(() => new Set(marks.map((mark) => mark.id)), [marks]);

  const mark = useCallback((product: { id: string; productName: string }) => {
    markProductOutOfStock(product);
  }, []);

  const restore = useCallback((id: string) => {
    restoreOutOfStockProduct(id);
  }, []);

  return { marks, ids, mark, restore };
}
