// ECharts option builders. Mark specs follow the dataviz skill: 2px lines,
// bars <= 18px with 4px rounded data-ends, hairline solid grid, text in ink
// tokens (never series colours), one y-axis per chart.
import type { EChartsOption, LineSeriesOption, BarSeriesOption } from "echarts";
import type { Point } from "./data";
import { escapeHtml, periodLabel } from "./format";
import type { Tokens } from "./theme";

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Axis ticks drop a trailing ".0": "15.0%" -> "15%". */
const tick = (s: string) => s.replace(/\.0(?=\D*$)/, "");

function tooltipBase(t: Tokens) {
  return {
    backgroundColor: t.surface,
    borderColor: t.border,
    borderWidth: 1,
    padding: [8, 10] as [number, number],
    confine: true,
    textStyle: { color: t.textSecondary, fontFamily: FONT },
    extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,.14);border-radius:8px;",
  };
}

const ttRow = (color: string, value: string, name: string, rect = false) =>
  `<div class="tt-row"><span class="tt-key${rect ? " rect" : ""}" style="background:${color}"></span>` +
  `<strong>${escapeHtml(value)}</strong><span>${escapeHtml(name)}</span></div>`;

// ---------- Line charts ----------

export interface LineSpec {
  name: string;
  points: Point[];
  color: string;
  step?: boolean;
  /** Points on/after this date are drawn dashed as forecasts. */
  forecastFrom?: string | null;
  /** Change on a year earlier at a date, shown in the tooltip. */
  change?: (date: string) => string | undefined;
}

export interface LineOpts {
  series: LineSpec[];
  t: Tokens;
  width: number;
  freq: string;
  yFormat: (v: number) => string;
  band?: [number, number];
  bandLabel?: string;
  breaks?: { date: string; label: string }[];
  events?: { date: string; label: string; short: string }[];
  zeroLine?: boolean;
  endLabels?: boolean;
}

