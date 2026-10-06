"""Gleicht die Spotify-Playlist mit data/zitate.csv ab.

In die Playlist kommt jeder Song mit Prüfstatus „bestätigt“ und Spotify-Link,
die neueste Folge oben, die älteste unten, jeder Song nur einmal. Was nicht mehr in der Sammlung
steht, fliegt raus, Doppelte und Umsortierungen von Hand werden korrigiert: Die Playlist zeigt
immer genau die Sammlung. Der Abgleich läuft bei jeder Änderung und einmal am Tag. Der Link zur
Playlist steht unten in PLAYLIST, die Website liest ihn beim Veröffentlichen von hier.

Einrichten, einmalig und mit dem Spotify-Konto, dem die Playlist gehört:
  1. In der App auf developer.spotify.com die Redirect URI http://127.0.0.1:8888/callback eintragen.
  2. SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET in .env schreiben, dann
     python3 scripts/playlist.py anmelden
  3. Auf GitHub unter Settings → Secrets and variables → Actions die Secrets
     SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET und SPOTIFY_REFRESH_TOKEN (steht danach in .env) anlegen.
  4. Unter Actions „Sync Spotify playlist“ einmal starten.

Spotify lässt die Anmeldung nach 6 Monaten auslaufen. Dann Schritt 2 wiederholen
und das Secret SPOTIFY_REFRESH_TOKEN ersetzen.

  python3 scripts/playlist.py             abgleichen
  python3 scripts/playlist.py --dry-run   nur zeigen, was sich ändern würde
  python3 scripts/playlist.py anmelden    Zugang zur Playlist einrichten
  python3 scripts/playlist.py link        Link zur Playlist ausgeben (für die Website)
"""

import base64
import json
import os
import re
import secrets
import sys
import time
import webbrowser
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

import sammlung

PLAYLIST = "https://open.spotify.com/playlist/7hl43UtBeA1jUhBODl1lrO"  # SPOTIFY_PLAYLIST ersetzt ihn, z. B. zum Testen
API = "https://api.spotify.com/v1"
ACCOUNTS = "https://accounts.spotify.com"
SCOPES = "playlist-read-private playlist-modify-public playlist-modify-private"
REDIRECT_URI = "http://127.0.0.1:8888/callback"
KEYS = ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN")
CHUNK = 100
EXPIRED = (
    "Die Spotify-Anmeldung ist abgelaufen oder wurde widerrufen (sie gilt 6 Monate). "
    "Lokal `python3 scripts/playlist.py anmelden` ausführen, das Secret SPOTIFY_REFRESH_TOKEN ersetzen "
    "und den Workflow „Sync Spotify playlist“ neu starten."
)


class Stop(Exception):
    """Abbruch mit einer verständlichen Meldung."""


class SpotifyError(Exception):
    def __init__(self, status, reason, message):
        super().__init__(f"Spotify antwortet mit {status}: {message or reason or 'ohne Begründung'}")
        self.status, self.reason = status, reason


# --- Spotify ---------------------------------------------------------------------------


