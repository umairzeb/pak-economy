// Reusable chart cards: line cards for time series, bar cards for bundles.
import { useCallback, useState, type ReactNode } from "react";
import { since, type Point, type Series, type Source } from "./data";
import { yearChange } from "./change";
import { barListHeight, barOption, columnOption, groupedBarOption, groupedHeight, lineOption, type BarItem, type RefLine } from "./charts";
import { EChart } from "./components/EChart";
import { ChartCard, type LegendEntry } from "./components/ui";
import { periodLabel } from "./format";
import { eventsBetween } from "./events";
import { useRange } from "./range";
import { useTokens } from "./theme";

export interface LineInput {
  s: Series;
  name: string;
  color: string;
  step?: boolean;
  /** Override the plotted points (e.g. a step series extended to today). */
  points?: Point[];
  /** Leave out the change on a year earlier (e.g. a flat target line). */
  noChange?: boolean;
}

interface LineCardProps {
  anchor?: string;
  title: string;
  subtitle?: string;
  takeaway?: ReactNode;
  note?: ReactNode;
  lines: LineInput[];
  yFormat: (v: number) => string;
  band?: [number, number];
  bandLabel?: string;
  breaks?: boolean;
  zeroLine?: boolean;
  /** Mark major economic events (default on). */
  events?: boolean;
  height?: number;
  glossary?: { title: string; terms: { term: string; text: string }[] };
}

export function LineCard(p: LineCardProps) {
  const t = useTokens();
  const { range, start } = useRange();
  const lines = p.lines.map((l) => {
    const all = l.points ?? l.s.points;
    const pts = since(all, start);
    // A step series only has points when it changes: start from the value in force at the range's start.
    const before = l.step ? all.filter(([d]) => d < start).at(-1) : undefined;
    return { ...l, pts: before && pts[0]?.[0] !== start ? ([[start, before[1]], ...pts] as Point[]) : pts };
  });
  const firstDate = lines.map((l) => l.pts[0]?.[0] ?? "9999").sort()[0];
  const lastDate = lines.map((l) => l.pts.at(-1)?.[0] ?? "").sort().at(-1)!;
  const freq = p.lines[0].s.freq;
  const hasForecast = p.lines.some((l) => l.s.forecast_from);
  // Worked out on the full series, so the first year of a shorter range still has a figure.
  const changes = p.lines.map((l) => (l.noChange ? undefined : yearChange(l.s, l.points ?? l.s.points, p.yFormat)));
  const option = useCallback(
    (width: number) =>
      lineOption({
        t, width, freq, yFormat: p.yFormat, band: p.band, zeroLine: p.zeroLine, endLabels: true,
        breaks: p.breaks ? p.lines[0].s.breaks?.filter((b) => b.date >= firstDate) : undefined,
        events: p.events === false ? undefined : eventsBetween(firstDate, lastDate),
        series: lines.map((l, i) => ({ name: l.name, points: l.pts, color: l.color, step: l.step, forecastFrom: l.s.forecast_from, change: changes[i] })),
      }),
    [t, start, ...p.lines.map((l) => l.s)],
  );

  const legend: LegendEntry[] = [
    ...lines.map((l) => ({ label: l.name, color: l.color })),
    ...(hasForecast ? [{ label: "Estimate", color: t.textMuted, kind: "dash" as const }] : []),
    ...(p.band ? [{ label: p.bandLabel ?? "Target", kind: "band" as const }] : []),
  ];

  // Table: one row per date, newest first.
  // A step line alongside others takes their dates, so its own change dates don't add near-empty rows.
  const rowLines = lines.some((l) => !l.step) ? lines.filter((l) => !l.step) : lines;
  const dates = [...new Set(rowLines.flatMap((l) => l.pts.map(([d]) => d)))].sort().reverse();
  const maps = lines.map((l) => new Map(l.pts));
  const head = ["Period", ...lines.flatMap((l, i) => (changes[i] ? [l.name, lines.length > 1 ? `${l.name} vs a year earlier` : "vs a year earlier"] : [l.name]))];
  const table = {
    head,
    rows: dates.map((d) => [
      lines[0].step ? periodLabel(d, "event") : periodLabel(d, freq),
      ...maps.flatMap((m, i) => [
        lines[i].step
          ? ((v) => (v ? p.yFormat(v[1]) : "–"))(lines[i].pts.findLast(([x]) => x <= d))
          : m.has(d) ? p.yFormat(m.get(d)!) : "–",
        ...(changes[i] ? [changes[i](d) ?? "–"] : []),
      ]),
    ]),
    num: head.slice(1).map((_, i) => i + 1),
  };

  // Say so when a series can't reach back as far as the chosen range.
  const late = [...lines].filter((l) => l.pts.length).sort((a, b) => (a.pts[0][0] < b.pts[0][0] ? 1 : -1))[0];
  const lateYear = late ? Number(late.pts[0][0].slice(0, 4)) : 0;
  const startsLate = range !== "5y" && lateYear > Number(start.slice(0, 4)) + 1;
  const allSameStart = new Set(lines.map((l) => l.pts[0]?.[0].slice(0, 4))).size === 1;
  const note = `${lines.length > 1 && !allSameStart ? `${late?.name} data` : "Data"} starts ${lateYear}`;
  const subtitle = startsLate ? `${p.subtitle ?? ""}${p.subtitle ? " · " : ""}${note}` : p.subtitle;

  const s0 = lines[0].s;
  const latest = (s0.forecast_from ? s0.points.filter(([d]) => d < s0.forecast_from!) : s0.points).at(-1)![0];
  return (
    <ChartCard anchor={p.anchor} title={p.title} subtitle={subtitle} takeaway={p.takeaway} note={p.note} legend={legend}
      sources={lines.map((l) => l.s.source)} asOf={`latest ${s0.forecast_from ? "actual " : ""}${periodLabel(latest, freq)}`} table={table} glossary={p.glossary}>
      <EChart option={option} height={p.height ?? 260} label={`${p.title}. Line chart; use Show table for values.`} />
    </ChartCard>
  );
}

