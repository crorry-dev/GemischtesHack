import {
  STATUSES,
  episodeLink,
  formatDate,
  formatDuration,
  formatNumber,
  formatShortDate,
  formatWeekday,
  loadData,
  loadEpisodeText,
  normalizeText,
  safeHttpUrl,
  statusClass,
  statusInfo,
} from "./data.js";
import { hideTooltip, renderArtists, renderDurations, renderTable, renderTimeline } from "./charts.js";

const REPO = "https://github.com/crorry-dev/GemischtesHack";
const CHUNK = 40;
const SORTS = {
  neu: (a, b) => b.number - a.number || b.id.localeCompare(a.id),
  alt: (a, b) => a.number - b.number || a.id.localeCompare(b.id),
  lang: (a, b) => (b.duration || 0) - (a.duration || 0) || b.number - a.number,
};
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktop = window.matchMedia("(min-width: 960px)");

const state = { q: "", from: 0, to: 0, status: "", artist: "", quote: false, suspected: false, sort: "neu" };
let episodes = [];
let years = [];
let artists = [];
let filtered = [];
let groups = [];
let cursor = { group: 0, index: 0, list: null };
let timelineShown = false;
let currentEpisode = null;
let openedByNavigation = false;
let closingFromHash = false;
let toastTimer;
const tables = new Set();

const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll("#status-tabs [role=radio]")];
const filterSheet = $("#filter-sheet");
const episodeSheet = $("#episode-sheet");

init();

async function init() {
  setupTheme();
  setupToolbar();
  try {
    episodes = await loadData();
  } catch (error) {
    showError(error);
    return;
  }
  years = [...new Set(episodes.map((episode) => episode.year).filter(Boolean))].sort((a, b) => a - b);
  artists = [...new Set(episodes.flatMap((episode) => episode.artists))].sort((a, b) => a.localeCompare(b, "de"));

  setupFilters();
  setupSheets();
  setupList();
  readHash();
  syncControls();
  render();
  renderIntro();
  setupReveal();
  openFromHash(false);

  window.addEventListener("hashchange", () => {
    const before = hashFor();
    readHash();
    if (hashFor() !== before) {
      syncControls();
      render();
    }
    openFromHash(true);
  });
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width === lastWidth) return;
    lastWidth = width;
    moveIndicator();
    requestAnimationFrame(() => renderCharts(false));
  }).observe($("main"));
  document.addEventListener("keydown", handleShortcuts);
}

// --- Darstellung allgemein ---------------------------------------------------------

function setupTheme() {
  const button = $("#theme-toggle");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => document.documentElement.dataset.theme || (media.matches ? "dark" : "light");
  const label = () => button.setAttribute("aria-pressed", String(current() === "dark"));
  button.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ohne Speicher gilt die Wahl nur für diesen Besuch
    }
    label();
  });
  media.addEventListener("change", label);
  label();
}

function setupToolbar() {
  const toolbar = $("#toolbar");
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--toolbar-h", `${toolbar.offsetHeight}px`);
  }).observe(toolbar);
  const marker = document.createElement("div");
  marker.setAttribute("aria-hidden", "true");
  toolbar.before(marker);
  new IntersectionObserver(([entry]) => toolbar.classList.toggle("is-stuck", !entry.isIntersecting)).observe(marker);
}

