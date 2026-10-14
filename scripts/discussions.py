"""GitHub Discussions als Formularvorschläge für den Wochenlauf lesen."""

import argparse
import json
import os
import subprocess
from datetime import datetime

import sammlung
import uebernehmen

CONFIG = sammlung.ROOT / ".github" / "kuratoren.json"


def config():
    value = json.loads(CONFIG.read_text(encoding="utf-8"))
    for key in ("kuratoren", "kategorien"):
        if not isinstance(value.get(key), list) or not all(isinstance(item, str) and item for item in value[key]):
            raise ValueError(f"{CONFIG}: {key} muss eine Liste nichtleerer Namen sein.")
    return value


def graphql(query, **variables):
    command = ["gh", "api", "graphql", "-f", f"query={query}"]
    for key, value in variables.items():
        if value is not None:
            command += ["-f", f"{key}={value}"]
    response = json.loads(subprocess.run(command, check=True, stdout=subprocess.PIPE, text=True).stdout)
    if response.get("errors"):
        raise RuntimeError(json.dumps(response["errors"], ensure_ascii=False))
    return response["data"]


def pages(query, variables, connection):
    cursor = None
    while True:
        data = graphql(query, **variables, cursor=cursor)
        page = connection(data)
        yield from page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            break
        cursor = page["pageInfo"]["endCursor"]
        if not cursor:
            raise RuntimeError("GitHub meldet eine Folgeseite ohne Cursor.")


AUTHOR = "author { login ... on User { databaseId } }"
DISCUSSIONS = """
query($owner:String!, $name:String!, $cursor:String) {
  repository(owner:$owner, name:$name) {
    discussions(first:100, after:$cursor, states:OPEN) {
      nodes {
        id number title body url createdAt lastEditedAt
        category { slug isAnswerable }
        AUTHOR
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
""".replace("AUTHOR", AUTHOR)
COMMENTS = """
query($id:ID!, $cursor:String) {
  node(id:$id) {
    ... on Discussion {
      comments(first:100, after:$cursor) {
        nodes { id databaseId body url createdAt lastEditedAt AUTHOR }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
""".replace("AUTHOR", AUTHOR)


def user(author):
    author = author or {}
    return {
        "login": author.get("login", ""),
        "id": author.get("databaseId"),
        "type": "User" if author.get("databaseId") else "Bot",
    }


def fetch(repo, with_comments=False):
    owner, name = repo.split("/", 1)
    categories = config()["kategorien"]
    records = []
    for discussion in pages(DISCUSSIONS, {"owner": owner, "name": name}, lambda data: data["repository"]["discussions"]):
        if discussion["category"]["slug"] not in categories:
            continue
        record = {
            "number": discussion["number"], "body": discussion["body"], "title": discussion["title"],
            "html_url": discussion["url"], "created_at": discussion["createdAt"],
            "edited_at": discussion["lastEditedAt"] or discussion["createdAt"],
            "user": user(discussion["author"]), "discussion_id": discussion["id"],
            "answerable": discussion["category"]["isAnswerable"],
        }
        if with_comments:
            record["_comments"] = [
                {
                    "id": comment["databaseId"], "node_id": comment["id"],
                    "body": comment["body"], "html_url": comment["url"], "created_at": comment["createdAt"],
                    "edited_at": comment["lastEditedAt"] or comment["createdAt"], "user": user(comment["author"]),
                }
                for comment in pages(COMMENTS, {"id": discussion["id"]}, lambda data: data["node"]["comments"])
            ]
        records.append(record)
    return records


def proposal(discussion, approval):
    """Eine Freigabe gilt nur für den verlinkten Kommentar derselben Discussion."""
    words = approval["body"].strip().split("\n", 1)[0].split()
    links = [word for word in words[1:] if word.startswith(("https://", "http://"))]
    if len(links) > 1:
        raise uebernehmen.Problem("Bitte genau einen Vorschlagskommentar verlinken.")
    source = discussion
    if links:
        source = next((comment for comment in discussion["_comments"] if comment["html_url"] == links[0]), None)
        if source is None:
            raise uebernehmen.Problem("Der Link muss auf einen Hauptkommentar dieser Discussion zeigen, nicht auf eine Antwort im Thread.")
    edited = datetime.fromisoformat(source["edited_at"].replace("Z", "+00:00"))
    approved = datetime.fromisoformat(approval["created_at"].replace("Z", "+00:00"))
    if edited > approved:
        raise uebernehmen.Problem("Der Vorschlag wurde nach der Freigabe geändert. Bitte erneut prüfen und `/approve` kommentieren.")
    return dict(discussion, body=source["body"], user=source["user"],
                answer_id=source.get("node_id"), source_url=source["html_url"])


def reply(discussion, body, close, answer_id=None):
    graphql("""
      mutation($id:ID!, $body:String!) {
        addDiscussionComment(input:{discussionId:$id, body:$body}) { comment { id } }
      }
    """, id=discussion["discussion_id"], body=body)
    if close:
        if answer_id and discussion["answerable"]:
            graphql("""
              mutation($id:ID!) {
                markDiscussionCommentAsAnswer(input:{id:$id}) { discussion { id } }
              }
            """, id=answer_id)
        graphql("""
          mutation($id:ID!) {
            closeDiscussion(input:{discussionId:$id, reason:RESOLVED}) { discussion { id } }
          }
        """, id=discussion["discussion_id"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comments", action="store_true")
    args = parser.parse_args()
    print(json.dumps(fetch(os.environ["GITHUB_REPOSITORY"], args.comments), ensure_ascii=False))
