// Statistik-Abschnitte des Onepagers: immer über alle Folgen, Antippen führt in die gefilterte Liste
import { ORIGIN_GROUPS, formatDate, formatDuration, formatNumber, formatWeekday, originGroup } from "./data.js";
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

let actions = {};

// actions: episodeHref(id), onArtist(name), onYear(year), onOrigin(key), onStatus(status), onSearch(text)
export function renderInsights(container, episodes, handlers) {
  actions = handlers;
  container.replaceChildren(...[
    numbersScene, originScene, artistScene, repeatScene, yearScene, otherScene, recordScene, listeningScene, helpScene,
  ].map((build) => build(episodes)).filter(Boolean));
}

// --- Bausteine -----------------------------------------------------------------------

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}

function scene(id, label, kicker, title) {
  const section = el("section", "scene stat-scene");
  section.id = id;
  section.dataset.label = label;
  const inner = el("div", "scene-inner");
  const heading = el("h2", "scene-title step", title);
  heading.id = `${id}-title`;
  section.setAttribute("aria-labelledby", heading.id);
  inner.append(el("p", "feature-kicker step", kicker), heading);
  section.append(inner);
  return { section, inner };
}

// Große Zahl, die beim Hereinscrollen hochzählt
function figure(value, unit, note) {
  const box = el("p", "big-figure step");
  const number = el("span", "", "0");
  number.dataset.count = String(value);
  box.append(number);
  if (unit) box.append(" ", el("small", "", unit));
  if (!note) return box;
  const wrap = el("div", "figure-wrap");
  wrap.append(box, el("p", "scene-lede step", note));
  return wrap;
}

function meter(value, index = 0) {
  const track = el("span", "meter");
  track.setAttribute("aria-hidden", "true");
  const fill = el("span");
  fill.style.setProperty("--value", String(Math.max(0.02, Math.min(1, value))));
  fill.style.setProperty("--i", String(index));
  track.append(fill);
  return track;
}

function episodeLink(episode, text = `#${episode.id}`) {
  const link = el("a", "ep-chip", text);
  link.href = actions.episodeHref(episode.id);
  link.title = `#${episode.id} ${episode.title}`;
  return link;
}

