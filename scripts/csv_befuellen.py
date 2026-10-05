#!/usr/bin/env python3
"""Füllt data/zitate.csv automatisch auf.

  folgen  Nummer, Titel, Datum und Link aller Folgen über die Spotify-API
  zitate  Einstiegszitat, Zeitmarke und – wenn Felix sie ansagt – Song und
          Interpret, per Whisper aus eigenen Audiodateien

Beispiele:
  python3 scripts/csv_befuellen.py folgen
  python3 scripts/csv_befuellen.py zitate ~/hack-audio
  python3 scripts/csv_befuellen.py zitate ~/hack-audio --folgen 300-364 --probelauf

Titel, Datum und Link übernimmt "folgen" immer von Spotify. Alle anderen
Felder werden nur gefüllt, wenn sie noch leer sind.
"""
from __future__ import annotations

import argparse
import base64
import csv
import functools
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT / "data" / "zitate.csv"
CACHE_DIR = ROOT / ".cache" / "intros"

SHOW_ID = "7BTOsF2boKmlYr76BelijW"
USER_AGENT = "GemischtesHack-Community (+https://github.com/crorry-dev/GemischtesHack)"

COLUMNS = [
    "verwendung_id", "folge_id", "folge_titel", "veroeffentlicht_am", "folge_url", "zeitmarke",
    "zitat_id", "zitat_referenz", "songtitel", "interpret", "spotify_track_uri", "kontext",
    "quellen", "pruefstatus", "beitrag_von", "namensnennung", "lizenz",
]
COLUMN_ALIASES = {"zitat": "zitat_referenz"}
EPISODE_COLUMNS = ["folge_id", "folge_titel", "veroeffentlicht_am", "dauer_sekunden", "folge_url"]
AUDIO_SUFFIXES = {".mp3", ".m4a", ".mp4", ".aac", ".wav", ".flac", ".ogg", ".opus", ".webm"}


# --- CSV ---------------------------------------------------------------------

def read_csv(path: Path) -> tuple[list[dict], list[str]]:
    if not path.exists():
        return [], []
    text = path.read_text(encoding="utf-8-sig")
    header_line = text.partition("\n")[0]
    # Excel speichert mit deutschen Ländereinstellungen gerne mit Semikolon
    delimiter = ";" if header_line.count(";") > header_line.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    header = [COLUMN_ALIASES.get(name.strip(), name.strip()) for name in next(reader, [])]

    rows = []
    for line, values in enumerate(reader, start=2):
        if not any(value.strip() for value in values):
            continue
        row = dict.fromkeys(COLUMNS, "")
        for index, value in enumerate(values):
            name = header[index] if index < len(header) else ""
            if name:
                row[name] = value.strip()
            elif value.strip():
                sys.exit(f"{path.name}, Zeile {line}: Spalte {index + 1} hat keine Überschrift, enthält aber Daten.")
        row["veroeffentlicht_am"] = iso_date(row["veroeffentlicht_am"])
        episode = row["folge_id"].lstrip("#").strip()
        if episode.isdigit():
            row["folge_id"] = str(int(episode))
        rows.append(row)
    extra = [name for name in header if name and name not in COLUMNS]
    return rows, extra


def write_csv(path: Path, rows: list[dict], extra: list[str]) -> None:
    assign_ids(rows)
    rows.sort(key=lambda row: (0, int(row["folge_id"])) if row["folge_id"].isdigit() else (1, 0))
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS + extra, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def assign_ids(rows: list[dict]) -> None:
    taken = {row["verwendung_id"] for row in rows if row["verwendung_id"]}
    for row in rows:
        if row["verwendung_id"] or not row["folge_id"].isdigit():
            continue
        number = 1
        while f"{int(row['folge_id']):03d}-{number}" in taken:
            number += 1
        row["verwendung_id"] = f"{int(row['folge_id']):03d}-{number}"
        taken.add(row["verwendung_id"])


def iso_date(value: str) -> str:
    match = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", value)
    return f"{match[3]}-{int(match[2]):02d}-{int(match[1]):02d}" if match else value


def save(args: argparse.Namespace, rows: list[dict], extra: list[str]) -> None:
    if args.probelauf:
        print("Probelauf: CSV nicht gespeichert.")
    else:
        write_csv(args.csv, rows, extra)
        print(f"Gespeichert: {args.csv}")


