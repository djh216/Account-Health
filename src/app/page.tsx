import dynamic from "next/dynamic";
import { DashboardPageLoading } from "@/components/page-loading";

const Dashboard = dynamic(
  () => import("@/components/dashboard").then((module) => module.Dashboard),
  { loading: () => <DashboardPageLoading label="Account health" /> },
);

export default function Home() {
  return <Dashboard />;
}
