# Gemischtes Hack – Einstiegszitate, Songs & Statistiken

Felix' Einstiegszitate aus *Gemischtes Hack* und die Songs dahinter – gesammelt
von Hackis für Hackis. Unabhängiges Community-Projekt, keine Verbindung zum
Podcast, zu Felix, Tommi oder Spotify.

**Website:** [crorry-dev.github.io/GemischtesHack](https://crorry-dev.github.io/GemischtesHack/)

**Playlist:** [auf Spotify folgen](https://crorry-dev.github.io/GemischtesHack/playlist/)

**English:** An unofficial, community-maintained dataset of opening quotes and
song references from the German podcast *Gemischtes Hack*, with a searchable
website, listening statistics and a Spotify playlist. Contributions welcome;
no coding required for quote suggestions.

## Mitmachen

- **Zitat vorschlagen:** auf der Website eine Folge öffnen oder direkt das
  [Zitat-Formular](https://github.com/crorry-dev/GemischtesHack/issues/new?template=zitat.yml) nutzen.
- **Neue Folge eintragen:** Titel, Datum, Länge und Link über das
  [Folgen-Formular](https://github.com/crorry-dev/GemischtesHack/issues/new?template=folge.yml),
  auf Wunsch gleich mit dem Zitat.
- **Daten bearbeiten:** [`data/zitate.csv`](data/zitate.csv), eine Zeile pro
  Zitat (UTF-8, Komma als Trennzeichen).

- **Am Code mitarbeiten:** kleine, abgegrenzte Aufgaben stehen unter
  [good first issue](https://github.com/crorry-dev/GemischtesHack/labels/good%20first%20issue)
  und [help wanted](https://github.com/crorry-dev/GemischtesHack/labels/help%20wanted).
  Einstieg und lokale Prüfung: [CONTRIBUTING.md](CONTRIBUTING.md).
- **Weitererzählen:** Website oder Playlist mit anderen Hackis teilen und das
  Repository auf GitHub mit einem Stern merken. Bitte keine ungefragte Werbung.

### Freigaben und Wochenlauf

Vorschläge prüft ein Maintainer und gibt sie mit `/approve` frei
(oder `/approve unsure`, `/approve open`, optional `extra` für ein weiteres Zitat).
`/approve all` gibt alle zu diesem Zeitpunkt offenen Formularvorschläge frei,
nicht später eingereichte Issues. Kommentare selbst starten **keine Action**.
Die aktuellen Schreibrechte der freigebenden Person werden beim Verarbeiten geprüft.

**Donnerstags um 06:17 UTC** (07:17 MEZ / 08:17 MESZ) sammelt
**Weekly community update** die Freigaben, übernimmt sie mit **einem Daten-Commit**,
gleicht einmal die Playlist ab und veröffentlicht einmal die Website.
GitHub kann geplante Läufe verzögert starten; in inaktiven öffentlichen Repositories
können Zeitpläne nach 60 Tagen deaktiviert werden.

Sofort manuell: **Actions → Weekly community update → Run workflow → main**.
Ohne Häkchen werden nur freigegebene Vorschläge übernommen. Mit
**„Alle offenen Formularvorschläge freigeben“** übernimmt der manuell startende
Maintainer ausdrücklich die Prüfung für alle. Fehlerhafte Vorschläge bleiben
mit einer Rückmeldung offen; unveränderte Fehler erzeugen nicht jede Woche neue
Kommentare. Nach einer Korrektur oder einem neuen `/approve` werden sie erneut geprüft.

„In Prüfung“ auf der Website entspricht dem Stand der letzten Veröffentlichung,
nicht dem Live-Stand der Issues. Bestätigte Songs mit Spotify-Link kommen danach
automatisch in die Playlist, die neueste Folge steht dort oben.
Bei einem Playlist-Fehler wird die Website trotzdem veröffentlicht; der Lauf
meldet den Fehler sichtbar. API-Fehler brechen ab statt leere Daten vorzutäuschen.

Direkte Änderungen an Website und Daten werden weiterhin nach einem Push auf
`main` veröffentlicht. Reine README-/Community-Änderungen lösen keine Builds aus;
die Playlist läuft bei Pushes nur für Änderungen an ihren Eingabedaten oder Skripten.
Es gibt weder tägliche Playlist-Läufe noch Workflows pro Issue/Kommentar.

## Statistiken und Datenstand

Die Website zeigt unter **Mehr Statistiken** die bestätigten Zuordnungen pro
Jahr, die Hörzeit pro Jahr mit Tabelle, die typische Folgenlänge (Median, also
den mittleren Wert), fehlende Zitate und fehlende Spotify-Links bestätigter Songs.
Die Auswertungen beachten die aktiven Filter und zählen Laufzeiten pro Folge,
nicht pro Zitat. Die Hörzeit ist die Summe erfasster Laufzeiten, kein persönlicher
Spotify-Hörverlauf. Folgen ohne Zitat sind aus der Zuordnungsquote ausgeschlossen;
„vermutet“ zählt nicht als bestätigt.

Bestandsaufnahme vom **14.10.2026**: 364 Folgen mit vollständigen Titel-, Datums-,
Laufzeit- und Folgenlink-Angaben; 29 erfasste Einstiege, davon 13 ohne Zitat.
Vier Einträge sind Songs mit Spotify-Link. Der größte Beitrag ist deshalb derzeit
das Zuordnen weiterer Einstiege. Musikgenres, Erscheinungsjahre der Songs und
Sprachen sind nicht erfasst und werden nicht aus Titeln geraten.

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
