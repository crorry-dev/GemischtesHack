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
Ignore-Regeln und Lizenzen. Playlist, Datensammlung, Website und Automatisierung
sind noch nicht implementiert; es gibt noch keinen veröffentlichten Playlist-
oder Website-Link.

### Was wir pro Verwendung erfassen wollen

Eine Zeile bzw. ein Datensatz entspricht einer Verwendung in einer Folge,
nicht einem Song. So gehen Wiederholungen nicht verloren.

| Feld | Zweck |
| --- | --- |
| Folgen-ID, Titel, Veröffentlichungsdatum | Folge eindeutig identifizieren; Datum im Format `YYYY-MM-DD` |
| Folgenlink und Zeitmarke | Fundstelle nachprüfen; Zeitmarke im Format `HH:MM:SS` |
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
JavaScript-Abhängigkeiten, Build-/Website-Ausgaben sowie Audio- und
Sprachmodelldateien aus der Versionsverwaltung. Daten in CSV/JSON, Quellcode,
Lockdateien und sichere `.env.example`-Vorlagen bleiben versionierbar.
Ignore-Regeln sind kein Sicherheitsschutz und wirken nicht auf bereits
versionierte Dateien: Vor jedem Commit den Diff auf sensible Inhalte prüfen.
