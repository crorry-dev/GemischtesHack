// Scroll-Motor im Stil einer Produktseite: Angepinnte Abschnitte (.pin) bleiben stehen, während man scrollt,
// und ihr Inhalt verwandelt sich mit dem Fortschritt. Jeder beobachtete Abschnitt bekommt
//   --p  Fortschritt durch den angepinnten Bereich (0 → 1)
//   --e  Eintritt in den Bildschirm (0 → 1)
//   --v  Durchlauf durch den Bildschirm, von unten rein bis oben raus (0 → 1)
// und optional eine Funktion, die bei jeder Änderung aufgerufen wird.
// Abschnitte mit autoplay() rasten dagegen ein (genau ein Bildschirm hoch) und spielen ihre Animation
// selbst ab, sobald sie im Bild sind; --p läuft dann über die Zeit statt über die Scrollstrecke.

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const tracks = [];
let queued = false;
let started = false;

export const motion = () => !reducedMotion.matches;

export function track(element, { frame = null, measure = null } = {}) {
  tracks.push({ element, frame, measure, last: "" });
  if (started) {
    measure?.();
    queue();
  }
}

export function autoplay(element, { duration = 2000, frame = null } = {}) {
  element.classList.add("snap");
  let raf = 0;
  let played = false;
  const set = (p) => {
    element.style.setProperty("--p", p.toFixed(4));
    element.style.setProperty("--e", "1");
    element.style.setProperty("--v", "0.5");
    frame?.({ p, e: 1, v: 0.5, moving: motion() });
  };
  const play = () => {
    if (!motion()) {
      set(1);
      return;
    }
    if (played) return;
    played = true;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      set(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  // Ganz aus dem Bild: zurück auf Anfang, damit es beim Wiederkommen noch einmal spielt
  const reset = () => {
    cancelAnimationFrame(raf);
    played = false;
    set(motion() ? 0 : 1);
  };
  const item = {
    element,
    auto: true,
    // ohne Bewegung sofort der Endzustand
    settle: () => {
      if (!motion()) set(1);
    },
    init: () => {
      reset();
      if (!("IntersectionObserver" in window)) {
        set(1);
        return;
      }
      new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.55) play();
          else if (!entry.isIntersecting) reset();
        }
      }, { threshold: [0, 0.55] }).observe(element);
    },
  };
  tracks.push(item);
  if (started) item.init();
}

