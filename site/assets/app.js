import {
  ORIGIN_GROUPS,
  STATUSES,
  formatClock,
  formatDate,
  formatDuration,
  formatLongDate,
  formatNumber,
  formatShortDate,
  formatWeekday,
  isSongUsage,
  applyPending,
  loadData,
  loadPending,
  loadPlaylist,
  normalizeText,
  originGroup,
  originParts,
  splitArtists,
  statusClass,
  statusInfo,
} from "./data.js";
import { hideTooltip, renderBars, renderDurations, renderTable, renderTimeline, renderYearBars } from "./charts.js";

const REPO = "https://github.com/crorry-dev/GemischtesHack";
const CHUNK = 40;
const SORTS = {
  neu: (a, b) => b.number - a.number || b.id.localeCompare(a.id),
  alt: (a, b) => a.number - b.number || a.id.localeCompare(b.id),
  lang: (a, b) => (b.duration || 0) - (a.duration || 0) || b.number - a.number,
};
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktop = window.matchMedia("(min-width: 960px)");
const phone = window.matchMedia("(max-width: 599px)");

const state = { q: "", from: 0, to: 0, status: "", artist: "", origin: "", quote: false, suspected: false, sort: "neu" };
let episodes = [];
let playlistUrl = null;
let pending = [];
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
    [episodes, playlistUrl, pending] = await Promise.all([loadData(), loadPlaylist(), loadPending()]);
    applyPending(episodes, pending);
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
  setupLinks();
  setupSpotlight();
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

