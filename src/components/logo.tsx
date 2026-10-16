import { cn } from "@/lib/utils";

// Brand colors of the logo (the UI theme keeps its own tokens, see docs/design-tokens.md).
const NAVY = "#25305F";
const MINT = "#7ADBA9";

/** The mark only (chat bubble + receipt + coin). Hand-built SVG, same artwork as public/logo.svg. */
function Mark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      viewBox="375 185 1170 1170"
      width={size}
      height={size}
      role="img"
      aria-label="จดตังค์ (JodTang)"
      className={cn("shrink-0", className)}
    >
      <path
        fill={NAVY}
        d="M965 315C650 315 440 530 440 770C440 930 500 1040 575 1085C570 1140 550 1180 530 1205C520 1222 535 1225 555 1225C620 1225 680 1205 705 1175C780 1210 870 1225 965 1225Z"
      />
      <path fill={MINT} d="M965 315H1400A90 90 0 0 1 1490 405V1135A90 90 0 0 1 1400 1225H965Z" />
      <g fill="none" stroke={NAVY} strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1075 490H1385" />
        <path d="M1075 622H1385" />
        <path d="M1075 755H1385" />
        <path d="M1075 885H1385" />
        <path d="M1262 1075L1300 1118L1402 1018" strokeWidth="30" />
      </g>
      <circle cx="965" cy="770" r="258" fill={NAVY} />
      <circle cx="965" cy="770" r="246" fill="#FBD34F" />
      <path fill="#EFB02A" d="M1139 596A246 246 0 0 1 791 944Z" />
      <circle cx="965" cy="770" r="186" fill="none" stroke="#D9A021" strokeWidth="14" />
      <text
        x="965"
        y="858"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="250"
        fontWeight="800"
        fill="#C98A12"
      >
        $
      </text>
    </svg>
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
        <span style={{ color: MINT }}>Tang</span>
      </p>
    </div>
  );
}
