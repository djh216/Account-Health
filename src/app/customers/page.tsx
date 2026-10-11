import type { Metadata } from "next";
import { CustomerDirectory } from "@/components/customer-directory";

export const metadata: Metadata = {
  title: "Customer directory — Cellar Pulse",
  description:
    "Search wine account contacts, delivery instructions, location IDs, and territories from an Outfield CSV export.",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;
  return <CustomerDirectory initialQuery={query ?? ""} />;
}
