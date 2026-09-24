"use client";

import { useEffect } from "react";
import { reloadPortfolioFromStorage } from "@/lib/portfolio-store";
import { runPortfolioMigration } from "@/lib/storage";

export function PortfolioBootstrap() {
  useEffect(() => {
    runPortfolioMigration();
    reloadPortfolioFromStorage();
  }, []);

  return null;
}
