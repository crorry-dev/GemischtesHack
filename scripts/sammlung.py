"""Gemeinsame Helfer für data/zitate.csv, genutzt von uebernehmen.py und playlist.py."""

import csv
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "zitate.csv"
FORMS_PATH = ROOT / ".github" / "ISSUE_TEMPLATE"


def read_rows(path=CSV_PATH):
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        return list(reader.fieldnames or []), list(reader)


def write_rows(fields, rows, path=CSV_PATH):
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


FEATURE = re.compile(r"\s*\(?\s*\b(?:feat\.?|ft\.?|featuring)\s+", re.IGNORECASE)


def upper_title(text):
    """Folgentitel stehen bei Gemischtes Hack immer in Großbuchstaben; „ß“ bleibt dabei „ß“."""
    return "".join(char if char in "ßẞ" else char.upper() for char in text or "")


def main_artist(text):
    """„B-Tight feat. Sido & Gauner“ → „B-Tight“: die Hauptinterpret:in vor den Features."""
    return FEATURE.split(text or "", maxsplit=1)[0].strip()


def episode_number(value):
    """„#007“ oder „7“ → 7, alles andere → None."""
    match = re.fullmatch(r"#?\s*(\d+)", (value or "").strip())
    return int(match.group(1)) if match else None


def origin_key(value):
    """Art der Herkunft: "" (unbekannt), song, film, serie, person, sonstiges oder anfang (kein Zitat)."""
    text = (value or "").strip().lower()
    if not text:
        return ""
    if text.startswith(("kein zitat", "folgenanfang")):
        return "anfang"
    if text.startswith(("song", "lied")):
        return "song"
    if text.startswith(("film", "kino")):
        return "film"
    if text.startswith(("serie", "tv")):
        return "serie"
    if text.startswith("person") or "privat" in text or "interview" in text:
        return "person"
    return "sonstiges"


def spotify_id(value, kind):
    """ID aus spotify:<kind>:… oder open.spotify.com/(intl-de/)<kind>/…, sonst None."""
    text = (value or "").strip()
    match = re.fullmatch(rf"spotify:{kind}:([A-Za-z0-9]{{22}})", text) or re.fullmatch(
        rf"https?://open\.spotify\.com/(?:intl-[a-zA-Z-]+/)?{kind}/([A-Za-z0-9]{{22}})/?(?:\?\S*)?", text
    )
    return match.group(1) if match else None


def song_key(row):
    """Derselbe Song auch mit anderem Link (Single, Album, Remaster): Titel und Interpret ohne
    Groß-/Kleinschreibung, Akzente und doppelte Leerzeichen. Nur wenn beides eingetragen ist."""
    def plain(text):
        text = unicodedata.normalize("NFKD", (text or "").casefold())
        return " ".join("".join(char for char in text if not unicodedata.combining(char)).split())

    # Features zählen nicht: „Song (feat. X)“ von „A feat. X“ ist derselbe Song wie „Song“ von „A“
    title = plain(FEATURE.split(row.get("songtitel") or "", maxsplit=1)[0].rstrip(" ()"))
    artist = plain(main_artist(row.get("interpret")))
    return (title, artist) if title and artist else None


def playlist_tracks(rows):
    """Track-ID → Zeile: bestätigte Songs mit Spotify-Link, neueste Folge zuerst, jeder Song nur einmal.

    Steht ein Song in mehreren Folgen, zählt die neueste. Als derselbe Song gilt derselbe Link
    oder derselbe Titel mit derselben Interpret/in.
    """
    def by_episode(row):
        number = episode_number(row.get("folge_id"))
        return (number is None, -(number or 0))

    tracks, songs = {}, set()
    for row in sorted(rows, key=by_episode):
        if (row.get("pruefstatus") or "").strip().lower() != "bestätigt":
            continue
        if origin_key(row.get("herkunft")) not in ("", "song"):
            continue
        track = spotify_id(row.get("spotify_link"), "track")
        key = song_key(row)
        if not track or track in tracks or (key and key in songs):
            continue
        tracks[track] = row
        if key:
            songs.add(key)
    return tracks
