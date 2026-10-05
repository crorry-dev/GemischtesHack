import {
  STATUSES,
  episodeLink,
  formatDate,
  formatDuration,
  formatLongDate,
  formatNumber,
  formatWeekday,
  loadData,
  normalizeText,
  safeHttpUrl,
  statusInfo,
} from "./data.js";
import {
  hideTooltip,
  renderArtists,
  renderCalendar,
  renderDurations,
  renderTable,
  renderYearColumns,
  statusClass,
} from "./charts.js";

const REPO = "https://github.com/crorry-dev/GemischtesHack";
const PAGE_SIZE = 48;
const SORTS = {
  neu: (a, b) => b.number - a.number || b.id.localeCompare(a.id),
  alt: (a, b) => a.number - b.number || a.id.localeCompare(b.id),
  lang: (a, b) => (b.duration || 0) - (a.duration || 0) || b.number - a.number,
  kurz: (a, b) => (a.duration || Infinity) - (b.duration || Infinity) || a.number - b.number,
};

const state = {
  q: "",
  from: 0,
  to: 0,
  status: "",
  artist: "",
  quote: false,
  suspected: false,
  sort: "neu",
  view: "karten",
  limit: PAGE_SIZE,
};
let episodes = [];
let years = [];
let artists = [];
let filtered = [];
let openedByNavigation = false;
let closingFromHash = false;
const tableViews = new Set();

const $ = (selector) => document.querySelector(selector);
const dialog = $("#episode-dialog");
const controls = {
  search: $("#search"),
  from: $("#year-from"),
  to: $("#year-to"),
  statuses: $("#status-filter"),
  artist: $("#artist"),
  artistList: $("#artist-list"),
  quote: $("#only-quotes"),
  suspected: $("#with-suspected"),
  sort: $("#sort"),
  reset: $("#reset-filters"),
};

init();

async function init() {
  setupTheme();
  try {
    episodes = await loadData();
  } catch (error) {
    showError(error);
    return;
  }
  years = [...new Set(episodes.map((episode) => episode.year).filter(Boolean))].sort((a, b) => a - b);
  artists = [...new Set(episodes.flatMap((episode) => episode.artists))].sort((a, b) => a.localeCompare(b, "de"));

  setupControls();
  readHash();
  syncControls();
  renderHero();
  render();
  openFromHash(false);
  document.body.classList.remove("is-loading");

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
    if (width !== lastWidth) {
      lastWidth = width;
      requestAnimationFrame(renderCharts);
    }
  }).observe($("#charts"));
  document.addEventListener("keydown", handleShortcuts);
}

// --- Theme ------------------------------------------------------------------------

function setupTheme() {
  const button = $("#theme-toggle");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => document.documentElement.dataset.theme || (media.matches ? "dark" : "light");
  const label = () => {
    const dark = current() === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.title = dark ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln";
  };
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

// --- Filter und URL ---------------------------------------------------------------------

function setupControls() {
  if (years.length > 0) {
    for (const select of [controls.from, controls.to]) {
      select.replaceChildren(...years.map((year) => new Option(String(year), String(year))));
    }
  } else {
    $("#year-range").hidden = true;
  }
  controls.artistList.replaceChildren(...artists.map((artist) => new Option(artist)));

  let searchTimer;
  controls.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = controls.search.value.trim();
      update();
    }, 120);
  });
  controls.from.addEventListener("change", () => {
    state.from = Number(controls.from.value);
    if (state.from > state.to) state.to = state.from;
    update();
  });
  controls.to.addEventListener("change", () => {
    state.to = Number(controls.to.value);
    if (state.to < state.from) state.from = state.to;
    update();
  });
  controls.statuses.addEventListener("change", (event) => {
    state.status = event.target.value;
    update();
  });
  controls.artist.addEventListener("change", () => {
    const value = normalizeText(controls.artist.value.trim());
    state.artist = artists.find((artist) => normalizeText(artist) === value) || "";
    update();
  });
  controls.quote.addEventListener("change", () => {
    state.quote = controls.quote.checked;
    update();
  });
  controls.suspected.addEventListener("change", () => {
    state.suspected = controls.suspected.checked;
    update();
  });
  controls.sort.addEventListener("change", () => {
    state.sort = controls.sort.value;
    update();
  });
  controls.reset.addEventListener("click", () => {
    resetFilters();
    update();
  });
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      update();
    });
  }
  for (const button of document.querySelectorAll("[data-random]")) {
    button.addEventListener("click", () => {
      const pool = filtered.length > 0 ? filtered : episodes;
      if (pool.length > 0) openEpisode(pool[Math.floor(Math.random() * pool.length)].id);
    });
  }
  $("#load-more").addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderList();
  });
  for (const button of document.querySelectorAll(".table-toggle")) {
    button.addEventListener("click", () => {
      const card = button.closest(".chart-card");
      if (tableViews.has(card.id)) tableViews.delete(card.id);
      else tableViews.add(card.id);
      renderCharts();
    });
  }
  dialog.addEventListener("close", () => {
    $("#embed-slot").replaceChildren();
    if (closingFromHash) {
      closingFromHash = false;
    } else if (openedByNavigation) {
      openedByNavigation = false;
      history.back();
    } else {
      writeHash();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
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
    limit: PAGE_SIZE,
  });
  syncControls();
}

