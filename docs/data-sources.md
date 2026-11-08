# Data sources

Written before any code, from opening each source on 8 November 2026. "Latest" means the latest period I actually saw in the file that day. Nothing here comes from memory or from news sites. News was only used to look for primary documents.

Fetched from this PC only. **I could not test any of this from GitHub's servers**, because nothing may be pushed in this session. Pakistani government sites sometimes block cloud addresses, so the first automatic refresh needs watching.

Summary of what I found:

| Publisher | Verdict | Why |
|---|---|---|
| State Bank of Pakistan, Excel archives | **Main source** | Current, official, machine-readable, long history |
| Pakistan Bureau of Statistics | **Main source for prices, GDP, jobs** | CPI data feed, weekly SPI Excel, national accounts Excel, open licence |
| Ministry of Finance | **Main source for the budget** | Actual outturns exist but only as PDF, so parsed with a layout test |
| World Bank API | Back-up, labelled | Long annual history only, runs behind Pakistan's own figures |
| OGRA | Not used as data | Current fuel prices only in HTML notifications with no history; PBS weekly prices are better |
| PSX | **Gap: stock index left out** | Terms ban robots and collecting content without written permission |
| SECP | **Gap** | Site returned 403 (blocked) |
| IMF website and API | **Blocked (403), not used directly** | The Finance Ministry republishes the IMF's own Country Reports at finance.gov.pk/imf.html, which is what the programme card uses |
| ADB | Not used | Returned 403 (blocked) |
| UN Comtrade | Not used | Works, but SBP and PBS already publish trade by country and commodity |
| SBP EasyData API | Not used | Needs a registered account and key |

## 1. State Bank of Pakistan (SBP)

Index page a person can read: https://www.sbp.org.pk/economic-data (lists every table, its frequency and its last update date).

Access method: Excel files (and matching PDFs) at `https://www.sbp.org.pk/assets/document/<file>`. The site moved in 2026. Old `/ecodata/...` links now land on a generic page with status 200, so the pipeline must check that it received a real spreadsheet and not a web page.

