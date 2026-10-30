"""Offene Vorschläge für die Website: welche Folgen eine offene Discussion haben.

Läuft beim Veröffentlichen (.github/workflows/pages.yml):
  python3 scripts/vorschlaege.py offen.json > site/data/vorschlaege.json

offen.json ist die normalisierte Liste aus discussions.py. Die Website markiert damit
Folgen als „In Prüfung“. Was in den Vorschlägen steht, landet bewusst nicht auf der
Website, denn es ist ja noch ungeprüft.
"""

import json
import sys
from pathlib import Path

import sammlung
from uebernehmen import Problem, bulk_entries, quoted_number, read_form


def pending(issues):
    entries = []
    for issue in issues if isinstance(issues, list) else []:
        if "pull_request" in issue:
            continue
        try:
            form, fields = read_form(issue.get("body"))
            if form == "folge":
                numbers = [sammlung.episode_number(fields.get("nummer"))]
            elif form == "mehrere":
                numbers = [quoted_number(entry.get("folge")) for entry in bulk_entries(fields.get("eintraege"))]
            else:
                numbers = [quoted_number(fields.get("folge"))]
        except Problem:
            continue  # kein Vorschlag aus einem unserer Formulare
        for number in sorted({number for number in numbers if number is not None}):
            entries.append({"folge": number, "issue": issue.get("number"), "url": issue.get("html_url", ""), "art": form})
    return sorted(entries, key=lambda entry: (entry["folge"], entry["issue"] or 0))


if __name__ == "__main__":
    issues = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")) if len(sys.argv) > 1 else []
    print(json.dumps(pending(issues), ensure_ascii=False))
