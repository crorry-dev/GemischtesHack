// Laden und Aufbereiten der Daten aus data/

export const STATUSES = [
  { key: "offen", label: "Offen", hint: "Noch niemand hat das Zitat zugeordnet." },
  { key: "in Prüfung", label: "In Prüfung", hint: "Es gibt einen Vorschlag, er wird gerade geprüft." },
  { key: "vermutet", label: "Vermutet", hint: "Es gibt eine Vermutung, sicher ist sie aber noch nicht." },
  { key: "bestätigt", label: "Bestätigt", hint: "Die Herkunft ist geprüft." },
  { key: "kein Song", label: "Kein Song", hint: "Das Zitat stammt nicht aus einem Song, ein Spotify-Link ist nicht möglich." },
  { key: "kein Zitat", label: "Kein Zitat", hint: "Die Folge beginnt ohne Zitat, hier stehen ihre ersten Worte." },
];

// Woher die Zitate stammen: für die Auswertung und den Filter „Herkunft“
export const ORIGIN_GROUPS = [
  { key: "song", label: "Song" },
  { key: "film", label: "Film & Serie" },
  { key: "person", label: "Person" },
  { key: "sonstiges", label: "Sonstiges" },
  { key: "kein-zitat", label: "Kein Zitat" },
  { key: "offen", label: "Herkunft offen" },
];

const STATUS_RANK = { "bestätigt": 4, "vermutet": 3, "kein Song": 2, "kein Zitat": 1, "offen": 0 };
const REVIEW_STATES = ["offen", "vermutet", "bestätigt"];
const shortDate = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const longDate = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long" });

export async function loadData() {
  const text = await fetchText("zitate.csv");
  if (text === null) throw new Error("Die Datensammlung konnte nicht geladen werden.");
  return buildEpisodes(toRecords(parseCsv(text)));
}

// Link zur Spotify-Playlist, null solange es keine gibt. data/playlist.json legt der
// Pages-Workflow mit dem Link aus scripts/playlist.py an.
export async function loadPlaylist(bases) {
  const text = await fetchText("playlist.json", bases);
  try {
    return text ? spotifyUrl(JSON.parse(text).url || "", "playlist") : null;
  } catch {
    return null;
  }
}

// Offene Vorschläge (Issues) als Liste {folge, issue, url, art}; legt der Pages-Workflow an
export async function loadPending() {
  const text = await fetchText("vorschlaege.json");
  try {
    const entries = text ? JSON.parse(text) : [];
    return Array.isArray(entries) ? entries.filter((entry) => safeHttpUrl(entry.url || "")) : [];
  } catch {
    return [];
  }
}

// Hängt offene Vorschläge an ihre Folgen; noch offene Folgen stehen dann auf „In Prüfung“
export function applyPending(episodes, entries) {
  for (const episode of episodes) {
    episode.pending = entries.filter((entry) => String(entry.folge) === episode.id);
    if (episode.pending.length > 0 && episode.status === "offen") episode.status = "in Prüfung";
  }
}

// Auf GitHub Pages liegen die Daten unter data/, bei der lokalen Vorschau aus dem
// Repository-Verzeichnis eine Ebene höher.
async function fetchText(path, bases = ["data/", "../data/"]) {
  for (const base of bases) {
    try {
      const response = await fetch(base + path, { cache: "no-cache" });
      if (response.ok) return await response.text();
    } catch {
      // nächsten Pfad probieren
    }
  }
  return null;
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

function toRecords(rows) {
  const [header = [], ...body] = rows;
  const names = header.map((name) => name.trim());
  if (!names.includes("folge_id")) throw new Error("In der CSV fehlt die Spalte folge_id.");
  return body.map((values) => {
    const record = {};
    names.forEach((name, index) => {
      if (name) record[name] = (values[index] || "").trim();
    });
    return record;
  });
}

function buildEpisodes(records) {
  const byId = new Map();
  for (const record of records) {
    const id = normalizeId(record.folge_id);
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        number: /^\d+$/.test(id) ? Number(id) : Infinity,
        title: "",
        dateText: "",
        duration: null,
        url: "",
        usages: [],
      });
    }
    const episode = byId.get(id);
    episode.title ||= record.folge_titel || "";
    episode.dateText ||= isoDate(record.veroeffentlicht_am || "");
    episode.duration ||= timeToSeconds(record.dauer || "");
    episode.url ||= record.folge_url || "";
    episode.usages.push(toUsage(record));
  }
  const episodes = [...byId.values()];
  for (const episode of episodes) finishEpisode(episode);
  return episodes.sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
}

// Steht in „herkunft“ etwas anderes als ein Song (Film, Serie, Person …), ist das Zitat kein Song
function otherOrigin(value) {
  const text = (value || "").trim();
  const key = normalizeText(text);
  return key && !key.startsWith("song") && !key.startsWith("lied") ? text : "";
}

// „Kein Zitat“: Die Folge beginnt ohne Zitat, in „zitat“ stehen dann ihre ersten Worte
function isOpening(value) {
  const key = normalizeText((value || "").trim());
  return key.startsWith("kein zitat") || key.startsWith("folgenanfang");
}

function toUsage(record) {
  let review = (record.pruefstatus || "").trim().toLocaleLowerCase("de");
  if (!REVIEW_STATES.includes(review)) review = "offen";
  const opening = isOpening(record.herkunft);
  const origin = opening ? "" : otherOrigin(record.herkunft);
  return {
    quote: opening ? "" : record.zitat || "",
    opening: opening ? record.zitat || "" : "",
    song: record.songtitel || "",
    artist: record.interpret || "",
    trackUrl: spotifyUrl(record.spotify_link || "", "track"),
    origin,
    review,
    status: opening ? "kein Zitat" : origin ? "kein Song" : review,
  };
}

