// Diagramme als Inline-SVG, ohne externe Bibliotheken

import { STACK_ORDER, formatDate, formatDuration, formatNumber, statusInfo } from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const tooltip = document.querySelector("#tooltip");

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

export function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, "-").replace("ä", "ae")}`;
}

function niceScale(max, ticks = 4) {
  if (max <= 0) return { max: ticks, step: 1 };
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= raw);
  return { max: Math.ceil(max / step) * step, step };
}

// Säule mit abgerundetem Kopf und gerader Grundlinie
function columnPath(x, y, width, height, radius) {
  const r = Math.min(radius, height, width / 2);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function emptyState(container, message) {
  const note = document.createElement("p");
  note.className = "chart-empty";
  note.textContent = message;
  container.replaceChildren(note);
}

// --- Tooltip --------------------------------------------------------------------

export function showTooltip(anchor, title, rows = []) {
  tooltip.replaceChildren();
  const heading = document.createElement("p");
  heading.className = "tooltip-title";
  heading.textContent = title;
  tooltip.append(heading);
  for (const row of rows) {
    const line = document.createElement("p");
    line.className = "tooltip-row";
    if (row.key) {
      const key = document.createElement("span");
      key.className = `tooltip-key ${row.key}`;
      line.append(key);
    }
    const value = document.createElement("strong");
    value.textContent = row.value;
    line.append(value);
    if (row.label) {
      const label = document.createElement("span");
      label.textContent = row.label;
      line.append(label);
    }
    tooltip.append(line);
  }
  tooltip.hidden = false;

  const point = anchor instanceof Element
    ? (({ left, top, width }) => ({ x: left + width / 2, y: top }))(anchor.getBoundingClientRect())
    : anchor;
  const box = tooltip.getBoundingClientRect();
  let x = point.x + 14;
  let y = point.y - box.height - 12;
  if (x + box.width > window.innerWidth - 8) x = point.x - box.width - 14;
  if (y < 8) y = point.y + 18;
  tooltip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
}

export function hideTooltip() {
  tooltip.hidden = true;
}

// --- Hack-Kalender: jede Folge ein Feld, Zeilen nach Jahr ----------------------------

export function renderCalendar(container, { episodes, years, isMatch, onOpen }) {
  const rows = years.map((year) => ({
    year,
    episodes: episodes.filter((episode) => episode.year === year).sort((a, b) => a.date - b.date || a.number - b.number),
  })).filter((row) => row.episodes.length > 0);
  if (rows.length === 0) {
    emptyState(container, "Sobald Erscheinungsdaten vorliegen, erscheint hier jede Folge als Feld.");
    return;
  }

  const perRow = Math.max(...rows.map((row) => row.episodes.length));
  const labelWidth = 46;
  const gap = 3;
  const available = container.clientWidth - labelWidth;
  const cell = Math.max(9, Math.min(17, Math.floor(available / perRow) - gap));
  const step = cell + gap;
  const rowHeight = cell + 9;
  const width = labelWidth + perRow * step;
  const height = rows.length * rowHeight;

  const root = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    class: "calendar",
    role: "group",
    "aria-label": "Hack-Kalender: alle Folgen nach Jahr",
  });
  const cells = [];

  rows.forEach((row, rowIndex) => {
    const y = rowIndex * rowHeight;
    text(root, String(row.year), { x: 0, y: y + cell - 1, class: "axis-label" });
    row.episodes.forEach((episode, index) => {
      const x = labelWidth + index * step;
      const group = svg("g", {
        class: `cal-cell ${statusClass(episode.status)}${isMatch(episode) ? "" : " is-dimmed"}`,
        transform: `translate(${x} ${y})`,
        tabindex: "-1",
        role: "button",
        "aria-label": `Folge ${episode.id}: ${episode.title}, ${statusInfo(episode.status).label}`,
      }, root);
      svg("rect", { width: cell, height: cell, rx: 3, class: "cal-box" }, group);
      if (episode.status === "vermutet") svg("path", { d: `M0,${cell}V3Q0,0 3,0H${cell}Z`, class: "cal-half" }, group);
      if (episode.status === "kein Song") svg("rect", { x: 2.5, y: cell / 2 - 1, width: cell - 5, height: 2, rx: 1, class: "cal-dash" }, group);
      svg("rect", { x: -2, y: -2, width: cell + 4, height: cell + 4, class: "hit" }, group);
      group.episode = episode;
      group.position = [rowIndex, index];
      cells.push(group);
    });
  });

  const tooltipFor = (target, anchor) => {
    const { episode } = target;
    const usage = episode.usages.find((item) => item.song) || episode.usages[0];
    const rows = [{ value: statusInfo(episode.status).label, label: "Prüfstatus", key: `key-${statusClass(episode.status)}` }];
    if (usage && usage.song) rows.push({ value: usage.song, label: usage.artist });
    showTooltip(anchor, `#${episode.id} ${episode.title}`, [{ value: formatDate(episode.date), label: formatDuration(episode.duration) }, ...rows]);
  };
  root.addEventListener("pointerover", (event) => {
    const target = event.target.closest(".cal-cell");
    if (target) tooltipFor(target, { x: event.clientX, y: event.clientY });
  });
  root.addEventListener("pointermove", (event) => {
    const target = event.target.closest(".cal-cell");
    if (target) tooltipFor(target, { x: event.clientX, y: event.clientY });
  });
  root.addEventListener("pointerleave", hideTooltip);
  root.addEventListener("click", (event) => {
    const target = event.target.closest(".cal-cell");
    if (target) onOpen(target.episode);
  });
  root.addEventListener("focusin", (event) => {
    const target = event.target.closest(".cal-cell");
    if (target) tooltipFor(target, target);
  });
  root.addEventListener("focusout", hideTooltip);

  // Pfeiltasten wandern durch das Raster, nur ein Feld ist per Tab erreichbar
  const first = cells.find((group) => !group.classList.contains("is-dimmed")) || cells[0];
  first.setAttribute("tabindex", "0");
  root.addEventListener("keydown", (event) => {
    const target = event.target.closest(".cal-cell");
    if (!target) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(target.episode);
      return;
    }
    const [rowIndex, index] = target.position;
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (!moves[event.key]) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(rows.length - 1, rowIndex + moves[event.key][0]));
    const nextIndex = Math.max(0, Math.min(rows[nextRow].episodes.length - 1, index + moves[event.key][1]));
    const next = cells.find((group) => group.position[0] === nextRow && group.position[1] === nextIndex);
    if (!next) return;
    target.setAttribute("tabindex", "-1");
    next.setAttribute("tabindex", "0");
    next.focus();
  });

  container.replaceChildren(root);
}

