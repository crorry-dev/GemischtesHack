import { artistKey, isSongUsage, normalizeText, originGroup, originParts } from "./data.js";

// Folgen statt CSV-Zeilen zählen; mehrere Zitate dürfen keine Laufzeit verdoppeln.
export function collectionStats(episodes) {
  const durations = episodes.map((episode) => episode.duration).filter((value) => value > 0).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const withoutQuote = episodes.filter((episode) => episode.status === "kein Zitat").length;
  const possible = episodes.length - withoutQuote;
  const confirmed = episodes.filter((episode) =>
    episode.usages.some((usage) => usage.quote && usage.review === "bestätigt")).length;
  const captured = episodes.filter((episode) => episode.hasQuote).length;
  const songs = episodes.flatMap((episode) => episode.usages).filter((usage) =>
    usage.status === "bestätigt" && !usage.origin && (usage.song || usage.trackUrl));
  return {
    total: episodes.length,
    withoutQuote,
    possible,
    confirmed,
    captured,
    missing: possible - captured,
    percent: possible ? Math.round(confirmed / possible * 100) : null,
    seconds: durations.reduce((sum, duration) => sum + duration, 0),
    timed: durations.length,
    median: durations.length ? (durations[middle] + durations[Math.floor((durations.length - 1) / 2)]) / 2 : null,
    missingLinks: songs.filter((usage) => !usage.trackUrl).length,
    unavailableLinks: songs.filter((usage) => usage.linkUnavailable).length,
  };
}

export function yearlyStats(episodes) {
  const years = [...new Set(episodes.map((episode) => episode.year).filter(Boolean))].sort((a, b) => b - a);
  return years.map((year) => ({ year, ...collectionStats(episodes.filter((episode) => episode.year === year)) }));
}

// --- Auswertungen für die Statistik-Abschnitte: immer über alle Folgen, nicht über die Filter der Liste ---

// Bestätigte Zitate aus Songs, jeweils mit ihrer Folge
export function songQuotes(episodes) {
  return episodes.flatMap((episode) => episode.usages
    .filter((usage) => usage.quote && usage.review === "bestätigt" && isSongUsage(usage) && (usage.song || usage.trackUrl))
    .map((usage) => ({ episode, usage })));
}

