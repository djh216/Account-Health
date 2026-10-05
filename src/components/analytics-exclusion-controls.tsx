"use client";

import { Building2, PackageX, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { useClosedBusinessAccounts } from "@/hooks/use-closed-business-accounts";
import { outOfStockProductId } from "@/lib/out-of-stock-products";
import { closedBusinessAccountId } from "@/lib/closed-business-accounts";
import { cn } from "@/lib/utils";

export function ExcludeProductOutOfStockButton({
  productName,
  className,
  onExcluded,
}: {
  productName: string;
  className?: string;
  onExcluded?: (productName: string) => void;
}) {
  const { mark } = useOutOfStockProducts();

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={cn("no-print gap-1", className)}
      onClick={(event) => {
        event.stopPropagation();
        mark({ id: outOfStockProductId(productName), productName });
        onExcluded?.(productName);
      }}
      title={`Remove ${productName} from analytics (out of stock)`}
    >
      <PackageX className="size-3" />
      <span className="hidden sm:inline">Out of stock</span>
    </Button>
  );
}

export function ExcludeAccountClosedButton({
  accountName,
  accountId,
  className,
  onExcluded,
}: {
  accountName: string;
  accountId?: string;
  className?: string;
  onExcluded?: (accountName: string) => void;
}) {
  const { mark } = useClosedBusinessAccounts();

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={cn("no-print gap-1", className)}
      onClick={(event) => {
        event.stopPropagation();
        mark({
          id: accountId ?? closedBusinessAccountId(accountName),
          accountName,
        });
        onExcluded?.(accountName);
      }}
      title={`Remove ${accountName} from analytics (closed business)`}
    >
      <Building2 className="size-3" />
      <span className="hidden sm:inline">Closed</span>
    </Button>
  );
}

export function ExcludedProductsPanel({
  onRestore,
  className,
}: {
  onRestore?: (productName: string) => void;
  className?: string;
}) {
  const { marks, restore } = useOutOfStockProducts();
  if (marks.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-3", className)}>
      <p className="text-xs font-semibold text-muted-foreground">
        Out of stock — hidden from wine lists ({marks.length})
      </p>
      <ul className="mt-2 space-y-1.5">
        {marks.map((mark) => (
          <li
            key={mark.id}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="min-w-0 break-words font-medium text-foreground">{mark.productName}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 shrink-0 gap-1"
              onClick={() => {
                restore(mark.id);
                onRestore?.(mark.productName);
              }}
            >
              <RotateCcw className="size-3" />
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExcludedAccountsPanel({
  onRestore,
  className,
}: {
  onRestore?: (accountName: string) => void;
  className?: string;
}) {
  const { marks, restore } = useClosedBusinessAccounts();
  if (marks.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-3", className)}>
      <p className="text-xs font-semibold text-muted-foreground">
        Closed business — hidden from account lists ({marks.length})
      </p>
      <ul className="mt-2 space-y-1.5">
        {marks.map((mark) => (
          <li
            key={mark.id}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="min-w-0 break-words font-medium text-foreground">{mark.accountName}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 shrink-0 gap-1"
              onClick={() => {
                restore(mark.id);
                onRestore?.(mark.accountName);
              }}
            >
              <RotateCcw className="size-3" />
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
