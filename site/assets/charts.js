// Diagramme als Inline-SVG, ohne externe Bibliotheken

import { formatDate, formatDuration, formatNumber, statusClass, statusInfo } from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const tooltip = document.querySelector("#tooltip");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function svg(tag, attributes = {}, parent = null) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (parent) parent.append(element);
  return element;
}

function text(parent, content, attributes) {
  const element = svg("text", attributes, parent);
  element.textContent = content;
  return element;
}

// Eine Zeile unter dem Titel; beide einzeilig, damit das Diagramm darunter nicht springt
function readoutLine(content) {
  const line = document.createElement("span");
  line.className = "readout-line";
  line.textContent = content;
  return line;
}

function emptyState(container, message) {
  const note = document.createElement("p");
  note.className = "chart-empty";
  note.textContent = message;
  container.replaceChildren(note);
}

function animateOnce(container) {
  if (reducedMotion.matches) return;
  container.classList.add("is-animating");
  setTimeout(() => container.classList.remove("is-animating"), 2200);
}

// --- Tooltip -------------------------------------------------------------------

export function showTooltip(point, title, lines = []) {
  tooltip.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = title;
  tooltip.append(heading);
  for (const line of lines.filter(Boolean)) {
    const row = document.createElement("span");
    row.textContent = line;
    tooltip.append(row);
  }
  tooltip.hidden = false;
  const box = tooltip.getBoundingClientRect();
  let x = point.x + 14;
  let y = point.y - box.height - 14;
  if (x + box.width > window.innerWidth - 8) x = point.x - box.width - 14;
  if (y < 8) y = point.y + 20;
  tooltip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
}

export function hideTooltip() {
  tooltip.hidden = true;
}

// --- Zeitstrahl: eine Zeile pro Jahr, ein Punkt pro Folge -------------------------

// --- Zeitstrahl fürs Handy: eine Zeile pro Jahr mit dem Stand als gestapeltem Balken ---------
// Auf schmalen Bildschirmen sind 50 Punkte pro Zeile nicht zu treffen und kaum zu sehen. Die Zeile
// zeigt deshalb den Stand des Jahres; Antippen zeigt nur dieses Jahr, die Folgen stehen dann in der Liste.
const BAR_ORDER = ["bestätigt", "vermutet", "kein Song", "kein Zitat", "in Prüfung", "offen"];

export function renderYearBars(container, { years, episodes, activeYear, status, onYear, animate }) {
  const list = document.createElement("ol");
  list.className = "year-bars";
  for (const year of [...years].reverse()) {
    const items = episodes.filter((episode) => episode.year === year);
    if (items.length === 0) continue;
    const parts = BAR_ORDER.map((key) => [key, items.filter((episode) => episode.status === key).length]).filter(([, count]) => count > 0);
    const quotes = items.filter((episode) => episode.hasQuote).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `year-bar${activeYear === year ? " is-active" : ""}`;
    button.setAttribute("aria-pressed", String(activeYear === year));
    button.setAttribute("aria-label", `${year}: ${formatNumber(items.length)} Folgen, ${parts.map(([key, count]) => `${formatNumber(count)} ${statusInfo(key).label}`).join(", ")}`);
    const head = document.createElement("span");
    head.className = "year-bar-head";
    const label = document.createElement("strong");
    label.textContent = String(year);
    const note = document.createElement("span");
    note.textContent = `${formatNumber(quotes)} von ${formatNumber(items.length)} mit Zitat`;
    head.append(label, note);
    const track = document.createElement("span");
    track.className = "year-bar-track";
    track.setAttribute("aria-hidden", "true");
    for (const [key, count] of parts) {
      const part = document.createElement("span");
      part.className = `year-bar-part ${statusClass(key)}${status && status !== key ? " is-dimmed" : ""}`;
      part.style.flexGrow = String(count);
      track.append(part);
    }
    button.append(head, track);
    button.addEventListener("click", () => onYear(year));
    const item = document.createElement("li");
    item.append(button);
    list.append(item);
  }
  container.replaceChildren(list);
  if (animate) animateOnce(container);
}