function setupReveal() {
  const items = [...document.querySelectorAll(".reveal")];
  const show = (item) => {
    item.classList.add("is-visible");
    if (item.id === "timeline-panel" && !timelineShown) {
      timelineShown = true;
      renderTimelinePanel(true);
    }
  };
  if (!("IntersectionObserver" in window) || reducedMotion.matches) {
    items.forEach(show);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      show(entry.target);
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
  items.forEach((item) => observer.observe(item));
}

function countUp(element, to, format = (value) => formatNumber(value)) {
  const from = Number(element.dataset.value || 0);
  element.dataset.value = String(to);
  if (reducedMotion.matches || from === to) {
    element.textContent = format(to);
    return;
  }
  const start = performance.now();
  const duration = 900;
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = format(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("is-visible"), 2200);
}

function showError(error) {
  const notice = $("#load-error");
  notice.textContent = `${error.message} Bitte später noch einmal versuchen oder einen Issue im Repository eröffnen.`;
  notice.hidden = false;
  for (const selector of ["#toolbar", ".overview", ".list-section"]) $(selector).hidden = true;
  document.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
}

// --- Filter und Adresse -------------------------------------------------------------

function setupFilters() {
  const search = $("#search");
  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = search.value.trim();
      update();
    }, 150);
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && filtered.length === 1) openEpisode(filtered[0].id);
  });

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      state.status = tab.dataset.status;
      update();
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const index = tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1);
      const next = tabs[(index + tabs.length) % tabs.length];
      state.status = next.dataset.status;
      update();
      next.focus();
    });
  }

  $("#filter-button").addEventListener("click", () => openSheet(filterSheet));
  const chips = $("#year-chips");
  chips.replaceChildren(...[null, ...years].map((year) => {
    const chip = element("button", "chip", year === null ? "Alle" : String(year));
    chip.type = "button";
    chip.dataset.year = year === null ? "" : String(year);
    chip.addEventListener("click", () => {
      const single = isNarrowed() && state.from === year && state.to === year;
      state.from = year === null || single ? years[0] : year;
      state.to = year === null || single ? years.at(-1) : year;
      update();
    });
    return chip;
  }));
  $("#artist-field").hidden = artists.length === 0;
  $("#artist").replaceChildren(new Option("Alle", ""), ...artists.map((artist) => new Option(artist, artist)));
  $("#artist").addEventListener("change", (event) => {
    state.artist = event.target.value;
    update();
  });
  for (const input of document.querySelectorAll("#sort-control input")) {
    input.addEventListener("change", () => {
      state.sort = input.value;
      update();
    });
  }
  $("#only-quotes").addEventListener("change", (event) => {
    state.quote = event.target.checked;
    update();
  });
  $("#with-suspected").addEventListener("change", (event) => {
    state.suspected = event.target.checked;
    update();
  });
  $("#filter-reset").addEventListener("click", () => {
    resetFilters();
    update();
  });
}

function resetFilters() {
  Object.assign(state, {
    q: "",
    from: years[0] || 0,
    to: years.at(-1) || 0,
    status: "",
    artist: "",
    quote: false,
    suspected: false,
    sort: "neu",
  });
}

function update() {
  syncControls();
  render();
  writeHash();
  const listTop = $("#liste").getBoundingClientRect().top + window.scrollY - $("#toolbar").offsetHeight;
  if (window.scrollY > listTop) window.scrollTo({ top: listTop, behavior: reducedMotion.matches ? "auto" : "smooth" });
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const clampYear = (value) => (years.length ? Math.min(years.at(-1), Math.max(years[0], value)) : 0);
  state.q = params.get("q") || "";
  state.from = clampYear(Number(params.get("von")) || years[0] || 0);
  state.to = clampYear(Number(params.get("bis")) || years.at(-1) || 0);
  if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
  state.status = STATUSES.some((status) => status.key === params.get("status")) ? params.get("status") : "";
  state.artist = artists.find((artist) => artist === params.get("interpret")) || "";
  state.quote = params.get("zitat") === "1";
  state.suspected = params.get("vermutet") === "1";
  state.sort = SORTS[params.get("sort")] ? params.get("sort") : "neu";
}

function hashFor(extra = {}) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (years.length && state.from !== years[0]) params.set("von", state.from);
  if (years.length && state.to !== years.at(-1)) params.set("bis", state.to);
  if (state.status) params.set("status", state.status);
  if (state.artist) params.set("interpret", state.artist);
  if (state.quote) params.set("zitat", "1");
  if (state.suspected) params.set("vermutet", "1");
  if (state.sort !== "neu") params.set("sort", state.sort);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function writeHash(folge = "") {
  const hash = hashFor({ folge });
  history.replaceState(history.state, "", hash ? `#${hash}` : location.pathname + location.search);
}