export function lineOption(o: LineOpts): EChartsOption {
  const { t } = o;
  const dates = o.series.flatMap((s) => s.points.map((p) => p[0])).sort();
  const first = dates.length ? Date.parse(dates[0]) : 0;
  const last = dates.length ? Date.parse(dates[dates.length - 1]) : 1;
  const years = (last - first) / 3.15e10;
  const narrow = o.width < 480;

  // Rotated event labels need ~20px each: drop a marker that would sit on top of the previous one.
  // Room on the right for the last value of each line, however long it is once formatted.
  const endPad = o.endLabels
    ? Math.min(96, Math.max(48, ...o.series.map((s) => (o.yFormat(s.points.at(-1)?.[1] ?? 0).length * 7) + 14)))
    : 12;
  const plotPx = Math.max(o.width - 4 - endPad - 30, 1);
  let lastX = -Infinity;
  const shownEvents = (o.events ?? []).filter((e) => {
    const x = ((Date.parse(e.date) - first) / (last - first || 1)) * plotPx;
    if (x - lastX < 20) return false;
    lastX = x;
    return true;
  });
  const out: LineSeriesOption[] = [];
  o.series.forEach((s, i) => {
    const actual = s.forecastFrom ? s.points.filter(([d]) => d < s.forecastFrom!) : s.points;
    const forecast = s.forecastFrom ? s.points.filter(([d]) => d >= s.forecastFrom!) : [];
    const base: LineSeriesOption = {
      type: "line",
      name: s.name,
      showSymbol: false,
      symbolSize: 8,
      step: s.step ? "end" : undefined,
      sampling: "lttb",
      lineStyle: { width: 2, color: s.color, cap: "round", join: "round" },
      itemStyle: { color: s.color, borderColor: t.surface, borderWidth: 2 },
      emphasis: { disabled: true },
      z: 3,
    };
    out.push({
      ...base,
      id: `${s.name}-actual`,
      data: actual,
      endLabel: o.endLabels && !forecast.length
        ? { show: true, formatter: (p) => o.yFormat((p.value as Point)[1]), color: t.textSecondary, fontSize: 12, fontFamily: FONT, distance: 6, minMargin: 4 }
        : undefined,
      labelLayout: o.endLabels ? { moveOverlap: "shiftY" } : undefined,
      markArea: i === 0 && o.band
        ? {
            silent: true,
            itemStyle: { color: t.band },
            label: { show: !!o.bandLabel, formatter: o.bandLabel, position: "insideTopLeft", color: t.textMuted, fontSize: 11, fontFamily: FONT },
            data: [[{ yAxis: o.band[0] }, { yAxis: o.band[1] }]],
          }
        : undefined,
      markLine: i === 0 && (o.breaks?.length || o.events?.length || o.zeroLine)
        ? {
            silent: true,
            symbol: "none",
            lineStyle: { color: t.axis, width: 1, type: "solid" },
            label: { color: t.textMuted, fontSize: 11, fontFamily: FONT },
            data: [
              ...(o.zeroLine ? [{ yAxis: 0, label: { show: false } }] : []),
              ...shownEvents.map((e) => ({
                xAxis: e.date,
                lineStyle: { color: t.axis, width: 1, type: "solid" as const },
                // Near the left edge, put the label on the right of the line so it clears the y-axis numbers.
                label: { show: true, formatter: narrow ? e.short : e.label, position: "insideEndTop" as const, color: t.textMuted, offset: (Date.parse(e.date) - first) / (last - first) < 0.08 ? [0, 22] : [0, 0] },
              })),
              ...(o.breaks ?? []).map((b) => ({
                xAxis: b.date,
                label: { show: true, formatter: narrow ? "New CPI" : b.label, position: "insideEndTop" as const },
              })),
            ],
          }
        : undefined,
    });
    if (forecast.length && actual.length) {
      out.push({
        ...base,
        id: `${s.name}-forecast`,
        data: [actual[actual.length - 1], ...forecast],
        lineStyle: { ...base.lineStyle, type: "dashed" },
        endLabel: o.endLabels
          ? { show: true, formatter: (p) => o.yFormat((p.value as Point)[1]), color: t.textSecondary, fontSize: 12, fontFamily: FONT, distance: 6, minMargin: 4 }
          : undefined,
        labelLayout: o.endLabels ? { moveOverlap: "shiftY" } : undefined,
      });
    }
  });

  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: 4, right: endPad, top: 16, bottom: 4 },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: t.axisMuted,
        hideOverlap: true,
        margin: 14,
        formatter: (v: number) => {
          const d = new Date(v);
          return years > 3 ? String(d.getFullYear()) : d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
        },
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      splitNumber: 4,
      axisLabel: { color: t.axisMuted, formatter: (v: number) => tick(o.yFormat(v)) },
      splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" } },
    },
    tooltip: {
      ...tooltipBase(t),
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: t.axis, width: 1 } },
      formatter: (raw) => {
        const ps = (Array.isArray(raw) ? raw : [raw]) as unknown as { seriesName: string; color: string; value: Point; seriesId: string }[];
        if (!ps.length) return "";
        const seen = new Set<string>();
        const rows = ps
          .filter((p) => !seen.has(p.seriesName) && seen.add(p.seriesName))
          .map((p) => {
            const change = o.series.find((s) => s.name === p.seriesName)?.change?.(p.value[0]);
            return ttRow(p.color, o.yFormat(p.value[1]), p.seriesName + (p.seriesId.endsWith("-forecast") ? " (forecast)" : "")) +
              (change ? `<div class="tt-change">${escapeHtml(change)} vs a year earlier</div>` : "");
          });
        return `<div class="tt"><div class="tt-head">${periodLabel(ps[0].value[0], o.freq)}</div>${rows.join("")}</div>`;
      },
    },
    series: out,
  };
}

// ---------- Horizontal bar lists ----------

