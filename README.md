# pak-economy

A plain-English dashboard of Pakistan's economy: how the country makes and spends money, how things are going, and what it means for daily life. Data comes from Pakistan's own publishers (State Bank of Pakistan, Pakistan Bureau of Statistics, Finance Ministry). Sister of the Australian dashboard.

## Status

Approved for publishing at https://umairzeb.github.io/pak-economy/. The data on the site does not update by itself yet: the daily refresh is prepared but off (see `docs/REPORT.md`).

## Run it on this computer

Site (React + Vite + TypeScript, charts with Apache ECharts):

```bash
npm install
npm run dev
```

Data:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m pipeline.build
```

Tests:

```bash
python -m tests.test_guards
python -m tests.health_check
python -m tests.health_check --live
```

`tests/browser_audit.js` checks the page itself: paste it into the browser console. Take a screenshot first if the tab was in the background, so the charts draw.

## Where things are

- `pipeline/sources/`: one module per publisher (`sbp`, `pbs`, `mof`, `worldbank`)
- `pipeline/build.py`: every series and breakdown, plus the guards that refuse bad data
- `pipeline/hand_entered.py`: figures entered by hand, each with its document and due date
- `pipeline/release_days.py`: when a refresh is due (Pakistan time, UTC+5)
- `public/data/`: output JSON and `manifest.json`
- `src/sections.tsx`: the nine chapters
- `src/verdicts.ts`, `src/insights.ts`: wording worked out from the data
- `src/events.ts`: events marked on charts
- `docs/data-sources.md`: every source, what it publishes, terms and gaps
- `docs/REPORT.md`: what's included, left out, verified, and decisions needed
- `.github/workflows/refresh-and-deploy.yml.disabled`: the daily refresh, prepared but off
