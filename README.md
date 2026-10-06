# GemischtesHack

**Von Hackis, für Hackis.** Ein unabhängiges Community-Projekt von Hörerinnen
und Hörern des Podcasts *Gemischtes Hack* für andere Hörerinnen und Hörer.
Keine offizielle Verbindung zum Podcast, zu Felix, Tommi oder Spotify.

## Hauptprojekt: Felix' Einstiegszitate und die Songs dahinter

Wir möchten die Songreferenzen hinter Felix' Zitaten am Anfang der Folgen
gemeinsam entdecken, nachvollziehbar erfassen und daraus eine Spotify-Playlist
zusammenstellen. Nicht jedes Zitat stammt aus einem Song: Ungeklärte Quellen
und andere Herkunft sollen ausdrücklich sichtbar bleiben.

Geplant sind:

- **Eine Spotify-Playlist** mit allen eindeutig zugeordneten, auf Spotify
  verfügbaren Songs. Jeder Track soll nur einmal enthalten sein; wiederholte
  Verwendungen bleiben in den Episodendaten erhalten.
- **Eine GitHub-Pages-Website** mit einer durchsuchbaren Übersicht pro Folge:
  welches Zitat, welcher Song, wann und in welchem Zusammenhang?
- **Auswertungen** zu wiederkehrenden Zitaten, Songs und Interpretinnen bzw.
  Interpreten, einschließlich Häufigkeiten und zeitlichem Verlauf.

**Aktueller Stand:** Dieses Repository enthält die Projektbeschreibung,
Ignore-Regeln, Lizenzen, eine [CSV für die Datensammlung](data/zitate.csv),
eine erste statische Website unter [`site/`](site/) und ein
[Skript](scripts/csv_befuellen.py), das die CSV automatisch befüllt. Bestätigte
Zuordnungen gibt es noch keine. Playlist und Veröffentlichung müssen noch
ergänzt bzw. eingerichtet werden.

### Was wir pro Verwendung erfassen wollen

Eine Zeile bzw. ein Datensatz entspricht einer Verwendung in einer Folge,
nicht einem Song. So gehen Wiederholungen nicht verloren.

| Feld | Zweck |
| --- | --- |
| Folgen-ID, Titel, Veröffentlichungsdatum, Länge | Folge eindeutig identifizieren; Datum im Format `YYYY-MM-DD`, Länge als `HH:MM:SS` |
| Folgenlink, Folgendatei und Zeitmarke | Fundstelle nachprüfen; Zeitmarke im Format `HH:MM:SS`; Verweis auf die Datei mit Beschreibung und Notizen zur Folge |
| Zitat-ID und Referenz | Wiederholungen desselben Zitats zusammenführen; bevorzugt Beschreibung und Fundstelle statt Songtext |
| Songtitel und Interpret/in | Vermutete oder bestätigte Zuordnung |
| Spotify-Track-URI bzw. Link | Exakte Aufnahme identifizieren, sofern verfügbar |
| Kontext | Wie Felix die Referenz verwendet, in eigenen Worten |
| Quellen und Prüfstatus | `offen`, `vermutet`, `bestätigt` oder `kein Song`; Belege für die Zuordnung |
| Beitrag und Namensnennung | Mitwirkende und ggf. abweichende Lizenz dokumentieren |

Unbekannte Angaben bleiben leer statt erfunden zu werden. Bestätigte
Songzuordnungen benötigen nachvollziehbare Belege. Unterschiedliche Aufnahmen
eines Songs werden nicht allein anhand des Titels zusammengelegt. Die Playlist
und Songstatistiken sollen nur bestätigte Zuordnungen berücksichtigen; offene
Fälle bleiben separat sichtbar. Häufigkeiten zählen Verwendungen, nicht
Playlist-Einträge.

### Daten eintragen und als Playlist-Grundlage nutzen

