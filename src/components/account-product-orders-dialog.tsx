"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Calendar, Layers, Package, TrendingUp } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Order } from "@/lib/types";

export type AccountProductSelection = {
  accountName: string;
  product: string;
};

export function AccountProductOrdersDialog({
  selection,
  orders,
  asOf,
  onOpenChange,
}: {
  selection: AccountProductSelection | null;
  orders: Order[];
  asOf?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const matchingOrders = useMemo(() => {
    if (!selection) return [];
    const targetAccount = selection.accountName.trim().toLowerCase();
    const targetProduct = selection.product.trim().toLowerCase();

    return orders.filter((o) => {
      const accMatch =
        (o.accountName && o.accountName.trim().toLowerCase() === targetAccount) ||
        (o.accountId && o.accountId.trim().toLowerCase() === targetAccount);
      const prodMatch = o.product && o.product.trim().toLowerCase() === targetProduct;
      return accMatch && prodMatch;
    });
  }, [selection, orders]);

  const sortedOrders = useMemo(() => {
    return [...matchingOrders].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sortDirection === "desc" ? db - da : da - db;
    });
  }, [matchingOrders, sortDirection]);

  const summary = useMemo(() => {
    if (matchingOrders.length === 0) return null;
    const totalVolume = matchingOrders.reduce((sum, o) => sum + (o.cases || 0), 0);
    const totalRevenue = matchingOrders.reduce((sum, o) => sum + (o.revenue || 0), 0);
    const avgVolume = totalVolume / matchingOrders.length;
    const dates = matchingOrders.map((o) => o.date).sort();
    const firstOrder = dates[0];
    const lastOrder = dates[dates.length - 1];

    const firstDate = parseISO(firstOrder.slice(0, 10));
    const refDate = asOf ? parseISO(asOf.slice(0, 10)) : new Date();
    const daysSinceFirst = Math.max(1, differenceInCalendarDays(refDate, firstDate));
    const activeMonths = Math.max(1, daysSinceFirst / 30.44);
    const avgBottlesPerMonth = totalVolume / activeMonths;

    return {
      orderCount: matchingOrders.length,
      totalVolume,
      totalRevenue,
      avgVolume,
      avgBottlesPerMonth,
      firstOrder,
      lastOrder,
    };
  }, [matchingOrders, asOf]);

  return (
    <Dialog open={Boolean(selection)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(54rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {selection ? (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal text-xs">
                  <Package className="mr-1 size-3.5" />
                  Product Orders Breakdown
                </Badge>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {selection.accountName}
                </span>
              </div>
              <DialogTitle className="font-heading mt-1 text-2xl">
                {selection.product}
              </DialogTitle>
              <DialogDescription>
                Detailed order volume and history for {selection.accountName} purchasing{" "}
                <span className="font-medium text-foreground">{selection.product}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {summary ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Layers className="size-3.5 text-primary" />
                      Total Volume
                    </div>
                    <div className="mt-1 font-heading text-xl font-bold tabular-nums">
                      {formatNumber(summary.totalVolume)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {summary.totalVolume === 1 ? "bottle" : "bottles"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Avg {formatNumber(summary.avgVolume, 1)} btls / order
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TrendingUp className="size-3.5 text-primary" />
                      Avg Bottles / Month
                    </div>
                    <div className="mt-1 font-heading text-xl font-bold tabular-nums">
                      {formatNumber(
                        summary.avgBottlesPerMonth,
                        summary.avgBottlesPerMonth % 1 === 0 ? 0 : 1,
                      )}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        btls / mo
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Across {summary.orderCount} order{summary.orderCount === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="size-3.5 text-primary" />
                      Last Ordered
                    </div>
                    <div className="mt-1 font-heading text-lg font-semibold">
                      {formatDate(summary.lastOrder)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      First: {formatDate(summary.firstOrder)}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Package className="size-3.5 text-primary" />
                      Order Events
                    </div>
                    <div className="mt-1 font-heading text-xl font-bold tabular-nums">
                      {summary.orderCount}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Purchase occurrences
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="font-heading text-base font-semibold">
                    Order history ({sortedOrders.length} order{sortedOrders.length === 1 ? "" : "s"})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSortDirection((d) => (d === "desc" ? "asc" : "desc"))}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  >
                    <ArrowUpDown className="size-3" />
                    Sort: {sortDirection === "desc" ? "Newest first" : "Oldest first"}
                  </button>
                </div>

                {sortedOrders.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No individual orders found matching this account and product.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="w-[30%]">Order Date</TableHead>
                          <TableHead className="text-right">Volume (Bottles)</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Price / Bottle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedOrders.map((order, index) => {
                          const unitPrice =
                            order.cases > 0 && order.revenue > 0
                              ? order.revenue / order.cases
                              : null;

                          return (
                            <TableRow key={order.id || `${order.date}-${index}`}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                                  <span>{formatDate(order.date)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="inline-flex items-center justify-end font-semibold text-foreground tabular-nums">
                                  {formatNumber(order.cases || 0)}
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                                    {(order.cases || 0) === 1 ? "btl" : "btls"}
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {order.revenue ? formatMoney(order.revenue) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {unitPrice ? formatMoney(unitPrice) : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
