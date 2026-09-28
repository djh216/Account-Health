"use client";

import { useEffect } from "react";
import { hydratePortfolioFromStorage, reloadPortfolioFromStorage } from "@/lib/portfolio-store";
import { runPortfolioMigration } from "@/lib/storage";

export function PortfolioBootstrap() {
  useEffect(() => {
    runPortfolioMigration();
    reloadPortfolioFromStorage();
    void hydratePortfolioFromStorage();
  }, []);

  return null;
}