// --- Folgen pro Jahr, gestapelt nach Prüfstatus ------------------------------------

export function renderYearColumns(container, { rows, selected, onSelect }) {
  if (rows.length === 0) {
    emptyState(container, "Für die aktuelle Auswahl gibt es keine datierten Folgen.");
    return;
  }
  const width = Math.max(280, container.clientWidth);
  const height = 250;
  const margin = { top: 26, right: 4, bottom: 28, left: 34 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const { max, step } = niceScale(Math.max(...rows.map((row) => row.total)));
  const band = plotWidth / rows.length;
  const barWidth = Math.min(24, band * 0.62);
  const y = (value) => margin.top + plotHeight - (value / max) * plotHeight;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "columns", role: "img", "aria-label": "Folgen pro Jahr nach Prüfstatus" });
  for (let tick = 0; tick <= max; tick += step) {
    svg("line", { x1: margin.left, x2: width - margin.right, y1: y(tick), y2: y(tick), class: tick === 0 ? "baseline" : "grid" }, root);
    text(root, formatNumber(tick), { x: margin.left - 8, y: y(tick) + 4, class: "axis-label tick", "text-anchor": "end" });
  }

  rows.forEach((row, index) => {
    const x = margin.left + index * band + (band - barWidth) / 2;
    const group = svg("g", {
      class: `column${selected === row.year ? " is-selected" : ""}`,
      tabindex: "0",
      role: "button",
      "aria-label": `${row.year}: ${row.total} Folgen. Klicken, um nur dieses Jahr zu zeigen.`,
    }, root);
    svg("rect", { x: margin.left + index * band, y: margin.top - 20, width: band, height: plotHeight + 20, class: "hit" }, group);
    let top = y(0);
    const segments = STACK_ORDER.filter((status) => row.counts[status] > 0);
    segments.forEach((status, segmentIndex) => {
      const segmentHeight = (row.counts[status] / max) * plotHeight;
      const isTop = segmentIndex === segments.length - 1;
      const gapBelow = segmentIndex > 0 ? 2 : 0;
      const drawnHeight = Math.max(0.5, segmentHeight - gapBelow);
      const segmentTop = top - segmentHeight;
      svg("path", {
        d: isTop ? columnPath(x, segmentTop, barWidth, drawnHeight, 4) : `M${x},${segmentTop}h${barWidth}v${drawnHeight}h${-barWidth}Z`,
        class: `segment ${statusClass(status)}`,
      }, group);
      top = segmentTop;
    });
    text(group, formatNumber(row.total), { x: x + barWidth / 2, y: y(row.total) - 8, class: "value-label", "text-anchor": "middle" });
    const label = band < 38 ? `’${String(row.year).slice(2)}` : String(row.year);
    text(group, label, { x: x + barWidth / 2, y: height - 8, class: "axis-label", "text-anchor": "middle" });

    const show = (anchor) => showTooltip(anchor, String(row.year), [
      { value: formatNumber(row.total), label: "Folgen" },
      ...STACK_ORDER.filter((status) => row.counts[status] > 0).map((status) => ({
        value: formatNumber(row.counts[status]),
        label: statusInfo(status).label,
        key: `key-${statusClass(status)}`,
      })),
    ]);
    group.addEventListener("pointermove", (event) => show({ x: event.clientX, y: event.clientY }));
    group.addEventListener("pointerleave", hideTooltip);
    group.addEventListener("focus", () => show(group));
    group.addEventListener("blur", hideTooltip);
    group.addEventListener("click", () => onSelect(row.year));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(row.year);
      }
    });
  });
  container.replaceChildren(root);
}

