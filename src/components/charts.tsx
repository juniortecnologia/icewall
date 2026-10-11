"use client";
import type { ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];

const axis = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false, axisLine: false } as const;

/** Série temporal de uma medida só (sem legenda: o título nomeia a série). */
export function TimeChart<T extends { ts: number }>({
  data,
  dataKey,
  format,
  domain,
  height = 150,
  color = "var(--ice)",
  label,
}: {
  data: T[];
  dataKey: keyof T & string;
  format: (v: number) => string;
  domain?: [number | "auto", number | "auto"];
  height?: number;
  color?: string;
  label: string;
}) {
  const spanH = data.length > 1 ? (data[data.length - 1].ts - data[0].ts) / 3_600_000 : 0;
  const tick = (ts: number) =>
    spanH > 30
      ? new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
      : new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const id = `g-${dataKey}`;
  return (
    <div style={{ height }} aria-label={label} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line-soft)" vertical={false} />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} tickFormatter={tick} minTickGap={40} {...axis} />
          <YAxis width={46} tickFormatter={(v: number) => format(v)} domain={domain ?? ["auto", "auto"]} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)", strokeDasharray: "3 3" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] shadow-lg">
                  <div className="text-ink-3">{new Date(Number(payload[0].payload.ts)).toLocaleString("pt-BR")}</div>
                  <div className="tnum text-ink">
                    {label}: {format(Number(payload[0].value))}
                  </div>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} connectNulls dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais em HTML: rótulo à esquerda, valor em texto (nunca na cor da série). */
export function BarList({
  rows,
  max,
  color = "var(--ice)",
  empty = "Sem dados ainda.",
}: {
  rows: { key: string; label: ReactNode; value: number; display: ReactNode; title?: string }[];
  max?: number;
  color?: string;
  empty?: string;
}) {
  if (!rows.length) return <p className="py-3 text-[13px] text-ink-3">{empty}</p>;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} title={r.title} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: color }} />
          </span>
          <span className="tnum text-ink">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
