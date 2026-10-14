# Mitmachen

Danke! Das Projekt lebt von nachprüfbaren Beiträgen von Hackis. Es ist unabhängig
vom Podcast und von Spotify. Sei freundlich; Vermutungen sind willkommen, wenn
sie als solche erkennbar sind.

## Ohne Programmierkenntnisse

1. Auf der [Website](https://crorry-dev.github.io/GemischtesHack/) eine offene Folge
   suchen und anhören.
2. Vorhandene [Discussions](https://github.com/crorry-dev/GemischtesHack/discussions)
   prüfen, um doppelte Arbeit zu vermeiden.
3. „Zitat vorschlagen“ öffnen, Folge und kurzen Wortlaut oder eine Beschreibung
   angeben. Bei Songs Titel, Interpret/in und möglichst Spotify-Link ergänzen.
4. Unter „Anmerkung“ die überprüfbare Fundstelle, etwa einen Zeitstempel, nennen.
   Unbekanntes leer lassen; keine vollständigen Liedtexte oder Aufnahmen hochladen.

Beginnt die Folge ohne Zitat, „Kein Zitat, nur Folgenanfang“ wählen. Neue Folgen
haben ein eigenes Formular. Freigaben werden wöchentlich gesammelt verarbeitet;
es braucht keine wiederholten Kommentare. Details im [README](README.md#freigaben-und-wochenlauf).

### Gemeinsam prüfen und kuratieren

- **Q&A:** Einstiegszitate und Quellen gemeinsam zuordnen.
- **General:** neue Folgen oder Korrekturen an Folgendaten eintragen.
- **Ideas:** Wünsche und größere Ideen besprechen.
- **Issues:** konkrete Bugs und umsetzbare Entwicklungsaufgaben.

Zu einer bestehenden Discussion ergänzen alle ihre Belege als Kommentare.
Ein alternativer Datenvorschlag muss als Hauptkommentar den **vollständigen
Formulartext mit denselben `###`-Überschriften** enthalten. Einzelne Gesprächsantworten
werden nicht als Daten importiert. Eine Kurator:in kann diesen Kommentar mit
`/approve KOMMENTAR-LINK` freigeben; `/approve` allein meint den Startbeitrag.
Beide Befehle gehören in einen Hauptkommentar, nicht in eine verschachtelte Antwort.
Eine markierte Antwort oder viele Zustimmungen ersetzen keine Freigabe.

Du möchtest regelmäßig Quellen prüfen? Melde dich in
[Ideas](https://github.com/crorry-dev/GemischtesHack/discussions/categories/ideas).
Nach Absprache ergänzen Maintainer deinen GitHub-Namen in
[kuratoren.json](.github/kuratoren.json). Dafür ist kein Schreibzugriff auf Code nötig.
Prüfe den Beleg und kennzeichne Unsicherheiten mit `/approve unsure`.
Beim nächsten Wochenlauf übernimmt der Bot die freigegebenen Daten.

## Code und Daten

Kleine Aufgaben findest du unter
[good first issue](https://github.com/crorry-dev/GemischtesHack/labels/good%20first%20issue).
Bei größeren Ideen erst eine Discussion in Ideas eröffnen, damit wir Umfang und Datenbedarf
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
- [Discussion-Formulare](.github/DISCUSSION_TEMPLATE/): Dateinamen müssen den
  Kategorie-Slugs entsprechen. Die Feldüberschriften werden auch vom Import gelesen.
  [discussions.py](scripts/discussions.py) liest alle offenen Daten-Discussions und
  ihre Hauptkommentare über die GitHub-GraphQL-API, einschließlich Folgeseiten.
- [site/assets/](site/assets/): native JavaScript-Module und CSS, kein Build-System.
  Reine Statistikberechnung in [statistics.js](site/assets/statistics.js).
- [tests/](tests/): Sammelfreigaben, Wiederholbarkeit, Datenprüfung und
  Statistikberechnung einschließlich der echten CSV.

Codebeiträge stehen unter [MIT](LICENSE), Datenbeiträge unter [CC BY 4.0](LICENSE-DATA).