Die gemeinsame Datendatei ist [`data/zitate.csv`](data/zitate.csv). Sie lässt
sich in einem Texteditor oder Tabellenprogrammen wie LibreOffice Calc und Excel
bearbeiten. Beim Import und Export **UTF-8**, **Komma als Trennzeichen** und
**doppelte Anführungszeichen als Textbegrenzung** verwenden. Die Kopfzeile
unverändert lassen; Felder mit Kommas, Anführungszeichen oder Zeilenumbrüchen
müssen korrekt als CSV maskiert werden. In Tabellenprogrammen die Spalten als
Text importieren, damit IDs, Datumsangaben und Zeitmarken unverändert bleiben.

Jede weitere Zeile beschreibt genau eine Verwendung. Es werden keine erfundenen
Folgen, Zitate oder Spotify-Tracks eingetragen; automatisch erkannte Angaben
stehen auf `offen` oder `vermutet`, bis jemand sie geprüft hat.

| CSV-Spalten | Eintragung |
| --- | --- |
| `verwendung_id` | Eindeutige, dauerhaft beibehaltene ID für diese Verwendung |
| `folge_id`, `folge_titel`, `veroeffentlicht_am`, `dauer` | Stabile Folgen-ID, Titel, Datum (`YYYY-MM-DD`) und Länge (`HH:MM:SS`) |
| `folge_url`, `folge_datei`, `zeitmarke` | Link zur Folge, Pfad der Folgendatei (z. B. `folgen/270.md`) und Fundstelle (`HH:MM:SS`) |
| `zitat_id`, `zitat_referenz` | Stabile Zitat-ID; bei Wiederholungen dieselbe ID nutzen. Referenz bevorzugt als Beschreibung in eigenen Worten, nicht als Songtext |
| `songtitel`, `interpret` | Zugeordneter oder vermuteter Song und Interpret/in |
| `spotify_track_uri` | Exakte Aufnahme als `spotify:track:<Track-ID>`; bei fehlender Spotify-Verfügbarkeit leer lassen |
| `kontext`, `quellen` | Kontext in eigenen Worten und überprüfbare Beleg-URLs; mehrere Quellen mit ` \| ` trennen |
| `pruefstatus` | Genau einer der Werte `offen`, `vermutet`, `bestätigt`, `kein Song` |
| `beitrag_von`, `namensnennung`, `lizenz` | Gewünschter öffentlicher Beitragsname, Namensnennung für die Weiterverwendung und ggf. abweichende Lizenz |

Für neue Einträge zunächst `offen` verwenden und unbekannte Angaben leer
lassen. IDs selbst vergeben und später nicht umnummerieren; die `verwendung_id`
darf nicht doppelt vorkommen. Ein Zitat in einer weiteren Folge erhält eine
neue `verwendung_id`, behält aber seine `zitat_id`. Für `bestätigt` müssen
Songtitel, Interpret/in und nachvollziehbare Quellen eingetragen sein. Die
Hinweise zu fremden Inhalten und Lizenzen gelten auch für die CSV; ohne
abweichende Lizenzangabe gelten für eigene Daten die unten genannten Bedingungen.

Aus dieser Datei kann später eine Playlist manuell oder per optionaler
Synchronisierung erstellt werden:

1. Nur Zeilen mit `pruefstatus` gleich `bestätigt` berücksichtigen.
2. Zeilen ohne gültige Spotify-Track-URI separat als fehlende Tracks aufführen,
   nicht anhand des Songtitels automatisch eine Aufnahme auswählen.
3. Identische Spotify-Track-URIs nur einmal in die Playlist übernehmen.
   Unterschiedliche Aufnahmen bleiben getrennt.
4. Alle Verwendungen in der CSV behalten, auch wenn ein Track bereits in der
   Playlist enthalten ist oder nicht auf Spotify verfügbar ist.

Die CSV ist eine Datenquelle, kein direkter Spotify-Import: Sie erstellt oder
aktualisiert selbst noch keine Playlist und benötigt keine Zugangsdaten.

### Einstiegszitate aus Audiodateien

[`scripts/csv_befuellen.py`](scripts/csv_befuellen.py) hilft beim Erfassen
der Einstiegszitate. Nötig sind Python ab Version 3.9 und für die
Spracherkennung `faster-whisper` (`pip install faster-whisper`, am besten in
einer `.venv`).

