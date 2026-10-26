import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pill-style tab selector used by the analytics page. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 flex-1 rounded-2xl border text-sm font-medium",
            value === o.value
              ? "border-primary bg-primary-soft text-primary"
              : "border-border bg-surface text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