// Mit der Maus: Hover zeigt, Klick öffnet. Mit dem Finger: Tippen oder Wischen wählt aus,
// geöffnet wird über die Zeile darüber, denn einzelne Punkte sind zum Treffen zu klein.
export function renderTimeline(container, readout, { years, episodes, isMatch, activeYear, onOpen, onYear, animate }) {
  const rows = years
    .map((year) => ({
      year,
      items: episodes.filter((episode) => episode.year === year).sort((a, b) => a.date - b.date || a.number - b.number),
    }))
    .filter((row) => row.items.length > 0);
  readout.replaceChildren("Auf einen Punkt tippen oder über eine Reihe wischen, um die Folge zu sehen.");
  readout.disabled = true;
  readout.onclick = null;
  if (rows.length === 0) {
    readout.hidden = true;
    emptyState(container, "Sobald Erscheinungsdaten vorliegen, erscheint hier jede Folge als Punkt.");
    return;
  }

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const style = window.getComputedStyle(container);
  const width = Math.max(260, container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  const labelWidth = width < 480 ? 34 : 48;
  const perRow = Math.max(...rows.map((row) => row.items.length));
  const step = Math.max(4.5, Math.min(17, (width - labelWidth) / perRow));
  const radius = Math.max(1.6, Math.min(5.5, step * 0.34));
  const rowHeight = coarse ? 30 : Math.max(18, Math.min(26, step + 10));
  const svgWidth = Math.max(width, labelWidth + perRow * step);
  const height = rows.length * rowHeight;
  const total = rows.reduce((sum, row) => sum + row.items.length, 0);

  const root = svg("svg", {
    width: svgWidth,
    height,
    viewBox: `0 0 ${svgWidth} ${height}`,
    tabindex: "0",
    role: "img",
    "aria-label": `Zeitstrahl mit ${total} Folgen. Pfeiltasten wählen eine Folge, Enter öffnet sie.`,
  });
  const cells = [];
  rows.forEach((row, rowIndex) => {
    const cy = rowIndex * rowHeight + rowHeight / 2;
    // Die ganze Zeilenhöhe neben der Jahreszahl ist Tippfläche; was ein Klick dort tut, steht unten bei „click“
    svg("rect", { x: 0, y: rowIndex * rowHeight, width: labelWidth - 4, height: rowHeight, class: "tl-year-hit" }, root);
    text(root, String(row.year), {
      x: 0,
      y: cy + 4,
      class: `tl-year${activeYear === row.year ? " is-active" : ""}`,
    });
    row.items.forEach((episode, column) => {
      const cx = labelWidth + column * step + step / 2;
      svg("circle", {
        cx,
        cy,
        r: radius,
        class: `tl-dot ${statusClass(episode.status)}${isMatch(episode) ? "" : " is-dimmed"}`,
        style: `--i: ${cells.length}`,
      }, root);
      cells.push({ episode, cx, cy, row: rowIndex, column });
    });
  });
  const ring = svg("circle", { r: radius + 3.5, class: "focus-ring", visibility: "hidden" }, root);

  const locate = (event) => {
    const box = root.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * svgWidth;
    const y = ((event.clientY - box.top) / box.height) * height;
    return { x, rowIndex: Math.max(0, Math.min(rows.length - 1, Math.floor(y / rowHeight))) };
  };
  const yearAt = (event) => {
    const { x, rowIndex } = locate(event);
    return x < labelWidth - 4 ? rows[rowIndex].year : null;
  };
  const cellAt = (event) => {
    const { x, rowIndex } = locate(event);
    if (x < labelWidth - 4) return null;
    const column = Math.max(0, Math.min(rows[rowIndex].items.length - 1, Math.floor((x - labelWidth) / step)));
    return cells.find((cell) => cell.row === rowIndex && cell.column === column) || null;
  };
  let active = cells.find((cell) => isMatch(cell.episode)) || cells[0];
  const highlight = (cell, point, tooltip = true) => {
    active = cell;
    ring.setAttribute("cx", cell.cx);
    ring.setAttribute("cy", cell.cy);
    ring.setAttribute("visibility", "visible");
    const { episode } = cell;
    const lines = [
      [formatDate(episode.date), formatDuration(episode.duration)].filter(Boolean).join(" · "),
      [statusInfo(episode.status).label, episode.reference].filter(Boolean).join(" · "),
    ];
    const title = document.createElement("strong");
    title.textContent = `#${episode.id} ${episode.title}`;
    readout.replaceChildren(title, readoutLine(lines.filter(Boolean).join(" · ")));
    readout.disabled = false;
    readout.onclick = () => onOpen(episode);
    if (!tooltip) return;
    if (!point) {
      const box = ring.getBoundingClientRect();
      point = { x: box.left + box.width / 2, y: box.top };
    }
    showTooltip(point, `#${episode.id} ${episode.title}`, lines);
  };
  const clear = () => {
    ring.setAttribute("visibility", "hidden");
    hideTooltip();
  };

  root.addEventListener("pointermove", (event) => {
    const cell = cellAt(event);
    if (event.pointerType !== "mouse") {
      if (cell) highlight(cell, null, false);
    } else if (cell) {
      highlight(cell, { x: event.clientX, y: event.clientY });
    } else {
      clear();
    }
  });
  // Beim Tippen verschiebt der Browser den Klick gern zum nächsten Ziel, z. B. auf die Jahreszahl
  // neben dem ersten Punkt. Deshalb zählt, wo der Finger aufgesetzt hat.
  let downAt = null;
  root.addEventListener("pointerdown", (event) => {
    downAt = { clientX: event.clientX, clientY: event.clientY };
    const cell = event.pointerType !== "mouse" && cellAt(event);
    if (cell) highlight(cell, null, false);
  });
  root.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") clear();
  });
  root.addEventListener("click", (event) => {
    const point = downAt || event;
    downAt = null;
    const year = yearAt(point);
    if (year) {
      onYear(year);
      return;
    }
    if (event.pointerType && event.pointerType !== "mouse") return;
    const cell = cellAt(point);
    if (cell) onOpen(cell.episode);
  });
  // Nur der Tastaturfokus wählt eine Folge; beim Antippen oder Klicken passiert das schon über Zeiger-Ereignisse
  root.addEventListener("focus", () => {
    if (root.matches(":focus-visible")) highlight(active);
  });
  root.addEventListener("blur", clear);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(active.episode);
      return;
    }
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (!moves[event.key]) return;
    event.preventDefault();
    const rowIndex = Math.max(0, Math.min(rows.length - 1, active.row + moves[event.key][0]));
    const column = Math.max(0, Math.min(rows[rowIndex].items.length - 1, active.column + moves[event.key][1]));
    highlight(cells.find((cell) => cell.row === rowIndex && cell.column === column));
  });

  container.replaceChildren(root);
  if (animate) animateOnce(container);
}