function syncControls() {
  const search = $("#search");
  if (document.activeElement !== search) search.value = state.q;
  for (const tab of tabs) {
    const active = tab.dataset.status === state.status;
    tab.setAttribute("aria-checked", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  moveIndicator();
  for (const chip of document.querySelectorAll("#year-chips .chip")) {
    const year = Number(chip.dataset.year);
    const pressed = chip.dataset.year ? isNarrowed() && year >= state.from && year <= state.to : !isNarrowed();
    chip.setAttribute("aria-pressed", String(pressed));
  }
  $("#artist").value = state.artist;
  for (const input of document.querySelectorAll("#sort-control input")) input.checked = input.value === state.sort;
  $("#only-quotes").checked = state.quote;
  $("#with-suspected").checked = state.suspected;
  const active = [isNarrowed(), state.artist, state.quote, state.suspected, state.sort !== "neu"].filter(Boolean).length;
  const badge = $("#filter-badge");
  badge.hidden = active === 0;
  badge.textContent = String(active);
}

function moveIndicator() {
  const active = tabs.find((tab) => tab.getAttribute("aria-checked") === "true");
  const indicator = $(".tab-indicator");
  if (!active || !active.offsetWidth) return;
  indicator.style.setProperty("--x", `${active.offsetLeft}px`);
  indicator.style.setProperty("--w", `${active.offsetWidth}px`);
}

function isNarrowed() {
  return years.length > 0 && (state.from > years[0] || state.to < years.at(-1));
}

function hasStatus(episode, status) {
  return episode.usages.some((usage) => usage.status === status);
}

function matches(episode, ignoreStatus = false) {
  if (isNarrowed() && (!episode.year || episode.year < state.from || episode.year > state.to)) return false;
  if (!ignoreStatus && state.status && !hasStatus(episode, state.status)) return false;
  if (state.artist && !episode.artists.includes(state.artist)) return false;
  if (state.quote && !episode.hasQuote) return false;
  const terms = normalizeText(state.q).split(/\s+/).filter(Boolean);
  return terms.every((term) => {
    const number = term.match(/^#?(\d+)$/);
    return number ? episode.id === String(Number(number[1])) || episode.titleKey.includes(number[1]) : episode.search.includes(term);
  });
}

function describeFilters() {
  const parts = [];
  if (isNarrowed()) parts.push(state.from === state.to ? String(state.from) : `${state.from}–${state.to}`);
  if (state.status) parts.push(statusInfo(state.status).label);
  if (state.artist) parts.push(state.artist);
  if (state.quote) parts.push("mit Zitat");
  if (state.q) parts.push(`„${state.q}“`);
  return parts.length ? parts.join(" · ") : `Alle ${formatNumber(episodes.length)} Folgen`;
}

// --- Seite aufbauen --------------------------------------------------------------------

function render() {
  filtered = episodes.filter((episode) => matches(episode)).sort(SORTS[state.sort]);
  const base = episodes.filter((episode) => matches(episode, true));
  for (const tab of tabs) {
    const count = tab.dataset.status ? base.filter((episode) => hasStatus(episode, tab.dataset.status)).length : base.length;
    tab.querySelector(".tab-count").textContent = formatNumber(count);
  }
  requestAnimationFrame(moveIndicator);
  $("#overview-note").textContent = describeFilters();
  renderStats(filtered);
  renderCharts(false);
  resetList();
}

function renderIntro() {
  const found = episodes.filter((episode) => episode.hasQuote).length;
  const seconds = episodes.reduce((sum, episode) => sum + (episode.duration || 0), 0);
  countUp($("#found-count"), found);
  $("#total-count").textContent = formatNumber(episodes.length);
  requestAnimationFrame(() => {
    $("#progress-bar").style.setProperty("--value", episodes.length ? found / episodes.length : 0);
  });
  const parts = [`${formatNumber(episodes.length)} Folgen`];
  if (seconds) parts.push(`${formatNumber(Math.round(seconds / 3600))} Stunden`);
  if (years.length) parts.push(`seit ${years[0]}`);
  $("#intro-meta").textContent = parts.join(" · ");
}

function renderStats(list) {
  const durations = list.map((episode) => episode.duration).filter(Boolean);
  const seconds = durations.reduce((sum, value) => sum + value, 0);
  const usages = list.flatMap((episode) => episode.usages);
  const quotes = list.filter((episode) => episode.hasQuote).length;
  const confirmed = usages.filter((usage) => usage.status === "bestätigt").length;
  const suspected = usages.filter((usage) => usage.status === "vermutet").length;
  const dated = list.filter((episode) => episode.year).map((episode) => episode.year);
  const items = [
    { key: "episodes", label: "Folgen", value: list.length, sub: list.length === episodes.length ? "insgesamt" : `von ${formatNumber(episodes.length)}` },
    { key: "quotes", label: "Zitate erfasst", value: quotes, sub: list.length ? `${Math.round((quotes / list.length) * 100)} % der Folgen` : "–" },
    { key: "songs", label: "Songs bestätigt", value: confirmed, sub: suspected ? `+ ${formatNumber(suspected)} vermutet` : "mit Beleg" },
    durations.length
      ? { key: "hours", label: "Stunden", value: Math.round(seconds / 3600), sub: `Ø ${formatDuration(seconds / durations.length)} pro Folge` }
      : { key: "span", label: "Zeitraum", text: dated.length ? `${Math.min(...dated)}–${Math.max(...dated)}` : "–", sub: "Länge noch nicht erfasst" },
  ];

  const container = $("#stats");
  if (container.dataset.keys !== items.map((item) => item.key).join()) {
    container.dataset.keys = items.map((item) => item.key).join();
    container.replaceChildren(...items.map((item) => {
      const stat = element("div", "stat");
      stat.dataset.key = item.key;
      const value = element("dd");
      value.append(element("span", "stat-value"), element("span", "stat-sub"));
      stat.append(element("dt", "", item.label), value);
      return stat;
    }));
  }
  for (const item of items) {
    const stat = container.querySelector(`[data-key="${item.key}"]`);
    const value = stat.querySelector(".stat-value");
    value.classList.toggle("is-text", Boolean(item.text));
    if (item.text) value.textContent = item.text;
    else countUp(value, item.value);
    stat.querySelector(".stat-sub").textContent = item.sub;
  }
}

function renderCharts(animate) {
  if (timelineShown) renderTimelinePanel(animate);
  if ($("#more").open) renderMore(animate);
}

function renderTimelinePanel(animate) {
  const shownYears = years.filter((year) => year >= state.from && year <= state.to);
  const inRange = episodes.filter((episode) => episode.year && episode.year >= state.from && episode.year <= state.to);
  const ids = new Set(filtered.map((episode) => episode.id));
  const showTable = tables.has("timeline");
  $("#timeline").hidden = showTable;
  $("#timeline-table").hidden = !showTable;
  if (showTable) {
    renderTable($("#timeline-table"), ["Jahr", "Folgen", "mit Zitat", ...STATUSES.map((status) => status.label)], shownYears.map((year) => {
      const items = filtered.filter((episode) => episode.year === year);
      return [
        String(year),
        formatNumber(items.length),
        formatNumber(items.filter((episode) => episode.hasQuote).length),
        ...STATUSES.map((status) => formatNumber(items.filter((episode) => episode.status === status.key).length)),
      ];
    }));
    return;
  }
  renderTimeline($("#timeline"), {
    years: shownYears,
    episodes: inRange,
    isMatch: (episode) => ids.has(episode.id),
    activeYear: isNarrowed() && state.from === state.to ? state.from : null,
    onOpen: (episode) => openEpisode(episode.id),
    onYear: (year) => {
      const single = isNarrowed() && state.from === year && state.to === year;
      state.from = single ? years[0] : year;
      state.to = single ? years.at(-1) : year;
      update();
    },
    animate,
  });
}

function renderMore(animate) {
  // Erst das Panel daneben ein- oder ausblenden, dann hat das Diagramm seine endgültige Breite
  const counts = new Map();
  for (const usage of filtered.flatMap((episode) => episode.usages)) {
    if (usage.artist && (usage.status === "bestätigt" || (state.suspected && usage.status === "vermutet"))) {
      counts.set(usage.artist, (counts.get(usage.artist) || 0) + 1);
    }
  }
  const rows = [...counts].map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist, "de"))
    .slice(0, 8);
  $("#artists-panel").hidden = rows.length === 0;
  if (rows.length > 0) {
    renderArtists($("#artists"), {
      rows,
      selected: state.artist,
      onSelect: (artist) => {
        state.artist = state.artist === artist ? "" : artist;
        update();
      },
    });
    $("#artists-caption").textContent = state.suspected
      ? "Bestätigte und vermutete Songs. Antippen filtert."
      : "Nur bestätigte Songs. Antippen filtert.";
  }
  // Ohne erfasste Längen bleibt das Panel ganz weg statt leer zu stehen
  const timed = filtered.filter((episode) => episode.date && episode.duration).length;
  $("#duration-panel").hidden = timed < 2;
  const showTable = tables.has("durations");
  $("#durations").hidden = showTable;
  $("#duration-readout").hidden = showTable;
  $("#durations-table").hidden = !showTable;
  if (showTable) {
    const shownYears = years.filter((year) => year >= state.from && year <= state.to);
    renderTable($("#durations-table"), ["Jahr", "Folgen", "Schnitt", "Längste", "Kürzeste"], shownYears.map((year) => {
      const values = filtered.filter((episode) => episode.year === year && episode.duration).map((episode) => episode.duration);
      if (values.length === 0) return [String(year), "0", "–", "–", "–"];
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return [String(year), formatNumber(values.length), formatDuration(average), formatDuration(Math.max(...values)), formatDuration(Math.min(...values))];
    }));
  } else if (timed >= 2) {
    renderDurations($("#durations"), $("#duration-readout"), {
      episodes: filtered,
      onOpen: (episode) => openEpisode(episode.id),
      animate,
    });
  }

  renderFacts(filtered);
}

function renderFacts(list) {
  const facts = [];
  const timed = list.filter((episode) => episode.duration);
  if (timed.length > 0) {
    const longest = timed.reduce((best, episode) => (episode.duration > best.duration ? episode : best));
    const shortest = timed.reduce((best, episode) => (episode.duration < best.duration ? episode : best));
    facts.push(["Längste Folge", formatDuration(longest.duration), `#${longest.id} ${longest.title}`, longest]);
    facts.push(["Kürzeste Folge", formatDuration(shortest.duration), `#${shortest.id} ${shortest.title}`, shortest]);
  }
  const dated = list.filter((episode) => episode.date).sort((a, b) => a.date - b.date);
  if (dated.length > 1) {
    // nur direkt aufeinanderfolgende Folgen vergleichen, sonst wären Lücken in den Daten eine "Pause"
    let gap = { days: 0 };
    for (let index = 1; index < dated.length; index += 1) {
      if (dated[index].number !== dated[index - 1].number + 1) continue;
      const days = Math.round((dated[index].date - dated[index - 1].date) / 86400000);
      if (days > gap.days) gap = { days, before: dated[index - 1], after: dated[index] };
    }
    if (gap.before) facts.push(["Längste Pause", `${formatNumber(gap.days)} Tage`, `vor #${gap.after.id}`, gap.after]);
    const weekdays = new Map();
    for (const episode of dated) {
      const day = formatWeekday(episode.date);
      weekdays.set(day, (weekdays.get(day) || 0) + 1);
    }
    const [day, count] = [...weekdays].sort((a, b) => b[1] - a[1])[0];
    facts.push(["Erscheint meist", day, `bei ${Math.round((count / dated.length) * 100)} % der Folgen`]);
    const newest = dated.at(-1);
    facts.push(["Neueste Folge", `#${newest.id}`, `${newest.title} · ${formatDate(newest.date)}`, newest]);
  }
  $("#facts").replaceChildren(...facts.map(([label, value, note, episode]) => {
    const fact = element("div", "fact");
    const content = element("dd");
    const target = episode ? element("a") : content;
    if (episode) {
      target.href = `#${hashFor({ folge: episode.id })}`;
      content.append(target);
    }
    target.append(element("strong", "", value), element("small", "", note));
    fact.append(element("dt", "", label), content);
    return fact;
  }));
}

// --- Folgenliste ---------------------------------------------------------------------------

function setupList() {
  const end = $("#list-end");
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    appendRows();
    // erneut beobachten, damit auf großen Bildschirmen nachgeladen wird, bis die Seite voll ist
    observer.unobserve(end);
    observer.observe(end);
  }, { rootMargin: "800px 0px" });
  observer.observe(end);
}

