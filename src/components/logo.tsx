import { cn } from "@/lib/utils";

/** The mascot (public/logo.png, also the picture on the LINE cards). `size` is the box it fits in. */
function Mark({ size, className }: { size: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="จดตังค์ (JodTang)"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/** Logo with an optional "JodTang" wordmark under the mark. */
export function Logo({
  size = 96,
  withWordmark = false,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  if (!withWordmark) return <Mark size={size} className={className} />;
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <Mark size={size} />
      <p className="text-2xl font-bold tracking-tight" aria-hidden>
        <span className="text-foreground">Jod</span>
        <span className="text-primary">Tang</span>
      </p>
    </div>
  );
}
