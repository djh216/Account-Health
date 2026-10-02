"use client";

import type { ReactNode } from "react";
import { FilteredPortfolioProvider } from "@/components/filtered-portfolio-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <FilteredPortfolioProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </FilteredPortfolioProvider>
  );
}
