import contextlib
import json
import sys
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import discussions
import sammellauf
import uebernehmen
import vorschlaege

BODY = """### Folge

#288

### Zitat

Kurze Beschreibung

### Woher stammt das Zitat?

Person

### Woher, wenn es kein Song ist

Testperson
"""
URL = "https://github.com/test/repo/discussions/10"


def discussion():
    return {
        "number": 10, "body": BODY, "created_at": "2026-10-01T00:00:00Z",
        "edited_at": "2026-10-01T00:00:00Z", "discussion_id": "D_10",
        "html_url": URL, "user": {"login": "author", "id": 1, "type": "User"},
        "answerable": True, "_comments": [],
    }


def comment(body="/approve", number=20, login="curator"):
    return {
        "id": number, "node_id": f"DC_{number}", "body": body,
        "html_url": f"{URL}#discussioncomment-{number}",
        "created_at": "2026-10-02T00:00:00Z", "edited_at": "2026-10-02T00:00:00Z",
        "user": {"login": login, "id": 2, "type": "User"},
    }


class ProposalTests(unittest.TestCase):
    def test_approval_without_link_uses_opening_post(self):
        proposal = discussions.proposal(discussion(), comment())
        self.assertEqual(proposal["body"], BODY)
        self.assertIsNone(proposal["answer_id"])

    def test_approve_all_keeps_creation_time_boundary_for_discussions(self):
        first = discussion()
        later = dict(discussion(), number=11, created_at="2026-10-03T00:00:00Z")
        selected = sammellauf.select(
            [first, later], {10: [comment("/approve all")], 11: []}, lambda _: True,
        )
        self.assertEqual([entry[0]["number"] for entry in selected], [10])

    def test_approval_uses_exact_link_and_credits_proposal_author(self):
        record = discussion()
        source = comment(BODY.replace("Testperson", "Andere Person"), 19, "helper")
        record["_comments"] = [source]
        result = discussions.proposal(record, comment(f"/approve {source['html_url']} unsure"))
        self.assertIn("Andere Person", result["body"])
        self.assertEqual(result["user"]["login"], "helper")
        self.assertEqual(result["answer_id"], source["node_id"])
        self.assertIn("helper", uebernehmen.commit_message([(result, uebernehmen.Outcome(True, "OK", "Zitat"))]))

    def test_foreign_links_and_nested_replies_are_rejected(self):
        for link in ["https://github.com/other/repo/discussions/10#discussioncomment-19",
                     f"{URL}#discussioncomment-999"]:
            with self.subTest(link=link), self.assertRaises(uebernehmen.Problem):
                discussions.proposal(discussion(), comment(f"/approve {link}"))

    def test_multiple_links_are_rejected(self):
        with self.assertRaises(uebernehmen.Problem):
            discussions.proposal(discussion(), comment(f"/approve {URL} {URL}"))

    def test_content_edited_after_approval_needs_new_approval(self):
        record = discussion()
        record["edited_at"] = "2026-10-03T00:00:00Z"
        with self.assertRaisesRegex(uebernehmen.Problem, "nach der Freigabe"):
            discussions.proposal(record, comment())

    def test_linked_comment_edited_after_approval_needs_new_approval(self):
        record = discussion()
        source = comment(BODY, 19)
        source["edited_at"] = "2026-10-03T00:00:00Z"
        record["_comments"] = [source]
        with self.assertRaises(uebernehmen.Problem):
            discussions.proposal(record, comment(f"/approve {source['html_url']}"))

    def test_accepted_answer_alone_is_not_an_approval(self):
        record = dict(discussion(), answer={"body": BODY}, answerChosenBy={"login": "author"})
        self.assertEqual(sammellauf.select([record], {10: [comment(BODY)]}, lambda _: True), [])

    def test_untrusted_approve_does_not_import(self):
        self.assertEqual(sammellauf.select([discussion()], {10: [comment()]}, lambda _: False), [])

    def test_marker_tracks_only_referenced_proposal_not_unrelated_conversation(self):
        record = discussion()
        source = comment(BODY, 19)
        record["_comments"] = [source]
        approval = comment(f"/approve {source['html_url']}")
        first = sammellauf.marker(record, approval)
        record["_comments"].append(comment("Noch eine Frage", 30))
        self.assertEqual(first, sammellauf.marker(record, approval))
        source["body"] += "\nKorrektur"
        self.assertNotEqual(first, sammellauf.marker(record, approval))

    def test_graphql_bot_login_prevents_repeated_failure_comments(self):
        record = discussion()
        approval = comment()
        reply = comment(sammellauf.marker(record, approval), 30, "github-actions")
        reply["user"] = discussions.user({"login": "github-actions"})
        self.assertEqual(reply["user"]["type"], "Bot")
        record["_comments"] = [approval, reply]
        self.assertEqual(sammellauf.select([record], {10: record["_comments"]}, lambda _: True), [])

    def test_pending_discussions_use_discussion_url(self):
        entries = vorschlaege.pending([discussion()])
        self.assertEqual(entries, [{"folge": 288, "issue": 10, "url": URL, "art": "zitat"}])