export interface BarItem {
  label: string;
  value: number;
  color: string;
  /** Extra tooltip line, e.g. "35% of exports · +11% on last year". */
  extra?: string;
  /** Further tooltip lines: a breakdown or a note on what the bar covers. */
  details?: string[];
  /** What's inside this bar, opened from an arrow beside its name. */
  expand?: { title: string; rows: { label: string; value?: string }[]; note?: string };
}

export interface RefLine {
  value: number;
  label: string;
  position?: "start" | "end";
}

export interface BarOpts {
  items: BarItem[];
  t: Tokens;
  width: number;
  valueFormat: (v: number) => string;
  refLines?: RefLine[];
}

export const barListHeight = (n: number, refLines = 0) => n * 30 + 16 + (refLines ? 36 : 0);

export function barOption(o: BarOpts): EChartsOption {
  const { t } = o;
  const labelWidth = Math.round(Math.min(210, Math.max(100, o.width * 0.44)));
  const hasNeg = o.items.some((i) => i.value < 0);
  const expandable = new Set(o.items.filter((i) => i.expand).map((i) => i.label));
  // Names are cut to fit so the arrow on expandable ones is never the part that gets lost.
  const maxChars = Math.max(8, Math.floor((labelWidth - 8) / 6.4));
  const fit = (s: string) => {
    const room = maxChars - (expandable.has(s) ? 2 : 0);
    const name = s.length > room ? `${s.slice(0, room - 1).trimEnd()}…` : s;
    return expandable.has(s) ? `${name} ▾` : name;
  };
  const plotWidth = Math.max(o.width - labelWidth - 64, 90);
  const data: BarSeriesOption["data"] = o.items.map((i) => ({
    value: i.value,
    name: i.label,
    itemStyle: { color: i.color, borderRadius: i.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] },
    label: { position: i.value >= 0 ? "right" : "left" },
  }));
  const ref = o.refLines ?? [];
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: 4, right: 52, top: ref.length ? 22 : 4, bottom: ref.length ? 18 : 4 },
    // Extra room left of zero (about 46px) so negative value labels fit before the category names.
    xAxis: { type: "value", show: false, min: hasNeg ? (e: { min: number; max: number }) => e.min - (46 * (Math.max(e.max, 0) - e.min)) / (plotWidth - 46) : 0 },
    yAxis: {
      type: "category",
      inverse: true,
      data: o.items.map((i) => i.label),
      triggerEvent: true,
      axisTick: { show: false },
      // With negative bars the names stay at the left edge (not on the zero line) and a
      // separate baseline is drawn at zero, so bars never run into the names.
      axisLine: { show: !hasNeg, onZero: false, lineStyle: { color: t.axis } },
      axisLabel: { color: t.textSecondary, fontSize: 12, width: labelWidth, overflow: "truncate", margin: 8, formatter: fit },
    },
    tooltip: {
      ...tooltipBase(t),
      trigger: "item",
      formatter: (p) => {
        const i = o.items[(p as { dataIndex: number }).dataIndex];
        return `<div class="tt">${ttRow(i.color, o.valueFormat(i.value), i.label, true)}${i.extra ? `<div class="tt-extra">${escapeHtml(i.extra)}</div>` : ""}${i.details?.length ? `<div class="tt-details">${i.details.map((d) => `<div>${escapeHtml(d)}</div>`).join("")}</div>` : ""}</div>`;
      },
    },
    series: [
      {
        type: "bar",
        data,
        barMaxWidth: 18,
        barCategoryGap: "32%",
        label: { show: true, color: t.textSecondary, fontSize: 12, formatter: (p) => o.valueFormat(p.value as number), distance: 6 },
        emphasis: { itemStyle: { opacity: 0.85 } },
        markLine: ref.length || hasNeg
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { color: t.textMuted, width: 1, type: "solid" },
              data: [
                ...(hasNeg ? [{ xAxis: 0, lineStyle: { color: t.axis }, label: { show: false } }] : []),
                ...ref.map((r) => ({
                xAxis: r.value,
                label: {
                  formatter: r.label,
                  position: (r.position === "start" ? "insideStartTop" : "end") as "insideStartTop" | "end",
                  color: t.textSecondary,
                  fontSize: 11,
                  fontFamily: FONT,
                },
              })),
              ],
            }
          : undefined,
      },
    ],
  };
}