function update() {
  state.limit = PAGE_SIZE;
  syncControls();
  render();
  writeHash();
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
  state.view = params.get("ansicht") === "tabelle" ? "tabelle" : "karten";
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
  if (state.view !== "karten") params.set("ansicht", state.view);
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
  if (document.activeElement !== controls.search) controls.search.value = state.q;
  controls.from.value = String(state.from);
  controls.to.value = String(state.to);
  for (const input of controls.statuses.querySelectorAll("input")) input.checked = input.value === state.status;
  if (document.activeElement !== controls.artist) controls.artist.value = state.artist;
  controls.quote.checked = state.quote;
  controls.suspected.checked = state.suspected;
  controls.sort.value = state.sort;
  for (const button of document.querySelectorAll("[data-view]")) {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
  }
}

function isNarrowed() {
  return years.length > 0 && (state.from > years[0] || state.to < years.at(-1));
}

function matches(episode, { ignoreStatus = false } = {}) {
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

function hasStatus(episode, status) {
  return episode.usages.length === 0 ? status === "offen" : episode.usages.some((usage) => usage.status === status);
}

// --- Darstellung ----------------------------------------------------------------------

function render() {
  filtered = episodes.filter((episode) => matches(episode)).sort(SORTS[state.sort]);
  renderStatusCounts();
  renderActiveFilters();
  renderKpis(filtered);
  renderFacts(filtered);
  renderCharts();
  renderList();
}

function renderHero() {
  const dated = episodes.filter((episode) => episode.date).sort((a, b) => a.date - b.date);
  const seconds = episodes.reduce((sum, episode) => sum + (episode.duration || 0), 0);
  const withQuote = episodes.filter((episode) => episode.hasQuote).length;
  $("#hero-count").textContent = formatNumber(episodes.length);
  const parts = [];
  if (dated.length) parts.push(`seit ${formatDate(dated[0].date)}`);
  if (seconds) parts.push(`${formatNumber(Math.round(seconds / 3600))} Stunden Hack`);
  $("#hero-detail").textContent = parts.join(" · ") || "Folgen in der Sammlung";
  $("#hero-progress-label").textContent = `${formatNumber(withQuote)} von ${formatNumber(episodes.length)} Einstiegszitaten erfasst`;
  $("#hero-progress").style.setProperty("--value", episodes.length ? withQuote / episodes.length : 0);
  if (dated.length) {
    const newest = dated.at(-1);
    $("#data-state").textContent = `Stand: #${newest.id} vom ${formatDate(newest.date)}`;
  }
}

function renderStatusCounts() {
  const base = episodes.filter((episode) => matches(episode, { ignoreStatus: true }));
  for (const label of controls.statuses.querySelectorAll("label")) {
    const value = label.querySelector("input").value;
    const count = value ? base.filter((episode) => hasStatus(episode, value)).length : base.length;
    label.querySelector(".chip-count").textContent = formatNumber(count);
  }
}

function renderActiveFilters() {
  const chips = [];
  if (state.q) chips.push([`„${state.q}“`, () => { state.q = ""; }]);
  if (isNarrowed()) {
    const range = state.from === state.to ? String(state.from) : `${state.from}–${state.to}`;
    chips.push([range, () => { state.from = years[0]; state.to = years.at(-1); }]);
  }
  if (state.status) chips.push([statusInfo(state.status).label, () => { state.status = ""; }]);
  if (state.artist) chips.push([state.artist, () => { state.artist = ""; }]);
  if (state.quote) chips.push(["Nur mit Zitat", () => { state.quote = false; }]);
  if (state.suspected) chips.push(["Vermutete mitgezählt", () => { state.suspected = false; }]);

  const container = $("#active-filters");
  container.replaceChildren(...chips.map(([label, remove]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "active-chip";
    chip.setAttribute("aria-label", `Filter ${label} entfernen`);
    chip.textContent = label;
    chip.addEventListener("click", () => {
      remove();
      update();
    });
    return chip;
  }));
  container.hidden = chips.length === 0;
  controls.reset.hidden = chips.length === 0;
}

function setKpi(name, value, note, ratio) {
  const tile = document.querySelector(`[data-kpi="${name}"]`);
  tile.querySelector(".kpi-value").textContent = value;
  tile.querySelector(".kpi-note").textContent = note;
  const meter = tile.querySelector(".meter");
  if (meter) meter.style.setProperty("--value", ratio || 0);
}

function renderKpis(list) {
  const usages = list.flatMap((episode) => episode.usages);
  const durations = list.map((episode) => episode.duration).filter(Boolean);
  const seconds = durations.reduce((sum, value) => sum + value, 0);
  const quotes = list.filter((episode) => episode.hasQuote).length;
  const confirmed = usages.filter((usage) => usage.status === "bestätigt").length;
  const suspected = usages.filter((usage) => usage.status === "vermutet").length;
  const names = new Set(usages
    .filter((usage) => usage.artist && (usage.status === "bestätigt" || (state.suspected && usage.status === "vermutet")))
    .map((usage) => normalizeText(usage.artist)));

  setKpi("episodes", formatNumber(list.length), list.length === episodes.length ? "in der Sammlung" : `von ${formatNumber(episodes.length)} insgesamt`);
  setKpi(
    "hours",
    durations.length ? formatNumber(seconds / 3600, seconds < 36000 ? 1 : 0) : "–",
    durations.length === 0 ? "Länge noch unbekannt" : durations.length < list.length ? `bei ${formatNumber(durations.length)} Folgen bekannt` : "Hörzeit insgesamt",
  );
  setKpi("quotes", formatNumber(quotes), `von ${formatNumber(list.length)} Folgen`, list.length ? quotes / list.length : 0);
  setKpi("confirmed", formatNumber(confirmed), "mit Beleg");
  setKpi("suspected", formatNumber(suspected), "warten auf Beleg");
  setKpi("artists", formatNumber(names.size), state.suspected ? "inkl. vermuteter Songs" : "aus bestätigten Songs");
}

function renderFacts(list) {
  const facts = [];
  const timed = list.filter((episode) => episode.duration);
  if (timed.length > 0) {
    const longest = timed.reduce((best, episode) => (episode.duration > best.duration ? episode : best));
    const shortest = timed.reduce((best, episode) => (episode.duration < best.duration ? episode : best));
    const average = timed.reduce((sum, episode) => sum + episode.duration, 0) / timed.length;
    facts.push({ label: "Längste Folge", value: formatDuration(longest.duration), note: `#${longest.id} ${longest.title}`, episode: longest });
    facts.push({ label: "Kürzeste Folge", value: formatDuration(shortest.duration), note: `#${shortest.id} ${shortest.title}`, episode: shortest });
    facts.push({ label: "Durchschnitt", value: formatDuration(average), note: `über ${formatNumber(timed.length)} Folgen` });
  }
  const dated = list.filter((episode) => episode.date).sort((a, b) => a.date - b.date);
  if (dated.length > 1) {
    let gap = { days: 0 };
    for (let index = 1; index < dated.length; index += 1) {
      const days = Math.round((dated[index].date - dated[index - 1].date) / 86400000);
      if (days > gap.days) gap = { days, before: dated[index - 1], after: dated[index] };
    }
    if (gap.before) {
      facts.push({ label: "Längste Pause", value: `${formatNumber(gap.days)} Tage`, note: `zwischen #${gap.before.id} und #${gap.after.id}`, episode: gap.after });
    }
    const weekdays = new Map();
    for (const episode of dated) {
      const day = formatWeekday(episode.date);
      weekdays.set(day, (weekdays.get(day) || 0) + 1);
    }
    const [day, count] = [...weekdays].sort((a, b) => b[1] - a[1])[0];
    facts.push({ label: "Erscheinungstag", value: day, note: `bei ${formatNumber(Math.round((count / dated.length) * 100))} % der Folgen` });
    const newest = dated.at(-1);
    facts.push({ label: "Neueste Folge", value: `#${newest.id}`, note: `${newest.title} · ${formatDate(newest.date)}`, episode: newest });
  }

  const container = $("#facts");
  container.hidden = facts.length === 0;
  container.replaceChildren(...facts.map((fact) => {
    const element = document.createElement(fact.episode ? "a" : "div");
    element.className = "fact";
    if (fact.episode) element.href = `#${hashFor({ folge: fact.episode.id })}`;
    const label = document.createElement("span");
    label.className = "fact-label";
    label.textContent = fact.label;
    const value = document.createElement("strong");
    value.className = "fact-value";
    value.textContent = fact.value;
    const note = document.createElement("span");
    note.className = "fact-note";
    note.textContent = fact.note;
    element.append(label, value, note);
    return element;
  }));
}

function renderCharts() {
  const shownYears = years.filter((year) => year >= state.from && year <= state.to);
  const matchIds = new Set(filtered.map((episode) => episode.id));
  const inRange = episodes.filter((episode) => episode.year && episode.year >= state.from && episode.year <= state.to);
  const yearRows = shownYears.map((year) => {
    const items = filtered.filter((episode) => episode.year === year);
    const counts = Object.fromEntries(STATUSES.map((status) => [status.key, 0]));
    for (const episode of items) counts[episode.status] += 1;
    return { year, counts, total: items.length };
  });

  chartCard("chart-calendar", (container) => renderCalendar(container, {
    episodes: inRange,
    years: shownYears,
    isMatch: (episode) => matchIds.has(episode.id),
    onOpen: (episode) => openEpisode(episode.id),
  }), () => [
    ["Folge", "Titel", "Datum", "Prüfstatus"],
    inRange.filter((episode) => matchIds.has(episode.id)).sort((a, b) => a.number - b.number)
      .map((episode) => [`#${episode.id}`, episode.title, formatDate(episode.date), statusInfo(episode.status).label]),
  ]);

  chartCard("chart-years", (container) => renderYearColumns(container, {
    rows: yearRows,
    selected: isNarrowed() && state.from === state.to ? state.from : null,
    onSelect: toggleYear,
  }), () => [
    ["Jahr", "Folgen", ...STATUSES.map((status) => status.label)],
    yearRows.map((row) => [String(row.year), formatNumber(row.total), ...STATUSES.map((status) => formatNumber(row.counts[status.key]))]),
  ]);

  chartCard("chart-durations", (container) => renderDurations(container, {
    episodes: filtered,
    onOpen: (episode) => openEpisode(episode.id),
  }), () => [
    ["Jahr", "Folgen", "Durchschnitt", "Längste", "Kürzeste"],
    shownYears.map((year) => {
      const timed = filtered.filter((episode) => episode.year === year && episode.duration).map((episode) => episode.duration);
      if (timed.length === 0) return [String(year), "0", "–", "–", "–"];
      const average = timed.reduce((sum, value) => sum + value, 0) / timed.length;
      return [String(year), formatNumber(timed.length), formatDuration(average), formatDuration(Math.max(...timed)), formatDuration(Math.min(...timed))];
    }),
  ]);

  const counts = new Map();
  for (const usage of filtered.flatMap((episode) => episode.usages)) {
    if (usage.artist && (usage.status === "bestätigt" || (state.suspected && usage.status === "vermutet"))) {
      counts.set(usage.artist, (counts.get(usage.artist) || 0) + 1);
    }
  }
  const artistRows = [...counts].map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist, "de"))
    .slice(0, 10);
  renderArtists($("#chart-artists .chart"), {
    rows: artistRows,
    selected: state.artist,
    onSelect: (artist) => {
      state.artist = state.artist === artist ? "" : artist;
      update();
    },
    emptyMessage: state.suspected
      ? "In dieser Auswahl gibt es noch keine Songs mit Interpret/in."
      : "Noch keine bestätigten Songs. Mit „Vermutete mitzählen“ erscheinen auch Vermutungen.",
  });
}

