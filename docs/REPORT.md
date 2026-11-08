# Report: Pakistan economy dashboard

Finished 8 November 2026. Published on the owner's instruction on 8 November 2026, at https://umairzeb.github.io/pak-economy/. The published data is from 8 November 2026 and does not update by itself until the refresh is turned on.

## What's wrong or unfinished first

- **Automatic refresh is prepared but switched off.** Refreshing from GitHub's servers is untested, and Pakistani government sites sometimes block cloud addresses. The first run needs watching. The workflow file is `.github/workflows/refresh-and-deploy.yml.disabled`: rename it to `.yml` to turn it on.
- **Unemployment and pay are out of date by nature.** The newest official figure is the 2024-25 survey. The dashboard says so.
- **Some figures are not rechecked automatically after today.** See "What I checked" below.
- **World Bank long-run inflation chart:** the World Bank's page returned a 504 error when I tested the source link on 8 Nov 2026, in a normal browser too, and again at publishing. The data itself came through their API, but that one source link may not open until the World Bank fixes it.
- **I could not confirm whether FY2025-26 GDP is PBS's "provisional" or "revised" figure** from PBS's own table, which has no marker. SBP's October statement calls it revised. The dashboard says recent years can change.

## What's on the dashboard

Nine chapters, from daily life outward: Cost of living; Jobs and pay; Interest rates and loans; The rupee and reserves; Remittances and trade; How the country makes money; Government money; Debt and the IMF; Business conditions. There are 41 cards, 35 of them charts. Headline cards at the top are inflation, policy rate, the rupee and the State Bank's reserves.

Run it with `npm run dev` in this folder (site at the address it prints), or `npm run build` for a static site. Data comes from the files in `public/data`.

## Headline figures