# --- Netzwerk ----------------------------------------------------------------

def fetch(url: str, headers: dict | None = None, data: bytes | None = None, attempts: int = 4) -> bytes:
    request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})})
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == attempts:
                raise
            retry_after = error.headers.get("Retry-After", "")
            wait = int(retry_after) if retry_after.isdigit() else 30
            print(f"  zu viele Anfragen, warte {wait} s …", flush=True)
            time.sleep(wait)


def load_env() -> None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and not key.strip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


# --- Folgen von Spotify --------------------------------------------------------

def spotify_episodes(market: str) -> list[dict]:
    load_env()
    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        sys.exit("SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET fehlen, siehe .env.example.")

    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    try:
        token = json.loads(fetch(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {credentials}"},
            data=b"grant_type=client_credentials",
        ))["access_token"]
        url = f"https://api.spotify.com/v1/shows/{SHOW_ID}/episodes?market={market}&limit=50"
        episodes = []
        while url:
            page = json.loads(fetch(url, headers={"Authorization": f"Bearer {token}"}))
            episodes += [item for item in page["items"] if item]
            url = page["next"]
    except urllib.error.HTTPError as error:
        message = error.read().decode(errors="replace")[:300]
        if error.code == 403:
            message += "\nApps im Development Mode funktionieren nur, wenn der Inhaber Spotify Premium hat."
        sys.exit(f"Spotify-Anfrage fehlgeschlagen ({error.code}): {message}")
    return episodes


def split_name(name: str) -> tuple[int | None, str]:
    name = " ".join(name.split())
    match = re.match(r"#\s*(\d+)\s+(.+)", name)
    return (int(match[1]), match[2]) if match else (None, name)


def update_episodes(args: argparse.Namespace) -> None:
    rows, extra = read_csv(args.csv)
    by_episode = defaultdict(list)
    for row in rows:
        by_episode[row["folge_id"]].append(row)

    episodes = spotify_episodes(args.markt)
    added = changed = skipped = 0
    for episode in episodes:
        number, title = split_name(episode["name"])
        if number is None:
            skipped += 1
            continue
        values = {
            "folge_titel": title,
            "veroeffentlicht_am": episode["release_date"],
            "folge_url": episode["external_urls"]["spotify"],
        }
        matches = by_episode[str(number)]
        if not matches:
            row = dict.fromkeys(COLUMNS, "")
            row.update(folge_id=str(number), pruefstatus="offen")
            rows.append(row)
            matches.append(row)
            added += 1
        elif any(row[key] != value for row in matches for key, value in values.items()):
            changed += 1
        for row in matches:
            row.update(values)
            row["pruefstatus"] = row["pruefstatus"] or "offen"

    print(f"{len(episodes)} Folgen bei Spotify: {added} neu, {changed} aktualisiert, "
          f"{skipped} ohne Folgennummer übersprungen.")
    save(args, rows, extra)
    if not args.probelauf:
        episode_file = args.csv.with_name("folgen.csv")
        write_episode_list(episode_file, episodes)
        print(f"Gespeichert: {episode_file}")


def write_episode_list(path: Path, episodes: list[dict]) -> None:
    # Eine Zeile pro Folge, für Zeitstrahl und Längen auf der Website
    by_number = {}
    for episode in episodes:
        number, title = split_name(episode["name"])
        if number is not None and number not in by_number:
            by_number[number] = {
                "folge_id": str(number),
                "folge_titel": title,
                "veroeffentlicht_am": episode["release_date"],
                "dauer_sekunden": str(round((episode.get("duration_ms") or 0) / 1000)),
                "folge_url": episode["external_urls"]["spotify"],
            }
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=EPISODE_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(by_number[number] for number in sorted(by_number))


# --- Einstiegszitate -----------------------------------------------------------
#
# Fast jede Folge beginnt gleich: Zitat, dann eine Ansage ("Das, meine Damen
# und Herren, war ...") und danach "Und damit herzlich willkommen ...".
# Daran wird der Anfang zerlegt.