// --- Länge der Folgen: gleitender Schnitt als Linie, Folgen als Punkte ---------------

export function renderDurations(container, readout, { episodes, onOpen, animate }) {
  const points = episodes.filter((episode) => episode.date && episode.duration).sort((a, b) => a.date - b.date);
  if (points.length < 2) {
    emptyState(container, "Sobald die Länge der Folgen in der CSV steht, erscheint hier der Verlauf.");
    readout.hidden = true;
    return;
  }
  readout.hidden = false;
  const span = 10;
  const averages = points.map((_, index) => {
    const recent = points.slice(Math.max(0, index - span + 1), index + 1);
    return recent.reduce((sum, item) => sum + item.duration, 0) / recent.length;
  });

  const width = Math.max(260, container.clientWidth);
  const height = width < 480 ? 170 : 220;
  const margin = { top: 10, right: 8, bottom: 24, left: 46 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const start = points[0].date.getTime();
  const end = points[points.length - 1].date.getTime();
  const maxMinutes = Math.max(...points.map((point) => point.duration)) / 60;
  const step = maxMinutes > 150 ? 60 : 30;
  const max = Math.ceil(maxMinutes / step) * step;
  const x = (date) => margin.left + ((date.getTime() - start) / Math.max(1, end - start)) * plotWidth;
  const y = (seconds) => margin.top + plotHeight - (seconds / 60 / max) * plotHeight;
  const positions = points.map((point) => x(point.date));

  const root = svg("svg", {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    tabindex: "0",
    role: "img",
    "aria-label": "Länge der Folgen im Zeitverlauf. Pfeiltasten wählen eine Folge, Enter öffnet sie.",
  });
  const gradient = svg("linearGradient", { id: "duration-fill", x1: 0, y1: 0, x2: 0, y2: 1 }, svg("defs", {}, root));
  svg("stop", { offset: "0%", class: "area-stop", "stop-opacity": 0.22 }, gradient);
  svg("stop", { offset: "100%", class: "area-stop", "stop-opacity": 0 }, gradient);

  for (let tick = step; tick <= max; tick += step) {
    svg("line", { x1: margin.left, x2: width - margin.right, y1: y(tick * 60), y2: y(tick * 60), class: "grid-line" }, root);
    text(root, `${tick} min`, { x: margin.left - 8, y: y(tick * 60) + 4, class: "axis-label", "text-anchor": "end" });
  }
  const firstYear = points[0].date.getFullYear();
  const lastYear = points[points.length - 1].date.getFullYear();
  const yearStep = plotWidth / Math.max(1, lastYear - firstYear) < 52 ? 2 : 1;
  for (let year = firstYear + 1; year <= lastYear; year += yearStep) {
    text(root, String(year), { x: x(new Date(year, 0, 1)), y: height - 6, class: "axis-label", "text-anchor": "middle" });
  }

  if (width >= 560) {
    const dots = svg("g", {}, root);
    points.forEach((point, index) => svg("circle", { cx: positions[index], cy: y(point.duration), r: 1.7, class: "point" }, dots));
  }
  const line = points.map((_, index) => `${index ? "L" : "M"}${positions[index].toFixed(1)},${y(averages[index]).toFixed(1)}`).join("");
  svg("path", { d: `${line}L${positions[positions.length - 1].toFixed(1)},${y(0)}L${positions[0].toFixed(1)},${y(0)}Z`, class: "area" }, root);
  const path = svg("path", { d: line, class: "line" }, root);
  const crosshair = svg("line", { y1: margin.top, y2: margin.top + plotHeight, class: "crosshair", visibility: "hidden" }, root);
  const marker = svg("circle", { r: 4.5, class: "marker", visibility: "hidden" }, root);

  let active = points.length - 1;
  const nearest = (clientX) => {
    const box = root.getBoundingClientRect();
    const target = ((clientX - box.left) / box.width) * width;
    let best = 0;
    for (let index = 1; index < positions.length; index += 1) {
      if (Math.abs(positions[index] - target) < Math.abs(positions[best] - target)) best = index;
    }
    return best;
  };
  const select = (index) => {
    active = index;
    const point = points[index];
    for (const element of [crosshair, marker]) element.setAttribute("visibility", "visible");
    crosshair.setAttribute("x1", positions[index]);
    crosshair.setAttribute("x2", positions[index]);
    marker.setAttribute("cx", positions[index]);
    marker.setAttribute("cy", y(point.duration));
    const title = document.createElement("strong");
    title.textContent = `#${point.id} ${point.title}`;
    readout.replaceChildren(
      title,
      readoutLine(`${formatDuration(point.duration)} · ${formatDate(point.date)} · Schnitt ${formatDuration(averages[index], { exact: false })}`),
    );
    readout.disabled = false;
    readout.onclick = () => onOpen(point);
  };
  root.addEventListener("pointermove", (event) => select(nearest(event.clientX)));
  root.addEventListener("pointerdown", (event) => select(nearest(event.clientX)));
  root.addEventListener("click", (event) => {
    if (event.pointerType === "mouse") onOpen(points[nearest(event.clientX)]);
  });
  root.addEventListener("focus", () => select(active));
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      select(Math.max(0, Math.min(points.length - 1, active + (event.key === "ArrowRight" ? 1 : -1))));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(points[active]);
    }
  });

  container.replaceChildren(root);
  path.style.setProperty("--length", path.getTotalLength());
  if (animate) animateOnce(container);
}

// --- Meistzitierte Interpret:innen -------------------------------------------------

// Waagerechte Balken zum Antippen; rows: [{ key, label, count }]
export function renderBars(container, { rows, selected, onSelect }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const list = document.createElement("ol");
  list.className = "bars";
  rows.forEach((row, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bar${selected === row.key ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", String(selected === row.key));
    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = row.label;
    const track = document.createElement("span");
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(3, (row.count / max) * 100)}%`;
    fill.style.animationDelay = `${index * 60}ms`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = formatNumber(row.count);
    button.append(name, track, value);
    button.addEventListener("click", () => onSelect(row.key));
    item.append(button);
    list.append(item);
  });
  container.replaceChildren(list);
}

// --- Tabellen als Alternative zu den Diagrammen --------------------------------------

export function renderTable(container, columns, rows) {
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  for (const column of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    head.append(cell);
  }
  const body = table.createTBody();
  for (const values of rows) {
    const row = body.insertRow();
    for (const value of values) row.insertCell().textContent = value;
  }
  container.replaceChildren(table);
}
