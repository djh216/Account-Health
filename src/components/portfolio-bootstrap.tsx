"use client";

import { useEffect } from "react";
import { hydratePortfolioFromStorage } from "@/lib/portfolio-store";
import { runPortfolioMigration } from "@/lib/storage";

export function PortfolioBootstrap() {
  useEffect(() => {
    runPortfolioMigration();
    void hydratePortfolioFromStorage();
  }, []);

  return null;
}
