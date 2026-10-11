"use client";

import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  BookUser,
  Grape,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { CustomerFacts } from "@/components/customer-facts";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  customerCsvTemplate,
  customerSearchText,
  parseCustomerCsv,
  type CustomerParseSuccess,
  type CustomerRecord,
} from "@/lib/customer-directory";
import { useCustomerDirectory } from "@/hooks/use-customer-directory";

type GapFilter = "all" | "missing-phone" | "missing-email" | "missing-delivery";
type SortKey = "name" | "territory" | "lid";

const GAP_OPTIONS: Array<{ value: GapFilter; label: string }> = [
  { value: "all", label: "All accounts" },
  { value: "missing-phone", label: "Missing phone" },
  { value: "missing-email", label: "Missing email" },
  { value: "missing-delivery", label: "Missing delivery notes" },
];

export function CustomerDirectory({ initialQuery = "" }: { initialQuery?: string }) {
  const { directory, hydrated, replace, clear } = useCustomerDirectory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [territory, setTerritory] = useState("all");
  const [gap, setGap] = useState<GapFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<CustomerParseSuccess | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const territories = useMemo(() => {
    const names = new Set<string>();
    for (const customer of directory.customers) {
      if (customer.territory) names.add(customer.territory);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [directory.customers]);

  const stats = useMemo(() => {
    const customers = directory.customers;
    return {
      accounts: customers.length,
      territories: new Set(customers.map((customer) => customer.territory).filter(Boolean)).size,
      missingPhone: customers.filter((customer) => customer.phones.length === 0 && !customer.phonesRaw).length,
      missingEmail: customers.filter((customer) => customer.emails.length === 0 && !customer.emailsRaw).length,
      missingDelivery: customers.filter((customer) => !customer.deliveryInstructions).length,
    };
  }, [directory.customers]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = directory.customers.filter((customer) => {
      if (territory !== "all" && customer.territory !== territory) return false;
      if (gap === "missing-phone" && (customer.phones.length > 0 || customer.phonesRaw)) return false;
      if (gap === "missing-email" && (customer.emails.length > 0 || customer.emailsRaw)) return false;
      if (gap === "missing-delivery" && customer.deliveryInstructions) return false;
      if (needle && !customerSearchText(customer).includes(needle)) return false;
      return true;
    });

    const direction = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }) * direction;
    });
    return rows;
  }, [directory.customers, gap, query, sortDir, sortKey, territory]);

  const selected = directory.customers.find((customer) => customer.id === selectedId) ?? null;
  const uploadedLabel = formatUploadedAt(directory.uploadedAt);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir("asc");
  }

  async function importFile(file: File) {
    setError(null);
    setNotice(null);
    if (!file.name.toLowerCase().endsWith(".csv") && file.type && !file.type.includes("csv") && !file.type.startsWith("text/")) {
      setError("Upload a CSV export. In Outfield, export the account list as CSV.");
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const result = parseCustomerCsv(file.name, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (directory.customers.length > 0) {
        setPending(result);
        return;
      }
      await applyImport(result);
    } catch {
      setError("That file could not be read. Export the account list as CSV and try again.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function applyImport(result: CustomerParseSuccess) {
    await replace(result.directory);
    setWarnings(result.warnings);
    setPending(null);
    setSelectedId(null);
    setNotice(
      `Saved ${result.directory.customers.length} account${result.directory.customers.length === 1 ? "" : "s"} from ${result.directory.sourceFileName ?? "the CSV"}.`,
    );
  }

  function downloadTemplate() {
    const blob = new Blob([customerCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "outfield-accounts-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-primary/15 bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Grape className="size-5" />
                <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                  Wine distribution · customer directory
                </p>
              </div>
              <h1 className="font-heading mt-1 text-3xl tracking-tight sm:text-4xl">
                Customer accounts
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Upload an Outfield account export to keep names, phone numbers, emails,
                delivery instructions, location IDs, and territories in one searchable directory.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                CSV template
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!hydrated || directory.customers.length === 0}
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 data-icon="inline-start" />
                Clear directory
              </Button>
              <Button type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}>
                <Upload data-icon="inline-start" />
                {importing ? "Reading file…" : "Upload CSV"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Upload customer CSV"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </div>
          </div>
          <SiteNav />
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void importFile(file);
        }}
      >
        {dragging ? (
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/6 px-4 py-3 text-sm">
            Drop the account CSV to import it.
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-primary/20 bg-primary/8 px-4 py-3 text-sm">{notice}</div>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        {!hydrated ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-2xl">Loading customer directory</CardTitle>
              <CardDescription>Reading accounts saved in this browser.</CardDescription>
            </CardHeader>
          </Card>
        ) : directory.customers.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardHeader className="items-center text-center">
              <BookUser className="mb-2 size-10 text-muted-foreground" />
              <CardTitle className="font-heading text-2xl">No customer accounts yet</CardTitle>
              <CardDescription className="max-w-lg">
                Upload a CSV with Name, Phone Numbers, Emails, Delivery Instructions (Places),
                LID (Places), and Territory (Places). The directory stays in this browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center gap-2">
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                Upload CSV
              </Button>
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                Download template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Accounts" value={String(stats.accounts)} detail={uploadedLabel ? `Uploaded ${uploadedLabel}` : directory.sourceFileName ?? undefined} />
              <StatCard label="Territories" value={String(stats.territories)} detail={directory.sourceFileName ?? undefined} />
              <FilterStat label="Missing phone" value={stats.missingPhone} active={gap === "missing-phone"} onClick={() => setGap(gap === "missing-phone" ? "all" : "missing-phone")} />
              <FilterStat label="Missing email" value={stats.missingEmail} active={gap === "missing-email"} onClick={() => setGap(gap === "missing-email" ? "all" : "missing-email")} />
              <FilterStat label="Missing delivery notes" value={stats.missingDelivery} active={gap === "missing-delivery"} onClick={() => setGap(gap === "missing-delivery" ? "all" : "missing-delivery")} />
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, email, LID, territory, or delivery notes"
                  aria-label="Search customers"
                  className="pl-8"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Territory
                <select
                  value={territory}
                  aria-label="Filter by territory"
                  onChange={(event) => setTerritory(event.target.value)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground"
                >
                  <option value="all">All territories</option>
                  {territories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Show
                <select
                  value={gap}
                  aria-label="Filter by missing fields"
                  onChange={(event) => setGap(event.target.value as GapFilter)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground"
                >
                  {GAP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-sm text-muted-foreground">
              Showing {filtered.length} of {directory.customers.length} accounts
              {directory.sourceFileName ? ` from ${directory.sourceFileName}` : ""}.
            </p>

            <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <div className="max-h-[calc(100vh-18rem)] overflow-auto">
                <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
                    <tr>
                      <SortHeader label="Account" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                      <SortHeader label="Territory" active={sortKey === "territory"} dir={sortDir} onClick={() => toggleSort("territory")} />
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Delivery instructions</th>
                      <SortHeader label="LID" active={sortKey === "lid"} dir={sortDir} onClick={() => toggleSort("lid")} />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                          No accounts match this search.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((customer) => (
                        <tr
                          key={customer.id}
                          tabIndex={0}
                          className="cursor-pointer border-t border-border/80 hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                          onClick={() => setSelectedId(customer.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedId(customer.id);
                            }
                          }}
                        >
                          <td className="px-3 py-2.5 font-medium">{customer.name}</td>
                          <td className="px-3 py-2.5">{customer.territory || "—"}</td>
                          <td className="px-3 py-2.5">
                            {customer.phones[0]?.display ?? (customer.phonesRaw || "—")}
                            {customer.phones.length > 1 ? (
                              <span className="text-muted-foreground"> +{customer.phones.length - 1}</span>
                            ) : null}
                          </td>
                          <td className="max-w-56 truncate px-3 py-2.5">
                            {customer.emails[0] ?? (customer.emailsRaw || "—")}
                            {customer.emails.length > 1 ? (
                              <span className="text-muted-foreground"> +{customer.emails.length - 1}</span>
                            ) : null}
                          </td>
                          <td className="max-w-md px-3 py-2.5">
                            <span className="line-clamp-2 text-muted-foreground">
                              {customer.deliveryInstructions || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                            {customer.lid || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl">{selected.name}</DialogTitle>
                <DialogDescription>
                  Account contact and delivery details from the uploaded customer file.
                </DialogDescription>
              </DialogHeader>
              <CustomerFacts customer={selected} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace the customer directory?</DialogTitle>
            <DialogDescription>
              {pending?.directory.sourceFileName ?? "This file"} has {pending?.directory.customers.length ?? 0} accounts.
              It will replace the {directory.customers.length} accounts already saved in this browser.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pending) void applyImport(pending);
              }}
            >
              Replace directory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the customer directory?</DialogTitle>
            <DialogDescription>
              This removes {directory.customers.length} saved accounts from this browser. Upload the CSV again to restore them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void clear().then(() => {
                  setConfirmClear(false);
                  setSelectedId(null);
                  setWarnings([]);
                  setNotice("Customer directory cleared.");
                });
              }}
            >
              Clear directory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-heading text-2xl tabular-nums">{value}</CardTitle>
        {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
      </CardHeader>
    </Card>
  );
}

function FilterStat({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card size="sm" className={active ? "ring-2 ring-primary" : "hover:bg-muted/40"}>
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="font-heading text-2xl tabular-nums">{value}</CardTitle>
          <p className="text-xs text-muted-foreground">{active ? "Filter on" : "Click to filter"}</p>
        </CardHeader>
      </Card>
    </button>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button type="button" className="inline-flex items-center gap-1" onClick={onClick}>
        {label}
        <span className="text-xs text-muted-foreground">{active ? (dir === "asc" ? "↑" : "↓") : ""}</span>
      </button>
    </th>
  );
}

function sortValue(customer: CustomerRecord, key: SortKey): string {
  if (key === "territory") return customer.territory;
  if (key === "lid") return customer.lid;
  return customer.name;
}

function formatUploadedAt(value: string | null): string | null {
  if (!value) return null;
  try {
    return format(parseISO(value), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return null;
  }
}
