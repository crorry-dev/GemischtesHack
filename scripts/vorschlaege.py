"""Offene Vorschläge für die Website: welche Folgen ein offenes Issue haben.

Läuft beim Veröffentlichen (.github/workflows/pages.yml):
  python3 scripts/vorschlaege.py offen.json > site/data/vorschlaege.json

offen.json ist die Liste offener Issues aus der GitHub-API. Die Website markiert damit
Folgen als „In Prüfung“. Was in den Vorschlägen steht, landet bewusst nicht auf der
Website, denn es ist ja noch ungeprüft.
"""

import json
import sys
from pathlib import Path

import sammlung
from uebernehmen import Problem, quoted_number, read_form


def pending(issues):
    entries = []
    for issue in issues if isinstance(issues, list) else []:
        if "pull_request" in issue:
            continue
        try:
            form, fields = read_form(issue.get("body"))
        except Problem:
            continue  # kein Vorschlag aus einem unserer Formulare
        number = sammlung.episode_number(fields.get("nummer")) if form == "folge" else quoted_number(fields.get("folge"))
        if number is not None:
            entries.append({"folge": number, "issue": issue.get("number"), "url": issue.get("html_url", ""), "art": form})
    return sorted(entries, key=lambda entry: (entry["folge"], entry["issue"] or 0))


if __name__ == "__main__":
    issues = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")) if len(sys.argv) > 1 else []
    print(json.dumps(pending(issues), ensure_ascii=False))