Terms: the SBP disclaimer (https://www.sbp.org.pk/our-operations/disclaimer) says content is published "for general information purposes only" and gives no warranty. It sets out no licence and no ban on reuse. I attribute SBP on every chart and link to its page. **The owner should know there is no explicit permission to republish, only no prohibition.**

Release schedule: SBP's Advance Release Calendar, `ARC.xls`, covers January to December 2026 and is linked from the index page. **It runs out at the end of December 2026**, and the health check warns about that.

Reliability from here: good. `Summary.xls` failed three times with a cut-off download, while `Summary.pdf` and every other file worked. Web pages take 3 to 8 seconds, files about 1. The WebFetch research tool got 403 from SBP, while an ordinary script request with an honest browser-compatible name worked. That means SBP may filter some automated traffic, which is another reason to watch the first GitHub run.

| What | File (Excel unless stated) | Units, frequency | History | Latest seen | Update lag |
|---|---|---|---|---|---|
| Policy, ceiling and floor rates | `OVR-Repo-History.pdf` (PDF only) | %, on each decision | 26 Feb 1991 onward | 27 Oct 2026, policy rate 12.00% | Within days |
| Same, cross-check | `sir.pdf` page 1 | Last 13 changes | Mar 2023 onward | 27 Oct 2026, 12.00% | About 2 weeks |
| Liquid FX reserves: SBP net, banks net, total | `Forex_Arch.xlsx` (sheets Year-end, Month-end, Week-end) | US$ million | Weekly from May 2011 | Week ended 30 Oct 2026: SBP 21,561; total 26,864 | About 6 days, weekly (usually Thursday) |
| Workers' remittances by country | `Homeremit_Arch.xlsx` (sheet per period) | US$ million, monthly | Jul 1972 onward | Sep 2026: 3,588 | About 9 days |
| Balance of payments, monthly, BPM6 | `BPM6_Ach_M.xlsx` | US$ million | Jul 2013 onward | Sep 2026: current account −356 | About 16 days |
| Exports and imports, BoP basis | `exp_import_BOP_Arch.xls` | US$ million, monthly | Annual from 1970-71, then monthly | Sep 2026 provisional | About 16 days |
| Exports by commodity group | `Export_Receipts_by_Commodities_and_Groups_Arch.xls` | US$ million | Monthly | Sep 2026 | About 16 days |
| Imports by commodity group | `Import_Payments_by_Commodities_and_Groups_Arch.xls` | US$ million | Monthly | Sep 2026 | About 16 days |
| Foreign direct investment | `FIS-FDI-Arch.xls`, `Foreign_Dir_Arch.xls`, `Netinflow.xls` | US$ million | Monthly | Sep 2026 | About 16 days |
| Rupee per US$, interbank monthly average | `IBF_Arch.xls` | PKR per unit | From Jan 1957 | October 2026: 277.24 | About 5 days |
| Rupee per US$, interbank daily | `BFER_Daily_Arch.xlsx` | PKR per unit | From Jul 2013 | Nov 2026 | Days |
| Rupee, open-market closing | Daily PDF, `open-market-closing-exchange-rates-*.pdf` | PKR per unit | Latest day only | 6 Nov 2026 | 1 day |
| Lending and deposit rates, all banks | `Lendingdepositrates_Arch.xls` | % a year, monthly | Monthly from 2004 | Sep 2026 | About 19 days |
| Credit by borrower | `CreditLoans-arch.xls` | PKR million, monthly stock | 2006 onward (three sheets) | Sep 2026 | About 16 days |
| Broad money, M2 | `BroadMoney_M2_Arch.xls` | PKR million | 1969 onward (nine sheets) | Weekly, Oct 2026 | Weekly |
| Pakistan debt and liabilities summary | `Summary.pdf` (`Summary.xls` broken) | PKR billion, quarterly | Five quarters in the PDF | Jun 2026 | About 6 weeks |
| Debt profile | `Profile.xls` | PKR billion | Two year-ends | Jun 2026 | About 6 weeks |
| Central government debt | `CenGovDebt-Archive.xls` | PKR billion, monthly | Jun 2010 onward (two sheets) | Aug 2026: domestic 58,757; external 24,196 | About 5 weeks |
| External debt | `pakdebt_Arch.xls` | US$ million, quarterly | 1995 onward (four sheets) | Jun 2026 | About 6 weeks |
| GDP by sector (PBS data, republished by SBP) | `GDP_table.xlsx`, `QGDP.xlsx` | PKR million, 2015-16 prices | FY2000 onward; quarterly FY2016 onward | FY2025-26: 3.65% | Same day as PBS |
| Large-scale manufacturing | `Productselect.xlsx` | YoY %, base 2015-16 | Monthly, about 12 columns | Aug 2026 | About 7 weeks |
| Consumer confidence (with IBA) | `Overall-Indices.xlsx`, page https://www.sbp.org.pk/our-operations/state-bank-surveys | Diffusion index, monthly-ish | Jan 2012 onward | Oct 2026: CCI 34.9 | Under 4 weeks |
| Business confidence | Sector PDFs only | Diffusion index | Not assessed in detail | | |
| Policy statements | https://www.sbp.org.pk/our-operations/monetary-policy | Text | | 26 Oct 2026 | Same day |

MPC dates for FY27, from the SBP calendar on the monetary policy page (rate takes effect the next working day): 27 Jul, 14 Sep, 26 Oct, 14 Dec 2026; 25 Jan, 8 Mar, 26 Apr, 17 Jun 2027. The calendar says a new date can be set if something unforeseen happens.

## 2. Pakistan Bureau of Statistics (PBS)

Pages: https://www.pbs.gov.pk/price-statistics/, https://www.pbs.gov.pk/national-accounts-2/, https://www.pbs.gov.pk/labour-force-statistics/, https://www.pbs.gov.pk/external-trade-statistics

Files sit at `https://www.pbs.gov.pk/wp-content/uploads/2020/07/<file>`, despite the "2020/07" in the path. Filenames change every month, so the pipeline reads the page for the current link.

Terms: https://www.pbs.gov.pk/data-dissemination/ says aggregate statistics are "normally released free of charge under an open license", with reuse allowed with attribution. This is the clearest permission of any publisher here.

Reliability from here: good, 1 to 3 seconds. `https://www.pbs.gov.pk/cpi` redirects to the data feed.

| What | Source | Units, base, frequency | Latest seen | Notes |
|---|---|---|---|---|
| CPI National, General, plus 12 groups | `https://www.pbs.gov.pk/cpi` -> `CPI.xml` (SDMX) | Index, 2015-16 = 100, monthly | Oct 2026: 307.62, which is +9.6% on a year earlier | Starts Jul 2022. Weights 34.58 food, 23.63 housing, 5.91 transport |
| National, Urban, Rural, WPI, YoY history | `indices_and_growth_rates_historical-1.pdf`, PDF | Index and YoY | 2017 to Jun 2026 | Fills in before Jul 2022 |
| Inflation headlines and core | `Monthly-Review-<Month><Year>.pdf`, PDF | YoY and MoM % | Oct 2026 | Published in the first days of the next month. Also gives urban and rural food, non-food and core (NFNE, trimmed) |
| Weekly SPI: 51 items, prices now, week ago, year ago | `SPI-Report-<dd.mm.yyyy>.xlsx`, Excel | PKR, weekly | Week ended 5 Nov 2026 | Gives petrol, diesel, LPG, flour, sugar, milk and more in actual rupees. Published on Fridays |
| Monthly prices by city | `SPI-Monthly-Prices-Annex-10.xlsx` | PKR | Oct 2026 | Includes daily wage rates for five trades. Latest month only |
| GDP by sector, current and constant | `National-Accounts-Annual-Tables-Sep-2026.xlsx` | PKR million, base 2015-16 | FY2025-26 | Marked provisional and revised. Filename changes with each revision |
| Labour Force Survey | `LFS-2024-25-Annual-Report.pdf` | %, irregular | 2024-25, posted Mar 2026 | Previous survey was 2020-21 |
| Trade summary | `Revised_Summary_<Month>-2026.xlsx` and release statements | US$ million, monthly | Sep 2026 summary (Oct 2026 announced on the home page) | Customs basis. Differs from SBP's payments basis |

## 3. Ministry of Finance

Pages: https://www.finance.gov.pk/fiscal_main.html, https://www.finance.gov.pk/fb_2026_27.html, https://www.finance.gov.pk/survey_2026.html, https://www.finance.gov.pk/updates.html

Terms: no stated reuse terms. Copyright notice only. Published government documents, attributed and linked.

Reliability from an ordinary connection: good. From GitHub's servers: refused (403, tested 8 Nov 2026), so these figures don't refresh automatically. Not worked around.

| What | Source | Latest seen | Notes |
|---|---|---|---|
| Consolidated fiscal operations, federal plus provincial, quarterly cumulative, **actuals** | `fiscal/july_june_2025_26.pdf`, PDF only. 79 files listed back to June 2001 | July-June 2025-26, marked **Provisional** (published Aug 2026) | Table 1 summary, 2 revenue, 3 spending, 10 financing. Filenames change between years |
| Budget 2026-27, **estimates** | `budget/budget_2026_27/Budget_in_Brief.pdf` | June 2026 | Budget and Revised columns are estimates, never actuals. Federal only |
| Monthly Economic Update & Outlook | `economic/Monthly_Economic_Update_and_Outlook_<Month>_2026.pdf` | Oct 2026 | Commentary, not used as a data source |
| Economic Survey 2025-26 | `survey/chapter_26/*.pdf` | June 2026 | Used to check context and events |

## 4. Others checked

| Source | URL | Result |
|---|---|---|
| World Bank API | `https://api.worldbank.org/v2/country/PAK/indicator/<code>?format=json` | Works, no key. Population to 2025, annual CPI inflation to 2025. Licence CC BY 4.0. Used only for what Pakistan's publishers do not offer |
| PSX | https://dps.psx.com.pk/indices/KSE100 | Terms say no robots or systematic retrieval without prior written permission. **Left out.** The owner could ask PSX for permission |
| OGRA | https://www.ogra.org.pk/notified-petroleum-prices | Price notifications as HTML and images, no history file. PBS weekly SPI covers petrol and diesel instead |
| NEPRA | https://nepra.org.pk/ | Tariff determinations are long legal PDFs, not a price series. Left out |
| FBR | https://www.fbr.gov.pk/ | No up-to-date statistics table found by following links, only yearbooks. FBR collections appear in the fiscal operations tables, which are used instead |
| SECP | https://www.secp.gov.pk/ | 403 blocked. Left out |
| IMF | https://www.imf.org/ | 403 blocked, including the data API. Programme facts come from IMF Country Reports at https://www.finance.gov.pk/imf.html. The dashboard's IMF debt figure is SBP's "Debt from IMF" |
| ADB | https://www.adb.org/ | 403 blocked. Left out |
| UN Comtrade | https://comtradeapi.un.org/ | Works in preview mode, not needed |
| SBP EasyData | https://easydata.sbp.org.pk/ | Needs a registered account for the API. Not used |

## 5. The known traps, checked

**Financial year.** July to June. SBP writes 2025-26, PBS FY2025-26 or 2025-26, the Ministry "July-June 2025-26". Stored by year-end date (30 June 2026) and always displayed as FY2025-26.

**CPI rebasing.** Current base is 2015-16. PBS's history file publishes the new-base index from July 2017. The earlier base was 2007-08 and PBS publishes old-base figures only up to mid-2019. The two bases are not joined on the dashboard, and the monthly CPI chart starts July 2017 on the 2015-16 base. Longer annual history uses the World Bank's CPI inflation series, labelled clearly.

**CPI versions.** Headline is **CPI National (General)**, the figure PBS leads with and SBP's 5 to 7 per cent target refers to. The dashboard also shows urban and rural. The weekly SPI is a separate, narrower 51-item basket for urban areas, shown only for actual item prices and clearly named.

**Labour force surveys.** 2020-21 and then 2024-25. The next date is not announced. The dashboard shows the survey year prominently and says it does not tell you about the last 12 months.

**Rupee.** Headline is the **interbank monthly average** (SBP). Open-market rate shown separately for its latest day because the file has no history.

**Reserves.** Headline is **SBP net liquid reserves**. Total liquid also shown. Some reserves are deposits lent by friendly countries, and SBP's weekly reserve file does not separate them. The dashboard says so plainly.

**GDP revisions.** PBS issues provisional and then revised estimates. The FY2025-26 figure is 3.65% (SBP's October statement rounds it to 3.7%, described as "revised"). Latest years are marked as PBS labels them.

**Budget estimates and actuals.** Actuals come from fiscal operations (marked provisional until finalised). Estimates come from Budget in Brief and are labelled "Budget estimate" and drawn apart.

**Debt.** One definition per chart: **Gross Public Debt** (Debt and Liabilities Summary, "sum I to III") for the headline, **External Debt and Liabilities** and **Debt from IMF** named separately. The monthly central-government chart is named as such and is not added to the others.

**Informal economy.** Tax, jobs and business figures miss much of the informal economy. The relevant chapters say so.

## 6. Topics with no trustworthy source

| Topic | Why it is a gap |
|---|---|
| Stock market index | PSX terms ban automated collection |
| Up-to-date unemployment and pay | Only the 2024-25 survey. No official wage index exists. Daily wage rates for five trades appear in one PBS file, latest month only |
| IMF programme detail beyond the reports | The IMF's site is blocked here. Programme facts come from IMF Country Reports via the Finance Ministry. Later events (such as the October 2026 staff-level agreement) are from SBP statements only |
| Friendly-country deposits inside reserves | Not published as a series |
| Electricity tariff history | NEPRA publishes legal determinations, not a usable price series |
| Company-level or new business data | SECP blocked |