function chartCard(id, draw, table) {
  const card = document.getElementById(id);
  const showTable = tableViews.has(id);
  const chart = card.querySelector(".chart");
  const tableContainer = card.querySelector(".chart-table");
  card.querySelector(".table-toggle").setAttribute("aria-pressed", String(showTable));
  chart.hidden = showTable;
  tableContainer.hidden = !showTable;
  if (showTable) {
    const [columns, rows] = table();
    renderTable(tableContainer, columns, rows);
  } else {
    draw(chart);
  }
}

function toggleYear(year) {
  if (isNarrowed() && state.from === year && state.to === year) {
    state.from = years[0];
    state.to = years.at(-1);
  } else {
    state.from = year;
    state.to = year;
  }
  update();
}

function renderList() {
  const container = $("#episode-list");
  const visible = filtered.slice(0, state.limit);
  $("#result-count").textContent = filtered.length === episodes.length
    ? `${formatNumber(episodes.length)} Folgen`
    : `${formatNumber(filtered.length)} von ${formatNumber(episodes.length)} Folgen`;

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    const message = document.createElement("p");
    message.textContent = "Keine Folge passt zu diesen Filtern.";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "button";
    reset.textContent = "Filter zurücksetzen";
    reset.addEventListener("click", () => {
      resetFilters();
      update();
    });
    empty.append(message, reset);
    container.className = "episode-grid";
    container.replaceChildren(empty);
  } else if (state.view === "tabelle") {
    container.className = "episode-table";
    container.replaceChildren(episodeTable(visible));
  } else {
    container.className = "episode-grid";
    container.replaceChildren(...visible.map(episodeCard));
  }

  const more = $("#load-more");
  const rest = filtered.length - visible.length;
  more.hidden = rest <= 0;
  more.textContent = `${formatNumber(Math.min(PAGE_SIZE, rest))} weitere anzeigen (${formatNumber(rest)} übrig)`;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function statusBadge(status) {
  const badge = element("span", `status-badge ${statusClass(status)}`);
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.classList.add("status-icon");
  const paths = {
    offen: '<circle cx="8" cy="8" r="5.5"/>',
    vermutet: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 0 0 11z" class="fill"/>',
    "bestätigt": '<circle cx="8" cy="8" r="6.25" class="fill"/><path d="m5.3 8.2 1.9 1.9 3.6-3.9" class="check"/>',
    "kein Song": '<circle cx="8" cy="8" r="5.5"/><path d="M5 8h6"/>',
  };
  icon.innerHTML = paths[status];
  badge.append(icon, document.createTextNode(statusInfo(status).label));
  return badge;
}

