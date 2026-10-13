"use client";

import { useMemo } from "react";
import { BarChart2, Wine } from "lucide-react";
import { BottleSalesTrendChart } from "@/components/bottle-sales-trend-chart";
import { ProductSalesTrendsDashboard } from "@/components/product-sales-trends-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardShell } from "@/components/dashboard-shell";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import { normalizeName } from "@/lib/format";
import { hasSpecifiedProduct } from "@/lib/order-analytics";
import type { TrendsGrain } from "@/lib/dashboard-view";
import { cn } from "@/lib/utils";

export function TrendsDashboardView({
  grain,
  onGrainChange,
}: {
  grain: TrendsGrain;
  onGrainChange: (grain: TrendsGrain) => void;
}) {
  const shell = useDashboardShell();
  const { state, enrichedAccounts, orderAnalytics } = useFilteredPortfolio();
  const activeGrain = grain;
  const setGrain = onGrainChange;

  const healthByAccountName = useMemo(
    () => new Map(enrichedAccounts.map((item) => [normalizeName(item.account.name), item])),
    [enrichedAccounts],
  );

  const bottleTrendOrders = useMemo(
    () => state.orders.filter(hasSpecifiedProduct),
    [state.orders],
  );

  const flash = (message: string) => shell?.flash(message);

  if (state.orders.length === 0) {
    return (
      <Card className="border-dashed py-12">
        <CardHeader className="items-center text-center">
          <BarChart2 className="mb-2 size-10 text-muted-foreground" />
          <CardTitle className="font-heading text-2xl">No order data for trends</CardTitle>
          <CardDescription className="max-w-lg">
            Upload order history to chart bottle velocity by account or by wine SKU.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => shell?.openUpload()}>Upload reports</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-1">
        <Button
          type="button"
          size="sm"
          variant={activeGrain === "account" ? "default" : "ghost"}
          className={cn("gap-1.5", activeGrain === "account" ? "" : "text-muted-foreground")}
          onClick={() => setGrain("account")}
        >
          <BarChart2 className="size-3.5" />
          By account
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeGrain === "product" ? "default" : "ghost"}
          className={cn("gap-1.5", activeGrain === "product" ? "" : "text-muted-foreground")}
          onClick={() => setGrain("product")}
        >
          <Wine className="size-3.5" />
          By product / SKU
        </Button>
      </div>

      {activeGrain === "account" ? (
        <BottleSalesTrendChart
          orders={bottleTrendOrders}
          deferHeavyCompute={bottleTrendOrders.length > 800}
          asOf={state.analysisAsOf}
          accountHealthByName={healthByAccountName}
          onNotify={flash}
        />
      ) : (
        <ProductSalesTrendsDashboard embedded />
      )}
    </div>
  );
}