// --- Länge der Folgen: Einzelwerte plus gleitender Schnitt ------------------------------

export function renderDurations(container, { episodes, onOpen }) {
  const points = episodes.filter((episode) => episode.date && episode.duration).sort((a, b) => a.date - b.date);
  if (points.length < 2) {
    emptyState(container, "Die Länge der Folgen kommt mit dem Spotify-Abgleich (data/folgen.csv).");
    return;
  }
  const span = 10;
  const averages = points.map((point, index) => {
    const slice = points.slice(Math.max(0, index - span + 1), index + 1);
    return slice.reduce((sum, item) => sum + item.duration, 0) / slice.length;
  });

  const width = Math.max(300, container.clientWidth);
  const height = 270;
  const margin = { top: 14, right: 12, bottom: 28, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const start = points[0].date.getTime();
  const end = points[points.length - 1].date.getTime();
  const maxMinutes = Math.max(...points.map((point) => point.duration)) / 60;
  const stepMinutes = maxMinutes > 150 ? 60 : 30;
  const max = Math.ceil(maxMinutes / stepMinutes) * stepMinutes;
  const x = (date) => margin.left + ((date.getTime() - start) / Math.max(1, end - start)) * plotWidth;
  const y = (seconds) => margin.top + plotHeight - (seconds / 60 / max) * plotHeight;

  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "durations", role: "img", "aria-label": "Länge der Folgen im Zeitverlauf" });
  for (let tick = 0; tick <= max; tick += stepMinutes) {
    svg("line", { x1: margin.left, x2: width - margin.right, y1: y(tick * 60), y2: y(tick * 60), class: tick === 0 ? "baseline" : "grid" }, root);
    text(root, `${tick} min`, { x: margin.left - 8, y: y(tick * 60) + 4, class: "axis-label tick", "text-anchor": "end" });
  }
  const firstYear = points[0].date.getFullYear();
  const lastYear = points[points.length - 1].date.getFullYear();
  const yearStep = plotWidth / (lastYear - firstYear + 1) < 44 ? 2 : 1;
  for (let year = firstYear + 1; year <= lastYear; year += yearStep) {
    const position = x(new Date(year, 0, 1));
    svg("line", { x1: position, x2: position, y1: y(0), y2: y(0) + 5, class: "baseline" }, root);
    text(root, String(year), { x: position, y: height - 8, class: "axis-label", "text-anchor": "middle" });
  }

  const dots = svg("g", { class: "dots" }, root);
  for (const point of points) svg("circle", { cx: x(point.date), cy: y(point.duration), r: 2.5, class: "dot" }, dots);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(averages[index]).toFixed(1)}`).join("");
  svg("path", { d: line, class: "series-line" }, root);

  const crosshair = svg("line", { y1: margin.top, y2: margin.top + plotHeight, class: "crosshair", visibility: "hidden" }, root);
  const marker = svg("circle", { r: 5, class: "focus-dot", visibility: "hidden" }, root);
  const overlay = svg("rect", {
    x: margin.left, y: margin.top, width: plotWidth, height: plotHeight,
    class: "overlay", tabindex: "0", role: "button",
    "aria-label": "Folgen-Längen. Mit den Pfeiltasten durch die Folgen gehen, Enter öffnet die Folge.",
  }, root);

  const positions = points.map((point) => x(point.date));
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
  const highlight = (index, anchor) => {
    active = index;
    const point = points[index];
    crosshair.setAttribute("x1", positions[index]);
    crosshair.setAttribute("x2", positions[index]);
    crosshair.setAttribute("visibility", "visible");
    marker.setAttribute("cx", positions[index]);
    marker.setAttribute("cy", y(point.duration));
    marker.setAttribute("visibility", "visible");
    showTooltip(anchor || marker, `#${point.id} ${point.title}`, [
      { value: formatDuration(point.duration), label: formatDate(point.date), key: "key-dot" },
      { value: formatDuration(averages[index]), label: `Schnitt der letzten ${Math.min(span, index + 1)} Folgen`, key: "key-series" },
    ]);
  };
  const clear = () => {
    crosshair.setAttribute("visibility", "hidden");
    marker.setAttribute("visibility", "hidden");
    hideTooltip();
  };
  overlay.addEventListener("pointermove", (event) => highlight(nearest(event.clientX), { x: event.clientX, y: event.clientY }));
  overlay.addEventListener("pointerleave", clear);
  overlay.addEventListener("click", (event) => onOpen(points[nearest(event.clientX)]));
  overlay.addEventListener("focus", () => highlight(active));
  overlay.addEventListener("blur", clear);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      highlight(Math.max(0, Math.min(points.length - 1, active + (event.key === "ArrowRight" ? 1 : -1))));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(points[active]);
    }
  });
  container.replaceChildren(root);
}

// --- Meistzitierte Interpret:innen als Balken ---------------------------------------

export function renderArtists(container, { rows, selected, onSelect, emptyMessage }) {
  if (rows.length === 0) {
    emptyState(container, emptyMessage);
    return;
  }
  const max = Math.max(...rows.map((row) => row.count));
  const list = document.createElement("ol");
  list.className = "bars";
  for (const row of rows) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bar-row${selected === row.artist ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", String(selected === row.artist));
    button.title = selected === row.artist ? "Filter aufheben" : `Nur Folgen mit ${row.artist} zeigen`;
    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = row.artist;
    const track = document.createElement("span");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(2, (row.count / max) * 100)}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = formatNumber(row.count);
    button.append(name, track, value);
    button.addEventListener("click", () => onSelect(row.artist));
    item.append(button);
    list.append(item);
  }
  container.replaceChildren(list);
}

// --- Tabellenansicht als Alternative zu jedem Diagramm ---------------------------------

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
  const scroller = document.createElement("div");
  scroller.className = "table-scroll";
  scroller.append(table);
  container.replaceChildren(scroller);
}
