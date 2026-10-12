"use client";

import dynamic from "next/dynamic";
import { DashboardPageLoading } from "@/components/page-loading";

const UnifiedDashboard = dynamic(
  () => import("@/components/unified-dashboard").then((mod) => mod.UnifiedDashboard),
  {
    ssr: false,
    loading: () => <DashboardPageLoading label="Loading Cellar Pulse…" />,
  },
);

export function HomeDashboardClient() {
  return <UnifiedDashboard />;
}
