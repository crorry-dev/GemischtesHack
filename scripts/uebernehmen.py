"""Übernimmt einen Vorschlag aus einem Issue-Formular in data/zitate.csv.

Läuft über .github/workflows/uebernehmen.yml, sobald jemand mit Schreibrechten
„/approve“ unter ein Issue kommentiert. Ohne Zusatz gilt der Vorschlag als bestätigt
(bei einem Song ohne Titel und Link als offen). Dahinter optional:

  all      alle offenen Vorschläge auf einmal übernehmen, nicht nur dieses Issue
  unsure   Prüfstatus „vermutet“
  open     Prüfstatus „offen“
  extra    Zitat als weitere Verwendung anlegen, statt die erste zu ersetzen

Die Überschriften der Formulare liest das Skript direkt aus .github/ISSUE_TEMPLATE/.
Ein Zitat-Vorschlag beschreibt die Verwendung vollständig: Leere Felder bleiben leer.

Lokal ausprobieren:  python3 scripts/uebernehmen.py event.json [--offen issues.json]
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import sammlung

NO_RESPONSE = "_No response_"
ORIGINS = {"song": "Song", "film": "Film", "serie": "Serie", "person": "Person", "sonstiges": "Sonstiges", "anfang": "Kein Zitat"}
# Zusätze hinter /approve; die deutschen Statuswörter gehen auch
STATES = {"unsure": "vermutet", "vermutet": "vermutet", "open": "offen", "offen": "offen"}
EXTRA = ("extra", "zusätzlich", "zusaetzlich")
ALL = ("all", "alle")
EPISODE_LABELS = {"folge_titel": "Titel", "veroeffentlicht_am": "Datum", "dauer": "Länge", "folge_url": "Link"}
QUOTE_LABELS = {
    "zitat": "Zitat",
    "songtitel": "Song",
    "interpret": "Interpret/in",
    "spotify_link": "Spotify-Link",
    "herkunft": "Herkunft",
    "pruefstatus": "Prüfstatus",
}
EPISODE_COLUMNS = {"folge_id", "folge_titel", "veroeffentlicht_am", "dauer", "folge_url"}
RETRY_HINT = "Nach dem Anpassen des Issues einfach noch einmal `/approve` kommentieren."


class Problem(Exception):
    """Der Vorschlag passt so nicht; der Text geht als Antwort ins Issue."""


@dataclass
class Outcome:
    changed: bool
    reply: str
    subject: str = ""
    close: bool = True


# --- Formulare lesen -------------------------------------------------------------------


def form_labels(path):
    """Überschrift → id eines Issue-Formulars."""
    labels, current = {}, None
    for line in path.read_text(encoding="utf-8").splitlines():
        found = re.match(r"\s*(?:-\s*)?id:\s*(\S+)\s*$", line)
        if found:
            current = found.group(1)
        found = re.match(r"\s*label:\s*(.+?)\s*$", line)
        if found and current:
            labels[found.group(1).strip("\"'")] = current
            current = None
    return labels


def parse_body(body, labels):
    """GitHub legt Formularfelder als „### Überschrift“ mit dem Wert darunter ab."""
    fields, key = {}, None
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        heading = re.match(r"###\s+(.+?)\s*$", line)
        if heading:
            key = labels.get(heading.group(1))
            if key:
                fields[key] = []
            continue
        if key:
            fields[key].append(line)
    values = {key: "\n".join(lines).strip() for key, lines in fields.items()}
    return {key: "" if value == NO_RESPONSE else value for key, value in values.items()}


def read_form(body):
    """Erkennt das Formular am Aufbau des Issues: (Name, Felder)."""
    best = ("", {})
    for path in sorted(sammlung.FORMS_PATH.glob("*.yml")):
        fields = parse_body(body, form_labels(path))
        if len(fields) > len(best[1]):
            best = (path.stem, fields)
    if len(best[1]) < 2:
        raise Problem("Das Issue passt zu keinem unserer Formulare („Zitat vorschlagen“ oder „Folge eintragen“).")
    return best


# --- Werte prüfen ----------------------------------------------------------------------


def one_line(value):
    return re.sub(r"\s+", " ", value or "").strip()


def clean_quote(value):
    text = one_line(value)
    if len(text) > 1 and text[0] in "„“\"»«‚'" and text[-1] in "“”\"«»‘’'":
        text = text[1:-1].strip()
    return text