function resetList() {
  const container = $("#episode-list");
  const grouped = state.sort !== "lang";
  groups = [];
  for (const episode of filtered) {
    const key = grouped ? episode.year || "Ohne Datum" : "";
    if (!groups.length || groups.at(-1).key !== key) groups.push({ key, episodes: [] });
    groups.at(-1).episodes.push(episode);
  }
  cursor = { group: 0, index: 0, list: null };
  $("#result-count").textContent = filtered.length === episodes.length
    ? `${formatNumber(filtered.length)} Folgen`
    : `${formatNumber(filtered.length)} von ${formatNumber(episodes.length)}`;

  if (filtered.length === 0) {
    const empty = element("div", "list-empty");
    empty.append(element("p", "", "Keine Folge passt zu dieser Auswahl."));
    const reset = element("button", "button", "Filter zurücksetzen");
    reset.type = "button";
    reset.addEventListener("click", () => {
      resetFilters();
      update();
    });
    empty.append(reset);
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren();
  appendRows();
}

function appendRows() {
  const container = $("#episode-list");
  let added = 0;
  while (added < CHUNK && cursor.group < groups.length) {
    const group = groups[cursor.group];
    if (cursor.index === 0) {
      if (group.key !== "") container.append(yearHead(group));
      cursor.list = element("ol", "rows");
      container.append(cursor.list);
    }
    const item = element("li");
    item.append(episodeRow(group.episodes[cursor.index], added, group.key !== ""));
    cursor.list.append(item);
    added += 1;
    cursor.index += 1;
    if (cursor.index >= group.episodes.length) {
      cursor.group += 1;
      cursor.index = 0;
    }
  }
}

function yearHead(group) {
  const head = element("header", "year-head");
  const withQuote = group.episodes.filter((episode) => episode.hasQuote).length;
  head.append(
    element("h3", "", String(group.key)),
    element("p", "", `${formatNumber(group.episodes.length)} Folgen${withQuote ? ` · ${formatNumber(withQuote)} mit Zitat` : ""}`),
  );
  return head;
}

function episodeRow(episode, index, grouped) {
  const row = element("a", `row ${statusClass(episode.status)}`);
  row.href = `#${hashFor({ folge: episode.id })}`;
  row.style.setProperty("--i", String(Math.min(index, 14)));
  const body = element("span", "row-body");
  const date = grouped ? formatShortDate(episode.date) : formatDate(episode.date);
  body.append(
    element("span", "row-title", episode.title || "Folge ohne Titel"),
    element("span", "row-meta", [date, formatDuration(episode.duration)].filter(Boolean).join(" · ")),
  );
  const extra = element("span", "row-extra");
  if (episode.quote) extra.append(element("span", "row-quote", `„${episode.quote}“`));
  if (episode.song) extra.append(element("span", "row-song", [episode.song.artist, episode.song.song].filter(Boolean).join(" – ")));
  row.append(
    element("span", "row-num", episode.id),
    body,
    extra,
    element("span", `row-dot ${statusClass(episode.status)}`),
    element("span", "sr-only", `Status: ${statusInfo(episode.status).label}`),
  );
  return row;
}

// --- Sheets ------------------------------------------------------------------------------

function setupSheets() {
  for (const dialog of [filterSheet, episodeSheet]) {
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeSheet(dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest("[data-close]")) closeSheet(dialog);
    });
    enableDrag(dialog);
  }
  episodeSheet.addEventListener("close", () => {
    $("#ep-embed-slot").replaceChildren();
    currentEpisode = null;
    if (closingFromHash) {
      closingFromHash = false;
    } else if (openedByNavigation) {
      openedByNavigation = false;
      history.back();
    } else {
      writeHash();
    }
  });
  $("#more").addEventListener("toggle", () => {
    if ($("#more").open) renderMore(true);
  });
  for (const button of document.querySelectorAll("[data-table-toggle]")) {
    button.addEventListener("click", () => {
      const name = button.dataset.tableToggle;
      if (tables.has(name)) tables.delete(name);
      else tables.add(name);
      button.setAttribute("aria-pressed", String(tables.has(name)));
      button.textContent = tables.has(name) ? "Als Diagramm" : "Als Tabelle";
      renderCharts(false);
    });
  }
  $("#ep-share").addEventListener("click", shareEpisode);
  $("#ep-embed").addEventListener("click", loadPlayer);
  $("#ep-more").addEventListener("click", () => {
    const text = $("#ep-text");
    text.classList.toggle("is-clamped");
    $("#ep-more").textContent = text.classList.contains("is-clamped") ? "Mehr lesen" : "Weniger";
  });
  $("#ep-prev").addEventListener("click", () => navigate(-1));
  $("#ep-next").addEventListener("click", () => navigate(1));
}

