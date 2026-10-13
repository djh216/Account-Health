"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { parseDashboardView, type DashboardViewId } from "@/lib/dashboard-view";
import { cn } from "@/lib/utils";

const LINKS: { view: DashboardViewId; label: string }[] = [
  { view: "insights", label: "Weekly book" },
  { view: "health", label: "Account health" },
  { view: "orders", label: "Orders & tracking" },
  { view: "trends", label: "Sales trends" },
];

export function SiteNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeView = parseDashboardView(searchParams.get("view"));

  useEffect(() => {
    for (const link of LINKS) {
      router.prefetch(`/?view=${link.view}`);
    }
  }, [router]);

  return (
    <nav className="flex flex-wrap gap-1">
      {LINKS.map((link) => {
        const active = activeView === link.view;
        return (
          <Link
            key={link.view}
            href={`/?view=${link.view}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
