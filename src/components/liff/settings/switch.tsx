import { cn } from "@/lib/utils";

/** The on/off switch used in the settings lists. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name, e.g. "เปิดเตือนจดประจำวัน". */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-surface shadow transition-all",
          checked ? "left-[23px]" : "left-[3px]",
        )}
      />
    </button>
  );
}
