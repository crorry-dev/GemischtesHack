const dataUrl = "data/episoden.csv";
const expectedColumns = [
  "verwendung_id",
  "folge_id",
  "folge_titel",
  "veroeffentlicht_am",
  "folge_url",
  "zeitmarke",
  "zitat_id",
  "zitat_referenz",
  "songtitel",
  "interpret",
  "spotify_track_uri",
  "kontext",
  "quellen",
  "pruefstatus",
  "beitrag_von",
  "namensnennung",
  "lizenz",
];

const tableBody = document.querySelector("#entries");
const searchInput = document.querySelector("#search");
const statusFilter = document.querySelector("#status-filter");
const resultsCount = document.querySelector("#results-count");
const dataError = document.querySelector("#data-error");
let records = [];

function parseCsv(text) {
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
    } else if (character === ",") {
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
  if (rows.length === 0) return [];

  const header = rows.shift().map((value, index) =>
    (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim(),
  );
  const missingColumns = expectedColumns.filter((column) => !header.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`In der CSV fehlen Spalten: ${missingColumns.join(", ")}.`);
  }

  return rows.map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new Error(`Zeile ${rowIndex + 2} hat ${values.length} statt ${header.length} Felder.`);
    }
    return Object.fromEntries(header.map((column, index) => [column, values[index].trim()]));
  });
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function spotifyTrackUrl(value) {
  const uriMatch = value.trim().match(/^spotify:track:([A-Za-z0-9]+)$/i);
  if (uriMatch) return `https://open.spotify.com/track/${uriMatch[1]}`;

  const url = safeHttpUrl(value.trim());
  if (!url) return null;
  const parsed = new URL(url);
  return parsed.hostname === "open.spotify.com" && /^\/track\/[A-Za-z0-9]+\/?$/.test(parsed.pathname)
    ? parsed.href
    : null;
}

function appendText(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function appendExternalLink(parent, label, href, className) {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  parent.append(link);
}

function normalizedStatus(record) {
  return (record.pruefstatus || "").trim().toLocaleLowerCase("de");
}

function addEpisodeCell(cell, record) {
  const title = record.folge_titel || record.folge_id || "Folge ohne Titel";
  const episodeUrl = safeHttpUrl(record.folge_url);
  if (episodeUrl) {
    appendExternalLink(cell, title, episodeUrl, "episode-title");
  } else {
    appendText(cell, "span", title, "episode-title");
  }
  if (record.veroeffentlicht_am) appendText(cell, "span", record.veroeffentlicht_am, "subtle");
  if (record.folge_id) appendText(cell, "span", `ID: ${record.folge_id}`, "subtle");
}

function addReferenceCell(cell, record) {
  if (record.zitat_referenz) appendText(cell, "span", record.zitat_referenz);
  if (record.zitat_id) appendText(cell, "span", `Zitat ${record.zitat_id}`, "subtle");
  if (record.zeitmarke) appendText(cell, "span", record.zeitmarke, "subtle");
  if (!record.zitat_referenz && !record.zitat_id && !record.zeitmarke) appendText(cell, "span", "—", "subtle");
}

function addSongCell(cell, record) {
  const title = record.songtitel || "";
  const artist = record.interpret || "";
  const label = [title, artist].filter(Boolean).join(" — ") || "Keine Zuordnung";
  const trackUrl = spotifyTrackUrl(record.spotify_track_uri || "");
  if (trackUrl) appendExternalLink(cell, title || label, trackUrl, "song-title");
  else appendText(cell, "span", title || label, "song-title");
  if (title && artist) appendText(cell, "span", artist, "subtle");
  if (record.spotify_track_uri && !trackUrl) {
    appendText(cell, "span", "Spotify-Link nicht erkannt", "subtle");
  }
}

function addStatusCell(cell, record) {
  const status = record.pruefstatus || "Nicht angegeben";
  const badge = appendText(cell, "span", status, `status${["offen", "vermutet", "bestätigt"].includes(normalizedStatus(record)) ? ` status--${normalizedStatus(record)}` : ""}`);
  if (!record.pruefstatus) badge.title = "Status in der CSV nicht angegeben";
}

function addContextCell(cell, record) {
  const text = [record.kontext, record.quellen].filter(Boolean).join("\n");
  appendText(cell, "span", text || "—");
}

function renderRow(record) {
  const row = document.createElement("tr");
  const cells = Array.from({ length: 5 }, () => document.createElement("td"));
  addEpisodeCell(cells[0], record);
  addReferenceCell(cells[1], record);
  addSongCell(cells[2], record);
  addStatusCell(cells[3], record);
  addContextCell(cells[4], record);
  for (const cell of cells) row.append(cell);
  return row;
}

function updateStats() {
  const confirmed = records.filter((record) => normalizedStatus(record) === "bestätigt").length;
  const open = records.filter((record) => ["offen", "vermutet"].includes(normalizedStatus(record))).length;
  document.querySelector("#stat-total").textContent = records.length.toLocaleString("de");
  document.querySelector("#stat-confirmed").textContent = confirmed.toLocaleString("de");
  document.querySelector("#stat-open").textContent = open.toLocaleString("de");
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase("de");
  const selectedStatus = statusFilter.value.toLocaleLowerCase("de");
  const filtered = records.filter((record) => {
    const matchesQuery = !query || Object.values(record).some((value) =>
      value.toLocaleLowerCase("de").includes(query),
    );
    return matchesQuery && (!selectedStatus || normalizedStatus(record) === selectedStatus);
  });

  tableBody.replaceChildren();
  if (filtered.length === 0) {
    const row = document.createElement("tr");
    const cell = appendText(
      row,
      "td",
      records.length === 0
        ? "Noch keine Einträge — die Sammlung wartet auf eure Beiträge."
        : "Keine Einträge für diese Suche gefunden.",
      "table-message",
    );
    cell.colSpan = 5;
    tableBody.append(row);
  } else {
    tableBody.append(...filtered.map(renderRow));
  }

  resultsCount.textContent = `${filtered.length.toLocaleString("de")} von ${records.length.toLocaleString("de")} Verwendungen`;
}

async function loadRecords() {
  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`Die CSV-Datei konnte nicht geladen werden (${response.status}).`);
    records = parseCsv(await response.text());
    updateStats();
    render();
  } catch (error) {
    tableBody.replaceChildren();
    const row = document.createElement("tr");
    const cell = appendText(row, "td", "Die Sammlung ist gerade nicht verfügbar.", "table-message");
    cell.colSpan = 5;
    tableBody.append(row);
    dataError.textContent = `${error.message} Bitte später noch einmal versuchen oder einen Issue im Repository eröffnen.`;
    dataError.hidden = false;
    resultsCount.textContent = "";
  }
}

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
loadRecords();