```sh
python3 scripts/csv_befuellen.py zitate ORDNER
```

Das Skript transkribiert den Anfang eigener Audiodateien lokal mit Whisper und
zerlegt ihn in Zitat, Ansage („Das, meine Damen und Herren, war …“) und
Begrüßung. Eingetragen werden Zitat, Zeitmarke und, wenn die Folge einen Link
hat, der Link mit Zeitmarke als Beleg. Nennt Felix Song und Interpret, landen
beide mit Status `vermutet` in der CSV, sonst bleibt der Status `offen`. Die
Folgennummer muss im Dateinamen stehen, z. B. `079.mp3` oder
`#79 WIR ROCKEN DAS.m4a`; ergänzt werden nur Folgen, die schon eine Zeile in
der CSV haben.

Mit `--folgen 300-364` lassen sich einzelne Folgen auswählen, mit
`--probelauf` wird nichts gespeichert. Das Skript füllt nur leere Felder und
überspringt Folgen, für die schon ein Zitat eingetragen ist; Zwischenergebnisse
liegen in `.cache/`. Die Erkennung ist eine Vorarbeit: Transkripte enthalten
Hörfehler, gerade bei Namen und Songtiteln, deshalb vor `bestätigt` die Stelle
selbst nachhören. Gespeichert wird immer im oben beschriebenen Format (Komma,
Datum als `YYYY-MM-DD`); Dateien, die Excel mit Semikolon und Datum als
`TT.MM.JJJJ` gespeichert hat, liest das Skript ebenfalls.

### Folgendateien

Zu jeder Folge kann es eine Datei `data/folgen/<nr>.md` geben, etwa für eine
kurze Beschreibung oder Notizen. In der CSV verweist `folge_datei` darauf
(z. B. `folgen/270.md`); die Website zeigt den Abschnitt `## Beschreibung` in
der Detailansicht an.

```markdown
---
folge: 270
titel: "DEUTSCHE KENNEDY"
---

# #270 DEUTSCHE KENNEDY

## Beschreibung

Worum es in der Folge geht, in eigenen Worten.
```

### GitHub Pages

Die Website unter [`site/`](site/) ist statisch, fürs Handy gebaut und kommt
ohne Build-Schritt, Bibliotheken oder externe Schriften aus. Oben stehen der
Fortschritt und eine Suche mit Status-Tabs, weitere Filter (Jahr,
Interpret/in, Sortierung) liegen in einem eigenen Panel. Darunter folgen ein
Überblick mit Kennzahlen und einem Zeitstrahl aller Folgen, auf Wunsch weitere
Statistiken, und die nach Jahren gruppierte Folgenliste. Jede Folge öffnet
eine Detailansicht mit Zitat, Belegen, Beschreibung aus der Folgendatei und
einem Link, um Ergänzungen als Issue vorzuschlagen. Filter und geöffnete
Folge stehen in der Adresse, sodass sich jede Ansicht teilen lässt. Der
eingebettete Spotify-Player lädt erst nach einem Klick.

Lokal lässt sich die Seite aus dem Repository-Verzeichnis mit
`python3 -m http.server 8000` starten und unter
`http://localhost:8000/site/` ansehen; sie liest dann direkt aus `data/`.
Beim Push auf `main` kopiert der Workflow
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) den Ordner
`data/` in das Website-Artefakt und veröffentlicht es über GitHub Pages. Änderungen an Daten oder Website lösen die Veröffentlichung aus;
alternativ lässt sich der Workflow manuell starten. In den
Repository-Einstellungen muss Pages als Quelle **GitHub Actions** verwenden.

### Erste Meilensteine

1. Gemeinsam ein Datenformat festlegen und einige Folgen manuell mit Quellen
   erfassen und prüfen.
2. Eine gemeinsame Spotify-Playlist aus bestätigten Zuordnungen erstellen;
   fehlende Tracks und Dubletten transparent behandeln.