function openSheet(dialog) {
  if (dialog.open) return;
  dialog.classList.remove("is-closing");
  hideTooltip();
  dialog.showModal();
  dialog.querySelector(".sheet-panel").scrollTop = 0;
}

function closeSheet(dialog) {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  const panel = dialog.querySelector(".sheet-panel");
  if (reducedMotion.matches) {
    dialog.close();
    return;
  }
  dialog.classList.add("is-closing");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    dialog.classList.remove("is-closing");
    panel.style.transform = "";
    panel.style.transition = "";
    dialog.close();
  };
  panel.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 400);
}

// Auf dem Handy lässt sich das Sheet am Griff nach unten wegziehen
function enableDrag(dialog) {
  const panel = dialog.querySelector(".sheet-panel");
  let startY = null;
  let delta = 0;
  let started = 0;
  for (const handle of dialog.querySelectorAll(".sheet-grip, .sheet-head")) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || desktop.matches || event.target.closest("button, a")) return;
      startY = event.clientY;
      delta = 0;
      started = performance.now();
      panel.classList.add("is-dragging");
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // ohne Capture funktioniert das Ziehen trotzdem, solange der Finger auf dem Griff bleibt
      }
    });
    handle.addEventListener("pointermove", (event) => {
      if (startY === null) return;
      delta = Math.max(0, event.clientY - startY);
      panel.style.transform = `translateY(${delta}px)`;
    });
    const release = () => {
      if (startY === null) return;
      startY = null;
      panel.classList.remove("is-dragging");
      const fast = delta / Math.max(1, performance.now() - started) > 0.6;
      panel.style.transition = "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)";
      if (delta > 110 || (fast && delta > 30)) {
        panel.style.transform = "translateY(100%)";
        setTimeout(() => {
          panel.style.transition = "";
          panel.style.transform = "";
          dialog.close();
        }, 260);
      } else {
        panel.style.transform = "";
        setTimeout(() => {
          panel.style.transition = "";
        }, 300);
      }
    };
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
  }
}

