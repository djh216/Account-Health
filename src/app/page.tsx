import { Suspense } from "react";
import { DashboardPageLoading } from "@/components/page-loading";
import { UnifiedDashboard } from "@/components/unified-dashboard";

export default function Home() {
  return (
    <Suspense fallback={<DashboardPageLoading label="Loading Cellar Pulse…" />}>
      <UnifiedDashboard />
    </Suspense>
  );
}
