"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/hooks/use-portfolio";
import { resetRepFilter } from "@/lib/rep-filter";

export function ClearDataButton({
  onCleared,
  disabled,
  variant = "outline",
}: {
  onCleared?: (message: string) => void;
  disabled?: boolean;
  variant?: "outline" | "ghost" | "destructive";
}) {
  const { reset, state } = usePortfolio();
  const [open, setOpen] = useState(false);

  const hasData =
    state.orders.length > 0 ||
    state.accounts.length > 0 ||
    state.visits.length > 0 ||
    state.reports.length > 0;

  function closeDialog() {
    setOpen(false);
  }

  function confirmClear() {
    reset();
    resetRepFilter();
    closeDialog();
    onCleared?.("All saved accounts, orders, and reports cleared.");
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDialog();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled ?? !hasData}
        onClick={() => setOpen(true)}
      >
        <RotateCcw data-icon="inline-start" />
        Clear
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancel clear"
            className="absolute inset-0 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
            onClick={closeDialog}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-data-title"
            aria-describedby="clear-data-description"
            className="relative z-10 w-full max-w-md space-y-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10"
          >
            <div className="space-y-2">
              <h2 id="clear-data-title" className="font-heading text-base font-medium">
                Clear all saved data?
              </h2>
              <p id="clear-data-description" className="text-sm text-muted-foreground">
                This removes uploaded orders, visit logs, account records, and import
                history from this browser. Your health scores and analytics will reset.
                This cannot be undone.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={confirmClear}>
                Clear everything
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
