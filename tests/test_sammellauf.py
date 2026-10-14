import copy
import json
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import sammlung
import sammellauf
import uebernehmen


def issue(number=1, created="2026-10-01T00:00:00Z"):
    return {"number": number, "body": "Vorschlag", "created_at": created}


def comment(number=1, body="/approve", login="maintainer", created="2026-10-02T00:00:00Z"):
    return {"id": number, "body": body, "user": {"login": login}, "created_at": created}


class SelectionTests(unittest.TestCase):
    def select(self, issues, comments, everything=False):
        return sammellauf.select(issues, comments, lambda login: login == "maintainer", everything)

    def test_no_implicit_approval(self):
        self.assertEqual(self.select([issue()], {1: []}), [])

    def test_current_permissions_required(self):
        self.assertEqual(self.select([issue()], {1: [comment(login="visitor")]}), [])

    def test_latest_approval_options_win(self):
        selected = self.select([issue()], {1: [comment(), comment(2, "/approve unsure extra")]})
        self.assertEqual(selected[0][1:3], ("vermutet", True))

    def test_command_boundary(self):
        self.assertEqual(self.select([issue()], {1: [comment(body="/approve-not-a-command")]}), [])

    def test_all_only_includes_issues_existing_at_approval(self):
        issues = [issue(), issue(2), issue(3, "2026-10-03T00:00:00Z")]
        selected = self.select(issues, {1: [comment(body="/approve all open")], 2: [], 3: []})
        self.assertEqual([item[0]["number"] for item in selected], [1, 2])
        self.assertTrue(all(item[1] == "offen" for item in selected))

    def test_manual_all_requires_explicit_option(self):
        self.assertEqual(len(self.select([issue()], {1: []}, everything=True)), 1)

    def test_failed_suggestion_not_replied_to_every_week(self):
        approval = comment()
        reply = comment(2, sammellauf.marker(issue(), approval), "github-actions[bot]")
        reply["user"]["type"] = "Bot"
        self.assertEqual(self.select([issue()], {1: [approval, reply]}), [])
        edited = dict(issue(), body="Korrigierter Vorschlag")
        self.assertEqual(len(self.select([edited], {1: [approval, reply]})), 1)
        self.assertEqual(len(self.select([issue()], {1: [approval, reply, comment(3)]})), 1)

    def test_copied_marker_does_not_suppress_processing(self):
        approval = comment()
        fake = comment(2, sammellauf.marker(issue(), approval), "visitor")
        self.assertEqual(len(self.select([issue()], {1: [approval, fake]})), 1)

    def test_api_paginates_without_truncating(self):
        with patch("sammellauf.subprocess.run") as run:
            run.return_value.stdout = '[[{"id":1}],[{"id":2}]]'
            self.assertEqual(len(sammellauf.api("endpoint", paginate=True)), 2)
            self.assertEqual(run.call_args.args[0][-2:], ["--paginate", "--slurp"])


class ApplyTests(unittest.TestCase):
    def test_improvement_form_is_not_a_data_suggestion(self):
        with self.assertRaises(uebernehmen.Problem):
            uebernehmen.read_form("### Worum geht es?\n\nEine Idee\n\n### Schritte und Beispiele\n\nBeispiel")

    def test_additional_quote_is_idempotent_after_partial_failure(self):
        fields = {"folge": "#1", "zitat": "Ein Test", "herkunft": "Person", "interpret": "Testperson"}
        columns, rows = sammlung.read_rows()
        rows = [dict(rows[0], folge_id="1")]
        first = uebernehmen.apply_quote(fields, columns, rows, "", True)
        self.assertTrue(first.changed)
        count = len(rows)
        second = uebernehmen.apply_quote(fields, columns, rows, "", True)
        self.assertFalse(second.changed)
        self.assertEqual(len(rows), count)

    def test_failed_form_does_not_write_partial_data(self):
        columns, rows = sammlung.read_rows()
        before = copy.deepcopy(rows)
        with patch("sammlung.read_rows", return_value=(columns, rows)), \
                patch("sammlung.write_rows") as write, \
                patch("uebernehmen.read_form", return_value=("folge", {"nummer": "nicht numerisch"})):
            results = uebernehmen.apply([issue()])
        self.assertFalse(results[0][1].close)
        self.assertEqual(rows, before)
        write.assert_not_called()

    def test_two_approved_issues_share_one_commit(self):
        issues = [dict(issue(), body="### Folge\n\n#1\n\n### Zitat\n\nTest"),
                  dict(issue(2), body="### Folge\n\n#2\n\n### Zitat\n\nTest")]
        outcomes = [(item, uebernehmen.Outcome(True, "OK", "Zitat übernehmen")) for item in issues]
        with patch("sammellauf.argparse.ArgumentParser.parse_args") as args, \
                patch("sammellauf.Path.read_text", return_value=json.dumps(issues)), \
                patch("sammellauf.uebernehmen.read_form", return_value=("zitat", {})), \
                patch("sammellauf.api", return_value=[[]]), \
                patch("sammellauf.uebernehmen.apply", side_effect=[[outcomes[0]], [outcomes[1]]]), \
                patch("sammellauf.uebernehmen.push", return_value=True) as push, \
                patch("sammellauf.subprocess.run") as run, \
                patch("builtins.print"), \
                patch.dict("os.environ", {"GITHUB_REPOSITORY": "test/repo", "GITHUB_REF_NAME": "main"}):
            args.return_value.offen = "issues.json"
            args.return_value.alle = True
            args.return_value.commit = True
            sammellauf.main()
        push.assert_called_once()
        self.assertIn("2 Vorschläge", push.call_args.args[0])
        self.assertEqual(run.call_count, 4)

    def test_real_dataset_has_valid_episode_metadata(self):
        _, rows = sammlung.read_rows()
        ids = set()
        for row in rows:
            with self.subTest(usage=row["verwendung_id"]):
                self.assertNotIn(row["verwendung_id"], ids)
                ids.add(row["verwendung_id"])
                self.assertIsNotNone(sammlung.episode_number(row["folge_id"]))
                date.fromisoformat(row["veroeffentlicht_am"])
                self.assertEqual(uebernehmen.clock(row["dauer"], "Länge"), row["dauer"])
                self.assertIsNotNone(sammlung.spotify_id(row["folge_url"], "episode"))
                self.assertTrue(row["folge_titel"])
                self.assertIn(row["pruefstatus"], {"offen", "vermutet", "bestätigt"})


if __name__ == "__main__":
    unittest.main()