class ApiTests(unittest.TestCase):
    def test_all_pages_are_read(self):
        values = [
            {"nodes": [1], "pageInfo": {"hasNextPage": True, "endCursor": "next"}},
            {"nodes": [2], "pageInfo": {"hasNextPage": False, "endCursor": None}},
        ]
        with patch("discussions.graphql", side_effect=values) as api:
            self.assertEqual(list(discussions.pages("query", {"id": "D_10"}, lambda data: data)), [1, 2])
        self.assertEqual(api.call_args.kwargs["cursor"], "next")

    def test_graphql_errors_are_not_treated_as_empty_data(self):
        with patch("discussions.subprocess.run") as run:
            run.return_value.stdout = '{"errors":[{"message":"Forbidden"}],"data":null}'
            with self.assertRaisesRegex(RuntimeError, "Forbidden"):
                discussions.graphql("query")

    def test_invalid_curator_configuration_fails(self):
        with patch("pathlib.Path.read_text", return_value='{"kuratoren":"everyone","kategorien":[]}'):
            with self.assertRaisesRegex(ValueError, "kuratoren"):
                discussions.config()

    def test_missing_pagination_cursor_fails(self):
        with patch("discussions.graphql", return_value={
            "nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": None},
        }):
            with self.assertRaisesRegex(RuntimeError, "Cursor"):
                list(discussions.pages("query", {}, lambda data: data))

    def test_only_allowed_categories_are_loaded_and_comments_normalized(self):
        entry = {
            "id": "D_10", "number": 10, "title": "Zitat", "body": BODY, "url": URL,
            "createdAt": "2026-10-01T00:00:00Z", "lastEditedAt": None,
            "category": {"slug": "q-a", "isAnswerable": True},
            "author": {"login": "author", "databaseId": 1},
        }
        source = {
            "id": "DC_19", "databaseId": 19, "body": BODY, "url": f"{URL}#discussioncomment-19",
            "createdAt": entry["createdAt"], "lastEditedAt": None, "author": entry["author"],
        }
        with patch("discussions.pages", side_effect=[
            [entry, dict(entry, category={"slug": "polls", "isAnswerable": False})], [source],
        ]):
            result = discussions.fetch("test/repo", with_comments=True)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["_comments"][0]["id"], 19)
        self.assertEqual(result[0]["user"]["type"], "User")

    def test_reply_marks_selected_answer_then_closes(self):
        with patch("discussions.graphql") as api, patch("discussions.time.sleep"):
            discussions.reply(discussion(), "Übernommen", True, "DC_19")
        self.assertEqual(api.call_count, 3)
        self.assertIn("markDiscussionCommentAsAnswer", api.call_args_list[1].args[0])
        self.assertIn("closeDiscussion", api.call_args_list[2].args[0])

    def test_non_answerable_categories_are_closed_without_marking_answer(self):
        with patch("discussions.graphql") as api, patch("discussions.time.sleep"):
            discussions.reply(dict(discussion(), answerable=False), "Übernommen", True, "DC_19")
        self.assertEqual(api.call_count, 2)
        self.assertIn("closeDiscussion", api.call_args_list[1].args[0])

    def test_failed_suggestion_is_not_marked_or_closed(self):
        with patch("discussions.graphql") as api, patch("discussions.time.sleep"):
            discussions.reply(discussion(), "Bitte korrigieren", False, "DC_19")
        self.assertEqual(api.call_count, 1)

    def test_deleted_author_is_not_a_curator(self):
        self.assertEqual(discussions.user(None)["login"], "")


class BatchTests(unittest.TestCase):
    def run_batch(self, record, apply_result):
        args = Namespace(offen="offen.json", alle=False, discussions=True, commit=True)
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch("sammellauf.argparse.ArgumentParser.parse_args", return_value=args))
            stack.enter_context(patch("sammellauf.Path.read_text", return_value=json.dumps([record])))
            stack.enter_context(patch("discussions.config", return_value={"kuratoren": ["Curator"]}))
            api = stack.enter_context(patch("sammellauf.api"))
            apply = stack.enter_context(patch("uebernehmen.apply", return_value=apply_result))
            push = stack.enter_context(patch("uebernehmen.push", return_value=True))
            reply = stack.enter_context(patch("discussions.reply"))
            stack.enter_context(patch("builtins.print"))
            stack.enter_context(patch.dict("os.environ", {"GITHUB_REPOSITORY": "test/repo", "GITHUB_REF_NAME": "main"}))
            sammellauf.main()
        return api, apply, push, reply

    def test_configured_curator_can_approve_without_repository_write_access(self):
        record = discussion()
        record["_comments"] = [comment()]
        api, apply, push, reply = self.run_batch(record, [(record, uebernehmen.Outcome(True, "Übernommen", "Zitat"))])
        api.assert_not_called()
        apply.assert_called_once()
        push.assert_called_once()
        reply.assert_called_once()
        self.assertNotIn("sammellauf:", reply.call_args.args[1])

    def test_stale_approval_leaves_discussion_open_with_explanation(self):
        record = discussion()
        record["edited_at"] = "2026-10-03T00:00:00Z"
        record["_comments"] = [comment()]
        _, apply, push, reply = self.run_batch(record, [])
        apply.assert_not_called()
        push.assert_not_called()
        self.assertFalse(reply.call_args.args[2])
        self.assertIn("nach der Freigabe", reply.call_args.args[1])

    def test_unapproved_discussions_are_left_untouched(self):
        api, apply, push, reply = self.run_batch(discussion(), [])
        api.assert_not_called()
        apply.assert_not_called()
        push.assert_not_called()
        reply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