// --- Detailansicht einer Folge ----------------------------------------------------------------

function openEpisode(id) {
  location.hash = hashFor({ folge: id });
}

function openFromHash(viaNavigation) {
  const id = new URLSearchParams(location.hash.slice(1)).get("folge");
  const episode = id && episodes.find((item) => item.id === id);
  if (episode) {
    fillEpisode(episode);
    if (!episodeSheet.open) {
      openedByNavigation = viaNavigation;
      openSheet(episodeSheet);
    }
  } else if (episodeSheet.open) {
    closingFromHash = true;
    closeSheet(episodeSheet);
  }
}

function neighbours(episode) {
  const list = filtered.some((item) => item.id === episode.id) ? filtered : [...episodes].sort(SORTS[state.sort]);
  const index = list.findIndex((item) => item.id === episode.id);
  return [list[index - 1], list[index + 1]];
}

function navigate(step) {
  if (!currentEpisode) return;
  const next = neighbours(currentEpisode)[step < 0 ? 0 : 1];
  if (!next) return;
  writeHash(next.id);
  fillEpisode(next);
  episodeSheet.querySelector(".sheet-panel").scrollTop = 0;
}

function statusBadge(status) {
  const badge = element("span", "status-badge");
  badge.append(element("span", `status-dot ${statusClass(status)}`), statusInfo(status).label);
  return badge;
}

