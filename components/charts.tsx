"use client";

import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { GROUP_COLORS, GROUP_LABELS } from "@/lib/ui/palette";

const SINGLE = "#1a56a4";
const AXIS = { fontSize: 12, fill: "#4a5566" };
const GRID = "#e6ebf1";

const tooltipStyle = {
  contentStyle: { border: "1px solid #d5dce6", borderRadius: 2, fontSize: 12, padding: "6px 10px" },
  labelStyle: { fontWeight: 700, color: "#0f2440", marginBottom: 2 },
  cursor: { fill: "rgba(26,86,164,0.06)" },
};

/** 단일 계열 가로 막대 — 계열·층위 분포 (범례 없음, 제목이 계열을 말함) */
export function DistributionBars({ data, height = 230 }: { data: { key: string; label: string; n: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={118} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v}건`, "건수"]} />
        <Bar dataKey="n" fill={SINGLE} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          <LabelList dataKey="n" position="right" style={{ fontSize: 12, fill: "#1b2430", fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 연도별 출원 추이 — 상태군 누적 막대 */
export function YearTrend({ data }: { data: { year: number; valid: number; pending: number; inactive: number }[] }) {
  const keys = ["valid", "pending", "inactive"] as const;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="year" tick={AXIS} axisLine={{ stroke: "#c3ccd8" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(y) => `${y}년 출원`}
          formatter={(v, name) => [`${v}건`, GROUP_LABELS[name as keyof typeof GROUP_LABELS] ?? name]}
        />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="square"
          iconSize={10}
          height={28}
          formatter={(v) => <span style={{ color: "#4a5566", fontSize: 12 }}>{GROUP_LABELS[v as keyof typeof GROUP_LABELS]}</span>}
        />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="a"
            fill={GROUP_COLORS[k]}
            stroke="#fff"
            strokeWidth={1}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={28}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
