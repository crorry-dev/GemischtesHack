// Onepager: Jeder Abschnitt blendet sich beim Scrollen ein und wieder aus, gekoppelt an die Scrollposition.
// Pro Abschnitt setzt das Skript --in (0 → 1 beim Hereinscrollen) und --out (0 → 1 beim Hinausscrollen);
// das CSS leitet daraus Deckkraft, Versatz und Balkenlängen ab.

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function setupScenes({ onEnter = () => {} } = {}) {
  const scenes = [...document.querySelectorAll("main [data-label]")].filter((scene) => !scene.hidden);
  const entered = new WeakSet();
  const enter = (scene) => {
    if (entered.has(scene)) return;
    entered.add(scene);
    onEnter(scene);
  };
  for (const scene of scenes) {
    scene.querySelectorAll(".step").forEach((step, index) => step.style.setProperty("--step", String(index)));
  }
  const nav = buildNav(scenes);
  const bar = document.querySelector("#scroll-progress");
  const animated = !reducedMotion.matches;
  let active = null;
  let queued = false;

  const frame = () => {
    queued = false;
    const height = window.innerHeight;
    for (const scene of scenes) {
      const box = (scene.querySelector(":scope > .scene-inner") || scene).getBoundingClientRect();
      if (box.bottom < -height || box.top > height * 2) continue;
      const into = clamp((height - box.top) / (height * 0.55));
      const away = clamp((height * 0.5 - box.bottom) / (height * 0.5));
      if (animated && scene.classList.contains("scene")) {
        scene.style.setProperty("--in", into.toFixed(3));
        scene.style.setProperty("--out", away.toFixed(3));
      }
      if (into > 0.3) enter(scene);
    }
    const current = scenes.findLast((scene) => scene.getBoundingClientRect().top <= height * 0.5) || scenes[0];
    if (current !== active) {
      active = current;
      for (const button of nav) button.toggleAttribute("aria-current", button.dataset.target === current.id);
    }
    const total = document.documentElement.scrollHeight - height;
    if (bar) bar.style.transform = `scaleX(${total > 0 ? clamp(window.scrollY / total) : 0})`;
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  document.documentElement.classList.toggle("scenes-animated", animated);
  frame();
  return { refresh: queue };
}

function buildNav(scenes) {
  const nav = document.querySelector("#scene-nav");
  if (!nav) return [];
  const buttons = scenes.map((scene) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.target = scene.id;
    button.setAttribute("aria-label", scene.dataset.label);
    button.title = scene.dataset.label;
    button.addEventListener("click", () => scene.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth" }));
    return button;
  });
  nav.replaceChildren(...buttons);
  return buttons;
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

// Zahl von ihrem letzten Wert hochzählen; ohne Bewegung sofort der Endwert
export function countUp(element, to, format = String) {
  const from = Number(element.dataset.value || 0);
  element.dataset.value = String(to);
  if (reducedMotion.matches || from === to) {
    element.textContent = format(to);
    return;
  }
  const start = performance.now();
  const duration = 1100;
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = format(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
