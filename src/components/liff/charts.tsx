"use client";

/**
 * Recharts lives only in this file so the analytics pages can load it lazily
 * (next/dynamic): the other pages never download the charting library.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBaht } from "@/lib/money";
import { sliceColor } from "@/components/liff/slice-color";

export const INCOME_FILL = "#059669"; // bars: graphical objects need 3:1, which this meets
export const EXPENSE_FILL = "#E11D48";
const LINE = "#0F766E";

const compact = (baht: number) => {
  const abs = Math.abs(baht);
  const sign = baht < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`;
  return `${sign}${abs}`;
};

const money = (v: unknown) => `฿${formatBaht(Math.round(Number(v) * 100))}`;

export interface FlowPoint {
  label: string;
  income: number; // baht, for drawing only
  expense: number;
}

export function FlowBarChart({ data }: { data: FlowPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.25} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={compact} />
          <Tooltip formatter={(v, name) => [money(v), name === "income" ? "รายรับ" : "รายจ่าย"]} />
          <Bar dataKey="income" fill={INCOME_FILL} radius={[6, 6, 0, 0]} />
          <Bar dataKey="expense" fill={EXPENSE_FILL} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DonutSlice {
  key: string;
  name: string;
  value: number; // baht
  color: string | null;
}

export function CategoryDonutChart({ slices }: { slices: DonutSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          innerRadius={56}
          outerRadius={86}
          paddingAngle={2}
          stroke="none"
        >
          {slices.map((s, i) => (
            <Cell key={s.key} fill={sliceColor(s.color, i)} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export interface SavingsPoint {
  label: string;
  net: number; // baht kept in the period
  total: number; // baht kept so far
}

export function SavingsChart({ points }: { points: SavingsPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.25} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={compact} />
          <Tooltip formatter={(v, name) => [money(v), name === "net" ? "เก็บได้" : "เก็บสะสม"]} />
          <Bar dataKey="net" radius={[6, 6, 0, 0]}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.net >= 0 ? INCOME_FILL : EXPENSE_FILL} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="total" stroke={LINE} strokeWidth={3} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface GoalPoint {
  label: string;
  total: number; // baht saved so far
}

/** Money saved over time towards a goal, with the target as a dashed line. */
export function GoalChart({ points, target }: { points: GoalPoint[]; target: number }) {
  return (
    <div className="h-48 w-full" role="img" aria-label="กราฟยอดออมสะสม">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.25} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickFormatter={compact}
            domain={[0, Math.max(target, ...points.map((p) => p.total))]}
          />
          <Tooltip formatter={(v) => [money(v), "ออมสะสม"]} />
          <ReferenceLine y={target} stroke={EXPENSE_FILL} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="total" stroke={LINE} strokeWidth={3} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
