// Statistik-Szenen des Onepagers. Jede Szene baut ihr DOM und meldet sich beim Scroll-Motor an;
// gerechnet wird immer über alle Folgen, Antippen führt in die gefilterte Liste.
import { ORIGIN_GROUPS, formatDuration, formatNumber, formatWeekday, normalizeText, originGroup } from "./data.js";
import { autoplay, clamp, ease, motion, scrollToProgress, span, track } from "./scenes.js";
import {
  collectionStats,
  longestSongRun,
  quoteExtremes,
  quoteSources,
  repeatedSongs,
  songKey,
  songQuotes,
  topArtists,
  topDuos,
  yearFavourites,
  yearlyStats,
} from "./statistics.js";

const SVG = "http://www.w3.org/2000/svg";
const n = (value) => formatNumber(value);
let actions = {};

// actions: episodeHref(id), onArtist(name), openArtists(), onYear(year), onOrigin(key), onStatus(status)
export function renderInsights(container, episodes, handlers) {
  actions = handlers;
  container.replaceChildren(...[
    numbersScene, originScene, artistScene, repeatScene, yearScene, otherScene, listeningScene, recordScene, helpScene,
  ].map((build) => build(episodes)).filter(Boolean));
}

// --- Bausteine -----------------------------------------------------------------------

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

// Angepinnter Abschnitt: length in svh, so lange bleibt er beim Scrollen stehen
function pinned(id, length, label, stage = false) {
  const section = el("section", `pin${stage ? " stage" : ""}`);
  section.id = id;
  section.style.setProperty("--pin", String(length));
  section.setAttribute("aria-label", label);
  const inner = el("div", "pin-stage");
  section.append(inner);
  return { section, inner };
}

function plain(id, label, stage = false) {
  const section = el("section", `scene${stage ? " stage" : ""}`);
  section.id = id;
  section.setAttribute("aria-label", label);
  const inner = el("div", "scene-inner");
  section.append(inner);
  return { section, inner };
}