AD = re.compile(r"präsentiert von|wird euch präsentiert|gemischtes hack wünscht|mit dem code\b|rabattcode|gutscheincode", re.I)
FORMAL_CREDIT = re.compile(r"(?:\b(?:leute|so|ja|okay)\s*,\s*)?(?:\bdas\b[^.!?]{0,25}?)?\bmeine damen und herren\b", re.I)
CREDIT = re.compile(
    r"(?:\bleute\s*,\s*)?\b(?:das|dies)\s+(?:war|ist aus)\b|\bdas\s*,\s*[^,.!?]{1,30},\s*war\b"
    r"|\bmit diese[mn]\b[^.!?]{0,40}\bzitat",
    re.I,
)
GREETING = re.compile(
    r"(?P<strong>\b(?:und\s+)?damit\s+(?:\w+\s+){0,3}?(?:herzlich\s+willkommen|willkommen|frohe|grüße)\b"
    r"|(?:gemischtes hack\s*,\s*)?der einflussreichste podcast)"
    r"|herzlich willkommen|willkommen (?:zu|bei)\b|schönen guten (?:morgen|tag|abend)"
    r"|mein name ist felix|felix lobrecht mein name",
    re.I,
)
NO_QUOTE = re.compile(r"\bkein(?:en)?\s+(?:rap[- ]?)?zitat", re.I)
SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ])")

KEYWORD = r"(?:[\w-]+-)?(?:ultra)?(?:track|song|lied|titel|klassiker|brett|banger|brecher)\s+(?:namens\s+)?"
DETERMINER = r"(?:(?:seinem|ihrem|dem|einem|der|den)\s+)?(?:\S+\s+){0,3}?"
SONG_PATTERNS = [
    # "war Haftbefehl mit dem Track Ich zahle gar nix", "Zitat von Ali Bumaye aus seinem Song Kimbo Slice"
    re.compile(
        rf"\b(?:war(?:en)?|zitat\s+von)\s+(?P<artist>.+?)\s+(?:mit|auf|aus|von|in|im)\s+{DETERMINER}"
        rf"(?:{KEYWORD}|(?:intro|outro)\s+(?:von|aus)\s+)(?P<title>[^,.!?]+)",
        re.I,
    ),
    # "Zitat aus dem Deutschrap-Klassiker Badewiese von Bushido", "ist aus dem Song 2002 von Sido"
    re.compile(rf"\b(?:war|ist|zitat)\s+aus\s+{DETERMINER}{KEYWORD}(?P<title>[^,.!?]+?)\s+von\s+(?P<artist>[^,.!?]+)", re.I),
    # "war Tequila von The Champs"
    re.compile(r"\bwar\s+(?P<title>[A-ZÄÖÜ0-9][^,.!?]*?)\s+von\s+(?P<artist>[A-ZÄÖÜ0-9][^,.!?]*)"),
    # "war K.I.Z. mit Unterfickt und geistig behindert", "war Shindy aus Mandarinen"
    re.compile(r"\bwar(?:en)?\s+(?P<artist>.+?)\s+(?:mit|aus)\s+(?P<title>[A-ZÄÖÜ0-9][^,.!?]*)"),
]
LEADING_LOWERCASE = re.compile(r"^(?:[a-zäöüß][\w'-]*\s+)+")
ARTIST_TAIL = re.compile(r"\s+(?:aus|auf|von|vom|im|in|mit)\s+.*$", re.I)
TITLE_TAIL = re.compile(r"\s+und\s+(?:den|das|die|diese[mns]?|ihn)\s+(?:\S+\s+)?widme.*$", re.I)
NOT_A_TITLE = re.compile(r"track|album|mixtape|\b(?:song|lied|titel|brett|banger)\b", re.I)
DESCRIPTIVE = re.compile(r"\b(?:seine[mnrs]?|ihre[mnrs]?|meine[mnrs]?|einem|einer|eines)\b")


@dataclass
class Intro:
    start: int
    quote: str
    credit: str = ""
    artist: str = ""
    title: str = ""
    ad: bool = False