// ---------- Grouped horizontal bars (two measures per category) ----------

export interface GroupedOpts {
  categories: string[];
  series: { name: string; values: number[]; color: string }[];
  t: Tokens;
  width: number;
  valueFormat: (v: number) => string;
}

export const groupedHeight = (n: number) => n * 46 + 16;

export function groupedBarOption(o: GroupedOpts): EChartsOption {
  const { t } = o;
  const labelWidth = Math.round(Math.min(160, Math.max(90, o.width * 0.3)));
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: 4, right: 52, top: 4, bottom: 4 },
    xAxis: { type: "value", show: false, min: 0 },
    yAxis: {
      type: "category",
      inverse: true,
      data: o.categories,
      axisTick: { show: false },
      axisLine: { show: true, lineStyle: { color: t.axis } },
      axisLabel: { color: t.textSecondary, fontSize: 12, width: labelWidth, overflow: "truncate", margin: 8 },
    },
    tooltip: {
      ...tooltipBase(t),
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } },
      formatter: (raw) => {
        const ps = (Array.isArray(raw) ? raw : [raw]) as unknown as { dataIndex: number; seriesIndex: number }[];
        const i = ps[0].dataIndex;
        return `<div class="tt"><div class="tt-head">${escapeHtml(o.categories[i])}</div>${o.series
          .map((s) => ttRow(s.color, o.valueFormat(s.values[i]), s.name, true)).join("")}</div>`;
      },
    },
    series: o.series.map((s) => ({
      type: "bar" as const,
      name: s.name,
      data: s.values,
      barMaxWidth: 12,
      barGap: "25%",
      barCategoryGap: "30%",
      itemStyle: { color: s.color, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right" as const, color: t.textSecondary, fontSize: 11, formatter: (p: { value: unknown }) => o.valueFormat(p.value as number), distance: 4 },
      emphasis: { itemStyle: { opacity: 0.85 } },
    })),
  };
}

// ---------- Column chart for financial years (budget) ----------

export interface ColumnOpts {
  points: Point[];
  forecastFrom?: string | null;
  t: Tokens;
  width: number;
  yFormat: (v: number) => string;
  name: string;
}

export function columnOption(o: ColumnOpts): EChartsOption {
  const { t } = o;
  const isF = (d: string) => !!o.forecastFrom && d >= o.forecastFrom;
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: 4, right: 8, top: 12, bottom: 4 },
    xAxis: {
      type: "category",
      data: o.points.map(([d]) => periodLabel(d, "FY")),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: t.axisMuted, hideOverlap: true, interval: o.width < 480 ? 9 : 4, margin: 14 },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      axisLabel: { color: t.axisMuted, formatter: (v: number) => o.yFormat(v) },
      splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" } },
    },
    tooltip: {
      ...tooltipBase(t),
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.4 } },
      formatter: (raw) => {
        const p = (Array.isArray(raw) ? raw[0] : raw) as { dataIndex: number };
        const [d, v] = o.points[p.dataIndex];
        const f = isF(d);
        return `<div class="tt"><div class="tt-head">${periodLabel(d, "FY")}${f ? " · Estimate" : ""}</div>${ttRow(f ? t.s1Soft : t.s1, o.yFormat(v), o.name, true)}</div>`;
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 14,
        barCategoryGap: "24%",
        data: o.points.map(([d, v]) => ({
          value: v,
          itemStyle: { color: isF(d) ? t.s1Soft : t.s1, borderRadius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] },
        })),
        markLine: { silent: true, symbol: "none", lineStyle: { color: t.axis, width: 1, type: "solid" }, label: { show: false }, data: [{ yAxis: 0 }] },
      },
    ],
  };
}
