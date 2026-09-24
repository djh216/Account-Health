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
}: {
  reps: string[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  if (reps.length === 0) return null;

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? "all")}>
      <SelectTrigger className="w-full sm:w-48">
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
