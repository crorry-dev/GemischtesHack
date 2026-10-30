"""Prüft, ob die Spotify-Links der Songs noch funktionieren, und markiert tote Links.

Läuft im Wochenlauf (.github/workflows/uebernehmen.yml). Ist ein Song bei Spotify nicht mehr da
oder in Deutschland nicht abspielbar, steht in data/zitate.csv in der Spalte spotify_status
„nicht verfügbar“; die Website bittet dann um einen neuen Link. Geht der Link wieder oder kommt
ein neuer, wird die Spalte geleert. Braucht SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET
(wie scripts/playlist.py); ohne passiert nichts.

  python3 scripts/spotifylinks.py            prüfen und data/zitate.csv anpassen
  python3 scripts/spotifylinks.py --commit   dazu committen und pushen
"""

import argparse
import os
import sys

import playlist
import sammlung
import uebernehmen

UNAVAILABLE = "nicht verfügbar"
MARKET = "DE"


def available(token, track):
    try:
        found = playlist.call("GET", f"{playlist.API}/tracks/{track}?market={MARKET}", token=token)
    except playlist.SpotifyError as error:
        if error.status in (400, 404):  # ungültige oder gelöschte ID
            return False
        raise
    return found.get("is_playable") is not False


def check(rows, available):
    """Setzt spotify_status je Zeile; gibt die geänderten Zeilen zurück. Jeder Song wird nur einmal abgefragt."""
    results, changed = {}, []
    for row in rows:
        track = sammlung.spotify_id(row.get("spotify_link"), "track")
        if track and track not in results:
            results[track] = available(track)
        status = UNAVAILABLE if track and not results[track] else ""
        if row.get("spotify_status", "") != status:
            row["spotify_status"] = status
            changed.append(row)
    return changed


def main(argv):
    parser = argparse.ArgumentParser(description="Spotify-Links in data/zitate.csv prüfen.")
    parser.add_argument("--commit", action="store_true", help="Änderung committen und pushen")
    args = parser.parse_args(argv)
    playlist.load_env()
    if not all(os.environ.get(key) for key in playlist.KEYS[:2]):
        print("Kein Spotify-Zugang (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), Links bleiben ungeprüft.")
        return
    columns, rows = sammlung.read_rows()
    try:
        token = playlist.call("POST", f"{playlist.ACCOUNTS}/api/token",
                              form={"grant_type": "client_credentials"}, basic=playlist.client())["access_token"]
        changed = check(rows, lambda track: available(token, track))
    except (playlist.Stop, playlist.SpotifyError) as error:
        # Spotify-Störung soll den Wochenlauf nicht abbrechen; nächste Woche wird neu geprüft
        print(f"::warning::Spotify-Links nicht geprüft: {error}")
        return

    broken = [row for row in rows if row.get("spotify_status") == UNAVAILABLE]
    lines = [f"Spotify-Links: {len(broken)} nicht verfügbar"] + [
        f"- #{row['folge_id']} {row.get('songtitel') or row['spotify_link']}" for row in broken
    ]
    print("\n".join(lines))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as file:
            file.write("\n".join(lines) + "\n")
    if not changed:
        return
    sammlung.write_rows(columns, rows)
    if args.commit and not uebernehmen.push("Spotify-Links prüfen\n", os.environ.get("GITHUB_REF_NAME", "main")):
        sys.exit("Push fehlgeschlagen. Spotify-Links bitte im nächsten Lauf erneut prüfen.")


if __name__ == "__main__":
    main(sys.argv[1:])
