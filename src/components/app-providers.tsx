"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { FilteredPortfolioProvider } from "@/components/filtered-portfolio-provider";
import { ReportExportProvider } from "@/components/report-export-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const DASHBOARD_ROUTES = ["/", "/?view=insights", "/?view=health", "/?view=orders", "/?view=trends"] as const;

export function AppProviders({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    for (const href of DASHBOARD_ROUTES) {
      router.prefetch(href);
    }
  }, [router]);

  return (
    <FilteredPortfolioProvider>
      <Suspense fallback={<TooltipProvider>{children}</TooltipProvider>}>
        <ReportExportProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ReportExportProvider>
      </Suspense>
    </FilteredPortfolioProvider>
  );
}