def parse_intro(segments: list[tuple[int, str]]) -> Intro | None:
    segments = [(start, " ".join(text.split())) for start, text in segments if start <= 150]
    segments = [(start, text) for start, text in segments if text]
    if not segments:
        return None
    offsets, position = [], 0
    for _, text in segments:
        offsets.append(position)
        position += len(text) + 1
    full = " ".join(text for _, text in segments)
    limit = next((offsets[i] for i, (start, _) in enumerate(segments) if start > 90), len(full))

    greeting = GREETING.search(full, 0, limit)
    end = greeting.start() if greeting else limit
    credit = FORMAL_CREDIT.search(full, 0, end) or CREDIT.search(full, 0, end)
    if credit:
        cut = credit.start()
    elif greeting and greeting.group("strong"):
        cut = greeting.start()
    else:
        return None

    # Bei Werbung am Anfang nur das letzte Stück vor der Ansage nehmen
    first = 0
    ads = [i for i, (_, text) in enumerate(segments) if offsets[i] < cut and AD.search(text)]
    if ads:
        first = max(ads[-1] + 1, bisect_right(offsets, cut - 1) - 1)
    quote = full[offsets[first]:cut].strip(" ,;:-–")
    if len(quote.split()) > 80 or NO_QUOTE.search(quote):
        return None
    # Mit Ansage reicht auch ein einzelnes Wort ("Tequila."); wurde das Zitat
    # als Musik eingespielt, fehlt es im Transkript und nur die Ansage bleibt
    if len(quote.split()) < (1 if credit else 3):
        quote = ""

    intro = Intro(start=segments[first][0], quote=quote, ad=bool(ads))
    if credit:
        stop = greeting.start() if greeting else min(len(full), cut + 200)
        intro.credit = full[cut:stop].strip()
        intro.artist, intro.title = find_song(SENTENCE_END.split(intro.credit, 1)[0])
    return intro if intro.quote or intro.title else None


def find_song(sentence: str) -> tuple[str, str]:
    def capitalized(text: str) -> bool:
        return text[:1].isupper() or text[:1].isdigit()

    for pattern in SONG_PATTERNS:
        match = pattern.search(sentence)
        if not match:
            continue
        # "überraschenderweise Fler", "der verstorbene XXXTentacion"
        artist = ARTIST_TAIL.sub("", LEADING_LOWERCASE.sub("", match["artist"].strip()))
        title = TITLE_TAIL.sub("", match["title"].strip())
        if (capitalized(artist) and capitalized(title) and not NOT_A_TITLE.search(match["artist"])
                and len(artist.split()) <= 6 and "," not in artist and len(title.split()) <= 7
                and not NOT_A_TITLE.search(title) and not DESCRIPTIVE.search(title)):
            return artist, title
    return "", ""


