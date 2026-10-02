import dynamic from "next/dynamic";
import { DashboardPageLoading } from "@/components/page-loading";

const OrderAnalyticsDashboard = dynamic(
  () =>
    import("@/components/order-analytics-dashboard").then(
      (module) => module.OrderAnalyticsDashboard,
    ),
  { loading: () => <DashboardPageLoading label="Order analytics" /> },
);

export default function OrdersPage() {
  return <OrderAnalyticsDashboard />;
}