def clock(value, label):
    """„0:07“, „1:23:45“ oder „1 Std. 23 Min.“ → „HH:MM:SS“."""
    text = one_line(value).lower()
    if not text:
        return ""
    found = re.fullmatch(r"(?:(\d{1,2}):)?(\d{1,3}):(\d{2})", text) or re.fullmatch(
        r"(?:(\d{1,2}) ?(?:h|std\.?|stunden?))? ?(?:(\d{1,3}) ?(?:m|min\.?|minuten?))? ?(?:(\d{1,2}) ?(?:s|sek\.?|sekunden?))?",
        text,
    )
    hours, minutes, seconds = (int(part or 0) for part in found.groups()) if found else (0, 0, 0)
    if not found or not any(found.groups()) or seconds > 59 or (found.group(1) and minutes > 59):
        raise Problem(f"{label} „{one_line(value)}“ ist unklar. Bitte im Format HH:MM:SS angeben, z. B. 01:23:45.")
    total = hours * 3600 + minutes * 60 + seconds
    return f"{total // 3600:02d}:{total // 60 % 60:02d}:{total % 60:02d}"


def iso_date(value):
    """„29.09.2026“ oder „2026-09-29“ → „2026-09-29“."""
    text = one_line(value)
    german = re.fullmatch(r"(\d{1,2})\. ?(\d{1,2})\. ?(\d{4})", text)
    iso = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", text)
    try:
        if german:
            return date(int(german.group(3)), int(german.group(2)), int(german.group(1))).isoformat()
        if iso:
            return date(*map(int, iso.groups())).isoformat()
    except ValueError:
        pass
    raise Problem(f"Das Datum „{text}“ ist unklar. Bitte als TT.MM.JJJJ angeben, z. B. 29.09.2026.")


def german_date(value):
    year, month, day = value.split("-")
    return f"{day}.{month}.{year}"


def spotify_link(value, kind):
    """ID der ersten passenden Spotify-Adresse im Text, auch mit „?si=…“ oder Text drumherum."""
    for token in re.split(r"[\s<>()\[\]]+", value or ""):
        found = sammlung.spotify_id(token, kind)
        if found:
            return found
    return None


def episode_title(value, number):
    """Titel ohne vorangestellte Nummer wie „#365 “ oder „365 – “, in Großbuchstaben wie bei Spotify."""
    text = one_line(value)
    return sammlung.upper_title(re.sub(rf"^(?:#\s*0*{number}\b\s*[-–—:|]?|0*{number}\s*[-–—:|])\s*", "", text) or text)


def artist_names(value):
    """Features einheitlich mit „feat.“: „B-Tight ft. Sido“ und „B-Tight (featuring Sido)“ → „B-Tight feat. Sido“."""
    text = one_line(value)
    text = re.sub(r"\(\s*((?:feat\.?|ft\.?|featuring)\s+[^)]*)\)", r"\1", text, flags=re.IGNORECASE)
    return one_line(re.sub(r"\s*\b(?:feat\.?|ft\.?|featuring)\s+", " feat. ", text, flags=re.IGNORECASE))


def quoted_number(value):
    """Folgennummer aus „#270 DEUTSCHE KENNEDY – https://…“ oder „Folge 270“."""
    found = re.search(r"#\s*(\d+)", value or "") or re.match(r"\s*(?:folge\s*)?(\d+)\b", value or "", re.I)
    return int(found.group(1)) if found else None


def origin_text(kind, detail):
    """Herkunft eines Zitats, das kein Song ist, z. B. „Film: Ein Fisch namens Wanda (1988)“."""
    detail = re.sub(r"^(?:film|serie|person|sonstiges)\s*:\s*", "", detail, flags=re.I)
    if not detail:
        return kind
    return detail if kind in ("", "Sonstiges") else f"{kind}: {detail}"


def safe(text):
    """Nutzertext für die Antwort: keine ungewollten @-Erwähnungen."""
    return (text or "").replace("@", "@​")


def position_key(row):
    number = sammlung.episode_number(row.get("folge_id"))
    return float("inf") if number is None else number


# --- Übernehmen ------------------------------------------------------------------------