def read_cache(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_cache(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


@functools.lru_cache(maxsize=None)
def whisper_model(name: str):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("Für zitate wird faster-whisper gebraucht: pip install faster-whisper")
    print(f"Lade Whisper-Modell {name} …", flush=True)
    return WhisperModel(name, compute_type="int8")


def whisper_intro(number: int, path: Path, model_name: str, seconds: int) -> dict:
    cache = CACHE_DIR / f"whisper-{model_name}" / f"{number}.json"
    data = read_cache(cache)
    if data is not None:
        return data
    model = whisper_model(model_name)
    from faster_whisper import decode_audio

    audio = decode_audio(str(path))[: seconds * 16000]
    result, _ = model.transcribe(audio, language="de", vad_filter=True, condition_on_previous_text=False)
    data = {"segments": [[int(segment.start), segment.text.strip()] for segment in result]}
    write_cache(cache, data)
    return data


def find_audio(folder: Path) -> dict[int, Path]:
    folder = folder.expanduser()
    if not folder.is_dir():
        sys.exit(f"Ordner nicht gefunden: {folder}")
    files = {}
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() not in AUDIO_SUFFIXES:
            continue
        match = re.search(r"#\s*(\d+)", path.stem) or re.search(r"(?<!\d)(\d{1,3})(?!\d)", path.stem)
        if match:
            files.setdefault(int(match[1]), path)
    if not files:
        sys.exit(f"In {folder} liegen keine Audiodateien mit Folgennummer im Namen.")
    return files


def fill_row(row: dict, intro: Intro) -> None:
    row["zitat_referenz"] = intro.quote
    if not row["zeitmarke"]:
        row["zeitmarke"] = time.strftime("%H:%M:%S", time.gmtime(intro.start))
    if intro.title and not row["songtitel"] and not row["interpret"]:
        row["songtitel"], row["interpret"] = intro.title, intro.artist
        if row["pruefstatus"] in ("", "offen"):
            row["pruefstatus"] = "vermutet"
    row["pruefstatus"] = row["pruefstatus"] or "offen"

    if row["folge_url"].startswith("https://open.spotify.com/episode/"):
        link = f"{row['folge_url'].split('?')[0]}?t={intro.start}"
        sources = [source for source in row["quellen"].split(" | ") if source]
        row["quellen"] = " | ".join(sources if link in sources else sources + [link])


def update_quotes(args: argparse.Namespace) -> None:
    rows, extra = read_csv(args.csv)
    audio = find_audio(args.ordner)
    episodes = defaultdict(list)
    for row in rows:
        if row["folge_id"].isdigit():
            episodes[int(row["folge_id"])].append(row)

    todo = [
        number for number, matches in sorted(episodes.items())
        if number in audio
        and (args.folgen is None or number in args.folgen)
        and not any(row["zitat_referenz"] for row in matches)
    ]
    print(f"{len(todo)} Folgen ohne Zitat mit passender Audiodatei werden geprüft.")

    found = guessed = 0
    try:
        for number in todo:
            data = whisper_intro(number, audio[number], args.modell, args.sekunden)
            intro = parse_intro(data["segments"])
            if intro is None:
                print(f"#{number:<4} nicht erkannt", flush=True)
                continue

            row = episodes[number][0]
            fill_row(row, intro)
            found += bool(intro.quote)
            if intro.title:
                guessed += 1
                result = f"{intro.artist} – {intro.title}"
            else:
                credit = intro.credit[:100] + ("…" if len(intro.credit) > 100 else "")
                result = f"Herkunft offen: {credit}" if credit else "Herkunft offen"
            if not intro.quote:
                result += "  (Zitat selbst nicht im Transkript)"
            if intro.ad:
                result += "  (Werbung am Anfang, Zitat prüfen)"
            print(f"#{number:<4} {row['zeitmarke']}  {result}", flush=True)
    except KeyboardInterrupt:
        print("\nAbgebrochen, bisherige Ergebnisse werden übernommen.")
    except OSError as error:
        print(f"Abbruch ({error}), bisherige Ergebnisse werden übernommen.")

    print(f"{found} Zitate erkannt, davon {guessed} mit Song-Vermutung.")
    save(args, rows, extra)


# --- Aufruf --------------------------------------------------------------------

def episode_numbers(spec: str) -> set[int]:
    numbers = set()
    try:
        for part in spec.split(","):
            first, _, last = part.strip().partition("-")
            numbers.update(range(int(first), int(last or first) + 1))
    except ValueError:
        raise argparse.ArgumentTypeError(f"ungültige Folgenangabe: {spec}") from None
    return numbers


def main() -> None:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--csv", type=Path, default=CSV_FILE, help="CSV-Datei (Standard: data/zitate.csv)")
    common.add_argument("--probelauf", action="store_true", help="nur anzeigen, nichts speichern")

    parser = argparse.ArgumentParser(description="Füllt data/zitate.csv automatisch auf.")
    commands = parser.add_subparsers(dest="command", required=True)

    episodes = commands.add_parser("folgen", parents=[common], help="Folgen über die Spotify-API eintragen")
    episodes.add_argument("--markt", default="DE", help="Spotify-Markt (Standard: DE)")
    episodes.set_defaults(run=update_episodes)

    quotes = commands.add_parser("zitate", parents=[common], help="Einstiegszitate aus Audiodateien erkennen")
    quotes.add_argument("ordner", type=Path, help="Ordner mit Audiodateien, Folgennummer im Dateinamen")
    quotes.add_argument("--folgen", type=episode_numbers, help="nur bestimmte Folgen, z. B. 300-364 oder 12,15")
    quotes.add_argument("--modell", default="large-v3-turbo", help="Whisper-Modell (Standard: large-v3-turbo)")
    quotes.add_argument("--sekunden", type=int, default=120, help="so viele Sekunden vom Anfang transkribieren")
    quotes.set_defaults(run=update_quotes)

    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
