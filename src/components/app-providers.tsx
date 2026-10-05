"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FilteredPortfolioProvider } from "@/components/filtered-portfolio-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const DASHBOARD_ROUTES = ["/", "/orders", "/products"] as const;

export function AppProviders({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    for (const href of DASHBOARD_ROUTES) {
      router.prefetch(href);
    }
  }, [router]);

  return (
    <FilteredPortfolioProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </FilteredPortfolioProvider>
  );
}
