import { format, parseISO } from "date-fns";
import type { AccountType, ReportKind, RiskLevel } from "./types";

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatFrequencyDeltaDays(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value === 0) return "Unchanged";
  const days = Math.abs(value);
  if (value < 0) return `Shortened ${days} day${days === 1 ? "" : "s"}`;
  return `Lengthened ${days} day${days === 1 ? "" : "s"}`;
}

export function frequencyDeltaTone(value: number | null): "shortened" | "lengthened" | "neutral" | "unknown" {
  if (value === null || Number.isNaN(value)) return "unknown";
  if (value < 0) return "shortened";
  if (value > 0) return "lengthened";
  return "neutral";
}

export function formatPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function formatDays(days: number | null): string {
  if (days === null) return "No date";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function formatOrderFrequency(days: number | null): string {
  if (days === null) return "—";
  if (days === 1) return "Daily";
  if (days < 14) return `Every ${days} days`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "Every week" : `Every ${weeks} weeks`;
  }
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? "Every month" : `Every ${months} months`;
}

export function formatIntervalDays(days: number | null): string {
  if (days === null) return "—";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function riskLabel(risk: RiskLevel): string {
  switch (risk) {
    case "critical":
      return "Critical";
    case "at_risk":
      return "At risk";
    case "dormant":
      return "Dormant";
    case "healthy":
      return "Healthy";
  }
}

export function accountTypeLabel(type: AccountType): string {
  switch (type) {
    case "restaurant":
      return "Restaurant";
    case "hotel":
      return "Hotel";
    case "bar":
      return "Bar";
    case "club":
      return "Club";
    case "other":
      return "Other";
  }
}

export function reportKindLabel(kind: ReportKind): string {
  switch (kind) {
    case "snapshot":
      return "account snapshot";
    case "orders":
      return "order";
    case "visits":
      return "visit";
    case "accounts":
      return "account";
  }
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
