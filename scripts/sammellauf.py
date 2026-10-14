"""Offene Formularvorschläge gesammelt prüfen und mit einem Commit übernehmen.

Ohne --alle werden nur /approve-Kommentare von Personen mit Schreibrechten
verarbeitet. Kein Issue- oder Kommentar-Ereignis startet dafür einen Runner.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

import uebernehmen


def api(path, paginate=False):
    command = ["gh", "api", path]
    if paginate:
        command += ["--paginate", "--slurp"]
    result = json.loads(subprocess.run(command, check=True, stdout=subprocess.PIPE, text=True).stdout)
    return result


def marker(issue, comment):
    value = json.dumps([issue["body"], comment.get("id"), comment.get("body")], ensure_ascii=False)
    return f"<!-- sammellauf:{hashlib.sha256(value.encode()).hexdigest()} -->"


def select(issues, comments, can_write, everything=False):
    approvals = []
    for issue in issues:
        for comment in comments[issue["number"]]:
            if re.fullmatch(r"/approve(?:\s+.*)?", comment.get("body", "").strip(), re.DOTALL):
                if can_write(comment["user"]["login"]):
                    approvals.append((issue["number"], comment))
    approvals.sort(key=lambda item: item[1]["id"], reverse=True)
    selected = []
    for issue in issues:
        if everything:
            approval = {"body": "/approve", "id": None}
        else:
            approval = next((
                comment for number, comment in approvals
                if number == issue["number"]
                or (uebernehmen.read_options(comment["body"])[2]
                    and issue["created_at"] <= comment["created_at"])
            ), None)
        if approval is None:
            continue
        stamp = marker(issue, approval)
        already_replied = any(
            comment["user"]["login"] == "github-actions[bot]"
            and comment["user"].get("type") == "Bot"
            and stamp in (comment.get("body") or "")
            for comment in comments[issue["number"]]
        )
        if not everything and already_replied:
            continue
        status, additional, _ = uebernehmen.read_options(approval["body"])
        selected.append((issue, status, additional, stamp))
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offen", required=True, help="Alle offenen Issues als JSON")
    parser.add_argument("--alle", action="store_true", help="Explizite manuelle Freigabe aller Formularvorschläge")
    parser.add_argument("--commit", action="store_true", help="Commit pushen, antworten und Issues schließen")
    args = parser.parse_args()
    repo = os.environ["GITHUB_REPOSITORY"]
    issues = []
    for issue in json.loads(Path(args.offen).read_text(encoding="utf-8")):
        if "pull_request" in issue:
            continue
        try:
            form, _ = uebernehmen.read_form(issue.get("body"))
        except uebernehmen.Problem:
            continue
        issues.append((form, issue))
    issues.sort(key=lambda item: (item[0] != "folge", item[1]["number"]))
    issues = [issue for _, issue in issues]
    comments = {
        issue["number"]: [
            comment
            for page in api(f"repos/{repo}/issues/{issue['number']}/comments?per_page=100", paginate=True)
            for comment in page
        ]
        for issue in issues
    }
    permissions = {}

    def can_write(login):
        if login not in permissions:
            permissions[login] = api(f"repos/{repo}/collaborators/{login}/permission")["permission"] in {
                "admin", "maintain", "write"
            }
        return permissions[login]

    results, stamps = [], {}
    for issue, status, additional, stamp in select(issues, comments, can_write, args.alle):
        results.extend(uebernehmen.apply([issue], status, additional))
        stamps[issue["number"]] = stamp
    changed = any(outcome.changed for _, outcome in results)
    if args.commit and changed:
        branch = os.environ["GITHUB_REF_NAME"]
        if not uebernehmen.push(uebernehmen.commit_message(results), branch):
            raise RuntimeError("Push fehlgeschlagen. Keine Issues geschlossen; Sammellauf bitte erneut starten.")
    for issue, outcome in results:
        print(f"#{issue['number']}: {outcome.reply}")
        if args.commit:
            if outcome.close:
                subprocess.run(
                    ["gh", "issue", "close", str(issue["number"]), "--repo", repo, "--reason", "completed"],
                    check=True,
                )
            subprocess.run(
                ["gh", "issue", "comment", str(issue["number"]), "--repo", repo, "--body-file", "-"],
                input=f"{outcome.reply}\n\n{stamps[issue['number']]}",
                text=True, check=True,
            )
    message = uebernehmen.summary(results)
    print(message)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as file:
            file.write(message + "\n")


if __name__ == "__main__":
    main()