3. Die Übersicht und Auswertungen als statische Website auf GitHub Pages
   veröffentlichen.
4. Erst danach eine optionale Spotify-Synchronisierung entwickeln. Zugangsdaten
   bleiben lokal oder in GitHub Secrets, niemals im Repository oder im
   öffentlich ausgelieferten Website-Code. Dabei die aktuellen
   Spotify-Nutzungsbedingungen und API-Vorgaben beachten.

## Weitere Ideen aus dem Podcast

Das Repository soll auch Platz für andere Community-Projekte bieten:

- **Filmübersetzungen:** Zu einem Film sichtbar machen, wer die Übersetzung
  angefertigt hat. Synchronübersetzung/Dialogbuch und Untertitelübersetzung
  getrennt erfassen, jeweils mit Sprache, Fassung, Quelle und verifizierten
  Credits. Fehlende Angaben als unbekannt kennzeichnen.
- **Neue Community-Ideen:** Vorschläge über GitHub Issues sammeln. Beschreibt
  die Idee, die Folge mit Zeitmarke, den Nutzen für Hörende, mögliche Quellen
  und einen kleinen ersten Umsetzungsschritt. Vor größeren Änderungen
  gemeinsam Umfang und Datenrechte klären.
- **Text-to-Speech als spätere Idee:** Eine Nachbildung der Stimmen von Felix
  und Tommi kommt nur mit ihrer vorherigen ausdrücklichen, dokumentierten
  Zustimmung und geklärten Rechten an Aufnahmen, Training und Nutzung infrage.
  Ohne diese Freigaben werden keine Stimmen geklont und keine entsprechenden
  Trainingsdaten oder Modelle bereitgestellt. Als Alternative können eigene
  oder passend lizenzierte, nicht imitierende synthetische Stimmen dienen.
  Synthetische Ausgaben müssen klar als solche gekennzeichnet sein und dürfen
  nicht als echte Podcast-Aussagen ausgegeben werden.

## Mitmachen

Songhinweise, Quellenkorrekturen, Datenpflege, Gestaltung, Code und neue Ideen
sind willkommen. Nutzt Issues für Vorschläge und ungeklärte Zuordnungen oder
Pull Requests für konkrete Änderungen. Kleine, überprüfbare Beiträge mit
Fundstelle erleichtern die gemeinsame Prüfung.

Bitte respektvoll miteinander umgehen und nur eigene oder entsprechend
freigegebene Inhalte beitragen. Keine vollständigen Songtexte, Podcast-Audios,
ungeklärten Transkripte oder personenbezogenen Daten veröffentlichen. Wo ein
kurzes Zitat wirklich nötig ist, müssen dessen Nutzung rechtlich zulässig und
Quelle sowie Umfang angemessen sein; die Repository-Lizenz ersetzt diese
Prüfung nicht.

## Lizenzen und lokale Dateien

- **Eigener Code:** [MIT-Lizenz](LICENSE).
- **Eigene Dokumentation und Datensammlungen:**
  [CC BY 4.0](LICENSE-DATA), soweit daran Rechte bestehen. Bei Weiterverwendung
  Urheber nennen, auf die Lizenz verweisen und Änderungen kennzeichnen.
- **Fremde Inhalte und Stimmen:** Nicht von diesen Lizenzen umfasst. Rechte am
  Podcast, an Musik, Zitaten, Marken und Stimmen bleiben unberührt.

Die [`.gitignore`](.gitignore) hält lokale Zugangsdaten, typische Python- und
JavaScript-Abhängigkeiten, Build-/Website-Ausgaben, den Zwischenspeicher in
`.cache/` sowie Audio- und Sprachmodelldateien aus der Versionsverwaltung.
Daten in CSV/JSON, Quellcode, Lockdateien und sichere `.env.example`-Vorlagen
bleiben versionierbar.
Ignore-Regeln sind kein Sicherheitsschutz und wirken nicht auf bereits
versionierte Dateien: Vor jedem Commit den Diff auf sensible Inhalte prüfen.
