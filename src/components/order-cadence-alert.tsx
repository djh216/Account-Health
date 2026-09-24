"use client";

import { AlertTriangle } from "lucide-react";
import { formatDate, formatOrderFrequency } from "@/lib/format";
import type { OrderCadenceAlertData } from "@/lib/order-cadence";

export type { OrderCadenceAlertData };

export function OrderCadenceAlert({ cadence }: { cadence: OrderCadenceAlertData }) {
  if (!cadence.orderCadenceOverdue) return null;

  const interval = cadence.typicalIntervalDays ?? 28;
  const frequency = formatOrderFrequency(cadence.typicalIntervalDays);

  let detail: string;
  if (cadence.daysSinceOrder === null) {
    detail = `No last order on file. This account typically reorders ${frequency.toLowerCase()}.`;
  } else if (cadence.orderCadenceDaysOverdue !== null) {
    const overdueLabel =
      cadence.orderCadenceDaysOverdue === 1
        ? "1 day"
        : `${cadence.orderCadenceDaysOverdue} days`;
    detail = `Last ordered ${cadence.daysSinceOrder} days ago — usually every ${interval} days (${overdueLabel} past due).`;
  } else {
    detail = `Last ordered ${cadence.daysSinceOrder} days ago — past the typical ${interval}-day cycle.`;
  }

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-amber-950"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Overdue for an order</p>
          <p className="mt-1 text-sm leading-6">{detail}</p>
          {cadence.expectedOrderDate ? (
            <p className="mt-1 text-sm font-medium">
              Expected reorder by {formatDate(cadence.expectedOrderDate)}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
