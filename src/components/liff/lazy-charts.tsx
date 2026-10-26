"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/liff/states";

const Loading = () => <Skeleton className="h-56 w-full" />;

/** Chart components, loaded on demand (the charting library is the heaviest dependency). */
export const FlowBarChart = dynamic(
  () => import("@/components/liff/charts").then((m) => m.FlowBarChart),
  { ssr: false, loading: Loading },
);

export const CategoryDonutChart = dynamic(
  () => import("@/components/liff/charts").then((m) => m.CategoryDonutChart),
  { ssr: false, loading: Loading },
);

export const SavingsChart = dynamic(
  () => import("@/components/liff/charts").then((m) => m.SavingsChart),
  { ssr: false, loading: Loading },
);

export const GoalChart = dynamic(
  () => import("@/components/liff/charts").then((m) => m.GoalChart),
  { ssr: false, loading: Loading },
);

export const MiniBarChart = dynamic(
  () => import("@/components/liff/charts").then((m) => m.MiniBarChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);
