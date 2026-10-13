import { redirect } from "next/navigation";

export default function OrderAnalyticsPage() {
  redirect("/?view=orders");
}