function fillEpisode(episode) {
  currentEpisode = episode;
  $("#ep-embed-slot").replaceChildren();
  $("#ep-embed").hidden = !episode.spotifyId;
  $("#ep-number").textContent = `#${episode.id}`;
  $("#ep-status").replaceChildren(statusBadge(episode.status));
  $("#ep-title").textContent = episode.title || "Folge ohne Titel";
  const meta = [formatDate(episode.date), episode.date && formatWeekday(episode.date), formatDuration(episode.duration)].filter(Boolean);
  $("#ep-meta").replaceChildren(...meta.map((value) => element("li", "", value)));

  const spotify = $("#ep-spotify");
  spotify.hidden = !episode.url;
  if (episode.url) spotify.href = episode.url;
  $("#ep-usages").replaceChildren(...episode.usages.map((usage, index) => usageBlock(episode, usage, episode.usages.length > 1 ? index + 1 : 0)));
  $("#ep-issue").href = issueLink(episode);

  const [previous, next] = neighbours(episode);
  for (const [button, target] of [[$("#ep-prev"), previous], [$("#ep-next"), next]]) {
    button.disabled = !target;
    button.querySelector(".nav-label").textContent = target ? `#${target.id}` : "";
  }
  showDescription(episode);
}

function usageBlock(episode, usage, position) {
  const block = element("section", "ep-block");
  const head = element("div", "usage-head");
  head.append(element("h3", "", position ? `Einstiegszitat ${position}` : "Einstiegszitat"));
  const link = usage.seconds !== null && episodeLink(episode, usage.seconds);
  if (link) {
    const listen = element("a", "listen", `▶ ab ${usage.time}`);
    listen.href = link;
    listen.target = "_blank";
    listen.rel = "noopener noreferrer";
    head.append(listen);
  }
  block.append(head);
  block.append(usage.quote
    ? element("blockquote", "quote", usage.quote)
    : element("p", "missing", "Noch kein Zitat eingetragen. Kennst du es? Schlag es unten vor."));

  const details = element("dl", "details");
  const add = (label, content) => {
    if (!content) return;
    const row = element("div", "detail");
    const value = element("dd");
    value.append(content);
    row.append(element("dt", "", label), value);
    details.append(row);
  };
  if (usage.song) {
    const song = document.createDocumentFragment();
    song.append(usage.song);
    if (usage.trackUrl) {
      const track = element("a", "inline-link", "auf Spotify");
      track.href = usage.trackUrl;
      track.target = "_blank";
      track.rel = "noopener noreferrer";
      song.append(" · ", track);
    }
    add("Song", song);
  }
  add("Interpret/in", usage.artist);
  if (position || usage.status !== "offen") {
    const status = document.createDocumentFragment();
    status.append(statusBadge(usage.status), element("small", "", statusInfo(usage.status).hint));
    add("Prüfstatus", status);
  }
  add("Kontext", usage.context);
  if (usage.sources.length > 0) {
    const list = element("ul");
    for (const source of usage.sources) {
      const item = element("li");
      const url = safeHttpUrl(source);
      if (url) {
        const anchor = element("a", "inline-link", new URL(url).hostname.replace(/^www\./, ""));
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        item.append(anchor);
      } else {
        item.textContent = source;
      }
      list.append(item);
    }
    add("Quellen", list);
  }
  add("Beitrag von", usage.contributor);
  add("Namensnennung", usage.attribution);
  add("Lizenz", usage.license);
  if (details.children.length > 0) block.append(details);
  return block;
}

