// Laden und Aufbereiten der CSV-Dateien aus data/

export const STATUSES = [
  { key: "offen", label: "Offen", hint: "Noch niemand hat das Zitat zugeordnet." },
  { key: "vermutet", label: "Vermutet", hint: "Es gibt eine Vermutung, aber noch keinen Beleg." },
  { key: "bestätigt", label: "Bestätigt", hint: "Song und Interpret/in sind mit Quelle belegt." },
  { key: "kein Song", label: "Kein Song", hint: "Das Zitat stammt nicht aus einem Song." },
];

// Reihenfolge beim Stapeln von der Grundlinie aus
export const STACK_ORDER = ["bestätigt", "vermutet", "kein Song", "offen"];

const STATUS_RANK = { "bestätigt": 3, "vermutet": 2, "kein Song": 1, "offen": 0 };
const COLUMN_ALIASES = { zitat: "zitat_referenz" };
const dayFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const longDayFormat = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat("de-DE", { weekday: "long" });

export async function loadData() {
  const [usageText, episodeText] = await Promise.all([fetchText("zitate.csv"), fetchText("folgen.csv", true)]);
  const usages = toRecords(parseCsv(usageText), ["folge_id"]);
  const episodeRows = episodeText ? toRecords(parseCsv(episodeText), ["folge_id"]) : [];
  return buildEpisodes(usages, episodeRows);
}

// Auf GitHub Pages liegen die Daten unter data/, bei der lokalen Vorschau aus dem
// Repo-Wurzelverzeichnis eine Ebene höher.
async function fetchText(name, optional = false) {
  for (const base of ["data/", "../data/"]) {
    try {
      const response = await fetch(base + name, { cache: "no-cache" });
      if (response.ok) return await response.text();
    } catch {
      // nächsten Pfad probieren
    }
  }
  if (optional) return null;
  throw new Error(`${name} konnte nicht geladen werden.`);
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const headerLine = text.split("\n", 1)[0];
  const delimiter = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.");
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
}

function toRecords(rows, required) {
  const [header = [], ...body] = rows;
  const names = header.map((name) => COLUMN_ALIASES[name.trim()] || name.trim());
  const missing = required.filter((column) => !names.includes(column));
  if (missing.length > 0) throw new Error(`In der CSV fehlen Spalten: ${missing.join(", ")}.`);
  return body.map((values) => {
    const record = {};
    names.forEach((name, index) => {
      if (name) record[name] = (values[index] || "").trim();
    });
    return record;
  });
}

function buildEpisodes(usageRows, episodeRows) {
  const byId = new Map();
  const episodeFor = (rawId) => {
    const id = normalizeId(rawId);
    if (!id) return null;
    if (!byId.has(id)) {
      const number = /^\d+$/.test(id) ? Number(id) : Infinity;
      byId.set(id, { id, number, title: "", dateText: "", duration: null, url: "", usages: [] });
    }
    return byId.get(id);
  };

  for (const record of episodeRows) {
    const episode = episodeFor(record.folge_id);
    if (!episode) continue;
    episode.title = record.folge_titel || "";
    episode.dateText = isoDate(record.veroeffentlicht_am);
    episode.duration = Number(record.dauer_sekunden) || null;
    episode.url = record.folge_url || "";
  }

  for (const record of usageRows) {
    const episode = episodeFor(record.folge_id);
    if (!episode) continue;
    episode.title ||= record.folge_titel || "";
    episode.dateText ||= isoDate(record.veroeffentlicht_am || "");
    episode.url ||= record.folge_url || "";
    episode.usages.push(toUsage(record, episode));
  }

  const episodes = [...byId.values()];
  for (const episode of episodes) finishEpisode(episode);
  return episodes.sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
}

function toUsage(record, episode) {
  const status = (record.pruefstatus || "").trim().toLocaleLowerCase("de");
  const time = record.zeitmarke || "";
  return {
    id: record.verwendung_id || "",
    quote: record.zitat_referenz || "",
    quoteId: record.zitat_id || "",
    time,
    seconds: timeToSeconds(time),
    song: record.songtitel || "",
    artist: record.interpret || "",
    trackUrl: spotifyTrackUrl(record.spotify_track_uri || ""),
    trackRaw: record.spotify_track_uri || "",
    context: record.kontext || "",
    sources: (record.quellen || "").split("|").map((source) => source.trim()).filter(Boolean),
    status: STATUS_RANK[status] === undefined ? "offen" : status,
    contributor: record.beitrag_von || "",
    attribution: record.namensnennung || "",
    license: record.lizenz || "",
    episode,
  };
}

function finishEpisode(episode) {
  episode.date = parseDate(episode.dateText);
  episode.year = episode.date ? episode.date.getFullYear() : null;
  episode.spotifyId = (episode.url.match(/open\.spotify\.com\/episode\/([A-Za-z0-9]+)/) || [])[1] || "";
  episode.url = safeHttpUrl(episode.url) || "";
  episode.status = episode.usages.reduce(
    (best, usage) => (STATUS_RANK[usage.status] > STATUS_RANK[best] ? usage.status : best),
    "offen",
  );
  episode.hasQuote = episode.usages.some((usage) => usage.quote);
  episode.artists = [...new Set(episode.usages.map((usage) => usage.artist).filter(Boolean))];
  episode.titleKey = normalizeText(episode.title);
  episode.search = normalizeText([
    `#${episode.id}`,
    episode.title,
    ...episode.usages.flatMap((usage) => [usage.quote, usage.song, usage.artist, usage.context]),
  ].join(" "));
}

export function normalizeText(value) {
  return value.toLocaleLowerCase("de").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
}

function normalizeId(value) {
  const id = (value || "").replace(/^#/, "").trim();
  return /^\d+$/.test(id) ? String(Number(id)) : id;
}

function isoDate(value) {
  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : value;
}

function parseDate(value) {
  const match = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function timeToSeconds(value) {
  const match = value.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function spotifyTrackUrl(value) {
  const uri = value.trim().match(/^spotify:track:([A-Za-z0-9]+)$/i);
  if (uri) return `https://open.spotify.com/track/${uri[1]}`;
  const url = safeHttpUrl(value.trim());
  if (!url) return null;
  const parsed = new URL(url);
  return parsed.hostname === "open.spotify.com" && /^\/track\/[A-Za-z0-9]+\/?$/.test(parsed.pathname) ? parsed.href : null;
}

export function episodeLink(episode, seconds) {
  if (!episode.url) return null;
  return seconds ? `${episode.url.split("?")[0]}?t=${seconds}` : episode.url;
}

export function formatDate(date) {
  return date ? dayFormat.format(date) : "Datum unbekannt";
}

export function formatLongDate(date) {
  return date ? longDayFormat.format(date) : "Datum unbekannt";
}

export function formatWeekday(date) {
  return weekdayFormat.format(date);
}

export function formatDuration(seconds) {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function formatNumber(value, digits = 0) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function statusInfo(key) {
  return STATUSES.find((status) => status.key === key) || STATUSES[0];
}