// Derselbe Song, auch mit anderem Spotify-Link (Album, Single): Titel und erste Interpret:in, sonst der Link
export function songKey(usage) {
  const title = normalizeText(usage.song || "").replace(/\s*[([].*$/, "").replace(/[^\p{L}\p{N}]/gu, "");
  return title ? `${artistKey(usage.artists[0] || usage.artist)}|${title}` : usage.trackUrl || "";
}

// Wie oft jede Interpret:in zitiert wurde; Features zählen für alle Beteiligten, Songs zählen je Titel einmal
export function topArtists(episodes) {
  const byName = new Map();
  for (const { episode, usage } of songQuotes(episodes)) {
    for (const name of usage.artists) {
      const entry = byName.get(name) || { name, quotes: 0, songs: new Set(), episodes: [] };
      entry.quotes += 1;
      entry.songs.add(songKey(usage));
      entry.episodes.push(episode);
      byName.set(name, entry);
    }
  }
  return [...byName.values()]
    .map((entry) => ({ ...entry, songs: entry.songs.size }))
    .sort((a, b) => b.quotes - a.quotes || b.songs - a.songs || a.name.localeCompare(b.name, "de"));
}

// Songs, die in mehr als einer Folge das Einstiegszitat waren
export function repeatedSongs(episodes) {
  const bySong = new Map();
  for (const { episode, usage } of songQuotes(episodes)) {
    const key = songKey(usage);
    if (!key) continue;
    const entry = bySong.get(key) || { key, song: usage.song, artist: usage.artists[0] || usage.artist, episodes: [] };
    if (!entry.episodes.includes(episode)) entry.episodes.push(episode);
    bySong.set(key, entry);
  }
  return [...bySong.values()]
    .filter((entry) => entry.episodes.length > 1)
    .sort((a, b) => b.episodes.length - a.episodes.length || b.episodes.at(-1).number - a.episodes.at(-1).number);
}

// Wer am häufigsten zusammen auf einem zitierten Song ist
export function topDuos(episodes) {
  const pairs = new Map();
  for (const { usage } of songQuotes(episodes)) {
    const names = [...usage.artists].sort((a, b) => a.localeCompare(b, "de"));
    for (let first = 0; first < names.length; first += 1) {
      for (let second = first + 1; second < names.length; second += 1) {
        const key = `${names[first]}\u0000${names[second]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  return [...pairs].map(([key, count]) => ({ names: key.split("\u0000"), count }))
    .sort((a, b) => b.count - a.count || a.names.join().localeCompare(b.names.join(), "de"));
}

// Je Jahr die meistzitierte Interpret:in (bei Gleichstand bis zu zwei) und der Anteil der Song-Zitate
export function yearFavourites(episodes) {
  const years = [...new Set(episodes.map((episode) => episode.year).filter(Boolean))].sort((a, b) => a - b);
  return years.map((year) => {
    const inYear = episodes.filter((episode) => episode.year === year);
    const artists = topArtists(inYear);
    const best = artists[0] ? artists.filter((entry) => entry.quotes === artists[0].quotes).slice(0, 2) : [];
    const quotes = inYear.filter((episode) => episode.usages.some((usage) => usage.quote && usage.review === "bestätigt")).length;
    const songs = new Set(songQuotes(inYear).map(({ episode }) => episode)).size;
    return { year, names: best.map((entry) => entry.name), count: best[0]?.quotes || 0, quotes, songs, episodes: inYear.length };
  });
}

// Längste Strecke direkt aufeinanderfolgender Folgen, die alle mit einem Song beginnen
export function longestSongRun(episodes) {
  const withSong = new Set(songQuotes(episodes).map(({ episode }) => episode.number));
  const numbers = episodes.map((episode) => episode.number).filter(Number.isFinite).sort((a, b) => a - b);
  let best = { length: 0, from: null, to: null };
  let start = null;
  numbers.forEach((number, index) => {
    if (!withSong.has(number)) {
      start = null;
      return;
    }
    if (start === null || numbers[index - 1] !== number - 1) start = number;
    if (number - start + 1 > best.length) best = { length: number - start + 1, from: start, to: number };
  });
  return best;
}

// Wer abseits der Musik zitiert wird: „Person: Tommi Schmitt“ zählt für Tommi, Zufallsbegegnungen als Unbekannte
const ANONYMOUS = /^(?:random|irgend|ein\b|eine|einer|zwei|drei|alte|ehemalig|enttäusch|kleine|typ\b|tankwart|bauarbeiter|lkw|mexican|privat|nachbar|\d|\*)/i;
const NAME_WORD = /^[\p{Lu}][\p{L}'’.-]*$/u;
const LINK_WORD = /^(?:in|im|bei|beim|auf|zu|zum|nach|von|vor|aus|an|am|der|die|das)$/;

export function personNames(origin) {
  const [, rest] = originParts(origin);
  const head = rest.split("(")[0].split(/\s[-–]\s/)[0];
  return head.split(/\s*(?:,|&|\bund\b)\s*/).map((part) => {
    // nur die großgeschriebenen Wörter am Anfang: „Samra in jedem Track“ → „Samra“
    const words = part.trim().split(/\s+/);
    const end = words.findIndex((word) => !NAME_WORD.test(word));
    let name = words.slice(0, end === -1 ? words.length : end).join(" ");
    // „Birdmans legendäres Interview“: Genitiv, wenn kein Bindewort folgt
    if (end > 0 && !LINK_WORD.test(words[end]) && /[^s]s$/.test(name)) name = name.slice(0, -1);
    return !name || ANONYMOUS.test(part.trim()) || /doku/i.test(name) ? null : name;
  });
}

export function quoteSources(episodes) {
  const people = new Map();
  const anonymous = [];
  const films = [];
  const finds = [];
  let total = 0;
  for (const episode of episodes) {
    for (const usage of episode.usages) {
      if (!usage.quote || usage.status !== "kein Song" || usage.review !== "bestätigt") continue;
      total += 1;
      const group = originGroup(usage);
      const label = originParts(usage.origin)[1];
      if (group === "film") films.push({ label, episode });
      else if (group !== "person") finds.push({ label, episode });
      else {
        const names = personNames(usage.origin);
        if (names.every((name) => name === null)) anonymous.push({ label, episode });
        for (const name of new Set(names.filter(Boolean))) {
          const entry = people.get(name) || { name, count: 0, episodes: [] };
          entry.count += 1;
          entry.episodes.push(episode);
          people.set(name, entry);
        }
      }
    }
  }
  return {
    total,
    people: [...people.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de")),
    anonymous,
    films,
    finds,
  };
}

// Kürzestes und längstes bestätigtes Einstiegszitat
export function quoteExtremes(episodes) {
  const quotes = episodes.flatMap((episode) => episode.usages
    .filter((usage) => usage.quote && usage.review === "bestätigt")
    .map((usage) => ({ episode, usage, length: [...usage.quote].length })))
    .sort((a, b) => a.length - b.length || a.episode.number - b.episode.number);
  return quotes.length ? { shortest: quotes[0], longest: quotes.at(-1) } : null;
}
