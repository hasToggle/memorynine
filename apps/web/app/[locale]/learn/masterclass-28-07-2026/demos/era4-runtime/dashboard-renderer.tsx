"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import { useCallback, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import type { RenderSpec, TableWidget, Widget } from "./render-spec";

const SERIES_COLORS = ["var(--color-ht-cyan-500)", "var(--color-foreground)"];

function BarBlock({ widget }: { widget: Extract<Widget, { kind: "bar" }> }) {
  return (
    <ChartContainer className="h-64 w-full" config={{}}>
      <BarChart data={widget.data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis hide type="number" />
        <YAxis dataKey="label" tickLine={false} type="category" width={140} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill={SERIES_COLORS[0]} radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

function LineBlock({ widget }: { widget: Extract<Widget, { kind: "line" }> }) {
  // Flatten series into rows keyed by x for recharts.
  const xs = widget.series[0]?.points.map((p) => p.x) ?? [];
  const data = xs.map((x, i) => {
    const row: Record<string, string | number> = { x };
    for (const s of widget.series) {
      row[s.name] = s.points[i]?.y ?? 0;
    }
    return row;
  });
  return (
    <ChartContainer className="h-64 w-full" config={{}}>
      <LineChart data={data} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="x" tickLine={false} />
        <YAxis tickLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {widget.series.map((s, i) => (
          <Line
            dataKey={s.name}
            dot={false}
            key={s.name}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

function TableBlock({ widget }: { widget: TableWidget }) {
  const [desc, setDesc] = useState(true);
  const toggleSort = useCallback(() => setDesc((d) => !d), []);
  const col = widget.sortableColumn ?? -1;
  const rows =
    col >= 0
      ? [...widget.rows].sort((a, b) => {
          const av = Number(a[col]);
          const bv = Number(b[col]);
          return desc ? bv - av : av - bv;
        })
      : widget.rows;
  // Cells are positional, so their identity is the column they sit under.
  const bodyRows = rows.map((row) => ({
    cells: row.map((value, i) => ({
      id: `${row[0]}-${widget.columns[i]}`,
      value,
    })),
    id: String(row[0]),
  }));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-foreground/10 border-b text-left text-muted-foreground">
          {widget.columns.map((c, i) => (
            <th className="py-2 pr-4" key={c}>
              {col === i ? (
                <button onClick={toggleSort} type="button">
                  {c} {desc ? "↓" : "↑"}
                </button>
              ) : (
                c
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bodyRows.map((row) => (
          <tr className="border-foreground/5 border-b" key={row.id}>
            {row.cells.map((cell) => (
              <td className="py-2 pr-4" key={cell.id}>
                {cell.value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DashboardRenderer({ spec }: { spec: RenderSpec }) {
  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">{spec.title}</h3>
      <div className="grid gap-4">
        {spec.widgets.map((w, i) => {
          const key = `${w.kind}-${i}`;
          if (w.kind === "kpi") {
            return (
              <div
                className="rounded-lg border border-foreground/10 p-4"
                key={key}
              >
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  {w.label}
                </div>
                <div className="mt-1 font-semibold text-3xl">
                  {w.delta} {w.value}
                </div>
              </div>
            );
          }
          return (
            <div
              className="rounded-lg border border-foreground/10 p-4"
              key={key}
            >
              {"title" in w && w.title ? (
                <div className="mb-3 text-muted-foreground text-sm">
                  {w.title}
                </div>
              ) : null}
              {w.kind === "bar" && <BarBlock widget={w} />}
              {w.kind === "line" && <LineBlock widget={w} />}
              {w.kind === "table" && <TableBlock widget={w} />}
            </div>
          );
        })}
      </div>
      {spec.source ? (
        <p className="font-mono text-muted-foreground text-xs">
          source: {spec.source}
        </p>
      ) : null}
    </div>
  );
}
