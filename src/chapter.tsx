// A chapter: numbered header with a one-line plain-English verdict, optional key numbers, then its charts.
import type { ReactNode } from "react";
import { StatTile, type TileProps } from "./components/ui";

export type Part = "Your daily life" | "Money and the world" | "The country";

export const CHAPTERS = [
  { id: "cost", n: 1, title: "Cost of living", short: "Prices", part: "Your daily life" },
  { id: "jobs", n: 2, title: "Jobs and pay", short: "Jobs", part: "Your daily life" },
  { id: "rates", n: 3, title: "Interest rates and loans", short: "Rates", part: "Your daily life" },
  { id: "rupee", n: 4, title: "The rupee and reserves", short: "Rupee", part: "Money and the world" },
  { id: "abroad", n: 5, title: "Remittances and trade", short: "Trade", part: "Money and the world" },
  { id: "growth", n: 6, title: "How the country makes money", short: "Growth", part: "The country" },
  { id: "budget", n: 7, title: "Government money", short: "Budget", part: "The country" },
  { id: "debt", n: 8, title: "Debt and the IMF", short: "Debt", part: "The country" },
  { id: "business", n: 9, title: "Business conditions", short: "Business", part: "The country" },
] as const satisfies readonly { id: string; n: number; title: string; short: string; part: Part }[];

export type ChapterId = (typeof CHAPTERS)[number]["id"];

/** Tiles for the given ids, in that order, skipping any without data. */
export const pick = (tiles: TileProps[], ...ids: string[]): TileProps[] =>
  ids.map((id) => tiles.find((t) => t.id === id)).filter((t): t is TileProps => !!t);

export function Chapter({ id, verdict, tiles, children }: { id: ChapterId; verdict?: string; tiles?: TileProps[]; children: ReactNode }) {
  const c = CHAPTERS.find((x) => x.id === id)!;
  return (
    <section className="chapter" id={id} aria-labelledby={`${id}-h`}>
      <header>
        <div className="eyebrow"><span className="badge" aria-hidden="true">{c.n}</span>{c.part}</div>
        <h2 id={`${id}-h`}>{c.title}</h2>
        {verdict && <p className="verdict">{verdict}</p>}
        {tiles && tiles.length > 0 && (
          <div className="tiles tiles-chapter">{tiles.map((t) => <StatTile key={t.label} {...t} />)}</div>
        )}
      </header>
      {children}
    </section>
  );
}