function button(className, onClick, content) {
  const node = el("button", className, content);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function episodeLink(episode, text, className = "ep-chip") {
  const link = el("a", className, text ?? `#${episode.id}`);
  link.href = actions.episodeHref(episode.id);
  link.title = `#${episode.id} ${episode.title}`;
  return link;
}

// Kacheln und Wolken einmal sanft einblenden, sobald sie sichtbar werden
const revealer = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      revealer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -12% 0px" })
  : null;

function reveal(node) {
  if (revealer) revealer.observe(node);
  else node.classList.add("is-in");
  return node;
}

function countTo(node, value) {
  if (!motion()) {
    node.textContent = n(value);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / 1200);
    node.textContent = n(Math.round(value * ease(progress)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// --- Einzelseiten: jede Zahl, jeder Rekord rastet einzeln ein ---------------------------------

// items: { value: Zahl oder Text, label, note?, episode? }. Der Abschnitt ist so viele Bildschirme hoch,
// wie er Seiten hat; Rastmarken lassen das Scrollen auf jeder Seite einrasten. Dazwischen blendet die
// alte Seite kleiner werdend aus und die neue wächst von groß herein.
function sequenceScene(id, label, eyebrow, items, stage) {
  const { section, inner } = pinned(id, items.length * 100, label, stage);
  section.classList.add("sequence");
  items.forEach((_, index) => {
    const mark = el("span", "snap-mark");
    mark.style.setProperty("--k", String(index));
    mark.setAttribute("aria-hidden", "true");
    section.append(mark);
  });
  const slides = items.map((item, index) => {
    const slide = el("div", "count-slide");
    const numeric = typeof item.value === "number";
    const value = el("span", `mega gradient-text${numeric ? "" : " mega-text"}`, numeric ? "0" : item.value);
    slide.append(el("div", `glow tone-${index % 4}`), value, el("p", "mega-sub", item.label));
    if (item.note) slide.append(el("p", "slide-note", item.note));
    if (item.episode) slide.append(episodeLink(item.episode, `#${item.episode.id} ${item.episode.title}`, "ep-chip slide-link"));
    inner.append(slide);
    return { slide, value, item, numeric };
  });
  const ticks = el("div", "ticks");
  ticks.setAttribute("aria-hidden", "true");
  const fills = items.map(() => {
    const tick = el("span");
    const fill = el("span");
    tick.append(fill);
    ticks.append(tick);
    return fill;
  });
  inner.prepend(el("p", "eyebrow scene-eyebrow", eyebrow));
  inner.append(ticks);

  track(section, {
    frame: ({ p, e, moving }) => {
      const position = p * Math.max(1, slides.length - 1);
      slides.forEach(({ slide, value, item, numeric }, index) => {
        if (!moving) {
          slide.style.opacity = "";
          slide.style.transform = "";
          slide.style.visibility = "";
          slide.inert = false;
          if (numeric) value.textContent = n(item.value);
          return;
        }
        const local = position - index;
        const shown = clamp(1 - Math.abs(local) * 1.5);
        const scale = local < 0 ? 1 - local * 0.35 : 1 - local * 0.22;
        slide.style.opacity = String(shown);
        slide.style.transform = `translate3d(0, ${(local * -6).toFixed(2)}svh, 0) scale(${scale.toFixed(4)})`;
        slide.style.visibility = shown > 0.01 ? "visible" : "hidden";
        slide.inert = shown < 0.6;
        if (numeric) {
          const arrived = index === 0 ? span(e, 0.35, 1) : span(local, -0.85, 0);
          value.textContent = n(Math.round(item.value * ease(arrived)));
        }
      });
      fills.forEach((fill, index) => {
        fill.style.transform = `scaleX(${moving ? (index === 0 ? 1 : span(position, index - 1, index)) : 1})`;
      });
    },
  });
  return section;
}

// --- 1. Die großen Zahlen ------------------------------------------------------------------

function numbersScene(episodes) {
  const stats = collectionStats(episodes);
  const items = [
    { value: stats.total, label: "Folgen." },
    { value: Math.round(stats.seconds / 3600), label: "Stunden Hack." },
    { value: new Set(songQuotes(episodes).map(({ usage }) => songKey(usage))).size, label: "Songs als Einstieg." },
    { value: topArtists(episodes).length, label: "Künstler:innen." },
  ].filter((item) => item.value > 0);
  return items.length ? sequenceScene("zahlen", "In Zahlen", "In Zahlen", items, true) : null;
}

// --- 2. Herkunft als Ring, der sich beim Scrollen zeichnet -------------------------------

function originScene(episodes) {
  const counts = new Map(ORIGIN_GROUPS.map((group) => [group.key, 0]));
  for (const usage of episodes.flatMap((episode) => episode.usages)) {
    const group = usage.quote ? originGroup(usage) : "";
    if (group) counts.set(group, counts.get(group) + 1);
  }
  const groups = ORIGIN_GROUPS.filter((group) => counts.get(group.key) > 0);
  const total = groups.reduce((sum, group) => sum + counts.get(group.key), 0);
  if (!total) return null;
  const { section, inner } = pinned("herkunft", 100, "Woher die Zitate stammen");
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const ring = svg("svg", { viewBox: "0 0 200 200", class: "ring", "aria-hidden": "true" });
  ring.append(svg("circle", { cx: 100, cy: 100, r: radius, class: "ring-track" }));
  let start = 0;
  const parts = groups.map((group) => {
    const count = counts.get(group.key);
    const circle = svg("circle", { cx: 100, cy: 100, r: radius, class: `ring-part is-${group.key}`, transform: "rotate(-90 100 100)" });
    ring.append(circle);
    const part = { group, count, start, circle };
    start += count;
    return part;
  });
  const songs = counts.get("song");
  const center = el("div", "ring-center");
  const percent = el("strong", "ring-value", "0 %");
  center.append(percent, el("span", "ring-label", "aus Songs"));
  const figure = el("div", "ring-figure");
  figure.append(ring, center);
  figure.setAttribute("role", "img");
  figure.setAttribute("aria-label", `${Math.round((songs / total) * 100)} % der ${n(total)} Zitate stammen aus Songs`);
  const legend = el("ul", "ring-legend");
  for (const part of parts) {
    const item = el("li");
    const action = button(`legend-button is-${part.group.key}`, () => actions.onOrigin(part.group.key));
    action.append(el("span", "swatch"), el("span", "", part.group.label), el("strong", "", n(part.count)));
    item.append(action);
    legend.append(item);
    part.item = item;
  }
  inner.append(el("p", "eyebrow scene-eyebrow", "Woher sie stammen"), figure, legend);

  autoplay(section, {
    duration: 1800,
    frame: ({ p, moving }) => {
      const drawn = (moving ? ease(p) : 1) * total;
      const gap = 1.6;
      for (const part of parts) {
        const length = clamp(drawn - part.start, 0, part.count);
        const arc = Math.max(0, (length / total) * circumference - (length > 0 && parts.length > 1 ? gap : 0));
        part.circle.style.strokeDasharray = `${arc} ${circumference}`;
        part.circle.style.strokeDashoffset = String(-(part.start / total) * circumference);
        part.item.classList.toggle("is-on", length > 0);
      }
      percent.textContent = `${Math.round((Math.min(drawn, songs) / total) * 100)} %`;
    },
  });
  return section;
}

// --- 3. Die Meistzitierten als Wettrennen ------------------------------------------------

function artistScene(episodes) {
  const everyone = topArtists(episodes);
  const artists = everyone.slice(0, 8);
  if (!artists.length) return null;
  const { section, inner } = pinned("kuenstler", 100, "Die Meistzitierten", true);
  const max = artists[0].quotes;
  const list = el("ol", "race");
  const rows = artists.map((artist, index) => {
    const item = el("li");
    const row = button("race-row", () => actions.onArtist(artist.name));
    row.setAttribute("aria-label", `Platz ${index + 1}: ${artist.name}, ${n(artist.quotes)} Zitate aus ${n(artist.songs)} Songs. Folgen anzeigen`);
    const bar = el("span", "race-bar");
    const fill = el("span", "race-fill");
    bar.append(fill);
    const value = el("strong", "race-value", "0×");
    row.append(el("span", "race-rank", String(index + 1)), el("span", "race-name", artist.name), value, bar);
    item.append(row);
    list.append(item);
    return { artist, fill, value };
  });
  inner.append(el("p", "eyebrow scene-eyebrow", "Die Meistzitierten"), list);
  const [duo] = topDuos(episodes);
  const finale = el("div", "race-finale");
  if (duo && duo.count > 1) finale.append(el("span", "pill", `${duo.names.join(" × ")} · ${n(duo.count)}× zusammen`));
  finale.append(button("button button-quiet", () => actions.openArtists(), `Alle ${n(everyone.length)} ansehen`));
  inner.append(finale);
  fillArtistSheet(everyone);

  autoplay(section, {
    duration: 2600,
    frame: ({ p, moving }) => {
      const time = moving ? span(p, 0, 0.85) : 1;
      rows.forEach(({ artist, fill, value }, index) => {
        const grow = ease(span(time, index * 0.05, index * 0.05 + 0.6));
        fill.style.transform = `scaleX(${(artist.quotes / max) * grow})`;
        value.textContent = `${n(Math.round(artist.quotes * grow))}×`;
      });
      section.classList.toggle("is-final", !moving || p > 0.88);
    },
  });
  return section;
}

// Alle Künstler:innen im Sheet: Platz, Zitate, verschiedene Songs, letzte Folge; Suche filtert
function fillArtistSheet(everyone) {
  const list = document.querySelector("#artists-all");
  const search = document.querySelector("#artists-search");
  if (!list || !search) return;
  const max = everyone[0]?.quotes || 1;
  let rank = 0;
  const rows = everyone.map((artist, index) => {
    // gleiche Zahl, gleicher Platz
    if (index === 0 || artist.quotes !== everyone[index - 1].quotes) rank = index + 1;
    const item = el("li");
    const row = button("race-row", () => actions.onArtist(artist.name));
    const fill = el("span", "race-fill");
    fill.style.transform = `scaleX(${artist.quotes / max})`;
    const bar = el("span", "race-bar");
    bar.append(fill);
    const first = artist.episodes[0];
    const last = artist.episodes.at(-1);
    row.append(
      el("span", "race-rank", String(rank)),
      el("span", "race-name", artist.name),
      el("strong", "race-value", `${n(artist.quotes)}×`),
      el("span", "race-meta", [
        `${n(artist.songs)} ${artist.songs === 1 ? "Song" : "Songs"}`,
        first === last ? `#${first.id}` : `#${first.id} bis #${last.id}`,
      ].join(" · ")),
      bar,
    );
    row.setAttribute("aria-label", `Platz ${rank}: ${artist.name}, ${n(artist.quotes)} Zitate aus ${n(artist.songs)} Songs. Folgen anzeigen`);
    item.append(row);
    return { item, key: normalizeText(artist.name) };
  });
  list.replaceChildren(...rows.map((row) => row.item));
  const note = document.querySelector("#artists-note");
  const filter = () => {
    const query = normalizeText(search.value.trim());
    let shown = 0;
    for (const row of rows) {
      row.item.hidden = Boolean(query) && !row.key.includes(query);
      if (!row.item.hidden) shown += 1;
    }
    note.textContent = query
      ? `${n(shown)} von ${n(rows.length)}`
      : `${n(rows.length)} Künstler:innen aus bestätigten Song-Zitaten. Features zählen für alle Beteiligten.`;
  };
  search.addEventListener("input", filter);
  filter();
}

// --- 4. Mehrfach zitierte Songs als horizontale Galerie ----------------------------------

function repeatScene(episodes) {
  const songs = repeatedSongs(episodes);
  if (!songs.length) return null;
  const { section, inner } = pinned("mehrfach", 100, "Mehrfach zitierte Songs");
  section.classList.add("gallery");
  const featured = songs.filter((song) => song.episodes.length > 2);
  const rest = songs.filter((song) => !featured.includes(song));
  const rail = el("div", "rail");
  const cards = featured.map((song) => {
    const card = el("article", "song-card");
    const quote = song.episodes.at(-1).usages.find((usage) => usage.quote && songKey(usage) === song.key)?.quote;
    card.append(
      el("p", "song-quote", quote ? `„${quote}“` : ""),
      el("span", "song-count gradient-text", `${song.episodes.length}×`),
      el("h3", "song-title", song.song),
      el("p", "song-artist", song.artist),
    );
    const chips = el("p", "chip-row");
    chips.append(...song.episodes.map((episode) => episodeLink(episode)));
    card.append(chips);
    return card;
  });
  if (rest.length) {
    const card = el("article", "song-card song-card-list");
    card.append(el("span", "song-count gradient-text", "2×"));
    const list = el("ul", "twice");
    for (const song of rest) {
      const item = el("li");
      const link = episodeLink(song.episodes.at(-1), "", "twice-link");
      link.append(el("strong", "", song.song), el("span", "", song.artist));
      item.append(link);
      list.append(item);
    }
    card.append(list);
    cards.push(card);
  }
  rail.append(...cards);
  const head = el("div", "gallery-head");
  head.append(el("p", "eyebrow", "Immer wieder"), el("h2", "headline", `${n(songs.length)} Songs, mehr als einmal.`));
  inner.append(head, rail);

  let overflow = 0;
  track(section, {
    measure: () => {
      rail.style.transform = "";
      // Ende der letzten Karte plus Innenabstand; scrollWidth zählt den rechten Abstand nicht überall mit
      const last = cards.at(-1);
      overflow = Math.max(0, last.offsetLeft + last.offsetWidth + parseFloat(getComputedStyle(rail).paddingRight) - rail.clientWidth);
      section.style.height = motion() && overflow > 0 ? `${window.innerHeight + overflow}px` : "";
    },
    frame: ({ p, moving }) => {
      if (!moving) {
        rail.style.transform = "";
        return;
      }
      rail.style.transform = `translate3d(${-p * overflow}px, 0, 0)`;
      const middle = window.innerWidth / 2;
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        const distance = clamp(Math.abs(box.left + box.width / 2 - middle) / window.innerWidth);
        card.style.setProperty("--focus", (1 - distance).toFixed(3));
      }
    },
  });
  return section;
}

// --- 5. Jahr für Jahr: der Favorit wechselt beim Scrollen ----------------------------------

function yearScene(episodes) {
  const rows = yearFavourites(episodes).filter((row) => row.quotes > 0);
  if (rows.length < 2) return null;
  const { section, inner } = pinned("jahre", 100 + rows.length * 38, "Favorit pro Jahr", true);
  let current = -1;
  const ghost = el("span", "year-ghost");
  ghost.setAttribute("aria-hidden", "true");
  const card = el("div", "year-card");
  const name = el("strong", "year-name gradient-text");
  const count = el("span", "year-count");
  const share = el("p", "year-share");
  const bar = el("span", "year-bar");
  bar.append(el("span"));
  const open = button("text-button year-open", () => actions.onYear(rows[current].year));
  card.append(el("p", "eyebrow", "Favorit des Jahres"), name, count, share, bar, open);
  const ticks = el("div", "year-ticks");
  ticks.setAttribute("role", "group");
  ticks.setAttribute("aria-label", "Jahre");
  const tickButtons = rows.map((row, index) => button("year-tick", () => {
    if (motion()) scrollToProgress(section, (index + 0.5) / rows.length);
    else show(index);
  }, `’${String(row.year).slice(2)}`));
  ticks.append(...tickButtons);
  inner.append(ghost, card, ticks);

  function show(index) {
    if (index === current) return;
    current = index;
    const row = rows[index];
    ghost.textContent = String(row.year);
    name.textContent = row.count > 1 ? row.names.join(" & ") : "Lauter Einzelstücke";
    count.textContent = row.count > 1 ? `${n(row.count)}× zitiert` : "niemand doppelt";
    share.textContent = `${n(row.songs)} von ${n(row.quotes)} Zitaten aus Songs`;
    bar.style.setProperty("--value", String(row.songs / row.quotes));
    open.textContent = `Alle Folgen aus ${row.year}`;
    tickButtons.forEach((tick, tickIndex) => tick.setAttribute("aria-pressed", String(tickIndex === index)));
    for (const node of [ghost, card]) {
      node.classList.remove("is-swap");
      void node.offsetWidth;
      node.classList.add("is-swap");
    }
  }
  show(0);
  track(section, {
    frame: ({ p, moving }) => {
      if (moving) show(Math.min(rows.length - 1, Math.floor(span(p, 0, 0.98) * rows.length)));
      ticks.style.setProperty("--p", String(moving ? p : 1));
    },
  });
  return section;
}

// --- 6. Abseits der Musik: eine ruhige Wolke, die Namen atmen langsam ------------------------

function otherScene(episodes) {
  const sources = quoteSources(episodes);
  if (!sources.total) return null;
  const { section, inner } = plain("abseits", "Zitate ohne Song");
  const number = el("span", "mega gradient-text", "0");
  inner.append(el("p", "eyebrow", "Abseits der Musik"), number, el("p", "mega-sub", "Zitate ohne Song."));
  // Jede Quelle einmal: Personen mit Namen, Unbekannte, Fundstücke, Filme; mehrfach Zitierte groß mit Anzahl
  const big = [];
  const small = [];
  for (const person of sources.people) {
    (person.count > 1 ? big : small).push({ text: person.name, count: person.count, episodes: person.episodes, tone: person.count > 1 ? "strong" : "" });
  }
  small.push(
    ...grouped(sources.anonymous).map((entry) => ({ ...entry, tone: "soft" })),
    ...grouped(sources.finds).map((entry) => ({ ...entry, tone: "find" })),
    ...grouped(sources.films).map((entry) => ({ ...entry, tone: "film" })),
  );
  // kleine Einträge gemischt, große gleichmäßig dazwischen
  const items = small.map((item, index) => ({ item, order: (index * 17) % small.length }))
    .sort((a, b) => a.order - b.order).map(({ item }) => item);
  big.forEach((entry, index) => items.splice(Math.round(((index + 0.5) / big.length) * items.length), 0, entry));
  const cloud = el("ul", "cloud");
  cloud.setAttribute("aria-label", "Alle Quellen der Zitate ohne Song");
  items.forEach((entry, index) => {
    const item = el("li");
    const link = episodeLink(entry.episodes.at(-1), shorten(entry.text, 28), `cloud-item${entry.tone ? ` is-${entry.tone}` : ""}`);
    link.title = entry.text;
    if (entry.count > 1) link.append(el("small", "", `${n(entry.count)}×`));
    const size = entry.tone === "strong" ? Math.min(2.6, 1.3 + entry.count * 0.2) : entry.tone ? 0.95 : 1.15;
    link.style.setProperty("--size", `${size.toFixed(2)}rem`);
    // jede Wolke atmet in ihrem eigenen Takt
    link.style.setProperty("--dur", `${(7 + ((index * 37) % 60) / 10).toFixed(1)}s`);
    link.style.setProperty("--delay", `${(-((index * 53) % 90) / 10).toFixed(1)}s`);
    link.style.setProperty("--d", String(((index * 37) % 9) - 4));
    item.append(link);
    cloud.append(item);
  });
  inner.append(cloud, el("p", "scene-note", `${n(sources.people.length)} Personen · ${n(sources.anonymous.length)}× Unbekannte · ${n(sources.finds.length)} Fundstücke · ${n(sources.films.length)}× Film & Serie`));
  reveal(cloud);
  let counted = false;
  track(section, {
    frame: ({ e }) => {
      if (counted || e < 0.5) return;
      counted = true;
      countTo(number, sources.total);
    },
  });
  return section;
}

// Gleiche Beschriftung zusammenfassen: „Random Person“ zweimal → einmal mit 2×
function grouped(entries) {
  const byLabel = new Map();
  for (const entry of entries) {
    const key = entry.label.toLowerCase();
    const group = byLabel.get(key) || { text: entry.label, count: 0, episodes: [] };
    group.count += 1;
    group.episodes.push(entry.episode);
    byLabel.set(key, group);
  }
  return [...byLabel.values()];
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

// --- 7. Hörzeit: Stunden zählen, Säulen wachsen ------------------------------------------

function listeningScene(episodes) {
  const rows = yearlyStats(episodes).filter((row) => row.timed).reverse();
  if (rows.length < 2) return null;
  const stats = collectionStats(episodes);
  const hours = Math.round(stats.seconds / 3600);
  const { section, inner } = pinned("hoerzeit", 100, "Hörzeit", true);
  const number = el("span", "mega gradient-text", "0");
  const average = (row) => row.seconds / row.timed;
  const max = Math.max(...rows.map(average));
  const chart = el("ol", "columns");
  const bars = rows.map((row, index) => {
    const item = el("li");
    const action = button("column", () => actions.onYear(row.year));
    action.setAttribute("aria-label", `${row.year}: im Schnitt ${formatDuration(average(row), { exact: false })} pro Folge. Folgen aus ${row.year} anzeigen`);
    const bar = el("span", "column-bar");
    bar.style.setProperty("--value", String(average(row) / max));
    const value = el("span", "column-value", String(Math.round(average(row) / 60)));
    action.append(value, bar, el("span", "column-label", `’${String(row.year).slice(2)}`));
    item.append(action);
    chart.append(item);
    return { bar, value, index };
  });
  const finale = el("p", "listening-finale", `≈ ${n(Math.round(stats.seconds / 86400))} Tage nonstop.`);
  inner.append(el("p", "eyebrow scene-eyebrow", "Hörzeit"), number, el("p", "mega-sub", "Stunden Hack."), chart, el("p", "scene-note", "Minuten pro Folge im Schnitt"), finale);

  autoplay(section, {
    duration: 2600,
    frame: ({ p, moving }) => {
      const counted = moving ? span(p, 0, 0.4) : 1;
      number.textContent = n(Math.round(hours * ease(counted)));
      for (const { bar, value, index } of bars) {
        const grow = moving ? ease(span(p, 0.2 + index * 0.035, 0.55 + index * 0.035)) : 1;
        bar.style.transform = `scaleY(${grow})`;
        value.style.opacity = String(grow);
      }
      section.classList.toggle("is-final", !moving || p > 0.85);
    },
  });
  return section;
}

// --- 8. Rekorde: jeder einzeln, groß -----------------------------------------------------------

function recordScene(episodes) {
  const items = [];
  const run = longestSongRun(episodes);
  const byNumber = new Map(episodes.map((episode) => [episode.number, episode]));
  if (run.length > 2) items.push({ value: run.length, label: "Folgen am Stück mit Song.", note: `#${run.from} bis #${run.to}`, episode: byNumber.get(run.from) });
  const extremes = quoteExtremes(episodes);
  if (extremes) {
    items.push({ value: `„${extremes.shortest.usage.quote}“`, label: "Das kürzeste Zitat.", episode: extremes.shortest.episode });
    items.push({ value: extremes.longest.length, label: "Zeichen im längsten Zitat.", episode: extremes.longest.episode });
  }
  const timed = episodes.filter((episode) => episode.duration);
  if (timed.length) {
    const longest = timed.reduce((best, episode) => (episode.duration > best.duration ? episode : best));
    const shortest = timed.reduce((best, episode) => (episode.duration < best.duration ? episode : best));
    items.push({ value: formatDuration(longest.duration, { exact: false }), label: "Die längste Folge.", episode: longest });
    items.push({ value: formatDuration(shortest.duration, { exact: false }), label: "Die kürzeste Folge.", episode: shortest });
  }
  const dated = episodes.filter((episode) => episode.date).sort((a, b) => a.date - b.date);
  if (dated.length > 1) {
    // nur direkt aufeinanderfolgende Folgen vergleichen, sonst wären Lücken in den Daten eine „Pause“
    let gap = { days: 0 };
    for (let index = 1; index < dated.length; index += 1) {
      if (dated[index].number !== dated[index - 1].number + 1) continue;
      const days = Math.round((dated[index].date - dated[index - 1].date) / 86400000);
      if (days > gap.days) gap = { days, after: dated[index] };
    }
    if (gap.after) items.push({ value: gap.days, label: "Tage Pause, die längste.", note: `vor #${gap.after.id}`, episode: gap.after });
    const first = dated.find((episode) => episode.hasQuote);
    if (first) items.push({ value: `#${first.id}`, label: "Das erste Einstiegszitat.", episode: first });
    // „Mittwoch ist Hacktag“ sagen die beiden, hochgeladen wird meist schon am Vortag
    const weekdays = new Map();
    for (const episode of dated) weekdays.set(formatWeekday(episode.date), (weekdays.get(formatWeekday(episode.date)) || 0) + 1);
    const [day, count] = [...weekdays].sort((a, b) => b[1] - a[1])[0];
    const share = Math.round((count / dated.length) * 100);
    items.push({
      value: "Mittwoch ist Hacktag.",
      label: day === "Mittwoch" ? "Hochgeladen wird auch mittwochs." : `Hochgeladen wird aber meist ${day.toLowerCase().replace(/g$/, "gs")}.`,
      note: `${share} % der Folgen erscheinen ${day === "Mittwoch" ? "mittwochs" : `am ${day}`}`,
    });
  }
  return items.length ? sequenceScene("rekorde", "Rekorde", "Rekorde", items, false) : null;
}

// --- 9. Mitmachen: Ring mit dem Sammelstand --------------------------------------------------

function helpScene(episodes) {
  const stats = collectionStats(episodes);
  const waiting = episodes.filter((episode) => episode.status === "offen" || episode.status === "in Prüfung").length;
  const share = stats.possible ? stats.captured / stats.possible : 0;
  const { section, inner } = plain("mitmachen", "Mitmachen", true);
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const ring = svg("svg", { viewBox: "0 0 200 200", class: "ring", "aria-hidden": "true" });
  const arc = svg("circle", { cx: 100, cy: 100, r: radius, class: "ring-part is-song", transform: "rotate(-90 100 100)" });
  ring.append(svg("circle", { cx: 100, cy: 100, r: radius, class: "ring-track" }), arc);
  const value = el("strong", "ring-value", "0 %");
  const center = el("div", "ring-center");
  center.append(value, el("span", "ring-label", `${n(stats.captured)} von ${n(stats.possible)}`));
  const figure = el("div", "ring-figure ring-small");
  figure.setAttribute("role", "img");
  figure.setAttribute("aria-label", `${Math.round(share * 100)} % der Einstiegszitate gesammelt`);
  figure.append(ring, center);
  const row = el("div", "actions actions-center");
  if (waiting) row.append(button("button", () => actions.onStatus("offen"), "Offene Folgen"));
  const join = el("a", "button button-quiet", "Zitat vorschlagen");
  join.href = "https://github.com/crorry-dev/GemischtesHack/discussions/new?category=q-a";
  row.append(join);
  inner.append(
    el("p", "eyebrow", "Mach mit"),
    figure,
    el("h2", "headline", waiting ? `${n(waiting)} ${waiting === 1 ? "Zitat fehlt" : "Zitate fehlen"} noch.` : "Alles gesammelt."),
    row,
  );
  autoplay(section, {
    duration: 1600,
    frame: ({ p, moving }) => {
      const drawn = (moving ? ease(p) : 1) * share;
      arc.style.strokeDasharray = `${drawn * circumference} ${circumference}`;
      value.textContent = `${Math.round(drawn * 100)} %`;
    },
  });
  return section;
}