async function showDescription(episode) {
  const block = $("#ep-description");
  block.hidden = true;
  const text = await loadEpisodeText(episode.file);
  if (!text || currentEpisode !== episode) return;
  const container = $("#ep-text");
  container.replaceChildren(...markdownBlocks(text));
  container.classList.add("is-clamped");
  block.hidden = false;
  const overflowing = container.scrollHeight > container.clientHeight + 4;
  container.classList.toggle("is-clamped", overflowing);
  $("#ep-more").hidden = !overflowing;
  $("#ep-more").textContent = "Mehr lesen";
}

// Die Beschreibung ist schlichtes Markdown: Absätze, Listen, Links und Fettdruck
function markdownBlocks(text) {
  return text.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").filter((line) => line.trim());
    if (lines.length > 0 && lines.every((line) => line.startsWith("- "))) {
      const list = element("ul");
      for (const line of lines) {
        const item = element("li");
        item.append(inlineMarkdown(line.slice(2)));
        list.append(item);
      }
      return list;
    }
    const paragraph = element("p");
    lines.forEach((line, index) => {
      if (index > 0) paragraph.append(element("br"));
      paragraph.append(inlineMarkdown(line));
    });
    return paragraph;
  });
}

function inlineMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(text.slice(last, match.index));
    if (match[1]) {
      const url = safeHttpUrl(match[2]);
      if (url) {
        const link = element("a", "", match[1]);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        fragment.append(link);
      } else {
        fragment.append(match[1]);
      }
    } else {
      fragment.append(element("strong", "", match[3]));
    }
    last = match.index + match[0].length;
  }
  fragment.append(text.slice(last));
  return fragment;
}

function loadPlayer() {
  if (!currentEpisode || !currentEpisode.spotifyId) return;
  const frame = document.createElement("iframe");
  frame.src = `https://open.spotify.com/embed/episode/${currentEpisode.spotifyId}`;
  frame.title = `Spotify-Player: ${currentEpisode.title}`;
  frame.loading = "lazy";
  frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  $("#ep-embed-slot").replaceChildren(frame);
  $("#ep-embed").hidden = true;
}

async function shareEpisode() {
  if (!currentEpisode) return;
  const url = `${location.origin}${location.pathname}#folge=${currentEpisode.id}`;
  const title = `#${currentEpisode.id} ${currentEpisode.title}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      // abgebrochen
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link kopiert");
  } catch {
    toast(url);
  }
}

function issueLink(episode) {
  const title = `Zitat zu Folge #${episode.id}: ${episode.title}`;
  const lines = [`Folge: #${episode.id} ${episode.title}`];
  if (episode.dateText) lines.push(`Datum: ${episode.dateText}`);
  if (episode.url) lines.push(`Spotify: ${episode.url}`);
  lines.push("", "Zitat (Wortlaut oder kurze Beschreibung):", "", "Song und Interpret/in:", "", "Zeitmarke (HH:MM:SS):", "", "Beleg / Quelle:", "");
  return `${REPO}/issues/new?${new URLSearchParams({ title, body: lines.join("\n") })}`;
}

// --- Tastatur -------------------------------------------------------------------------------

function handleShortcuts(event) {
  const typing = event.target.closest("input, select, textarea");
  if (event.key === "/" && !typing && !filterSheet.open && !episodeSheet.open) {
    event.preventDefault();
    $("#search").focus();
  } else if (episodeSheet.open && !typing && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    navigate(event.key === "ArrowRight" ? 1 : -1);
  }
}
