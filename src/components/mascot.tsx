import { cn } from "@/lib/utils";

export type MascotMood = "smile" | "surprised" | "cheer" | "sleepy" | "thanks" | "thinking";

const INK = "#0F172A";
const COIN = "#FDE68A";
const COIN_EDGE = "#F59E0B";
const HAT = "#0F766E";

function Face({ mood }: { mood: MascotMood }) {
  const stroke = { stroke: INK, strokeWidth: 3.5, strokeLinecap: "round" as const, fill: "none" };
  switch (mood) {
    case "surprised":
      return (
        <g>
          <circle cx="47" cy="68" r="5" fill={INK} />
          <circle cx="73" cy="68" r="5" fill={INK} />
          <ellipse cx="60" cy="86" rx="5.5" ry="7" fill={INK} />
        </g>
      );
    case "cheer":
      return (
        <g>
          <path d="M41 70 Q47 60 53 70" {...stroke} />
          <path d="M67 70 Q73 60 79 70" {...stroke} />
          <path d="M46 80 Q60 98 74 80 Z" fill={INK} />
          <path d="M96 40 l6 -6 M100 54 h8 M24 40 l-6 -6" {...stroke} stroke={COIN_EDGE} />
        </g>
      );
    case "sleepy":
      return (
        <g>
          <path d="M41 68 H53" {...stroke} />
          <path d="M67 68 H79" {...stroke} />
          <path d="M53 84 H67" {...stroke} />
          <text x="88" y="42" fontSize="16" fontWeight="700" fill={HAT}>
            z
          </text>
        </g>
      );
    case "thanks":
      return (
        <g>
          <path d="M41 70 Q47 62 53 70" {...stroke} />
          <path d="M67 70 Q73 62 79 70" {...stroke} />
          <path d="M48 81 Q60 92 72 81" {...stroke} />
          <circle cx="38" cy="80" r="5" fill={COIN_EDGE} opacity="0.35" />
          <circle cx="82" cy="80" r="5" fill={COIN_EDGE} opacity="0.35" />
        </g>
      );
    case "thinking":
      return (
        <g>
          <circle cx="47" cy="68" r="4" fill={INK} />
          <circle cx="73" cy="68" r="4" fill={INK} />
          <path d="M52 84 Q60 80 68 84" {...stroke} />
          <circle cx="92" cy="46" r="3" fill={HAT} />
          <circle cx="100" cy="36" r="4.5" fill={HAT} />
        </g>
      );
    case "smile":
    default:
      return (
        <g>
          <circle cx="47" cy="68" r="4" fill={INK} />
          <circle cx="73" cy="68" r="4" fill={INK} />
          <path d="M46 80 Q60 92 74 80" {...stroke} />
        </g>
      );
  }
}

/** น้องตัง — a round coin with a calm face and a small hat. Flat vector, hand-built SVG. */
export function Mascot({
  mood = "smile",
  size = 96,
  className,
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="น้องตัง"
      className={cn("shrink-0", className)}
    >
      <circle cx="60" cy="70" r="40" fill={COIN} stroke={COIN_EDGE} strokeWidth="5" />
      {/* hat */}
      <path d="M38 40 Q60 10 82 40 Z" fill={HAT} />
      <rect x="32" y="38" width="56" height="8" rx="4" fill={HAT} />
      <circle cx="60" cy="16" r="4" fill={COIN_EDGE} />
      <Face mood={mood} />
    </svg>
  );
}
