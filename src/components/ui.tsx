import { useId, useState, type ReactNode } from "react";
import type { Point, Source } from "../data";
import { useTokens } from "../theme";

export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

const TONE_WORD: Record<Tone, string> = {
  good: "Good",
  warning: "Watch",
  serious: "Concern",
  critical: "Critical",
  neutral: "Info",
};

/** Status chip: colour always paired with a text label, never colour alone. */
export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`chip ${tone}`}>
      <span className="dot" aria-hidden="true" />
      <span className="sr-only">{TONE_WORD[tone]}: </span>
      {children}
    </span>
  );
}

export function Sparkline({ points, width = 88, height = 34 }: { points: Point[]; width?: number; height?: number }) {
  const t = useTokens();
  if (points.length < 2) return null;
  const vs = points.map((p) => p[1]);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const pad = 5;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const d = vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const lx = x(vs.length - 1);
  const ly = y(vs[vs.length - 1]);
  return (
    <svg className="spark" width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={t.axisMuted} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill={t.s1} stroke={t.surface} strokeWidth={2} />
    </svg>
  );
}

export interface TileProps {
  /** Lets a chapter pick this tile. */
  id?: string;
  label: string;
  value: string;
  delta?: { text: string; tone: "good" | "bad" | "neutral"; vs: string };
  chip?: { tone: Tone; text: string };
  read?: string;
  spark?: Point[];
  asOf: string;
  /** Link to the chart that explains this number. */
  href?: string;
}

export function StatTile({ label, value, delta, chip, read, spark, asOf, href }: TileProps) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="value-row">
        <div className="value">{value}</div>
        {spark && <Sparkline points={spark} />}
      </div>
      {delta && (
        <div className="delta">
          <strong className={delta.tone}>{delta.text}</strong> {delta.vs}
        </div>
      )}
      {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
      {read && <div className="read">{read}</div>}
      <div className="asof">{asOf}{href && <span className="tile-more" aria-hidden="true"> · See chart</span>}</div>
    </>
  );
  return href ? <a className="tile tile-link" href={href}>{body}</a> : <div className="tile">{body}</div>;
}

export interface LegendEntry {
  label: string;
  color?: string;
  kind?: "line" | "dash" | "rect" | "band";
}

export function Legend({ items }: { items: LegendEntry[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          {i.kind === "band" ? (
            <span className="key-band" />
          ) : i.kind === "dash" ? (
            <span className="key-dash" style={{ borderColor: i.color }} />
          ) : (
            <span className={i.kind === "rect" ? "key-rect" : "key-line"} style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export interface TableData {
  head: string[];
  rows: (string | number)[][];
  /** Column indexes to right-align as numbers. */
  num?: number[];
}

export function DataTable({ head, rows, num = [] }: TableData) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{head.map((h, i) => <th key={h} className={num.includes(i) ? "num" : undefined}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci} className={num.includes(ci) ? "num" : undefined}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CardProps {
  /** Anchor id so tiles and links can jump to this chart. */
  anchor?: string;
  title: string;
  subtitle?: string;
  takeaway?: ReactNode;
  /** A caution on how to read the chart, under the takeaway. */
  note?: ReactNode;
  legend?: LegendEntry[];
  sources: Source[];
  asOf?: string;
  table?: TableData;
  /** Plain-English definitions, opened with a tap under the chart. */
  glossary?: { title: string; terms: { term: string; text: string }[] };
  children: ReactNode;
}

export function ChartCard({ anchor, title, subtitle, takeaway, note, legend, sources, asOf, table, glossary, children }: CardProps) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  const uniq = sources.filter((s, i) => sources.findIndex((x) => x.name === s.name && x.dataset === s.dataset) === i);
  return (
    <article className="card" id={anchor} aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {takeaway && <p className="takeaway">{takeaway}</p>}
      {note && <p className="note">{note}</p>}
      {legend && legend.length > 1 && !showTable && <Legend items={legend} />}
      <div className="chart-wrap">{showTable && table ? <DataTable {...table} /> : children}</div>
      {glossary && (
        <details className="glossary">
          <summary>{glossary.title}</summary>
          <dl>
            {glossary.terms.map((g) => (
              <div key={g.term}><dt>{g.term}</dt><dd>{g.text}</dd></div>
            ))}
          </dl>
        </details>
      )}
      <footer>
        <span>
          Source:{" "}
          {uniq.map((s, i) => (
            <span key={s.name + s.dataset}>
              {i > 0 && "; "}
              <a href={s.url} target="_blank" rel="noopener noreferrer">{shortSource(s.name)}</a>, {s.dataset}
            </span>
          ))}
          {asOf && <> · {asOf}</>}
        </span>
        {table && (
          <button type="button" className="link-button" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </footer>
    </article>
  );
}

function shortSource(name: string): string {
  if (name.startsWith("State Bank")) return "SBP";
  if (name.startsWith("Pakistan Bureau")) return "PBS";
  if (name.startsWith("Ministry of Finance")) return "Finance Ministry";
  return name;
}