interface BarCardProps {
  anchor?: string;
  title: string;
  subtitle?: string;
  takeaway?: ReactNode;
  note?: ReactNode;
  items: BarItem[];
  valueFormat: (v: number) => string;
  refLines?: RefLine[];
  legend?: LegendEntry[];
  sources: Source[];
  asOf?: string;
  table: { head: string[]; rows: (string | number)[][]; num?: number[] };
}

export function BarCard(p: BarCardProps) {
  const t = useTokens();
  const [open, setOpen] = useState<string | null>(null);
  const option = useCallback(
    (width: number) => barOption({ items: p.items, t, width, valueFormat: p.valueFormat, refLines: p.refLines }),
    [t, p.items],
  );
  const expandable = p.items.filter((i) => i.expand);
  const shown = expandable.find((i) => i.label === open);
  const toggle = (name: string) => setOpen((o) => (o === name ? null : name));
  return (
    <ChartCard anchor={p.anchor} title={p.title} subtitle={p.subtitle} takeaway={p.takeaway} note={p.note} legend={p.legend} sources={p.sources} asOf={p.asOf} table={p.table}>
      <EChart option={option} height={barListHeight(p.items.length, p.refLines?.length ?? 0)} label={`${p.title}. Bar chart; use Show table for values.`}
        onItemClick={(name) => expandable.some((i) => i.label === name) && toggle(name)} />
      {expandable.length > 0 && (
        <div className="expand">
          <div className="expand-chips">
            <span>What's inside:</span>
            {expandable.map((i) => (
              <button key={i.label} type="button" className="chip-btn" aria-expanded={open === i.label} onClick={() => toggle(i.label)}>
                {i.label} <span aria-hidden="true">{open === i.label ? "▴" : "▾"}</span>
              </button>
            ))}
          </div>
          {shown?.expand && (
            <div className="expand-panel" role="region" aria-label={`What's inside ${shown.expand.title}`}>
              <ul>
                {shown.expand.rows.map((r) => (
                  <li key={r.label}><span>{r.label}</span>{r.value && <span className="num">{r.value}</span>}</li>
                ))}
              </ul>
              {shown.expand.note && <p>{shown.expand.note}</p>}
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}

interface ColumnCardProps {
  anchor?: string;
  title: string;
  subtitle?: string;
  takeaway?: ReactNode;
  s: Series;
  name: string;
  yFormat: (v: number) => string;
}

export function ColumnCard(p: ColumnCardProps) {
  const t = useTokens();
  const { start } = useRange();
  const pts = since(p.s.points, start);
  const option = useCallback(
    (width: number) => columnOption({ points: pts, forecastFrom: p.s.forecast_from, t, width, yFormat: p.yFormat, name: p.name }),
    [t, p.s, start],
  );
  const isF = (d: string) => !!p.s.forecast_from && d >= p.s.forecast_from;
  return (
    <ChartCard anchor={p.anchor} title={p.title} subtitle={p.subtitle} takeaway={p.takeaway} asOf={`latest ${periodLabel(p.s.points.at(-1)![0], p.s.freq)}`}
      legend={p.s.forecast_from ? [{ label: "Actual", color: t.s1, kind: "rect" }, { label: "Estimate", color: t.s1Soft, kind: "rect" }] : undefined}
      sources={[p.s.source]}
      table={{ head: ["Financial year", p.name], rows: [...pts].reverse().map(([d, v]) => [periodLabel(d, "FY"), p.yFormat(v) + (isF(d) ? " (estimate)" : "")]), num: [1] }}>
      <EChart option={option} height={240} label={`${p.title}. Column chart; use Show table for values.`} />
    </ChartCard>
  );
}

interface GroupedCardProps {
  anchor?: string;
  title: string;
  subtitle?: string;
  takeaway?: ReactNode;
  note?: ReactNode;
  categories: string[];
  series: { name: string; values: number[]; color: string }[];
  valueFormat: (v: number) => string;
  sources: Source[];
  asOf?: string;
  table: { head: string[]; rows: (string | number)[][]; num?: number[] };
}

export function GroupedCard(p: GroupedCardProps) {
  const t = useTokens();
  const option = useCallback(
    (width: number) => groupedBarOption({ categories: p.categories, series: p.series, t, width, valueFormat: p.valueFormat }),
    [t, p.categories, p.series],
  );
  return (
    <ChartCard anchor={p.anchor} title={p.title} subtitle={p.subtitle} takeaway={p.takeaway} note={p.note}
      legend={p.series.map((s) => ({ label: s.name, color: s.color, kind: "rect" as const }))}
      sources={p.sources} asOf={p.asOf} table={p.table}>
      <EChart option={option} height={groupedHeight(p.categories.length)} label={`${p.title}. Bar chart; use Show table for values.`} />
    </ChartCard>
  );
}