def apply_episode(fields, columns, rows):
    number = sammlung.episode_number(fields.get("nummer"))
    if number is None:
        raise Problem("Die Folgennummer fehlt oder ist keine Zahl.")
    episode_id = spotify_link(fields.get("link"), "episode")
    if fields.get("link") and not episode_id:
        raise Problem("Der Link zur Folge sollte so aussehen: https://open.spotify.com/episode/…")
    taken = next((row for row in rows if episode_id and sammlung.spotify_id(row.get("folge_url"), "episode") == episode_id), None)
    if taken and sammlung.episode_number(taken.get("folge_id")) != number:
        raise Problem(f"Der Link gehört schon zu Folge #{taken.get('folge_id')}.")
    values = {
        "folge_titel": episode_title(fields.get("titel"), number),
        "veroeffentlicht_am": iso_date(fields["datum"]) if fields.get("datum") else "",
        "dauer": clock(fields.get("dauer"), "Die Länge"),
        "folge_url": f"https://open.spotify.com/episode/{episode_id}" if episode_id else "",
    }
    values = {key: value for key, value in values.items() if value}

    episode = [row for row in rows if sammlung.episode_number(row.get("folge_id")) == number]
    if episode:
        changes = {key: value for key, value in values.items() if episode[0].get(key, "") != value}
        if not changes:
            return Outcome(False, "Die Angaben stehen schon genau so in der Sammlung, es gibt nichts zu ändern.")
        for row in episode:
            row.update(changes)
        changed = ", ".join(EPISODE_LABELS[key] for key in changes)
        return Outcome(
            True,
            f"Übernommen: Bei Folge **#{number}** ist jetzt {changed} aktualisiert.",
            f"Folge #{number} aktualisieren",
        )

    if "folge_titel" not in values:
        raise Problem(f"Folge #{number} ist neu, dafür braucht es mindestens den Titel.")
    row = dict.fromkeys(columns, "")
    row.update(values, verwendung_id=f"{number:03d}-1", folge_id=str(number), pruefstatus="offen")
    rows.insert(next((index for index, other in enumerate(rows) if position_key(other) > number), len(rows)), row)
    details = [german_date(values["veroeffentlicht_am"]) if "veroeffentlicht_am" in values else "", values.get("dauer", "")]
    details = " · ".join(filter(None, details))
    return Outcome(
        True,
        f"Übernommen: Folge **#{number} {safe(values['folge_titel'])}** steht jetzt in der Sammlung"
        f"{f' ({details})' if details else ''}.",
        f"Folge #{number} eintragen",
    )


def apply_quote(fields, columns, rows, status, additional):
    number = quoted_number(fields.get("folge"))
    episode = [row for row in rows if number is not None and sammlung.episode_number(row.get("folge_id")) == number]
    if not episode:
        missing = f"Folge #{number}" if number is not None else "Die Folge"
        raise Problem(f"{missing} steht noch nicht in der Sammlung. Bitte zuerst über „Folge eintragen“ ergänzen.")
    quote = clean_quote(fields.get("zitat"))
    if not quote:
        raise Problem("Das Zitat fehlt.")

    kind = ORIGINS.get(sammlung.origin_key(fields.get("herkunft")), "")
    song, artist = one_line(fields.get("songtitel")), artist_names(fields.get("interpret"))
    track = spotify_link(fields.get("spotify"), "track")
    if fields.get("spotify") and not track:
        raise Problem(
            "Der Spotify-Link zum Song sollte so aussehen: https://open.spotify.com/track/… "
            "(in Spotify beim Song auf „Teilen“ und „Songlink kopieren“ tippen)."
        )
    if song or track:
        if kind not in ("", "Song"):
            raise Problem(f"Als Herkunft ist „{kind}“ gewählt, dazu passen kein Songtitel und kein Songlink.")
        kind = "Song"
    # „Kein Zitat“: Die Folge beginnt ohne Zitat, im Feld Zitat stehen ihre ersten Worte
    if kind == "Kein Zitat":
        origin = "Kein Zitat"
    else:
        origin = "" if kind == "Song" else origin_text(kind, one_line(fields.get("herkunft_detail")))
    known = bool(origin) or bool(song or track)

    target = episode[0]
    if additional:
        target = {key: (episode[0].get(key, "") if key in EPISODE_COLUMNS else "") for key in columns}
        used = {row.get("verwendung_id") for row in episode}
        target["verwendung_id"] = next(
            f"{number:03d}-{index}" for index in range(len(episode) + 1, len(episode) + 100) if f"{number:03d}-{index}" not in used
        )
        rows.insert(rows.index(episode[-1]) + 1, target)

    data = {
        "zitat": quote,
        "songtitel": song,
        "interpret": artist,
        "spotify_link": f"https://open.spotify.com/track/{track}" if track else "",
        "herkunft": origin,
        "pruefstatus": status or ("bestätigt" if known else "offen"),
    }
    changes = [key for key, value in data.items() if target.get(key, "") != value]
    if not changes and not additional:
        return Outcome(False, "Das Zitat steht schon genau so in der Sammlung, es gibt nichts zu ändern.")
    replaced = bool(target.get("zitat")) and not additional
    target.update(data)

    title = f"#{number} {episode[0].get('folge_titel', '')}".strip()
    if kind == "Kein Zitat":
        lines = [f"Übernommen: **{safe(title)}** beginnt ohne Zitat. Die ersten Worte:", "", f"> {safe(quote)}", ""]
    else:
        lines = [f"Übernommen: Einstiegszitat zu **{safe(title)}**", "", f"> {safe(quote)}", ""]
    if kind == "Kein Zitat":
        if artist:
            lines.append(f"- Von: {safe(artist)}")
    elif kind == "Song":
        lines.append(f"- Song: {safe(' – '.join(filter(None, [song, artist])) or 'noch unbekannt')}")
    elif origin:
        lines.append(f"- Herkunft: {safe(origin)}")
        if artist:
            lines.append(f"- Von: {safe(artist)}")
    lines.append(f"- Prüfstatus: {data['pruefstatus']}")
    if replaced:
        lines.append(f"- Ersetzt den bisherigen Eintrag, geändert: {', '.join(QUOTE_LABELS[key] for key in changes)}")
    lines.append("")
    if kind == "Song" and data["pruefstatus"] == "bestätigt":
        lines.append("Der Song kommt automatisch in die Playlist." if track else "Mit Spotify-Link käme der Song auch in die Playlist.")
    return Outcome(True, "\n".join(lines).rstrip(), f"Zitat zu Folge #{number} übernehmen")


