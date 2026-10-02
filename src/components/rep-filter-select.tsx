"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RepFilterSelect({
  reps,
  value,
  onValueChange,
  pending = false,
}: {
  reps: string[];
  value: string;
  onValueChange: (value: string) => void;
  pending?: boolean;
}) {
  if (reps.length === 0) return null;

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? "all")}>
      <SelectTrigger
        className={`w-full sm:w-48 ${pending ? "opacity-70" : ""}`}
        aria-busy={pending}
        data-pending={pending ? "" : undefined}
      >
        <SelectValue placeholder="Sales rep" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All sales reps</SelectItem>
        {reps.map((rep) => (
          <SelectItem key={rep} value={rep}>
            {rep}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
