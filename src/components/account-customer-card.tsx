"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CustomerFacts } from "@/components/customer-facts";
import { customersMatchingAccountName } from "@/lib/customer-directory";
import { useCustomerDirectory } from "@/hooks/use-customer-directory";

export function AccountCustomerCard({ accountName }: { accountName: string }) {
  const { directory, hydrated } = useCustomerDirectory();
  const matches = useMemo(
    () => (hydrated ? customersMatchingAccountName(directory, accountName) : []),
    [directory, hydrated, accountName],
  );

  if (matches.length === 0) return null;

  const directoryQuery = matches[0].lid || matches[0].name;

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          Delivery & contacts
        </p>
        <Link
          href={`/customers?q=${encodeURIComponent(directoryQuery)}`}
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Open in directory
        </Link>
      </div>
      <div className="mt-3 space-y-5">
        {matches.map((customer) => (
          <div key={customer.id}>
            {matches.length > 1 ? (
              <p className="mb-2 text-sm font-medium">{customer.name}</p>
            ) : null}
            <CustomerFacts customer={customer} />
          </div>
        ))}
      </div>
    </section>
  );
}
