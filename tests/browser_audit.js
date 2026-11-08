// Page audit: paste into the browser console on the dashboard, or run from a browser tool.
// Goes through every range, chapter and chart, and returns the problems it finds.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const stats = { chapters: 0, cards: 0, tables: 0, tooltips: 0, expands: 0, ranges: 0 };
  const titleOf = (el) => el.closest("article")?.querySelector("h3")?.textContent ?? "page";
  const BAD = /\bNaN\b|\bundefined\b|\bnull\b|\bInfinity\b|\[object|\$-|\+-|--\d|%%|\$\$/;

  const pageChecks = (label) => {
    const text = document.body.innerText;
    const m = text.match(new RegExp(`.{0,40}(${BAD.source}).{0,40}`));
    if (m) problems.push(`${label}: bad text "${m[0]}"`);
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) problems.push(`${label}: page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`);
    const bar = document.querySelector(".topbar");
    if (bar && bar.getBoundingClientRect().height > 110) problems.push(`${label}: top bar is ${Math.round(bar.getBoundingClientRect().height)}px tall`);
    document.querySelectorAll(".tile").forEach((tile) => {
      if (tile.scrollWidth > tile.clientWidth + 1) problems.push(`${label}: tile "${tile.querySelector(".label")?.textContent}" overflows`);
    });
    document.querySelectorAll("article.card").forEach((a) => {
      const t = titleOf(a);
      if (a.scrollWidth > a.clientWidth + 1) problems.push(`${label}: "${t}" card overflows`);
      if (!a.querySelector("footer a")) problems.push(`${label}: "${t}" has no source link`);
      if (!a.querySelector(".fact-body") && !a.querySelector(".takeaway")?.textContent.trim()) problems.push(`${label}: "${t}" has no summary`);
      if (a.querySelector(".fact-body")) return; // a fact card, no chart expected
      const svg = a.querySelector(".chart-wrap svg");
      if (!svg) { problems.push(`${label}: "${t}" has no chart`); return; }
      const box = svg.getBoundingClientRect();
      if (box.width < 100 || box.height < 100) problems.push(`${label}: "${t}" chart is ${box.width}x${box.height}`);
      const texts = [...svg.querySelectorAll("text")].map((x) => ({ t: x.textContent, r: x.getBoundingClientRect() })).filter((o) => o.r.width > 0);
      stats.labels = (stats.labels || 0) + texts.length;
      if (!texts.length) problems.push(`${label}: "${t}" chart has no labels (the browser may not have drawn it; an empty check is a failure)`);
      for (const o of texts) {
        if (o.r.left < box.left - 2 || o.r.right > box.right + 2) problems.push(`${label}: "${t}" label "${o.t}" cut off at the side`);
        if (o.r.top < box.top - 4 || o.r.bottom > box.bottom + 4) problems.push(`${label}: "${t}" label "${o.t}" cut off at top or bottom`);
      }
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const A = texts[i].r, B = texts[j].r;
        if (A.left < B.right && B.left < A.right && A.top < B.bottom - 2 && B.top < A.bottom - 2) problems.push(`${label}: "${t}" labels overlap: ${texts[i].t} / ${texts[j].t}`);
      }
    });
  };

  if (document.visibilityState !== "visible") problems.push(`tab is ${document.visibilityState}: charts may not draw, take a screenshot first`);
  const button = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
  for (const r of ["5 yrs", "10 yrs", "30 yrs", "All"]) {
    button(r)?.click();
    await wait(900);
    stats.ranges++;
    pageChecks(r);
  }
  button("10 yrs")?.click();
  await wait(700);

  // Every chapter has a number, a verdict and charts; every nav link leads to one.
  document.querySelectorAll("main section.chapter").forEach((c) => {
    stats.chapters++;
    if (!c.querySelector(".badge")) problems.push(`chapter ${c.id} has no number`);
    if (!c.querySelector(".verdict")?.textContent.trim()) problems.push(`chapter ${c.id} has no verdict`);
    if (!c.querySelector("article.card")) problems.push(`chapter ${c.id} has no charts`);
  });
  document.querySelectorAll(".topbar-nav a").forEach((a) => {
    if (!document.getElementById(a.getAttribute("href").slice(1))) problems.push(`nav link ${a.getAttribute("href")} goes nowhere`);
  });
  if (document.querySelectorAll(".tiles-headline .tile").length !== 4) problems.push("the top of the page should have four headline cards");

  const cards = [...document.querySelectorAll("article.card")];
  stats.cards = cards.length;
  for (const a of cards) {
    const t = titleOf(a);
    a.scrollIntoView({ block: "center" });
    await wait(80);
    const host = a.querySelector(".chart-wrap svg")?.parentElement;
    if (host) {
      const box = host.getBoundingClientRect();
      for (const f of [0.2, 0.5, 0.8]) {
        const x = box.left + box.width * f, y = box.top + box.height * 0.45;
        for (const type of ["mouseover", "mousemove"]) host.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, view: window }));
        await wait(70);
        const tip = a.querySelector(".tt");
        if (tip) {
          stats.tooltips++;
          if (BAD.test(tip.innerText)) problems.push(`"${t}" tooltip has bad text: ${tip.innerText.slice(0, 80)}`);
          const tb = tip.parentElement.getBoundingClientRect();
          if (tb.left < -1 || tb.right > innerWidth + 1) problems.push(`"${t}" tooltip runs off screen`);
        }
      }
      host.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    }
    // Rows that say "other" open to show what's inside.
    for (const chip of a.querySelectorAll(".chip-btn")) {
      if (chip.getAttribute("aria-expanded") === "true") { chip.click(); await wait(40); }
      chip.click();
      await wait(60);
      const panel = a.querySelector(".expand-panel");
      if (!panel?.innerText.trim()) problems.push(`"${t}": "${chip.textContent.trim()}" opens nothing`);
      else {
        stats.expands++;
        if (panel.scrollWidth > panel.clientWidth + 1) problems.push(`"${t}": breakdown overflows`);
        if (BAD.test(panel.innerText)) problems.push(`"${t}": breakdown has bad text`);
      }
      chip.click();
      await wait(30);
    }
    const toggle = [...a.querySelectorAll("button")].find((b) => b.textContent === "Show table");
    if (toggle) {
      toggle.click();
      await wait(40);
      const rows = [...a.querySelectorAll("table tbody tr")];
      if (!rows.length) problems.push(`"${t}" table is empty`);
      else stats.tables++;
      const head = a.querySelectorAll("table thead th").length;
      for (const row of rows) {
        if (row.children.length !== head) { problems.push(`"${t}" table row has ${row.children.length} cells, header has ${head}`); break; }
        if (BAD.test(row.textContent)) { problems.push(`"${t}" table has bad text: ${row.textContent.slice(0, 80)}`); break; }
      }
      toggle.click();
      await wait(20);
    } else if (!a.querySelector(".fact-body")) problems.push(`"${t}" has no table button`);
  }

  const dupes = [...document.querySelectorAll("[id]")].map((e) => e.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (dupes.length) problems.push(`duplicate ids: ${[...new Set(dupes)].join(", ")}`);
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    if (id && !document.getElementById(id)) problems.push(`link ${a.getAttribute("href")} goes nowhere`);
  });
  const links = [...new Set([...document.querySelectorAll('a[href^="http"]')].map((a) => a.href))];
  if (!stats.labels) problems.push("no chart labels were found at all: the test checked nothing");
  return { width: innerWidth, theme: document.documentElement.getAttribute("data-theme"), stats, problems: [...new Set(problems)], links };
})();
