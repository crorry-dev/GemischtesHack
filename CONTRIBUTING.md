# Mitmachen

Danke! Das Projekt lebt von nachprüfbaren Beiträgen von Hackis. Es ist unabhängig
vom Podcast und von Spotify. Sei freundlich; Vermutungen sind willkommen, wenn
sie als solche erkennbar sind.

## Ohne Programmierkenntnisse

1. Auf der [Website](https://crorry-dev.github.io/GemischtesHack/) eine offene Folge
   suchen und anhören.
2. Vorhandene [Vorschläge](https://github.com/crorry-dev/GemischtesHack/issues)
   prüfen, um doppelte Arbeit zu vermeiden.
3. „Zitat vorschlagen“ öffnen, Folge und kurzen Wortlaut oder eine Beschreibung
   angeben. Bei Songs Titel, Interpret/in und möglichst Spotify-Link ergänzen.
4. Unter „Anmerkung“ die überprüfbare Fundstelle, etwa einen Zeitstempel, nennen.
   Unbekanntes leer lassen; keine vollständigen Liedtexte oder Aufnahmen hochladen.

Beginnt die Folge ohne Zitat, „Kein Zitat, nur Folgenanfang“ wählen. Neue Folgen
haben ein eigenes Formular. Freigaben werden wöchentlich gesammelt verarbeitet;
es braucht keine wiederholten Kommentare. Details im [README](README.md#freigaben-und-wochenlauf).

## Code und Daten

Kleine Aufgaben findest du unter
[good first issue](https://github.com/crorry-dev/GemischtesHack/labels/good%20first%20issue).
Bei größeren Ideen erst ein Issue eröffnen, damit wir Umfang und Datenbedarf
abstimmen können.

1. Repository über **Fork** in dein GitHub-Konto kopieren und lokal klonen.
2. Einen Branch für die Änderung anlegen, etwa `git switch -c statistik-verbessern`.
3. Änderungen klein und zusammenhängend halten. Keine Zugangsdaten einchecken.
4. Die folgenden Prüfungen ausführen und einen Pull Request nach `main` öffnen.
   Beschreibe die Änderung, den Test und bei Oberflächenänderungen einen Screenshot.

Voraussetzungen: Python 3.9+ und Node.js 22.7+ (für die JavaScript-Tests).
Es gibt keine externen Laufzeit- oder Testabhängigkeiten.

```sh
python3 -m unittest discover -s tests -q
node --test tests/statistics.test.mjs
python3 -m http.server 8000 --bind 127.0.0.1
```

Für die Vorschau `http://127.0.0.1:8000/site/` öffnen. Die CSV wird direkt aus
dem Repository geladen. Playlist-Link und offene Vorschläge werden erst beim
Veröffentlichen erzeugt und fehlen in einer frischen lokalen Vorschau.
Die Tests verwenden Kopien bzw. simulierte GitHub-Antworten und ändern keine
Produktivdaten oder Issues. Es sind keine Spotify-Secrets nötig.

- [data/zitate.csv](data/zitate.csv): UTF-8, Komma, eine Zeile pro Verwendung.
  Eine Folge kann mehrere Zitate haben; `verwendung_id` muss eindeutig bleiben.
- [scripts/](scripts/): Python-Standardbibliothek, gemeinsame Helfer in
  [sammlung.py](scripts/sammlung.py).
- [site/assets/](site/assets/): native JavaScript-Module und CSS, kein Build-System.
  Reine Statistikberechnung in [statistics.js](site/assets/statistics.js).
- [tests/](tests/): Sammelfreigaben, Wiederholbarkeit, Datenprüfung und
  Statistikberechnung einschließlich der echten CSV.

Codebeiträge stehen unter [MIT](LICENSE), Datenbeiträge unter [CC BY 4.0](LICENSE-DATA).
