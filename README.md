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
  [Discussion-Formular in Q&A](https://github.com/crorry-dev/GemischtesHack/discussions/new?category=q-a) nutzen.
- **Neue Folge eintragen:** Titel, Datum, Länge und Link über das
  [Discussion-Formular in General](https://github.com/crorry-dev/GemischtesHack/discussions/new?category=general),
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

**Discussions sind für Daten und Austausch, Issues für Bugs und Entwicklungsaufgaben.**
In **Q&A** ordnen wir Zitate gemeinsam zu, in **General** ergänzen wir Folgen.
Ideen kommen nach [Ideas](https://github.com/crorry-dev/GemischtesHack/discussions/categories/ideas).
Die bisherigen Daten-Issues sind abgearbeitet; ihre Links und Antworten bleiben erhalten.
Es gibt keinen zweiten automatischen Dateneingang über neue Issues.

Vorschläge prüft eine Community-Kurator:in oder jemand mit Schreibrechten und gibt sie
mit einem **Hauptkommentar** `/approve` frei
(oder `/approve unsure`, `/approve open`, optional `extra` für ein weiteres Zitat).
Das gilt für den Formulartext im Startbeitrag. Ein alternativer Vorschlag gehört
als vollständiger Formulartext (mit denselben `###`-Überschriften) in einen
Hauptkommentar. Dessen Link wird ausdrücklich freigegeben:

```text
/approve https://github.com/crorry-dev/GemischtesHack/discussions/NUMMER#discussioncomment-ID
```

Zusätze wie `unsure` stehen hinter dem Link. Links auf andere Discussions oder auf
verschachtelte Antworten werden zurückgewiesen. Nachträglich geänderte Vorschläge
brauchen eine neue Freigabe; der Wochenlauf meldet das in der Discussion.
Eine vom Fragesteller markierte Antwort und 👍 sind **keine** automatische Bestätigung.
Nach erfolgreicher Übernahme markiert der Bot den freigegebenen Kommentar in Q&A
als Antwort und schließt die Discussion als erledigt; Startbeiträge werden ebenfalls
übernommen und geschlossen. Für spätere Korrekturen eine neue Discussion eröffnen.

`/approve all` gibt die Startbeiträge aller zu diesem Zeitpunkt offenen
Daten-Discussions frei, nicht später eingereichte. Es wählt **keine** alternativen
Kommentarvorschläge aus. Kommentare selbst starten **keine Action**.
**Freigabe bedeutet Warteschlange, nicht sofortige Veröffentlichung.**

**Donnerstags um 06:17 UTC** (07:17 MEZ / 08:17 MESZ) sammelt
**Weekly community update** die Freigaben, übernimmt sie mit **einem Daten-Commit**,
gleicht einmal die Playlist ab und veröffentlicht einmal die Website.
Zum sofortigen Verarbeiten nach `/approve all` den Sammellauf manuell starten:

```sh
gh workflow run uebernehmen.yml --ref main
```

GitHub kann geplante Läufe verzögert starten; in inaktiven öffentlichen Repositories
können Zeitpläne nach 60 Tagen deaktiviert werden.

Sofort manuell: **Actions → Weekly community update → Run workflow → main**.
Ohne Häkchen werden nur freigegebene Vorschläge übernommen. Mit
**„Alle offenen Formularvorschläge freigeben“** übernimmt der manuell startende
Maintainer ausdrücklich die Prüfung für alle. Fehlerhafte Vorschläge bleiben
mit einer Rückmeldung offen; unveränderte Fehler erzeugen nicht jede Woche neue
Kommentare. Nach einer Korrektur oder einem neuen `/approve` werden sie erneut geprüft.

„In Prüfung“ auf der Website entspricht dem Stand der letzten Veröffentlichung,
nicht dem Live-Stand der Discussions. Bestätigte Songs mit Spotify-Link kommen danach
automatisch in die Playlist, die neueste Folge steht dort oben.
Bei einem Playlist-Fehler wird die Website trotzdem veröffentlicht; der Lauf
meldet den Fehler sichtbar. API-Fehler brechen ab statt leere Daten vorzutäuschen.

Direkte Änderungen an Website und Daten werden weiterhin nach einem Push auf
`main` veröffentlicht. Reine README-/Community-Änderungen lösen keine Builds aus;
die Playlist läuft bei Pushes nur für Änderungen an ihren Eingabedaten oder Skripten.
Es gibt weder tägliche Playlist-Läufe noch Workflows pro Issue/Kommentar.

### Verantwortung teilen

Die vertrauenswürdigen GitHub-Namen stehen in
[`.github/kuratoren.json`](.github/kuratoren.json). Neue Kurator:innen werden nach
Absprache per Pull Request aufgenommen und brauchen **keinen Schreibzugriff auf
den Code**. Bis weitere Personen mitmachen, ist `crorry-dev` eingetragen.
Die Liste gewährt nur die oben beschriebene Datenfreigabe; Repository-Schreibrechte
werden bei anderen Personen weiterhin über GitHub geprüft. Review, Beleg und
Freigabe bleiben menschliche Aufgaben, nicht eine Mehrheitsabstimmung.

## Statistiken und Datenstand

Die Website zeigt unter **Mehr Statistiken** die bestätigten Zuordnungen pro
Jahr, die Hörzeit pro Jahr mit Tabelle, die typische Folgenlänge (Median, also
den mittleren Wert), fehlende Zitate und fehlende Spotify-Links bestätigter Songs.
Die Auswertungen beachten die aktiven Filter und zählen Laufzeiten pro Folge,
nicht pro Zitat. Die Hörzeit ist die Summe erfasster Laufzeiten, kein persönlicher
Spotify-Hörverlauf. Folgen ohne Zitat sind aus der Zuordnungsquote ausgeschlossen;
„vermutet“ zählt nicht als bestätigt.

Bestandsaufnahme vom **14.10.2026** nach Übernahme der bisherigen Issues: 364 Folgen
mit vollständigen Titel-, Datums-, Laufzeit- und Folgenlink-Angaben;
35 erfasste Einstiege, davon 16 ohne Zitat.
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