def apply_episode_with_quote(fields, columns, rows, status, additional):
    """Formular „Folge eintragen“: erst die Folge, dann das Zitat, falls eins mitkam."""
    episode = apply_episode(fields, columns, rows)
    if not one_line(fields.get("zitat")):
        return episode
    number = sammlung.episode_number(fields.get("nummer"))
    quote = apply_quote(dict(fields, folge=f"#{number}"), columns, rows, status, additional)
    if not episode.changed:
        return quote
    if not quote.changed:
        return episode
    return Outcome(True, f"{episode.reply}\n\n{quote.reply}", f"Folge #{number} mit Zitat übernehmen")


def read_options(comment):
    """„/approve all unsure“ → (Prüfstatus, zusätzlich?, alle offenen?)."""
    words = (comment or "").strip().split("\n", 1)[0].lower().split()[1:]
    status = next((STATES[word] for word in words if word in STATES), "")
    return status, any(word in EXTRA for word in words), any(word in ALL for word in words)


def apply(issues, status="", additional=False, everything=False):
    """Übernimmt Vorschläge in einem Durchgang: erst neue Folgen, dann Zitate, damit beides zusammen klappt."""
    columns, rows = sammlung.read_rows()
    queue = []
    for issue in issues:
        try:
            queue.append((issue, *read_form(issue.get("body")), None))
        except Problem as problem:
            if not everything:  # bei „all“ bleiben Issues ohne Formular unberührt
                queue.append((issue, "", {}, problem))
    queue.sort(key=lambda item: (item[1] != "folge", item[0].get("number") or 0))

    results = []
    for issue, form, fields, problem in queue:
        before = [dict(row) for row in rows]
        try:
            if problem:
                raise problem
            if form == "folge":
                outcome = apply_episode_with_quote(fields, columns, rows, status, additional)
            elif form == "zitat":
                outcome = apply_quote(fields, columns, rows, status, additional)
            else:
                raise Problem(f"Für das Formular „{form}“ gibt es keine automatische Übernahme.")
        except Problem as error:
            rows[:] = before  # nichts halb übernehmen, z. B. die Folge ohne ihr fehlerhaftes Zitat
            outcome = Outcome(False, f"Nicht übernommen: {safe(str(error))}\n\n{RETRY_HINT}", close=False)
        if outcome.changed:
            outcome.reply += "\n\nDie Website zeigt es in ein paar Minuten. Danke!"
        results.append((issue, outcome))
    if any(outcome.changed for _, outcome in results):
        sammlung.write_rows(columns, rows)
    return results