def call(method, url, token=None, body=None, form=None, basic=None):
    headers = {"Accept": "application/json"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if basic:
        headers["Authorization"] = "Basic " + base64.b64encode(":".join(basic).encode()).decode()
    if form is not None:
        data = urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"

    for attempt in range(5):
        try:
            with urlopen(Request(url, data=data, method=method, headers=headers), timeout=30) as response:
                payload = response.read()
            return json.loads(payload) if payload else {}
        except HTTPError as error:
            if (error.code == 429 or error.code >= 500) and attempt < 4:
                time.sleep(retry_after(error, attempt))
                continue
            raise spotify_error(error) from None
        except URLError as error:
            if attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise Stop(f"Spotify ist nicht erreichbar: {error.reason}") from None


def retry_after(error, attempt):
    try:
        return min(int(error.headers.get("Retry-After")), 60)
    except (TypeError, ValueError):
        return 2 ** attempt


def spotify_error(error):
    try:
        payload = json.loads(error.read() or b"{}")
    except ValueError:
        payload = {}
    detail = payload.get("error")
    if isinstance(detail, dict):  # Web API: {"error": {"status": 403, "message": …}}
        return SpotifyError(error.code, "", detail.get("message", ""))
    return SpotifyError(error.code, detail or "", payload.get("error_description", ""))  # Anmeldung: {"error": "invalid_grant", …}


def client():
    return os.environ["SPOTIFY_CLIENT_ID"], os.environ["SPOTIFY_CLIENT_SECRET"]


def access_token():
    form = {"grant_type": "refresh_token", "refresh_token": os.environ["SPOTIFY_REFRESH_TOKEN"]}
    try:
        return call("POST", f"{ACCOUNTS}/api/token", form=form, basic=client())["access_token"]
    except SpotifyError as error:
        if error.reason == "invalid_grant":
            raise Stop(EXPIRED) from None
        if error.reason == "invalid_client":
            raise Stop("SPOTIFY_CLIENT_ID oder SPOTIFY_CLIENT_SECRET stimmt nicht.") from None
        raise


def playlist_items(token, playlist):
    url = f"{API}/playlists/{playlist}/items?" + urlencode({"limit": 50, "additional_types": "track,episode"})
    uris = []
    while url:
        page = call("GET", url, token=token)
        for entry in page.get("items") or []:
            item = entry.get("item") or entry.get("track") or {}
            uris.append(item.get("uri"))
        url = page.get("next")
    return uris


# --- Abgleich --------------------------------------------------------------------------


def plan(current, desired):
    """Schritte von der aktuellen zur gewünschten Playlist, ohne Bestehendes unnötig anzufassen.

    Stehen alle verbleibenden Songs schon in der richtigen Reihenfolge, werden nur Überzählige
    entfernt und Fehlende an ihrer Stelle eingefügt. Sonst wird die Playlist neu geschrieben.
    """
    wanted = set(desired)
    kept = [uri for uri in current if uri in wanted]
    order = {uri: index for index, uri in enumerate(desired)}
    if None in current or any(order[first] >= order[second] for first, second in zip(kept, kept[1:])):
        return [("replace", 0, desired)]

    steps = []
    extra = list(dict.fromkeys(uri for uri in current if uri not in wanted))
    if extra:
        steps.append(("remove", 0, extra))
    present = set(kept)
    index = 0
    while index < len(desired):
        if desired[index] in present:
            index += 1
            continue
        end = index
        while end < len(desired) and desired[end] not in present:
            end += 1
        steps.append(("insert", index, desired[index:end]))
        index = end
    return steps


def apply(token, playlist, steps):
    url = f"{API}/playlists/{playlist}/items"
    for kind, position, uris in steps:
        if kind == "remove":
            for start in range(0, len(uris), CHUNK):
                call("DELETE", url, token, body={"items": [{"uri": uri} for uri in uris[start:start + CHUNK]]})
        elif kind == "replace":
            call("PUT", url, token, body={"uris": uris[:CHUNK]})
            for start in range(CHUNK, len(uris), CHUNK):
                call("POST", url, token, body={"uris": uris[start:start + CHUNK]})
        else:
            for start in range(0, len(uris), CHUNK):
                call("POST", url, token, body={"uris": uris[start:start + CHUNK], "position": position + start})


def configured_playlist():
    url = (os.environ.get("SPOTIFY_PLAYLIST") or PLAYLIST).strip()
    if not url:
        return None
    playlist = sammlung.spotify_id(url, "playlist")
    if not playlist:
        raise Stop(f"„{url}“ ist kein Link zu einer Spotify-Playlist.")
    return playlist


def sync(dry_run):
    _, rows = sammlung.read_rows()
    tracks = sammlung.playlist_tracks(rows)
    desired = [f"spotify:track:{track}" for track in tracks]
    playlist = configured_playlist()
    missing = [key for key in KEYS if not os.environ.get(key)]
    if not playlist or len(missing) == len(KEYS) or (dry_run and missing):
        reason = "Es ist keine Playlist eingetragen" if not playlist else "Der Spotify-Zugang ist noch nicht eingerichtet"
        note(f"{reason}, deshalb kein Abgleich. Aus der Sammlung kämen {len(desired)} Songs hinein.")
        return
    if missing:
        raise Stop(f"Es fehlt {', '.join(missing)}. Wie das eingerichtet wird, steht oben in scripts/playlist.py.")

    token = access_token()
    try:
        current = playlist_items(token, playlist)
        steps = plan(current, desired)
        if not dry_run:
            apply(token, playlist, steps)
    except SpotifyError as error:
        if error.status == 403:
            raise Stop(
                f"Kein Zugriff auf die Playlist ({error}). Sie muss dem angemeldeten Spotify-Konto gehören, "
                "und Apps im Entwicklungsmodus brauchen ein Premium-Konto beim Besitzer der App."
            ) from None
        if error.status == 404:
            raise Stop("Die eingetragene Playlist gibt es bei Spotify nicht.") from None
        raise
    report(tracks, current, desired, steps, dry_run)


def note(message):
    print(f"::notice::{message}" if os.environ.get("GITHUB_ACTIONS") else message)


def report(tracks, current, desired, steps, dry_run):
    def label(uri):
        row = tracks.get((uri or "").rsplit(":", 1)[-1])
        if not row:
            return uri or "nicht mehr verfügbarer Eintrag"
        name = " – ".join(filter(None, [row.get("interpret"), row.get("songtitel")])) or uri
        return f"{name} (#{row.get('folge_id')})"

    added = [uri for uri in desired if uri not in set(current)]
    removed = [uri for uri in dict.fromkeys(current) if uri not in set(desired)]
    if not steps:
        lines = [f"Die Playlist ist aktuell: {len(desired)} Songs."]
    else:
        head = "Probelauf, nichts geändert" if dry_run else "Playlist abgeglichen"
        rewritten = ", komplett neu geschrieben" if steps[0][0] == "replace" else ""
        lines = [f"{head}: {len(desired)} Songs, {len(added)} neu, {len(removed)} entfernt{rewritten}."]
        lines += [f"+ {label(uri)}" for uri in added] + [f"− {label(uri)}" for uri in removed]
    print("\n".join(lines))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write("\n".join([lines[0], ""] + [f"- {line[2:]}" for line in lines[1:]]) + "\n")


# --- Anmeldung -------------------------------------------------------------------------


def login():
    for key in KEYS[:2]:
        if not os.environ.get(key):
            raise Stop(f"{key} fehlt in .env.")
    redirect = os.environ.get("SPOTIFY_REDIRECT_URI", REDIRECT_URI)
    target = urlparse(redirect)
    state = secrets.token_urlsafe(16)
    answer = {}

    class Callback(BaseHTTPRequestHandler):
        def do_GET(self):
            request = urlparse(self.path)
            if request.path != target.path:
                self.send_error(404)
                return
            answer.update((key, values[0]) for key, values in parse_qs(request.query).items())
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                "<!doctype html><meta charset=utf-8><title>Spotify</title>"
                "<p style='font:16px system-ui;padding:2rem'>Fertig, das Fenster kann zu.</p>".encode()
            )

        def log_message(self, *args):
            pass

    server = HTTPServer((target.hostname, target.port or 80), Callback)
    query = {"client_id": client()[0], "response_type": "code", "redirect_uri": redirect, "scope": SCOPES, "state": state}
    url = f"{ACCOUNTS}/authorize?{urlencode(query)}"
    print("Im Browser mit dem Spotify-Konto anmelden, dem die Playlist gehört, und zustimmen.")
    print(f"Falls sich nichts öffnet: {url}")
    webbrowser.open(url)
    while not answer:
        server.handle_request()
    server.server_close()

    if answer.get("state") != state:
        raise Stop("Die Antwort von Spotify gehört nicht zu dieser Anmeldung.")
    if "code" not in answer:
        raise Stop(f"Spotify hat die Anmeldung abgelehnt: {answer.get('error', 'ohne Begründung')}.")
    form = {"grant_type": "authorization_code", "code": answer["code"], "redirect_uri": redirect}
    tokens = call("POST", f"{ACCOUNTS}/api/token", form=form, basic=client())
    user = call("GET", f"{API}/me", token=tokens["access_token"])
    save_env("SPOTIFY_REFRESH_TOKEN", tokens["refresh_token"])
    until = date.today() + timedelta(days=182)
    print(f"Angemeldet als {user.get('display_name') or user.get('id')}.")
    print(f"SPOTIFY_REFRESH_TOKEN steht jetzt in .env und gilt bis etwa {until:%d.%m.%Y}.")
    print("Auf GitHub unter Settings → Secrets and variables → Actions als Secret eintragen,")
    print("zusammen mit SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET.")


def load_env():
    path = sammlung.ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        found = re.match(r"\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
        if found:
            os.environ.setdefault(found.group(1), found.group(2).strip("\"'"))


def save_env(key, value):
    path = sammlung.ROOT / ".env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    for index, line in enumerate(lines):
        if re.match(rf"\s*(?:export\s+)?{key}\s*=", line):
            lines[index] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.chmod(0o600)


def main(argv):
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    load_env()
    try:
        if argv[:1] == ["anmelden"]:
            login()
        elif argv[:1] == ["link"]:
            playlist = configured_playlist()
            print(f"https://open.spotify.com/playlist/{playlist}" if playlist else "")
        else:
            sync("--dry-run" in argv)
    except (Stop, SpotifyError) as error:
        print(f"::error::{error}" if os.environ.get("GITHUB_ACTIONS") else error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
