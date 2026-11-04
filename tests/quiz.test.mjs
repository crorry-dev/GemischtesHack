import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadData } from "../site/assets/data.js";
import { quizAnswer, quizPool, shuffle } from "../site/assets/quiz.js";

async function episodesFrom(t, lines) {
  const csv = ["verwendung_id,folge_id,folge_titel,zitat,songtitel,interpret,herkunft,pruefstatus", ...lines].join("\n");
  t.mock.method(globalThis, "fetch", async () => new Response(csv));
  return loadData();
}

test("only confirmed quotes with a known origin can be guessed", async (t) => {
  const episodes = await episodesFrom(t, [
    "001-1,1,A,Song-Zitat,HUSTLEN,Luvre47,,bestätigt",
    "002-1,2,B,Erste Worte,,,Kein Zitat,bestätigt",
    "003-1,3,C,Vermutet,Song,Jemand,,vermutet",
    "004-1,4,D,Unbekannt,,,,bestätigt",
    "005-1,5,E,Personen-Zitat,,,Person: Tommi Schmitt,bestätigt",
  ]);
  assert.deepEqual(quizPool(episodes).map(({ episode }) => episode.id), ["1", "5"]);
});

test("the answer names who said it, songs also their title", async (t) => {
  const episodes = await episodesFrom(t, [
    "001-1,1,A,Eins,I'm Ill,Red Cafe feat. Fabolous,,bestätigt",
    "002-1,2,B,Zwei,Nur der Titel,,,bestätigt",
    "003-1,3,C,Drei,,,Person: Jens Spahn,bestätigt",
    "004-1,4,D,Vier,,,Aufschrift auf einem Sprinter,bestätigt",
    "005-1,5,E,Fünf,,Til Schweiger,Film: Keinohrhasen (2007),bestätigt",
  ]);
  assert.deepEqual(episodes.map((episode) => quizAnswer(episode.usages[0])), [
    { kind: "Song", who: "Red Cafe feat. Fabolous", detail: "♪ I'm Ill" },
    { kind: "Song", who: "Nur der Titel", detail: "" },
    { kind: "Person", who: "Jens Spahn", detail: "" },
    { kind: "Quelle", who: "Aufschrift auf einem Sprinter", detail: "" },
    { kind: "Film", who: "Keinohrhasen (2007)", detail: "Von Til Schweiger" },
  ]);
});

test("shuffling keeps every quote once and leaves the original order alone", () => {
  const items = [1, 2, 3, 4, 5];
  const shuffled = shuffle(items, () => 0);
  assert.deepEqual(shuffled, [2, 3, 4, 5, 1]);
  assert.deepEqual(items, [1, 2, 3, 4, 5]);
  assert.deepEqual([...shuffle(items)].sort(), items);
});

test("every quiz entry from the real CSV has a quote and an answer", async (t) => {
  const csv = await readFile(new URL("../data/zitate.csv", import.meta.url), "utf8");
  t.mock.method(globalThis, "fetch", async () => new Response(csv));
  const pool = quizPool(await loadData());
  assert.ok(pool.length > 1);
  for (const { usage } of pool) {
    assert.ok(usage.quote);
    assert.ok(quizAnswer(usage).who);
  }
});