export function originGroup(usage) {
  if (usage.status === "kein Zitat") return "kein-zitat";
  if (usage.origin) {
    const key = normalizeText(usage.origin);
    if (/^(film|kino|serie|tv)/.test(key)) return "film";
    if (key.startsWith("person") || key.includes("privat") || key.includes("interview")) return "person";
    return "sonstiges";
  }
  if (usage.song || usage.trackUrl) return "song";
  return usage.quote ? "offen" : "";
}

// „B-Tight feat. Ben Salomo, Gauner & Sido“ → ["B-Tight", "Ben Salomo", "Gauner", "Sido"]. Vor dem „feat.“
// bleibt der Name ganz, damit Bands wie „Simon & Garfunkel“ zusammenbleiben.
export function splitArtists(text) {
  const match = (text || "").match(/^(.*?)\s*\(?\s*\b(?:feat\.?|ft\.?|featuring)\s+(.*?)\)?$/i);
  if (!match) return text ? [text.trim()] : [];
  const guests = match[2].split(/\s*(?:,|&|\bund\b|\bfeat\.?|\bft\.?)\s*/i);
  return [match[1], ...guests].map((name) => name.trim()).filter(Boolean);
}

// Zitate aus Songs: alles außer Film, Person … und Folgen ohne Zitat
export function isSongUsage(usage) {
  return usage.status !== "kein Song" && usage.status !== "kein Zitat";
}

function finishEpisode(episode) {
  episode.date = parseDate(episode.dateText);
  episode.year = episode.date ? episode.date.getFullYear() : null;
  episode.spotifyId = (spotifyUrl(episode.url, "episode") || "").split("/").pop();
  episode.url = safeHttpUrl(episode.url) || "";
  episode.status = episode.usages.reduce(
    (best, usage) => (STATUS_RANK[usage.status] > STATUS_RANK[best] ? usage.status : best),
    "offen",
  );
  episode.hasQuote = episode.usages.some((usage) => usage.quote);
  episode.quote = (episode.usages.find((usage) => usage.quote) || {}).quote || "";
  episode.song = episode.usages.find((usage) => usage.song && isSongUsage(usage)) || null;
  episode.origin = (episode.usages.find((usage) => usage.origin) || {}).origin || "";
  episode.opening = (episode.usages.find((usage) => usage.opening) || {}).opening || "";
  episode.reference = episode.song
    ? [episode.song.artist, episode.song.song].filter(Boolean).join(" – ")
    : episode.origin || (episode.opening ? `Beginnt mit „${shorten(episode.opening, 60)}“` : "");
  episode.artists = [...new Set(episode.usages
    .filter(isSongUsage)
    .flatMap((usage) => splitArtists(usage.artist)))];
  episode.titleKey = normalizeText(episode.title);
  episode.search = normalizeText([
    `#${episode.id}`,
    episode.title,
    ...episode.usages.flatMap((usage) => [usage.quote, usage.opening, usage.song, usage.artist, usage.origin]),
  ].join(" "));
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
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

// „Film: Ein Fisch namens Wanda (1988)“ → ["Film", "Ein Fisch namens Wanda (1988)"]
export function originParts(text) {
  const match = text.match(/^([^:]{1,14}):\s*(.+)$/);
  return match ? [match[1], match[2]] : ["", text];
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

// spotify:track:… oder open.spotify.com/(intl-de/)track/…?si=… → https://open.spotify.com/track/…
function spotifyUrl(value, kind) {
  const uri = value.trim().match(new RegExp(`^spotify:${kind}:([A-Za-z0-9]+)$`, "i"));
  if (uri) return `https://open.spotify.com/${kind}/${uri[1]}`;
  const url = safeHttpUrl(value.trim());
  if (!url) return null;
  const parsed = new URL(url);
  const path = parsed.pathname.match(new RegExp(`^/(?:intl-[a-z-]+/)?${kind}/([A-Za-z0-9]+)/?$`, "i"));
  return parsed.hostname === "open.spotify.com" && path ? `https://open.spotify.com/${kind}/${path[1]}` : null;
}

export function formatShortDate(date) {
  return date ? shortDate.format(date) : "";
}

export function formatDate(date) {
  return date ? fullDate.format(date) : "";
}

export function formatLongDate(date) {
  return date ? longDate.format(date) : "";
}

export function formatWeekday(date) {
  return weekday.format(date);
}

// Länge einer Folge sekundengenau („1 h 26 min 30 s“), Durchschnitte mit exact: false auf Minuten („1 h 27 min“)
export function formatDuration(seconds, { exact = true } = {}) {
  if (!seconds) return "";
  const total = exact ? Math.round(seconds) : Math.round(seconds / 60) * 60;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const parts = hours ? [`${hours} h`, `${String(minutes).padStart(2, "0")} min`] : [`${minutes} min`];
  if (exact) parts.push(`${String(total % 60).padStart(2, "0")} s`);
  return parts.join(" ");
}

// 5190 → "01:26:30", wie in den Formularen und der CSV
export function formatClock(seconds) {
  if (!seconds) return "";
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function formatNumber(value, digits = 0) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function statusInfo(key) {
  return STATUSES.find((status) => status.key === key) || STATUSES[0];
}

export function statusClass(status) {
  return `is-${status.toLowerCase().replace(/\s+/g, "-").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")}`;
}
