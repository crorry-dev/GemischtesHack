// Folgen statt CSV-Zeilen zählen; mehrere Zitate dürfen keine Laufzeit verdoppeln.
export function collectionStats(episodes) {
  const durations = episodes.map((episode) => episode.duration).filter((value) => value > 0).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const withoutQuote = episodes.filter((episode) => episode.status === "kein Zitat").length;
  const possible = episodes.length - withoutQuote;
  const confirmed = episodes.filter((episode) =>
    episode.usages.some((usage) => usage.quote && usage.review === "bestätigt")).length;
  const captured = episodes.filter((episode) => episode.hasQuote).length;
  const songs = episodes.flatMap((episode) => episode.usages).filter((usage) =>
    usage.status === "bestätigt" && !usage.origin && (usage.song || usage.trackUrl));
  return {
    total: episodes.length,
    withoutQuote,
    possible,
    confirmed,
    captured,
    missing: possible - captured,
    percent: possible ? Math.round(confirmed / possible * 100) : null,
    seconds: durations.reduce((sum, duration) => sum + duration, 0),
    timed: durations.length,
    median: durations.length ? (durations[middle] + durations[Math.floor((durations.length - 1) / 2)]) / 2 : null,
    missingLinks: songs.filter((usage) => !usage.trackUrl).length,
    unavailableLinks: songs.filter((usage) => usage.linkUnavailable).length,
  };
}

export function yearlyStats(episodes) {
  const years = [...new Set(episodes.map((episode) => episode.year).filter(Boolean))].sort((a, b) => b - a);
  return years.map((year) => ({ year, ...collectionStats(episodes.filter((episode) => episode.year === year)) }));
}