// Standard ist das helle Beige; dunkel nur, wenn man es über den Schalter wählt
function setupTheme() {
  const button = $("#theme-toggle");
  const current = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const label = () => {
    button.setAttribute("aria-pressed", String(current() === "dark"));
    $('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
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
  $("#origin").replaceChildren(new Option("Alle", ""), ...ORIGIN_GROUPS.map((group) => new Option(group.label, group.key)));
  $("#origin").addEventListener("change", (event) => {
    state.origin = event.target.value;
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
    origin: "",
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
  state.origin = ORIGIN_GROUPS.some((group) => group.key === params.get("herkunft")) ? params.get("herkunft") : "";
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
  if (state.origin) params.set("herkunft", state.origin);
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
  $("#origin").value = state.origin;
  for (const input of document.querySelectorAll("#sort-control input")) input.checked = input.value === state.sort;
  $("#only-quotes").checked = state.quote;
  $("#with-suspected").checked = state.suspected;
  const active = [isNarrowed(), state.artist, state.origin, state.quote, state.suspected, state.sort !== "neu"].filter(Boolean).length;
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
  // auf schmalen Bildschirmen den aktiven Tab in die Mitte der Leiste holen
  const strip = $("#status-tabs");
  if (strip.scrollWidth > strip.clientWidth) {
    strip.scrollTo({
      left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
  }
}

function isNarrowed() {
  return years.length > 0 && (state.from > years[0] || state.to < years.at(-1));
}

function hasStatus(episode, status) {
  // „In Prüfung“ gilt für die ganze Folge und ersetzt dort „Offen“
  if (status === "in Prüfung") return episode.status === status;
  if (status === "offen" && episode.status === "in Prüfung") return false;
  return episode.usages.some((usage) => usage.status === status);
}

function matches(episode, ignoreStatus = false, ignoreOrigin = false) {
  if (isNarrowed() && (!episode.year || episode.year < state.from || episode.year > state.to)) return false;
  if (!ignoreStatus && state.status && !hasStatus(episode, state.status)) return false;
  if (state.artist && !episode.artists.includes(state.artist)) return false;
  if (!ignoreOrigin && state.origin && !episode.usages.some((usage) => originGroup(usage) === state.origin)) return false;
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
  if (state.origin) parts.push(ORIGIN_GROUPS.find((group) => group.key === state.origin).label);
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
  renderOrigins();
  renderCharts(false);
  resetList();
}

function renderIntro() {
  const found = episodes.filter((episode) => episode.hasQuote).length;
  // Folgen, die ohne Zitat beginnen, können keins bekommen und zählen deshalb nicht mit
  const withoutQuote = episodes.filter((episode) => episode.status === "kein Zitat").length;
  const possible = episodes.length - withoutQuote;
  const seconds = episodes.reduce((sum, episode) => sum + (episode.duration || 0), 0);
  countUp($("#found-count"), found);
  $("#total-count").textContent = formatNumber(possible);
  requestAnimationFrame(() => {
    $("#progress-bar").style.setProperty("--value", possible ? found / possible : 0);
  });
  const parts = [`${formatNumber(episodes.length)} Folgen`];
  if (withoutQuote) parts.push(`${formatNumber(withoutQuote)} ohne Zitat`);
  if (pending.length) parts.push(`${formatNumber(pending.length)} ${pending.length === 1 ? "Vorschlag" : "Vorschläge"} in Prüfung`);
  if (seconds) parts.push(`${formatNumber(Math.round(seconds / 3600))} Stunden`);
  if (years.length) parts.push(`seit ${years[0]}`);
  $("#intro-meta").textContent = parts.join(" · ");
}

// Playlist-Button, sobald ein Playlist-Link eingetragen ist, und „Folge #… eintragen“ (Liste und Aufruf unten)
function setupLinks() {
  const next = Math.max(0, ...episodes.map((episode) => (Number.isFinite(episode.number) ? episode.number : 0))) + 1;
  // Liegt für die nächste Folge schon ein Vorschlag vor, führt der Knopf dorthin statt zu einem zweiten
  const waiting = pending.find((entry) => entry.art === "folge" && String(entry.folge) === String(next));
  const link = waiting ? waiting.url : episodeIssueLink({ id: String(next) });
  const label = waiting ? `Folge #${next} wird geprüft` : `Folge #${next} eintragen`;
  $("#episode-form").href = link;
  $("#episode-form").textContent = label;
  $("#add-episode").href = link;
  $("#add-episode .add-title").textContent = label;
  $("#add-episode .add-meta").textContent = waiting
    ? `Vorschlag #${waiting.issue} ansehen, über GitHub`
    : "Neue oder fehlende Folge, auf Wunsch gleich mit Zitat – über GitHub";
}

// Anteil der Folgen mit Zitat; Folgen, die ohne Zitat beginnen, stehen extra daneben
function quoteShare(list, quotes) {
  const withoutQuote = list.filter((episode) => episode.status === "kein Zitat").length;
  const possible = list.length - withoutQuote;
  if (!possible) return withoutQuote ? `${formatNumber(withoutQuote)} Folgen ohne Zitat` : "–";
  const share = `${Math.round((quotes / possible) * 100)} %`;
  return withoutQuote ? `${share} · ${formatNumber(withoutQuote)} Folgen ohne Zitat` : `${share} der Folgen`;
}

function renderStats(list) {
  const durations = list.map((episode) => episode.duration).filter(Boolean);
  const seconds = durations.reduce((sum, value) => sum + value, 0);
  const usages = list.flatMap((episode) => episode.usages);
  const quotes = list.filter((episode) => episode.hasQuote).length;
  const confirmedSongs = usages.filter((usage) => usage.status === "bestätigt" && (usage.song || usage.trackUrl));
  const confirmed = confirmedSongs.length;
  // jeder Song steht nur einmal in der Playlist, auch wenn er in mehreren Folgen vorkommt
  const linked = new Set(confirmedSongs.map((usage) => usage.trackUrl).filter(Boolean)).size;
  const dated = list.filter((episode) => episode.year).map((episode) => episode.year);
  const items = [
    { key: "episodes", label: "Folgen", value: list.length, sub: list.length === episodes.length ? "insgesamt" : `von ${formatNumber(episodes.length)}` },
    { key: "quotes", label: "Zitate erfasst", value: quotes, sub: quoteShare(list, quotes) },
    { key: "songs", label: "Songs bestätigt", value: confirmed, sub: confirmed ? `${formatNumber(linked)} davon für die Playlist` : "landen in der Playlist" },
    durations.length
      ? { key: "hours", label: "Stunden", value: Math.round(seconds / 3600), sub: `Ø ${formatDuration(seconds / durations.length, { exact: false })} pro Folge` }
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

// Woher die Zitate stammen: alle Filter außer der Herkunft selbst, damit alle Balken sichtbar bleiben
function renderOrigins() {
  const counts = new Map(ORIGIN_GROUPS.map((group) => [group.key, 0]));
  for (const episode of episodes.filter((item) => matches(item, false, true))) {
    for (const usage of episode.usages) {
      const group = originGroup(usage);
      if (group) counts.set(group, counts.get(group) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  $("#origins-panel").hidden = total === 0;
  if (total === 0) return;
  renderBars($("#origins"), {
    rows: ORIGIN_GROUPS.filter((group) => counts.get(group.key) > 0 || group.key === state.origin)
      .map((group) => ({ key: group.key, label: group.label, count: counts.get(group.key) })),
    selected: state.origin,
    onSelect: (key) => {
      state.origin = state.origin === key ? "" : key;
      update();
    },
  });
  const songs = counts.get("song");
  $("#origins-caption").textContent = `${formatNumber(total)} erfasste ${total === 1 ? "Zitat" : "Zitate"}, `
    + `${Math.round((songs / total) * 100)} % aus Songs. Antippen filtert die Liste.`;
}

// Name der Quelle für „Meistzitiert außerhalb von Songs“: „Film: Wanda“ → „Wanda“, bloß „Person“ → wer es gesagt hat
function sourceName(usage) {
  const [tag, rest] = originParts(usage.origin);
  const name = tag ? rest : usage.origin;
  return ["film", "serie", "person", "sonstiges"].includes(normalizeText(name)) ? usage.artist : name;
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
  const compact = phone.matches;
  $("#timeline").hidden = showTable;
  $("#timeline-readout").hidden = showTable || compact;
  $("#timeline-table").hidden = !showTable;
  $("#timeline-caption").textContent = compact
    ? "Jede Zeile ist ein Jahr, der Balken zeigt den Stand seiner Folgen. Antippen zeigt nur dieses Jahr."
    : "Jeder Punkt ist eine Folge. Antippen zeigt sie oben, der Titel dort öffnet sie. Eine Jahreszahl zeigt nur dieses Jahr.";
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
  const activeYear = isNarrowed() && state.from === state.to ? state.from : null;
  const onYear = (year) => {
    const single = isNarrowed() && state.from === year && state.to === year;
    state.from = single ? years[0] : year;
    state.to = single ? years.at(-1) : year;
    update();
  };
  if (compact) {
    renderYearBars($("#timeline"), { years: shownYears, episodes: inRange, activeYear, status: state.status, onYear, animate });
    return;
  }
  renderTimeline($("#timeline"), $("#timeline-readout"), {
    years: shownYears,
    episodes: inRange,
    isMatch: (episode) => ids.has(episode.id),
    activeYear,
    onOpen: (episode) => openEpisode(episode.id),
    onYear,
    animate,
  });
}

function renderMore(animate) {
  // Erst das Panel daneben ein- oder ausblenden, dann hat das Diagramm seine endgültige Breite
  const counts = new Map();
  for (const usage of filtered.flatMap((episode) => episode.usages)) {
    if (usage.artist && (usage.status === "bestätigt" || (state.suspected && usage.status === "vermutet"))) {
      // Features zählen mit: „B-Tight feat. Sido“ zählt für beide
      for (const artist of splitArtists(usage.artist)) counts.set(artist, (counts.get(artist) || 0) + 1);
    }
  }
  const rows = [...counts].map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist, "de"))
    .slice(0, 8);
  $("#artists-panel").hidden = rows.length === 0;
  if (rows.length > 0) {
    renderBars($("#artists"), {
      rows: rows.map((row) => ({ key: row.artist, label: row.artist, count: row.count })),
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
  // Filme, Personen und mehr: Quellen der Zitate, die nicht aus Songs stammen
  const sources = new Map();
  for (const usage of filtered.flatMap((episode) => episode.usages)) {
    const name = usage.status === "kein Song" ? sourceName(usage) : "";
    if (name) sources.set(name, (sources.get(name) || 0) + 1);
  }
  const sourceRows = [...sources].map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"))
    .slice(0, 8);
  $("#sources-panel").hidden = sourceRows.length === 0;
  if (sourceRows.length > 0) {
    renderBars($("#sources"), {
      rows: sourceRows,
      selected: state.q,
      onSelect: (name) => {
        state.q = state.q === name ? "" : name;
        update();
      },
    });
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
      return [String(year), formatNumber(values.length), formatDuration(average, { exact: false }), formatDuration(Math.max(...values)), formatDuration(Math.min(...values))];
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
  // Seit wann es Einstiegszitate gibt, sobald frühe Folgen ohne Zitat eingetragen sind
  const quoted = list.filter((episode) => episode.hasQuote && Number.isFinite(episode.number));
  if (quoted.length > 0 && list.some((episode) => episode.status === "kein Zitat")) {
    const first = quoted.reduce((best, episode) => (episode.number < best.number ? episode : best));
    facts.push(["Erstes Zitat", `#${first.id}`, first.title, first]);
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
  if (episode.song) {
    extra.append(element("span", "row-song", episode.reference));
  } else if (episode.origin) {
    const origin = element("span", "row-origin");
    const [tag, rest] = originParts(episode.origin);
    if (tag) origin.append(element("span", "row-tag", tag));
    origin.append(rest);
    extra.append(origin);
  } else if (episode.opening) {
    const opening = element("span", "row-opening");
    opening.append(element("span", "row-tag is-kein-zitat", "Kein Zitat"), `Beginnt mit „${episode.opening}“`);
    extra.append(opening);
  }
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
  $("#ep-usages").replaceChildren(...episode.usages.map((usage, index) => usageBlock(usage, episode.usages.length > 1 ? index + 1 : 0, episode.pending.length > 0)));
  $("#ep-issue").href = issueLink(episode);
  $("#ep-fix").href = episodeIssueLink(episode);
  showPending(episode);

  const [previous, next] = neighbours(episode);
  for (const [button, target] of [[$("#ep-prev"), previous], [$("#ep-next"), next]]) {
    button.disabled = !target;
    button.querySelector(".nav-label").textContent = target ? `#${target.id}` : "";
  }
}

function usageBlock(usage, position, waiting) {
  const block = element("section", "ep-block");
  const head = element("div", "usage-head");
  const label = usage.opening ? "Folgenanfang" : "Einstiegszitat";
  head.append(element("h3", "", position ? `${label} ${position}` : label));
  block.append(head);
  if (usage.quote) {
    block.append(element("blockquote", "quote", usage.quote));
  } else if (usage.opening) {
    // keine Anführungszeichen wie beim Zitat: Das sind nur die ersten Worte der Folge
    const opening = element("div", "opening");
    opening.append(element("p", "opening-note", "Diese Folge beginnt ohne Zitat. Die ersten Worte:"), element("p", "opening-text", usage.opening));
    block.append(opening);
  } else {
    block.append(element("p", "missing", waiting
      ? "Noch kein Zitat eingetragen, ein Vorschlag wird gerade geprüft."
      : "Noch kein Zitat eingetragen. Kennst du es? Schlag es unten vor."));
  }

  const details = element("dl", "details");
  const add = (label, content) => {
    if (!content) return;
    const row = element("div", "detail");
    const value = element("dd");
    value.append(content);
    row.append(element("dt", "", label), value);
    details.append(row);
  };
  if (usage.status === "kein Zitat") {
    add("Von", usage.artist);
  } else if (usage.status === "kein Song") {
    // Film, Serie, Person …: Zitat bleibt erfasst, aber ohne Songlink und nicht in der Playlist
    const origin = document.createDocumentFragment();
    origin.append(originParts(usage.origin).filter(Boolean).join(" · "));
    origin.append(element("small", "", "Kein Song – dafür gibt es keinen Spotify-Link, es kommt nicht in die Playlist."));
    add("Herkunft", origin);
    add("Von", usage.artist);
  } else if (usage.song || usage.trackUrl) {
    const song = document.createDocumentFragment();
    song.append(usage.song);
    if (usage.trackUrl) {
      const track = element("a", "track-link");
      track.href = usage.trackUrl;
      track.target = "_blank";
      track.rel = "noopener noreferrer";
      track.append(playIcon(), "Song auf Spotify");
      song.append(track);
    }
    if (usage.review === "bestätigt") song.append(playlistNote(usage));
    add("Song", song);
  }
  if (isSongUsage(usage)) add("Interpret/in", usage.artist);
  // Bei Nicht-Songs sagt der Prüfstatus, wie sicher die Herkunft ist
  if (position || usage.review !== "offen" || !isSongUsage(usage)) {
    const status = document.createDocumentFragment();
    status.append(statusBadge(usage.review), element("small", "", statusInfo(usage.review).hint));
    add("Prüfstatus", status);
  }
  if (details.children.length > 0) block.append(details);
  return block;
}

// Hinweis auf offene Vorschläge, damit niemand denselben noch einmal einreicht
function showPending(episode) {
  const count = episode.pending.length;
  $("#ep-pending").hidden = count === 0;
  $("#ep-pending-text").textContent = count === 1
    ? "Dazu gibt es schon einen Vorschlag, er wird gerade geprüft. Ergänzungen gern als Kommentar dort."
    : "Dazu gibt es schon Vorschläge, sie werden gerade geprüft. Ergänzungen gern als Kommentar dort.";
  $("#ep-pending-links").replaceChildren(...episode.pending.map((entry) => {
    const link = element("a", "pending-link", `Vorschlag #${entry.issue} ansehen ↗`);
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }));
}

function playlistNote(usage) {
  if (!usage.trackUrl) return element("small", "", "Der Spotify-Link fehlt noch – mit Link kommt der Song in die Playlist.");
  if (!playlistUrl) return element("small", "", "Kommt in die Playlist.");
  const link = element("a", "note-link", "Kommt in die Playlist ↗");
  link.href = playlistUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function playIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("class", "filled");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M8 5.5v13l10.5-6.5z");
  icon.append(path);
  return icon;
}

function loadPlayer() {
  if (!currentEpisode || !currentEpisode.spotifyId) return;
  embedSpotify($("#ep-embed-slot"), "episode", currentEpisode.spotifyId, 232, `Spotify-Player: ${currentEpisode.title}`);
  $("#ep-embed").hidden = true;
}

// Spotify-Player erst nach einem Klick laden; vorher geht nichts an Spotify
function embedSpotify(slot, kind, id, height, title) {
  const frame = document.createElement("iframe");
  frame.src = `https://open.spotify.com/embed/${kind}/${id}`;
  frame.title = title;
  frame.loading = "lazy";
  frame.style.height = `${height}px`;
  frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  slot.replaceChildren(frame);
}

// --- Zitat des Tages und Playlist ------------------------------------------------------

let todayPool = [];
let todayIndex = 0;

function setupSpotlight() {
  setupToday();
  setupPlaylistCard();
  $("#spotlight").hidden = $("#today").hidden && $("#playlist-card").hidden;
}

// Jeden Tag ein anderes Zitat, für alle gleich; „Anderes Zitat“ zieht zufällig ein weiteres
function setupToday() {
  todayPool = episodes.flatMap((episode) => episode.usages.filter((usage) => usage.quote).map((usage) => ({ episode, usage })));
  $("#today").hidden = todayPool.length === 0;
  if (todayPool.length === 0) return;
  const now = new Date();
  todayIndex = dayNumber(`${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`) % todayPool.length;
  $("#today-date").textContent = formatLongDate(now);
  $("#today-next").hidden = todayPool.length < 2;
  $("#today-next").addEventListener("click", () => {
    let next = todayIndex;
    while (next === todayIndex) next = Math.floor(Math.random() * todayPool.length);
    todayIndex = next;
    $("#today-label").textContent = "Zufälliges Zitat";
    $("#today-date").textContent = "";
    showToday(true);
  });
  $("#today-open").addEventListener("click", () => openEpisode(todayPool[todayIndex].episode.id));
  $("#today-play").addEventListener("click", () => {
    const { usage } = todayPool[todayIndex];
    embedSpotify($("#today-embed"), "track", usage.trackUrl.split("/").pop(), 152, `${usage.song || "Song"} auf Spotify`);
    $("#today-play").hidden = true;
  });
  showToday(false);
}

function showToday(animate) {
  const { episode, usage } = todayPool[todayIndex];
  const song = isSongUsage(usage);
  $("#today-quote").textContent = usage.quote;
  const source = song
    ? [usage.song, usage.artist].filter(Boolean).join(" – ")
    : [originParts(usage.origin).filter(Boolean).join(" · "), usage.artist].filter(Boolean).join(" · ");
  $("#today-source").textContent = source ? `${song ? "♪ " : ""}${source}` : "Woher es stammt, ist noch offen.";
  $("#today-episode").textContent = `aus #${episode.id} ${episode.title}${episode.date ? ` · ${formatDate(episode.date)}` : ""}`;
  $("#today-play").hidden = !(song && usage.trackUrl);
  $("#today-embed").replaceChildren();
  if (animate && !reducedMotion.matches) {
    const card = $("#today");
    card.classList.remove("is-changing");
    void card.offsetWidth;
    card.classList.add("is-changing");
  }
}

function dayNumber(text) {
  let hash = 5381;
  for (const char of text) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash;
}

function setupPlaylistCard() {
  $("#playlist-card").hidden = !playlistUrl;
  if (!playlistUrl) return;
  $("#playlist-link").href = playlistUrl;
  const songs = new Set(episodes.flatMap((episode) => episode.usages)
    .filter((usage) => usage.review === "bestätigt" && isSongUsage(usage) && usage.trackUrl)
    .map((usage) => usage.trackUrl)).size;
  $("#playlist-meta").textContent = `${formatNumber(songs)} ${songs === 1 ? "Song" : "Songs"}, die neueste Folge steht oben. `
    + "Jeder bestätigte Song kommt automatisch dazu.";
  $("#playlist-play").addEventListener("click", () => {
    embedSpotify($("#playlist-embed"), "playlist", playlistUrl.split("/").pop(), 352, "Spotify-Playlist zu Gemischtes Hack");
    $("#playlist-play").hidden = true;
  });
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

// Öffnet das Formular .github/ISSUE_TEMPLATE/zitat.yml, vorausgefüllt mit allem, was schon bekannt ist
function issueLink(episode) {
  const usage = episode.usages.find((item) => item.quote) || episode.usages[0];
  const params = new URLSearchParams({
    template: "zitat.yml",
    title: `Zitat zu Folge #${episode.id}: ${episode.title}`,
    folge: [`#${episode.id} ${episode.title}`, episode.url].filter(Boolean).join(" – "),
  });
  if (usage.quote || usage.opening) params.set("zitat", usage.quote || usage.opening);
  if (usage.song) params.set("songtitel", usage.song);
  if (usage.artist) params.set("interpret", usage.artist);
  if (usage.trackUrl) params.set("spotify", usage.trackUrl);
  if (usage.origin) params.set("herkunft_detail", usage.origin);
  return `${REPO}/issues/new?${params}`;
}

// Öffnet .github/ISSUE_TEMPLATE/folge.yml: für eine neue Folge nur mit Nummer, sonst mit allen bekannten Angaben
function episodeIssueLink(episode) {
  const params = new URLSearchParams({
    template: "folge.yml",
    title: [`Folge #${episode.id}`, episode.title].filter(Boolean).join(": "),
    nummer: episode.id,
  });
  if (episode.title) params.set("titel", episode.title);
  if (episode.date) params.set("datum", formatDate(episode.date));
  if (episode.duration) params.set("dauer", formatClock(episode.duration));
  if (episode.url) params.set("link", episode.url);
  return `${REPO}/issues/new?${params}`;
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
