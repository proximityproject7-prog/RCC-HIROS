"use client";

// ═══════════════════════════════════════════════════════════════
// Attendance Trends — present-rate line + daily clocked-in vs
// no-clock-in bars + per-department bars, built from the existing
// /api/reports/attendance byDate/byGroup series (no backend work).
// Follows the selected groups + dates (table-only role/search
// filters do not apply — noted in the caption).
// ═══════════════════════════════════════════════════════════════

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface TrendDay {
  date: string;
  total: number;
  clockedIn: number;
  absent: number;
  expected: number;
}

export interface TrendGroup {
  groupCode: string;
  groupName: string;
  total: number;
  clockedIn: number;
  absent: number;
  expected: number;
}

const BROWN = "#6B4A30";
const GOLD = "#D4A017";
const SAGE = "#7D9B6A";
const CLAY = "#C08552";

export function AttendanceTrends({
  byDate,
  byGroup,
}: {
  byDate: TrendDay[];
  byGroup: TrendGroup[];
}) {
  const daily = useMemo(
    () =>
      byDate.map((d) => ({
        ...d,
        short: d.date.slice(5),
        presentRate: d.expected > 0 ? Math.round((d.clockedIn / d.expected) * 100) : 0,
      })),
    [byDate]
  );

  if (byDate.length === 0) return null;

  return (
    <div className="bg-rcc-surface rounded-lg border border-rcc-border p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-rcc-text-primary uppercase tracking-wide">
          Attendance Trends
        </h2>
        <span className="text-xs text-rcc-text-muted">
          Selected groups + dates, hire-aware roster denominator (table-only role/search filters excluded)
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily present rate + volumes */}
        <div>
          <p className="text-xs font-semibold text-rcc-text-secondary mb-2">
            Daily presence — clocked-in vs absent incl. no record (bars) and present rate % of expected roster (line)
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rcc-border)" />
                <XAxis dataKey="short" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="count" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  formatter={(value: number | string, name: string) =>
                    name === "presentRate" ? [`${value}%`, "Present rate"] : [value, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="count" dataKey="clockedIn" name="Clocked in" fill={SAGE} radius={[2, 2, 0, 0]} />
                <Bar yAxisId="count" dataKey="absent" name="Absent" fill={CLAY} radius={[2, 2, 0, 0]} />
                <Line yAxisId="rate" type="monotone" dataKey="presentRate" name="Present rate" stroke={BROWN} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-department comparison */}
        <div>
          <p className="text-xs font-semibold text-rcc-text-secondary mb-2">
            By department — clocked-in vs absent records
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGroup} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rcc-border)" />
                <XAxis dataKey="groupCode" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="clockedIn" name="Clocked in" fill={BROWN} radius={[2, 2, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill={GOLD} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