def summary(results):
    """Antwort auf „/approve all“ im Issue, unter dem es kommentiert wurde."""
    def numbers(selected):
        return ", ".join(f"#{issue.get('number')}" for issue, outcome in results if selected(outcome))

    groups = [
        ("Übernommen", numbers(lambda outcome: outcome.changed)),
        ("Mit Rückfrage, Details im jeweiligen Issue", numbers(lambda outcome: not outcome.close)),
        ("Stand schon so in der Sammlung", numbers(lambda outcome: outcome.close and not outcome.changed)),
    ]
    lines = [f"- {label}: {value}" for label, value in groups if value]
    if not lines:
        return "Sammelübernahme: Es gibt gerade keine offenen Vorschläge."
    return "\n".join(["Sammelübernahme", "", *lines, "", "Die Website zeigt die Änderungen in ein paar Minuten."])


# --- Git und GitHub --------------------------------------------------------------------


def commit_message(results):
    """Ein Commit für alles Übernommene; wer die Issues geschrieben hat, steht als Co-Autor:in darin."""
    done = [(issue, outcome) for issue, outcome in results if outcome.changed]
    numbers = ", ".join(f"#{issue.get('number')}" for issue, _ in done)
    subject = f"{done[0][1].subject} ({numbers})" if len(done) == 1 else f"{len(done)} Vorschläge übernehmen ({numbers})"
    authors = {}
    for issue, _ in done:
        user = issue.get("user") or {}
        if user.get("type") == "User" and user.get("login") and user.get("id"):
            authors[user["login"]] = f"Co-authored-by: {user['login']} <{user['id']}+{user['login']}@users.noreply.github.com>"
    return "\n".join([subject, *([""] + list(authors.values()) if authors else [])]) + "\n"


def git(*args, **options):
    return subprocess.run(["git", *args], cwd=sammlung.ROOT, text=True, **options)


def push(message, branch):
    git("add", "data/zitate.csv", check=True)
    git("commit", "--quiet", "--file=-", input=message, check=True)
    return git("push", "--quiet", "origin", f"HEAD:{branch}").returncode == 0


def main(argv):
    parser = argparse.ArgumentParser(description="Vorschläge aus Issues in data/zitate.csv übernehmen.")
    parser.add_argument("event", nargs="?", default=os.environ.get("GITHUB_EVENT_PATH"), help="Event-JSON von GitHub")
    parser.add_argument("--commit", action="store_true", help="Änderung committen und pushen")
    parser.add_argument("--offen", help="offene Issues als JSON (GitHub-API), gebraucht für „/approve all“")
    args = parser.parse_args(argv)
    event = json.loads(Path(args.event).read_text(encoding="utf-8"))
    status, additional, everything = read_options((event.get("comment") or {}).get("body", ""))
    issues = [event["issue"]]
    if everything:
        listed = json.loads(Path(args.offen).read_text(encoding="utf-8")) if args.offen else []
        issues = [issue for issue in listed if "pull_request" not in issue]
    branch = (event.get("repository") or {}).get("default_branch", "main")

    # Kommen zwei Übernahmen gleichzeitig, gewinnt die erste; die zweite setzt neu auf und versucht es noch einmal
    for attempt in range(1, 6):
        results = apply(issues, status, additional, everything)
        changed = any(outcome.changed for _, outcome in results)
        if not args.commit or not changed or push(commit_message(results), branch):
            break
        if attempt == 5:
            sys.exit("Push nicht möglich, auch nach mehreren Versuchen.")
        time.sleep(3 * attempt)
        git("fetch", "--quiet", "origin", branch, check=True)
        git("reset", "--quiet", "--hard", f"origin/{branch}", check=True)

    answers = [{"issue": issue.get("number"), "reply": outcome.reply, "close": outcome.close} for issue, outcome in results]
    if everything:
        answers.append({"issue": event["issue"].get("number"), "reply": summary(results), "close": False})
    for answer in answers:
        print(f"#{answer['issue']}: {answer['reply']}\n")
    if os.environ.get("GITHUB_OUTPUT"):
        Path(os.environ["RUNNER_TEMP"], "antworten.json").write_text(json.dumps(answers, ensure_ascii=False), encoding="utf-8")
        closed = any(answer["close"] for answer in answers)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"changed={str(changed).lower()}\nclosed={str(closed).lower()}\n")


if __name__ == "__main__":
    main(sys.argv[1:])
