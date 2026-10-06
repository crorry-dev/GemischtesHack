# GemischtesHack

Felix' Einstiegszitate aus *Gemischtes Hack* und die Songs dahinter – gesammelt
von Hackis für Hackis. Unabhängiges Community-Projekt, keine Verbindung zum
Podcast, zu Felix, Tommi oder Spotify.

**Website:** [crorry-dev.github.io/GemischtesHack](https://crorry-dev.github.io/GemischtesHack/)

**Playlist:** [auf Spotify folgen](https://crorry-dev.github.io/GemischtesHack/playlist/)

## Mitmachen

- **Zitat vorschlagen:** auf der Website eine Folge öffnen oder direkt das
  [Zitat-Formular](https://github.com/crorry-dev/GemischtesHack/issues/new?template=zitat.yml) nutzen.
- **Neue Folge eintragen:** Titel, Datum, Länge und Link über das
  [Folgen-Formular](https://github.com/crorry-dev/GemischtesHack/issues/new?template=folge.yml),
  auf Wunsch gleich mit dem Zitat.
- **Daten bearbeiten:** [`data/zitate.csv`](data/zitate.csv), eine Zeile pro
  Zitat (UTF-8, Komma als Trennzeichen).

Vorschläge prüft ein Maintainer und übernimmt sie mit dem Kommentar
`/approve` (oder `/approve unsure`, wenn es noch nicht sicher ist);
`/approve all` übernimmt alle offenen Vorschläge auf einmal. Bis dahin zeigt
die Website die Folge schon als „In Prüfung“. Bestätigte Songs mit Spotify-Link
kommen danach automatisch in die Playlist, die neueste Folge steht dort oben.

## Daten

| Spalte | Inhalt |
| --- | --- |
| `verwendung_id` bis `folge_url` | Zeilen-ID wie `270-1`, dann Nummer, Titel, Datum, Länge und Link der Folge |
| `zitat` | das Einstiegszitat, bei Folgen ohne Zitat ihre ersten Worte |
| `songtitel`, `interpret`, `spotify_link` | Song, Interpret/in (sonst Autor/in) und Link zum Song auf Spotify |
| `herkunft` | nur wenn es kein Song ist, z. B. `Film: Ein Fisch namens Wanda (1988)`, oder `Kein Zitat`, wenn die Folge ohne Zitat beginnt |
| `pruefstatus` | `offen`, `vermutet` oder `bestätigt`; bestätigte Songs mit Link kommen in die Playlist |

Abgleich und Einrichtung der Playlist: [`scripts/playlist.py`](scripts/playlist.py).

Folgendaten (Titel, Datum, Länge, Link): Spotify.

## Lizenz

Code: [MIT](LICENSE) · Daten: [CC BY 4.0](LICENSE-DATA)
