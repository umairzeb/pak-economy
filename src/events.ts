// Events marked on long time-series charts. Each comes from an official document:
// IMF arrangements from IMF Country Reports republished by the Finance Ministry (finance.gov.pk/mefp),
// floods from Economic Survey 2022-23 Annex III, the 2026 energy shock from SBP's March 2026 policy statement.
export interface EconEvent {
  date: string;
  label: string;
  /** Shorter label for narrow charts. */
  short: string;
}

export const EVENTS: EconEvent[] = [
  { date: "2019-07-03", label: "IMF programme (EFF 2019)", short: "IMF 2019" },
  { date: "2020-03-18", label: "COVID-19", short: "COVID" },
  { date: "2022-08-31", label: "Floods (2022)", short: "Floods" },
  { date: "2023-07-12", label: "IMF Stand-By Arrangement", short: "IMF SBA" },
  { date: "2024-09-25", label: "IMF programme (EFF 2024)", short: "IMF 2024" },
  { date: "2026-03-09", label: "Middle East war, fuel prices", short: "War, fuel" },
];

export const eventsBetween = (start: string, end: string) => EVENTS.filter((e) => e.date >= start && e.date <= end);
