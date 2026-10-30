import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectionStats, yearlyStats } from "../site/assets/statistics.js";
import { loadData } from "../site/assets/data.js";

function episode(overrides = {}) {
  return { id: "1", year: 2026, duration: 3600, status: "offen", hasQuote: false, usages: [], ...overrides };
}

test("empty selections and missing lengths do not produce NaN", () => {
  const stats = collectionStats([]);
  assert.equal(stats.percent, null);
  assert.equal(stats.median, null);
  assert.equal(stats.seconds, 0);
  assert.deepEqual(yearlyStats([]), []);
});

test("multiple usages count as one episode and one listening duration", () => {
  const usage = { quote: "Test", review: "bestätigt", status: "bestätigt", song: "Song", origin: "", trackUrl: null };
  const stats = collectionStats([episode({ hasQuote: true, usages: [usage, usage] })]);
  assert.equal(stats.confirmed, 1);
  assert.equal(stats.seconds, 3600);
  assert.equal(stats.percent, 100);
  assert.equal(stats.missingLinks, 2);
});

test("openings without a quote are excluded from the denominator", () => {
  const stats = collectionStats([episode({ status: "kein Zitat" }), episode()]);
  assert.equal(stats.possible, 1);
  assert.equal(stats.missing, 1);
  assert.equal(collectionStats([episode({ status: "kein Zitat" })]).percent, null);
});

test("unconfirmed non-song origins are not presented as confirmed", () => {
  const stats = collectionStats([episode({
    hasQuote: true, status: "kein Song",
    usages: [{ quote: "Test", review: "vermutet", origin: "Film: Test" }],
  })]);
  assert.equal(stats.captured, 1);
  assert.equal(stats.confirmed, 0);
  assert.equal(stats.percent, 0);
});

test("median handles odd, even and missing durations", () => {
  assert.equal(collectionStats([1, 9, 2].map((duration) => episode({ duration }))).median, 2);
  assert.equal(collectionStats([1, 9, 2, 4, null].map((duration) => episode({ duration }))).median, 3);
});

test("yearly aggregations respect the supplied selection", () => {
  const rows = yearlyStats([episode({ year: 2024 }), episode({ year: 2026 }), episode({ year: null })]);
  assert.deepEqual(rows.map((row) => row.year), [2026, 2024]);
  assert.equal(rows[1].seconds, 3600);
});

test("real CSV produces internally consistent episode-based statistics", async () => {
  const csv = await readFile(new URL("../data/zitate.csv", import.meta.url), "utf8");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => csv });
  try {
    const episodes = await loadData();
    const stats = collectionStats(episodes);
    const years = yearlyStats(episodes);
    assert.ok(stats.total > 0);
    assert.equal(stats.total, new Set(episodes.map((item) => item.id)).size);
    assert.equal(stats.total, stats.possible + stats.withoutQuote);
    assert.equal(stats.possible, stats.captured + stats.missing);
    assert.equal(stats.seconds, years.reduce((sum, row) => sum + row.seconds, 0));
    assert.ok(stats.confirmed <= stats.captured);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("artist spellings and separators are unified for the evaluation", async (t) => {
  const csv = [
    "verwendung_id,folge_id,folge_titel,zitat,interpret,spotify_link,pruefstatus,anmerkung,spotify_status",
    "001-1,1,A,Eins,UFO361 feat. Gzuz,https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa,bestätigt,,nicht verfügbar",
    "002-1,2,B,Zwei,\"Ufo361, Sido (K.I.Z.)\",,bestätigt,Nicht bei Spotify,",
    "003-1,3,C,Drei,Ufo361 x Celo & Abdi,,bestätigt,,",
  ].join("\n");
  t.mock.method(globalThis, "fetch", async () => new Response(csv));
  const episodes = await loadData();
  assert.deepEqual(episodes.map((episode) => episode.artists), [["Ufo361", "Gzuz"], ["Ufo361", "Sido"], ["Ufo361", "Celo & Abdi"]]);
  assert.equal(episodes[0].usages[0].linkUnavailable, true);
  assert.equal(episodes[1].usages[0].note, "Nicht bei Spotify");
  assert.equal(collectionStats(episodes).unavailableLinks, 1);
});