export function startScenes() {
  started = true;
  for (const item of tracks) item.init?.();
  setupSettle();
  document.documentElement.classList.toggle("motion", motion());
  const remeasure = () => {
    for (const item of tracks) {
      item.last = "";
      item.measure?.();
    }
    for (const item of tracks) item.settle?.();
    queue();
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", remeasure);
  reducedMotion.addEventListener("change", () => {
    document.documentElement.classList.toggle("motion", motion());
    remeasure();
  });
  remeasure();
  update();
  // Breiten (Galerie) stimmen erst, wenn die Schrift geladen ist
  document.fonts?.ready.then(remeasure);
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(update);
}

function update() {
  queued = false;
  const height = window.innerHeight;
  const moving = motion();
  for (const item of tracks) {
    const element = item.element;
    if (element.hidden) continue;
    const box = element.getBoundingClientRect();
    // Übergang für jeden Abschnitt: --in beim Hereinkommen (Karte wächst auf volle Breite),
    // --x beim Hinausgehen (Inhalt bleibt zurück, wird kleiner und blasser)
    const enter = moving ? clamp((height - box.top) / height) : 1;
    const exit = moving ? clamp((height - box.bottom) / height) : 0;
    const transition = `${enter.toFixed(3)}|${exit.toFixed(3)}`;
    if (transition !== item.transition) {
      item.transition = transition;
      element.style.setProperty("--in", enter.toFixed(3));
      element.style.setProperty("--x", exit.toFixed(3));
    }
    if (item.auto) continue;
    const p = moving ? clamp(-box.top / Math.max(1, box.height - height)) : 1;
    const e = moving ? clamp((height - box.top) / (height * 0.75)) : 1;
    const v = moving ? clamp((height - box.top) / (height + box.height)) : 0.5;
    const key = `${p.toFixed(4)}|${e.toFixed(3)}|${v.toFixed(3)}`;
    if (key === item.last) continue;
    item.last = key;
    element.style.setProperty("--p", p.toFixed(4));
    element.style.setProperty("--e", e.toFixed(3));
    element.style.setProperty("--v", v.toFixed(3));
    item.frame?.({ p, e, v, moving });
  }
  // Kopfleiste übernimmt die Farben des Abschnitts darunter
  const bar = document.querySelector("#topbar");
  if (bar) {
    const edge = bar.offsetHeight;
    const under = tracks.findLast(({ element }) => {
      if (element.hidden) return false;
      const box = element.getBoundingClientRect();
      return box.top <= edge && box.bottom > edge;
    });
    bar.classList.toggle("stage", Boolean(under?.element.classList.contains("stage")));
  }
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

// Teilstück eines Fortschritts: span(0.4, 0.2, 0.6) → 0.5
export function span(value, from, to) {
  return clamp((value - from) / (to - from));
}

export const ease = (value) => 1 - (1 - value) ** 3;

// Zahl einmalig hochzählen (für Abschnitte ohne Anpinnen)
export function countUp(element, to, format = String) {
  const from = Number(element.dataset.value || 0);
  element.dataset.value = String(to);
  if (!motion() || from === to) {
    element.textContent = format(to);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / 1200);
    element.textContent = format(Math.round(from + (to - from) * ease(progress)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// So scrollen, dass ein angepinnter Abschnitt beim Fortschritt p steht
export function scrollToProgress(element, p) {
  const top = element.getBoundingClientRect().top + window.scrollY;
  const range = element.offsetHeight - window.innerHeight;
  window.scrollTo({ top: top + range * p, behavior: motion() ? "smooth" : "auto" });
}

// Einrasten mit Maus und Trackpad: Touch rastet über CSS-Scroll-Snap ein, das Mausrad aber nicht in jedem
// Browser in Scrollrichtung. Steht der Bildschirm nach dem Scrollen zwischen zwei Abschnitten, fährt er
// in Scrollrichtung zum nächsten Abschnitt; innerhalb langer Abschnitte bleibt das Scrollen frei.
function setupSettle() {
  const fine = window.matchMedia("(pointer: fine)");
  let direction = 1;
  let lastY = window.scrollY;
  let timer = 0;
  let steering = false;
  // Rastflächen: jeder Abschnitt, Einzelseiten-Abschnitte stattdessen mit jeder ihrer Rastmarken
  const sections = () => [...document.querySelectorAll("main > section:not([hidden]), #insights > section")]
    .flatMap((section) => {
      const marks = section.querySelectorAll(".snap-mark");
      return marks.length ? [...marks] : [section];
    })
    .map((area) => {
      const top = area.getBoundingClientRect().top + window.scrollY;
      return { top, bottom: top + area.offsetHeight };
    });
  const settle = () => {
    if (steering || !motion() || !fine.matches || document.querySelector("dialog[open]")) return;
    const y = window.scrollY;
    const height = window.innerHeight;
    const end = document.documentElement.scrollHeight - height;
    const list = sections();
    const index = list.findIndex((section) => section.top <= y + 1 && y < section.bottom - 1);
    if (index === -1) return;
    const current = list[index];
    if (Math.abs(y - current.top) <= 2) return;
    // ganz innerhalb eines langen Abschnitts: frei scrollen
    if (y + height <= current.bottom + 1 || y >= end - 1) return;
    const target = direction > 0
      ? Math.min(end, list[index + 1]?.top ?? end)
      : (current.bottom - current.top > height + 2 ? current.bottom - height : current.top);
    if (Math.abs(target - y) <= 2) return;
    steering = true;
    window.scrollTo({ top: target, behavior: "smooth" });
    const release = () => {
      steering = false;
      lastY = window.scrollY;
    };
    if ("onscrollend" in window) window.addEventListener("scrollend", release, { once: true });
    setTimeout(release, 900);
  };
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y !== lastY) direction = Math.sign(y - lastY);
    lastY = y;
    clearTimeout(timer);
    timer = setTimeout(settle, 140);
  }, { passive: true });
}
