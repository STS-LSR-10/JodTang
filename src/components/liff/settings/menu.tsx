import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A heading above a group of menu rows ("สมาชิก", "ทั่วไป"). */
export function MenuHeading({ children }: { children: ReactNode }) {
  return <h2 className="px-2 pt-2 text-[13px] font-semibold text-muted">{children}</h2>;
}

/** Rows in one rounded card, divided by lines. */
export function MenuGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      {children}
    </ul>
  );
}

interface RowProps {
  icon: ReactNode;
  title: string;
  sub?: string;
  /** A short value on the right ("ไทย", "บาท (฿)"). */
  value?: string;
  /** Something on the right before the arrow (a small "+ เพิ่ม" tag). */
  badge?: ReactNode;
  /** Tint of the icon tile: the default green, or the warm one for upgrades. */
  tone?: "primary" | "warm";
  ariaLabel?: string;
}

function RowBody({
  icon,
  title,
  sub,
  value,
  badge,
  tone = "primary",
  chevron,
}: RowProps & { chevron: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
          tone === "warm" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {sub ? <span className="block text-xs text-muted">{sub}</span> : null}
      </span>
      {value ? <span className="shrink-0 text-sm font-medium text-muted">{value}</span> : null}
      {badge ?? null}
      {chevron ? <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
}

const rowClass = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left";

/** A row that goes to another page. */
export function MenuLink({ href, ...row }: RowProps & { href: string }) {
  return (
    <li>
      <Link href={href} aria-label={row.ariaLabel ?? row.title} className={rowClass}>
        <RowBody {...row} chevron />
      </Link>
    </li>
  );
}

/** A row that opens something on this page (a sheet). */
export function MenuButton({ onClick, ...row }: RowProps & { onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={row.ariaLabel ?? row.title}
        className={rowClass}
      >
        <RowBody {...row} chevron />
      </button>
    </li>
  );
}

/** A row that only shows a value (nothing to open). */
export function MenuInfo(row: RowProps) {
  return (
    <li>
      <div className={rowClass}>
        <RowBody {...row} chevron={false} />
      </div>
    </li>
  );
}
