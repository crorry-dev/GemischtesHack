// „Wer hat’s gesagt?“: Zitat raten, die Herkunft ist verdeckt, bis man sie aufdeckt
import { isSongUsage, originParts } from "./data.js";

// Nur bestätigte Zitate mit bekannter Herkunft; Folgenanfänge haben kein Zitat und fallen so heraus
export function quizPool(episodes) {
  return episodes.flatMap((episode) => episode.usages
    .filter((usage) => usage.quote && usage.review === "bestätigt" && quizAnswer(usage))
    .map((usage) => ({ episode, usage })));
}

// Was beim Aufdecken erscheint: wer es war, darunter beim Song der Titel
export function quizAnswer(usage) {
  if (isSongUsage(usage)) {
    if (!usage.artist && !usage.song) return null;
    return { kind: "Song", who: usage.artist || usage.song, detail: usage.artist && usage.song ? `♪ ${usage.song}` : "" };
  }
  if (!usage.origin) return null;
  const [kind, name] = originParts(usage.origin);
  return { kind: kind || "Quelle", who: name, detail: usage.artist ? `Von ${usage.artist}` : "" };
}

// Jedes Zitat einmal, in zufälliger Reihenfolge (Fisher-Yates)
export function shuffle(items, random = Math.random) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}
