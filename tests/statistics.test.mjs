import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  collectionStats,
  longestSongRun,
  personNames,
  quoteExtremes,
  quoteSources,
  repeatedSongs,
  topArtists,
  topDuos,
  yearFavourites,
  yearlyStats,
} from "../site/assets/statistics.js";
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

test("bands with a separator in their name stay together", async (t) => {
  const csv = [
    "verwendung_id,folge_id,folge_titel,zitat,interpret,pruefstatus",
    "001-1,1,A,Eins,Celo & Abdi feat. Haftbefehl & Xatar,bestätigt",
    "002-1,2,B,Zwei,Hammer & Zirkel,bestätigt",
    "003-1,3,C,Drei,\"Bill Withers und Grover Washington, Jr.\",bestätigt",
    "004-1,4,D,Vier,OG Keemo & Kwam.E,bestätigt",
  ].join("\n");
  t.mock.method(globalThis, "fetch", async () => new Response(csv));
  const episodes = await loadData();
  assert.deepEqual(episodes.map((episode) => episode.artists), [
    ["Celo & Abdi", "Haftbefehl", "Xatar"],
    ["Hammer & Zirkel"],
    ["Bill Withers", "Grover Washington, Jr."],
    ["OG Keemo", "Kwam.E"],
  ]);
});

async function episodesFrom(t, lines) {
  const csv = ["verwendung_id,folge_id,folge_titel,zitat,songtitel,interpret,spotify_link,herkunft,pruefstatus", ...lines].join("\n");
  t.mock.method(globalThis, "fetch", async () => new Response(csv));
  return loadData();
}

test("artists count every confirmed quote, features included, and each song once", async (t) => {
  const episodes = await episodesFrom(t, [
    "001-1,1,A,Eins,Weihnachtssong,Sido,https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa,,bestätigt",
    "002-1,2,B,Zwei,Weihnachtssong,Sido,https://open.spotify.com/track/bbbbbbbbbbbbbbbbbbbbbb,,bestätigt",
    "003-1,3,C,Drei,Sehr Geil,B-Tight feat. Sido,,,bestätigt",
    "004-1,4,D,Vier,HUSTLEN,Luvre47,,,bestätigt",
    "005-1,5,E,Fünf,Offen,Luvre47,,,offen",
    "006-1,6,F,Sechs,,Tommi Schmitt,,Person: Tommi Schmitt,bestätigt",
  ]);
  const artists = topArtists(episodes);
  assert.deepEqual(artists.map(({ name, quotes, songs }) => [name, quotes, songs]), [["Sido", 3, 2], ["B-Tight", 1, 1], ["Luvre47", 1, 1]]);
  // gleicher Titel trotz anderem Spotify-Link ist derselbe Song
  assert.deepEqual(repeatedSongs(episodes).map((song) => [song.song, song.episodes.map((episode) => episode.id)]), [["Weihnachtssong", ["1", "2"]]]);
  assert.deepEqual(topDuos(episodes), [{ names: ["B-Tight", "Sido"], count: 1 }]);
  assert.deepEqual(longestSongRun(episodes), { length: 4, from: 1, to: 4 });
});

test("people are named, random encounters counted as unknown", async (t) => {
  assert.deepEqual(personNames("Person: Tommi Schmitt"), ["Tommi Schmitt"]);
  assert.deepEqual(personNames("Person: Felix Lobrecht & Julian Lobrecht"), ["Felix Lobrecht", "Julian Lobrecht"]);
  assert.deepEqual(personNames("Person: Samra in jedem Track"), ["Samra"]);
  assert.deepEqual(personNames("Person: Birdmans legendäres Interview bei The Breakfast Club"), ["Birdman"]);
  assert.deepEqual(personNames("Person: Ein Typ im Supermarkt"), [null]);
  assert.deepEqual(personNames("Person: Zitteraal Doku"), [null]);
  const episodes = await episodesFrom(t, [
    "001-1,1,A,Eins,,,,Person: Tommi Schmitt,bestätigt",
    "002-1,2,B,Zwei,,,,Person: Tommi Schmitt,bestätigt",
    "003-1,3,C,Drei,,,,Person: Tankwart,bestätigt",
    "004-1,4,D,Vier,,,,Film: Top Boy,bestätigt",
    "005-1,5,E,Fünf,,,,Aufschrift auf einem Sprinter,bestätigt",
    "006-1,6,F,Sechs,,,,Person: Jemand,offen",
  ]);
  const sources = quoteSources(episodes);
  assert.equal(sources.total, 5);
  assert.deepEqual(sources.people.map((person) => [person.name, person.count]), [["Tommi Schmitt", 2]]);
  assert.deepEqual([sources.anonymous.length, sources.films.length, sources.finds.length], [1, 1, 1]);
  assert.equal(quoteExtremes(episodes).shortest.usage.quote, "Eins");
});

test("each year names its favourite only when someone was quoted", async (t) => {
  const episodes = await episodesFrom(t, [
    "001-1,1,A,Eins,Song,Drake,,,bestätigt",
    "002-1,2,B,Zwei,Song 2,Drake,,,bestätigt",
  ]);
  episodes.forEach((episode) => { episode.year = 2020; });
  assert.deepEqual(yearFavourites(episodes), [{ year: 2020, names: ["Drake"], count: 2, quotes: 2, songs: 2, episodes: 2 }]);
});