function button(className, onClick) {
  const node = el("button", className);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function chips(items, className = "chip-row step") {
  const row = el("p", className);
  row.append(...items);
  return row;
}

// „Random Person“ kommt mehrfach vor, als Beispiel reicht es einmal
function distinctLabels(entries) {
  const seen = new Set();
  return entries.filter((entry) => !seen.has(entry.label.toLowerCase()) && seen.add(entry.label.toLowerCase()));
}

const plural = (count, one, many) => `${formatNumber(count)} ${count === 1 ? one : many}`;

// --- Abschnitte ---------------------------------------------------------------------

function numbersScene(episodes) {
  const stats = collectionStats(episodes);
  const songs = new Set(songQuotes(episodes).map(({ usage }) => songKey(usage))).size;
  const artists = topArtists(episodes).length;
  const { section, inner } = scene("zahlen", "In Zahlen", "In Zahlen", "Einstiegszitate");
  const grid = el("dl", "number-grid");
  for (const [label, value, note] of [
    ["Folgen", stats.total, stats.withoutQuote ? `${formatNumber(stats.withoutQuote)} davon ohne Zitat` : ""],
    ["Zitate geklärt", stats.confirmed, `von ${formatNumber(stats.possible)} möglichen`],
    ["Songs", songs, `von ${plural(artists, "Künstler:in", "Künstler:innen")}`],
    ["Stunden", Math.round(stats.seconds / 3600), `≈ ${formatNumber(Math.round(stats.seconds / 86400))} Tage am Stück`],
  ]) {
    const item = el("div", "number step");
    const value_ = el("dd");
    const number = el("strong", "", "0");
    number.dataset.count = String(value);
    value_.append(number, el("small", "", note));
    item.append(el("dt", "", label), value_);
    grid.append(item);
  }
  const years = episodes.map((episode) => episode.year).filter(Boolean);
  if (years.length) inner.querySelector(".scene-title").textContent = `Einstiegszitate seit ${Math.min(...years)}`;
  inner.append(grid);
  return section;
}

function originScene(episodes) {
  const counts = new Map(ORIGIN_GROUPS.map((group) => [group.key, 0]));
  for (const usage of episodes.flatMap((episode) => episode.usages)) {
    if (!usage.quote) continue;
    const group = originGroup(usage);
    if (group) counts.set(group, counts.get(group) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  const songs = counts.get("song");
  const { section, inner } = scene("herkunft", "Herkunft", "Woher sie stammen", "Meistens ein Song – aber nicht immer");
  inner.append(figure(Math.round((songs / total) * 100), "% aus Songs", `${plural(total, "erfasstes Zitat", "erfasste Zitate")}. Antippen zeigt die Folgen.`));
  const shown = ORIGIN_GROUPS.filter((group) => counts.get(group.key) > 0);
  const stack = el("div", "stack step");
  stack.setAttribute("aria-hidden", "true");
  shown.forEach((group, index) => {
    const part = el("span", `stack-part is-${group.key}`);
    part.style.flexGrow = String(counts.get(group.key));
    part.style.setProperty("--i", String(index));
    stack.append(part);
  });
  const legend = el("ul", "stack-legend step");
  for (const group of shown) {
    const item = el("li");
    const action = button(`legend-button is-${group.key}`, () => actions.onOrigin(group.key));
    action.append(el("span", "swatch"), el("span", "", group.label), el("strong", "", formatNumber(counts.get(group.key))));
    item.append(action);
    legend.append(item);
  }
  inner.append(stack, legend);
  const openings = episodes.filter((episode) => episode.status === "kein Zitat").length;
  if (openings) inner.append(el("p", "scene-note step", `Dazu ${plural(openings, "Folge", "Folgen")}, die ganz ohne Zitat beginnen – vor allem die frühen.`));
  return section;
}

function artistScene(episodes) {
  const artists = topArtists(episodes);
  if (!artists.length) return null;
  const top = artists.slice(0, 10);
  const { section, inner } = scene("kuenstler", "Meistzitiert", "Die Meistzitierten", `${top[0].name} vorn`);
  const list = el("ol", "rank-list");
  top.forEach((artist, index) => {
    const item = el("li", "step");
    const row = button("rank-row", () => actions.onArtist(artist.name));
    row.setAttribute("aria-label", `${artist.name}: ${plural(artist.quotes, "Zitat", "Zitate")} aus ${plural(artist.songs, "Song", "Songs")}, Folgen anzeigen`);
    const text = el("span", "rank-text");
    text.append(el("span", "rank-name", artist.name), el("span", "rank-meta", `${plural(artist.songs, "Song", "Songs")} · zuletzt #${artist.episodes.at(-1).id}`));
    row.append(el("span", "rank-pos", String(index + 1)), text, el("strong", "rank-value", `${formatNumber(artist.quotes)}×`), meter(artist.quotes / top[0].quotes, index));
    item.append(row);
    list.append(item);
  });
  inner.append(list);
  const notes = [`${plural(artists.length, "Künstler:in", "Künstler:innen")} insgesamt. Features zählen für alle Beteiligten.`];
  const [duo] = topDuos(episodes);
  if (duo && duo.count > 1) notes.unshift(`Bestes Duo: ${duo.names.join(" & ")} – ${formatNumber(duo.count)}× zusammen.`);
  inner.append(el("p", "scene-note step", notes.join(" ")));
  return section;
}

function repeatScene(episodes) {
  const songs = repeatedSongs(episodes);
  if (!songs.length) return null;
  const { section, inner } = scene("mehrfach", "Mehrfach zitiert", "Immer wieder", `${plural(songs.length, "Song", "Songs")} kamen mehrfach`);
  const featured = songs.filter((song) => song.episodes.length > 2).slice(0, 5);
  const list = el("ol", "repeat-list");
  for (const song of featured.length ? featured : songs.slice(0, 3)) {
    const item = el("li", "repeat step");
    const head = el("p", "repeat-head");
    head.append(el("strong", "repeat-count", `${song.episodes.length}×`), el("span", "repeat-song", song.song), el("span", "repeat-artist", song.artist));
    item.append(head, chips(song.episodes.map((episode) => episodeLink(episode)), "chip-row"));
    list.append(item);
  }
  inner.append(list);
  const twice = songs.filter((song) => !featured.includes(song));
  if (twice.length) {
    inner.append(el("p", "scene-note step", "Je zweimal:"));
    inner.append(chips(twice.map((song) => {
      const link = episodeLink(song.episodes.at(-1), `${song.song} · ${song.artist}`);
      link.title = `Zuletzt in #${song.episodes.at(-1).id}, vorher #${song.episodes.slice(0, -1).map((episode) => episode.id).join(", #")}`;
      return link;
    })));
  }
  return section;
}

function yearScene(episodes) {
  const rows = yearFavourites(episodes).filter((row) => row.quotes > 0);
  if (rows.length < 2) return null;
  const { section, inner } = scene("jahre", "Jahre", "Jahr für Jahr", "Jedes Jahr ein anderer Favorit");
  const list = el("ol", "year-list");
  rows.forEach((row, index) => {
    const item = el("li", "step");
    const action = button("year-row", () => actions.onYear(row.year));
    const text = el("span", "rank-text");
    text.append(
      el("span", "rank-name", row.count > 1 ? row.names.join(" & ") : "Lauter Einzelstücke"),
      el("span", "rank-meta", `${formatNumber(row.songs)} von ${plural(row.quotes, "Zitat", "Zitaten")} aus Songs`),
    );
    action.append(el("span", "year-label", String(row.year)), text, el("strong", "rank-value", row.count > 1 ? `${formatNumber(row.count)}×` : ""), meter(row.songs / row.quotes, index));
    action.setAttribute("aria-label", `${row.year}: ${text.textContent}. Folgen aus ${row.year} anzeigen`);
    item.append(action);
    list.append(item);
  });
  inner.append(list, el("p", "scene-note step", "Balken: Anteil der Zitate aus Songs. Antippen zeigt das Jahr."));
  return section;
}

function otherScene(episodes) {
  const sources = quoteSources(episodes);
  if (!sources.total) return null;
  const { section, inner } = scene("abseits", "Ohne Song", "Abseits der Musik", "Tommi, Felix und der Tankwart");
  inner.append(figure(sources.total, "Zitate ohne Song", "Von Personen, aus Filmen und von überall sonst."));
  const regulars = sources.people.filter((person) => person.count > 1);
  const top = regulars[0]?.count || 1;
  inner.querySelector(".scene-title").textContent = regulars.length
    ? `${regulars.slice(0, 2).map((person) => person.name.split(" ")[0]).join(", ")} und der Rest der Welt`
    : "Abseits der Musik";
  if (regulars.length) {
    const list = el("ol", "rank-list");
    regulars.slice(0, 5).forEach((person, index) => {
      const item = el("li", "step");
      const row = button("rank-row", () => actions.onSearch(person.name));
      const text = el("span", "rank-text");
      text.append(el("span", "rank-name", person.name), el("span", "rank-meta", `zuletzt #${person.episodes.at(-1).id}`));
      row.append(el("span", "rank-pos", String(index + 1)), text, el("strong", "rank-value", `${formatNumber(person.count)}×`), meter(person.count / top, index));
      item.append(row);
      list.append(item);
    });
    inner.append(list);
  }
  const famous = sources.people.filter((person) => person.count === 1 && person.name.includes(" ") && !regulars.includes(person));
  const groups = [
    ["Prominent", famous.map((person) => episodeLink(person.episodes[0], person.name))],
    [`${formatNumber(sources.anonymous.length)}× Unbekannte`, distinctLabels(sources.anonymous).filter((entry) => entry.label.length <= 26).slice(0, 8).map((entry) => episodeLink(entry.episode, entry.label))],
    [`${formatNumber(sources.finds.length)} Fundstücke`, distinctLabels(sources.finds).filter((entry) => entry.label.length <= 32).slice(0, 6).map((entry) => episodeLink(entry.episode, entry.label))],
    [`${formatNumber(sources.films.length)}× Film & Serie`, sources.films.map((entry) => episodeLink(entry.episode, entry.label))],
  ];
  for (const [label, links] of groups) {
    if (!links.length) continue;
    const block = el("div", "source-group step");
    block.append(el("h3", "", label), chips(links, "chip-row"));
    inner.append(block);
  }
  return section;
}

function recordScene(episodes) {
  const facts = [];
  const run = longestSongRun(episodes);
  const byNumber = new Map(episodes.map((episode) => [episode.number, episode]));
  if (run.length > 2) facts.push(["Längste Song-Serie", `${formatNumber(run.length)} Folgen`, `am Stück mit Song, #${run.from}–#${run.to}`, byNumber.get(run.from)]);
  const extremes = quoteExtremes(episodes);
  if (extremes) {
    facts.push(["Kürzestes Zitat", `„${extremes.shortest.usage.quote}“`, `#${extremes.shortest.episode.id} ${extremes.shortest.episode.title}`, extremes.shortest.episode]);
    facts.push(["Längstes Zitat", `${formatNumber(extremes.longest.length)} Zeichen`, `#${extremes.longest.episode.id} ${extremes.longest.episode.title}`, extremes.longest.episode]);
  }
  const timed = episodes.filter((episode) => episode.duration);
  if (timed.length) {
    const longest = timed.reduce((best, episode) => (episode.duration > best.duration ? episode : best));
    const shortest = timed.reduce((best, episode) => (episode.duration < best.duration ? episode : best));
    facts.push(["Längste Folge", formatDuration(longest.duration, { exact: false }), `#${longest.id} ${longest.title}`, longest]);
    facts.push(["Kürzeste Folge", formatDuration(shortest.duration, { exact: false }), `#${shortest.id} ${shortest.title}`, shortest]);
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
    if (gap.after) facts.push(["Längste Pause", `${formatNumber(gap.days)} Tage`, `vor #${gap.after.id} ${gap.after.title}`, gap.after]);
    const weekdays = new Map();
    for (const episode of dated) weekdays.set(formatWeekday(episode.date), (weekdays.get(formatWeekday(episode.date)) || 0) + 1);
    const [day, count] = [...weekdays].sort((a, b) => b[1] - a[1])[0];
    facts.push(["Erscheint meist", day, `bei ${Math.round((count / dated.length) * 100)} % der Folgen`]);
    const first = dated.find((episode) => episode.hasQuote);
    if (first) facts.push(["Erstes Zitat", `#${first.id}`, `${first.title} · ${formatDate(first.date)}`, first]);
  }
  if (!facts.length) return null;
  const { section, inner } = scene("rekorde", "Rekorde", "Rekorde", "Das Kürzeste, das Längste, das Meiste");
  const grid = el("div", "fact-grid");
  for (const [label, value, note, episode] of facts) {
    const card = episode ? el("a", "fact-card step") : el("div", "fact-card step");
    if (episode) card.href = actions.episodeHref(episode.id);
    card.append(el("span", "fact-label", label), el("strong", "fact-value", value), el("span", "fact-note", note));
    grid.append(card);
  }
  inner.append(grid);
  return section;
}

function listeningScene(episodes) {
  const rows = yearlyStats(episodes).filter((row) => row.timed).reverse();
  if (rows.length < 2) return null;
  const stats = collectionStats(episodes);
  const { section, inner } = scene("hoerzeit", "Hörzeit", "Hörzeit", "Die Folgen werden länger");
  inner.append(figure(Math.round(stats.seconds / 3600), "Stunden", `So lange dauert es, alle ${formatNumber(stats.timed)} Folgen am Stück zu hören.`));
  const average = (row) => row.seconds / row.timed;
  const max = Math.max(...rows.map(average));
  const chart = el("ol", "column-chart step");
  rows.forEach((row, index) => {
    const item = el("li");
    const action = button("column", () => actions.onYear(row.year));
    action.setAttribute("aria-label", `${row.year}: im Schnitt ${formatDuration(average(row), { exact: false })} pro Folge, ${formatNumber(Math.round(row.seconds / 3600))} Stunden. Folgen aus ${row.year} anzeigen`);
    const bar = el("span", "column-bar");
    bar.style.setProperty("--value", String(average(row) / max));
    bar.style.setProperty("--i", String(index));
    action.append(el("span", "column-value", formatNumber(Math.round(average(row) / 60))), bar, el("span", "column-label", `’${String(row.year).slice(2)}`));
    item.append(action);
    chart.append(item);
  });
  inner.append(chart);
  const first = rows[0];
  const last = rows.at(-1);
  inner.querySelector(".scene-title").textContent = average(last) > average(first) ? "Die Folgen werden länger" : "Die Folgen werden kürzer";
  inner.append(el("p", "scene-note step", `Minuten pro Folge im Schnitt: ${first.year} ${formatDuration(average(first), { exact: false })}, ${last.year} ${formatDuration(average(last), { exact: false })}. Antippen zeigt das Jahr.`));
  return section;
}

function helpScene(episodes) {
  const stats = collectionStats(episodes);
  const waiting = episodes.filter((episode) => episode.status === "offen" || episode.status === "in Prüfung").length;
  const { section, inner } = scene("mitmachen", "Mitmachen", "Mach mit", waiting ? "Hier fehlt noch was" : "Alles gefunden – fast");
  inner.append(figure(waiting, waiting === 1 ? "Folge offen" : "Folgen offen", `${stats.percent ?? 0} % sind geklärt. Kennst du ein Zitat? Folge öffnen und vorschlagen – mit Spotify-Link kommt der Song in die Playlist.`));
  const progress = el("div", "progress-track step");
  progress.setAttribute("aria-hidden", "true");
  const fill = el("span");
  fill.style.setProperty("--value", String((stats.percent ?? 0) / 100));
  progress.append(fill);
  const row = el("div", "feature-actions step");
  if (waiting) {
    const open = button("button", () => actions.onStatus("offen"));
    open.textContent = "Offene Folgen ansehen";
    row.append(open);
  }
  const join = el("a", "button button-quiet", "Gemeinsam zuordnen");
  join.href = "https://github.com/crorry-dev/GemischtesHack/discussions/new?category=q-a";
  row.append(join);
  inner.append(progress, row);
  return section;
}