function episodeCard(episode) {
  const card = element("a", `episode-card ${statusClass(episode.status)}`);
  card.href = `#${hashFor({ folge: episode.id })}`;
  const top = element("div", "card-top");
  top.append(element("span", "card-number", `#${episode.id}`), statusBadge(episode.status));
  card.append(top, element("h3", "card-title", episode.title || "Folge ohne Titel"));
  const meta = [formatDate(episode.date), formatDuration(episode.duration)].filter(Boolean).join(" · ");
  card.append(element("p", "card-meta", meta));

  const usage = episode.usages.find((item) => item.quote) || episode.usages[0];
  if (usage && usage.quote) {
    card.append(element("blockquote", "card-quote", usage.quote));
  } else {
    card.append(element("p", "card-placeholder", "Einstiegszitat noch nicht erfasst"));
  }
  const songUsage = episode.usages.find((item) => item.song);
  if (songUsage) {
    const song = element("p", "card-song");
    song.append(element("span", "note-icon", "♪"), element("span", "", [songUsage.song, songUsage.artist].filter(Boolean).join(" · ")));
    card.append(song);
  }
  return card;
}

function episodeTable(list) {
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  for (const label of ["Folge", "Titel", "Datum", "Länge", "Einstiegszitat", "Song", "Status"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    head.append(cell);
  }
  const body = table.createTBody();
  for (const episode of list) {
    const row = body.insertRow();
    const usage = episode.usages.find((item) => item.quote) || episode.usages[0];
    const songUsage = episode.usages.find((item) => item.song);
    row.insertCell().textContent = `#${episode.id}`;
    const title = element("a", "table-link", episode.title || "Folge ohne Titel");
    title.href = `#${hashFor({ folge: episode.id })}`;
    row.insertCell().append(title);
    row.insertCell().textContent = formatDate(episode.date);
    row.insertCell().textContent = formatDuration(episode.duration) || "–";
    const quote = row.insertCell();
    quote.className = "quote-cell";
    quote.textContent = usage && usage.quote ? usage.quote : "–";
    row.insertCell().textContent = songUsage ? [songUsage.song, songUsage.artist].filter(Boolean).join(" · ") : "–";
    row.insertCell().append(statusBadge(episode.status));
  }
  const scroller = element("div", "table-scroll");
  scroller.append(table);
  return scroller;
}

// --- Detailansicht ---------------------------------------------------------------------

function openEpisode(id) {
  location.hash = hashFor({ folge: id });
}

function openFromHash(viaNavigation) {
  const id = new URLSearchParams(location.hash.slice(1)).get("folge");
  const episode = id && episodes.find((item) => item.id === id);
  if (episode) {
    fillDialog(episode);
    if (!dialog.open) {
      openedByNavigation = viaNavigation;
      hideTooltip();
      dialog.showModal();
    }
  } else if (dialog.open) {
    closingFromHash = true;
    dialog.close();
  }
}

function navigate(step) {
  const id = new URLSearchParams(location.hash.slice(1)).get("folge");
  const list = filtered.some((episode) => episode.id === id) ? filtered : [...episodes].sort(SORTS[state.sort]);
  const index = list.findIndex((episode) => episode.id === id);
  const next = list[index + step];
  if (!next) return;
  writeHash(next.id);
  fillDialog(next);
}

function fillDialog(episode) {
  $("#embed-slot").replaceChildren();
  $("#dialog-number").textContent = `#${episode.id}`;
  $("#dialog-status").replaceChildren(statusBadge(episode.status));
  $("#dialog-title").textContent = episode.title || "Folge ohne Titel";
  $("#dialog-meta").textContent = [formatLongDate(episode.date), formatDuration(episode.duration)].filter(Boolean).join(" · ");

  const spotify = $("#dialog-spotify");
  spotify.hidden = !episode.url;
  if (episode.url) spotify.href = episode.url;
  const embed = $("#dialog-embed");
  embed.hidden = !episode.spotifyId;
  embed.onclick = () => {
    const frame = document.createElement("iframe");
    frame.src = `https://open.spotify.com/embed/episode/${episode.spotifyId}`;
    frame.title = `Spotify-Player: ${episode.title}`;
    frame.loading = "lazy";
    frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    $("#embed-slot").replaceChildren(frame);
  };

  const usages = episode.usages.length > 0 ? episode.usages : [null];
  $("#dialog-usages").replaceChildren(...usages.map((usage, index) => usageBlock(episode, usage, usages.length > 1 ? index + 1 : 0)));
  $("#dialog-issue").href = issueLink(episode);

  const list = filtered.some((item) => item.id === episode.id) ? filtered : [...episodes].sort(SORTS[state.sort]);
  const index = list.findIndex((item) => item.id === episode.id);
  for (const [selector, neighbour] of [["#dialog-prev", list[index - 1]], ["#dialog-next", list[index + 1]]]) {
    const button = $(selector);
    button.disabled = !neighbour;
    button.querySelector(".nav-label").textContent = neighbour ? `#${neighbour.id}` : "";
    button.onclick = () => navigate(selector === "#dialog-next" ? 1 : -1);
  }
}

function usageBlock(episode, usage, position) {
  const block = element("article", "usage");
  const heading = element("div", "usage-head");
  heading.append(element("h3", "", position ? `Einstiegszitat ${position}` : "Einstiegszitat"));
  if (usage && usage.time) {
    const link = episodeLink(episode, usage.seconds);
    if (link) {
      const listen = element("a", "listen-link", `ab ${usage.time} anhören`);
      listen.href = link;
      listen.target = "_blank";
      listen.rel = "noopener noreferrer";
      heading.append(listen);
    } else {
      heading.append(element("span", "usage-time", usage.time));
    }
  }
  block.append(heading);

  if (usage && usage.quote) {
    block.append(element("blockquote", "usage-quote", usage.quote));
  } else {
    block.append(element("p", "usage-missing", "Für diese Folge ist noch kein Zitat eingetragen. Kennst du es? Schlag es unten vor."));
  }

  const facts = element("dl", "usage-facts");
  const add = (label, content) => {
    if (!content) return;
    const row = element("div", "usage-fact");
    row.append(element("dt", "", label));
    const value = element("dd");
    value.append(typeof content === "string" ? document.createTextNode(content) : content);
    row.append(value);
    facts.append(row);
  };
  if (usage) {
    if (usage.song) {
      const song = document.createDocumentFragment();
      song.append(usage.song);
      if (usage.trackUrl) {
        const link = element("a", "inline-link", "auf Spotify");
        link.href = usage.trackUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        song.append(" · ", link);
      }
      add("Song", song);
    }
    add("Interpret/in", usage.artist);
    const status = document.createDocumentFragment();
    status.append(statusBadge(usage.status), element("span", "status-hint", statusInfo(usage.status).hint));
    add("Prüfstatus", status);
    add("Kontext", usage.context);
    if (usage.sources.length > 0) {
      const list = element("ul", "source-list");
      for (const source of usage.sources) {
        const item = element("li");
        const url = safeHttpUrl(source);
        if (url) {
          const link = element("a", "inline-link", new URL(url).hostname.replace(/^www\./, "") + new URL(url).pathname.replace(/\/$/, ""));
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          item.append(link);
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
  }
  if (facts.children.length > 0) block.append(facts);
  return block;
}

function issueLink(episode) {
  const title = `Zitat zu Folge #${episode.id}: ${episode.title}`;
  const body = [
    `Folge: #${episode.id} ${episode.title}`,
    episode.dateText ? `Datum: ${episode.dateText}` : "",
    episode.url ? `Spotify: ${episode.url}` : "",
    "",
    "Zitat (Wortlaut oder kurze Beschreibung):",
    "",
    "Song und Interpret/in:",
    "",
    "Zeitmarke (HH:MM:SS):",
    "",
    "Beleg / Quelle:",
    "",
  ].filter((line, index) => index > 2 || line).join("\n");
  return `${REPO}/issues/new?${new URLSearchParams({ title, body })}`;
}

// --- Sonstiges -------------------------------------------------------------------------

function handleShortcuts(event) {
  const typing = event.target.closest("input, select, textarea");
  if (event.key === "/" && !typing && !dialog.open) {
    event.preventDefault();
    controls.search.focus();
  } else if (dialog.open && !typing && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    navigate(event.key === "ArrowRight" ? 1 : -1);
  }
}

function showError(error) {
  document.body.classList.remove("is-loading");
  document.body.classList.add("has-error");
  const notice = $("#load-error");
  notice.textContent = `${error.message} Bitte später noch einmal versuchen oder einen Issue im Repository eröffnen.`;
  notice.hidden = false;
}
