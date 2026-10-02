import dynamic from "next/dynamic";
import { DashboardPageLoading } from "@/components/page-loading";

const ProductSalesTrendsDashboard = dynamic(
  () =>
    import("@/components/product-sales-trends-dashboard").then(
      (module) => module.ProductSalesTrendsDashboard,
    ),
  { loading: () => <DashboardPageLoading label="Product sales trends" /> },
);

export default function ProductsPage() {
  return <ProductSalesTrendsDashboard />;
}