| Figure | Value | Period | Source |
|---|---|---|---|
| Inflation, national CPI | 9.6% | Oct 2026 | PBS Monthly Review, Oct 2026 (with PBS's CPI data feed) |
| Policy rate | 12.00% | From 27 Oct 2026 | SBP rate history; SBP statement 26 Oct 2026 |
| Rupee per US$ (interbank monthly average) | Rs 277.24 | Oct 2026 | SBP |
| Open-market US$ selling rate | Rs 278.47 | 6 Nov 2026 | SBP |
| SBP net reserves | $21.56bn | Week ended 30 Oct 2026 | SBP |
| Total liquid reserves | $26.86bn | Week ended 30 Oct 2026 | SBP |
| Remittances, 12 months | $42.9bn | To Sep 2026 | SBP |
| Current account, 12 months | −$510m | To Sep 2026 | SBP BoP |
| Real GDP growth | 3.65% | FY2025-26 | PBS National Accounts (SBP's statement rounds to 3.7%) |
| Budget deficit, federal + provincial, provisional | Rs 3.31tn (2.6% of GDP) | FY2025-26 | Finance Ministry fiscal operations |
| Gross public debt | Rs 86.7tn (68.3% of GDP) | Jun 2026 | SBP Summary |
| IMF programme | EFF 2024, about US$7bn; about US$4.8bn paid out by May 2026 | | IMF Country Report, published by the Finance Ministry |
| Unemployment | 6.9% | 2024-25 survey | PBS Labour Force Survey |

## What I left out and why

- **Stock market (KSE-100):** PSX's terms forbid automated collection and republishing without written permission.
- **IMF's own website and API:** both returned 403 (blocked). I used the IMF documents the Finance Ministry publishes instead.
- **Up-to-date unemployment and pay:** there is no official monthly or quarterly series. Only the 2024-25 survey and five construction day-rates.
- **Friendly-country deposits inside reserves:** SBP doesn't publish them as a series.
- **Electricity tariffs:** NEPRA publishes long legal documents, not a usable price series.
- **SECP business data:** blocked (403).
- **SBP EasyData API:** needs a registered account.
- **Broad money (M2) and bank deposits:** available, but left out to keep to fewer solid charts.

## What I checked against the publisher's own release, and what I didn't

Checked today, in `tests/health_check.py`, against **separate published documents**:
- CPI national, urban and rural for Oct and Sep 2026 against PBS's Monthly Review; all 22 months in that review compared with the CPI series, and they match.
- Policy rate against SBP's Monetary Policy Statement and the separate `sir.pdf` table.
- Reserves against SBP's `forex.pdf` weekly table.
- Rupee against SBP's `IBF_Rates.pdf`, to within Rs 1.50. That is a loose check, because that PDF's table layout makes an exact match unreliable.
- Remittances against SBP's BoP table.
- Current account (including the Q1 total of −$874m in SBP's statement), exports, imports.
- GDP growth against SBP's republished table.
- Fiscal revenue, spending, interest, defence, balance (and revenue less spending equals the balance every year); revenue and spending mixes sum to their totals.
- Gross public debt against SBP's Summary; 68.3% and 70.6% of GDP against debt divided by GDP.
- External debt in dollars against the rupee figure via the exchange rate (consistency check).

These are dated anchors. If a publisher revises a figure later, the check flags it for a look rather than wrongly failing.

Could **not** check, or only partly:
- Remittances have not been checked against SBP's press release, only against its BoP table.
- GDP status (provisional/revised), as above.
- The live source link test on the World Bank page failed on the day (their outage).
- Every other source link opened fine.

## Figures entered by hand

Only where they exist solely in an official document. All in `pipeline/hand_entered.py`, with the document recorded next to each, and the health check flags them when an update is due.

1. Labour Force Survey 2024-25 (PBS annual report, Executive Summary): unemployment overall and by group, participation, labour force, employed, unemployed, average monthly wage, and the 2020-21 comparison figures. Update due whenever PBS publishes a new survey (flag date 30 Jun 2028).
2. Budget 2026-27 (Finance Ministry, Budget in Brief, Tables 1 and 3): federal budget estimates by spending line. Update due June 2027.
3. IMF programme facts (IMF Country Reports 24/310 and 26/101, via the Finance Ministry). Update due May 2027.
4. SBP's 5–7% inflation target (Monetary Policy Statement 26 Oct 2026).
5. Monetary Policy Committee dates to June 2027 (SBP calendar). The check flags these before they run out.

PDF-parsed figures (not hand-entered, but read automatically from PDFs): SBP policy-rate history, SBP debt summary, PBS price history and Monthly Review, Finance Ministry fiscal operations. Each has a check that fails if the layout changes.

## Test results

- `python -m tests.test_guards`: passes. Proves bad values, shrunken series, dates going backwards, emptied breakdowns and wrong refresh timing are refused.
- `python -m tests.health_check`: 501 checks pass (exit 0 on the data files).
- `python -m tests.health_check --live`: all pass except the World Bank link outage noted above.
- Failure tests carried out for real: I deliberately put a wrong reserves figure and a wrong budget total into the data files. The health check caught them and exited with a failure code, then I restored the files. I also removed two data files; the page kept working and showed its notice about missing charts.
- Browser audit (`tests/browser_audit.js`) at phone (375px), tablet (768px) and desktop widths, in light and dark themes, on all four ranges: 0 problems, with chart labels counted above zero (over 2,000 per run). It does fail when the browser hasn't drawn charts: I saw that happen once and re-ran after a screenshot, as the instructions warned.
- **An honest limit:** on the final desktop light run a screenshot timed out, so drawing was confirmed by counting labels (2,442) rather than a screenshot.
- During testing I read the page itself and found a real bug the automatic checks missed: gross public debt showed 8.3% of GDP instead of 68.3%, because the PDF splits digits. Fixed, and a new check compares the percentage against debt divided by GDP.
- Live site, after publishing on 8 Nov 2026: GitHub's deploy step succeeded, all 71 data files loaded, no console errors, and the same browser audit found 0 problems on all four ranges at phone (2,127 chart labels), tablet (2,407) and desktop (2,442) widths. The live run was in dark theme only; both themes were tested on the local copy of the same build.
- Not tested: fetching fresh data from GitHub's servers; a real unattended daily refresh.

## Decisions for you

1. **Published** on the owner's instruction, on GitHub Pages as a public repository like the Australian site. `CLAUDE.md` is kept out of the repository because it describes the owner personally.
2. **Reuse permission.** PBS has an open licence. SBP and the Finance Ministry have no stated reuse terms: no permission, no prohibition. You might ask them, especially if this goes beyond friends.
3. **The stock market.** Ask PSX for written permission if you want KSE-100 added. I left it out to respect their terms.
4. **Turning on the daily refresh** (rename the workflow file). It needs watching for its first few runs.
5. **SBP EasyData account** (needs your details): it would add long-run seasonally adjusted series, but isn't necessary.
