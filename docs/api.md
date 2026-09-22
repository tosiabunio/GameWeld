# The API

The web application talks to the server through an HTTP API. Anything else can use the same API:
a script, a report, or an AI assistant. This page covers how to get access, what that access
allows, and where the API is described.

In short: make a token in your profile, send it as `Authorization: Bearer gw_…`, and read the
description at `/api/openapi.json` on your instance. An AI assistant connects to the MCP server
at `/api/mcp` with the same token.

## Getting a token

1. Open your profile: your name or picture in the top bar.
2. Under **API tokens**, give the token a name that says where it will live, such as
   "Claude on my laptop" or "Nightly report", and choose **Read only** or **Read and write**.
3. Choose **Make a token**, and copy it before you choose **Done**. **It is shown this once.**
   GameWeld keeps only a hash of it, so a lost token cannot be shown again; make another.

What a token may do:

- **It acts as you.** It sees the projects you see and may do what your roles allow, no more. If
  a Game Director takes a role from you, the token loses it too.
- **Read only** is for looking: GET requests only. Anything else is refused with 403 and "This
  API token can only read".
- **Read and write** may do everything you can do in the app, except manage tokens. Making,
  listing, and revoking tokens needs the app, so a token that leaks cannot make itself another.
- **What it changes is yours, and says so.** The history shows the change as made by you "via
  Claude on my laptop", and the notifications it causes say the same. That is why the name
  matters.
- **Revoke** it in the same place. It stops working at once. The history keeps what was done
  with it, under the name it had.
- The list shows when each token was last used, to the minute, so a forgotten one stands out.
  One person may have 25 tokens at a time.

Keep a token as you would a password: in a password manager or the secret store of whatever
uses it, and not in a file that gets committed or shared.

## Calling the API

```sh
TOKEN=gw_…
curl -H "Authorization: Bearer $TOKEN" https://gameweld.eu/api/projects
```

Changing something works the same way, with a JSON body:

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title": "Boss arena lighting", "category": "should"}' \
  https://gameweld.eu/api/projects/<project id>/backlog
```

A few conventions hold across the API:

- **Rules are the server's.** A change the rules do not allow is refused: the scope limit, what
  may come into scope, who may complete a task, and nothing left stranded. The same rules apply to the
  app and to a token.
- **Refusals say why** in `{ "message": "…" }`, in English: 400 for invalid input (with
  `details` naming the fields), 401 without a working token, 403 without the permission, 404
  for what does not exist or is in a project you are not in, 409 when the current state does not
  allow it.
- **Updates carry a version.** A project, item, task, Workboard, or column is changed with the
  `version` it was read at. If someone changed it since, the answer is 409 and nothing changes:
  read it again and decide.
- **Lists are ordered** as the app shows them. Reordering takes `afterId` and `beforeId`: the
  thing goes between them, or to the end with neither.
- `GET /api/events` is a stream of server-sent events saying _that_ something changed, for a
  client that wants to follow along.
- **The Backlog in parts:** `GET /api/projects/{projectId}/backlog` takes `state` (such as
  `done`, or `open,ready_for_review`), and `acceptedSince` and `acceptedBefore` for Done items
  by when they were accepted, which each Done item carries as `acceptedAt`. Done only grows, so
  a report of what was accepted this month asks for `state=done&acceptedSince=2026-09-01`.
- **History for analysis:** `GET /api/projects/{projectId}/activity` takes `from`, `to`,
  `actorId`, `actions` (such as `task.moved,item.rejected`, or `task.*`), and `before` to page
  back. `GET /api/projects/{projectId}/column-stays` lists how long each card stayed in each
  column.

## Connecting an AI assistant (MCP)

GameWeld serves a [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp`
on every instance, for Claude and any other assistant that speaks MCP over streamable HTTP. The
assistant uses your token, so it acts as you: it sees your projects and may do what your roles
allow.

For Claude Code, the profile shows the command when you make a token. It is:

```sh
claude mcp add --transport http --scope user gameweld https://gameweld.eu/api/mcp \
  --header "Authorization: Bearer gw_…"
```

`--scope user` makes GameWeld available in every folder you run Claude Code in; leave it out
for the current folder only. Another client needs the same two things: the address, and the
`Authorization` header with the token.

What the tools do:

- **Read:** your projects and their members, the project's overview (its figures and every item's
  progress, as the Overview page shows them), the Backlog (with the Done items accepted in the
  last 30 days, or since a date you give, and a count of the older ones), an item with its
  breakdown, a task, the Workboard with its scope and columns, "My tasks", what waits for your
  decision, and search.
- **Analyse:** the history, filtered by time, person, action, or one item, task, or board; and
  how long cards stayed in each column, in hours.
- **Change:** add and edit Backlog items and reprioritise them, break an item down into tasks,
  edit a task (assignee, labels, due date, blocked and why), add checklist steps, complete or
  reopen a task, bring an item into the Workboard's scope, put a task on the board, move a card
  by its column's name, comment, and ask for out-of-scope work.

Deleting, archiving, accepting items, deciding on requests, and managing members and boards are
left to people in the app. With a read-only token, the assistant is offered only the tools that
read.

Each tool calls the same routes as the app, as you, so the rules and permissions are the same,
and a refusal comes back to the assistant with the same reason. Everything it changes is in the
history as yours "via" the token's name.

### The GameWeld skill

The tools say what they do; the skill says how GameWeld works and how to do the common jobs
well: the vocabulary and the rules (scope and its limit, review), how to break an item down
into Code, Assets, and Content tasks, how to write the week's summary from the history, and how
to find where work waits. It also tells the assistant to propose before changing several things,
and to take a refusal as the rules speaking rather than work around it.

Every instance serves it as a Claude Code plugin, so anyone who can reach the instance can
install it. In Claude Code (the profile shows these with the instance's address when you make a
token):

```text
/plugin marketplace add https://gameweld.eu/api/claude/marketplace.json
/plugin install gameweld@gameweld
```

The marketplace names the plugin's zip, `/api/claude/gameweld.zip`, by its SHA-256 digest, and
the digest serves as its version: when an upgrade of the instance changes the skill, Claude Code
sees an update. Claude Code downloads plugins only over HTTPS, so an instance on plain HTTP, such
as one on localhost, cannot serve it; there, add this repository as the marketplace instead
(`/plugin marketplace add tosiabunio/GameWeld`, which needs read access to it), or copy
[plugins/gameweld/skills/gameweld](../plugins/gameweld/skills/gameweld) to
`~/.claude/skills/gameweld`.

The skill needs the MCP server connected as above, or it falls back to the HTTP API with a token.

## The description

`/api/openapi.json` on any instance, for example <https://gameweld.eu/api/openapi.json>, is an
[OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) description of every route: what it is for,
its parameters, the body it takes, what it answers, and the permission it needs (in its
description and as `x-permission`). It needs no sign-in, and it always matches the version the
instance runs, because it is put together from the routes themselves.

Load it into any OpenAPI viewer or client generator, or give it to an assistant. Each operation
has a stable `operationId`, such as `createItem` or `moveCard`.

## Keeping the description right

For whoever changes the API. The description cannot drift from the code without a test failing:

- **Every route under `/api` describes itself** with a `RouteDoc`, passed to `projectRoute`,
  `memberRoute`, `sessionRoute`, or `publicRoute` beside its handler. The server refuses to
  start if a route has none. Browser-only sign-in steps are marked `hidden`.
- **Request bodies are the handler's own zod schemas**, the same objects the handler parses
  with. Query parameters are declared in the `RouteDoc`; the few handlers that read them by hand
  must be kept to that.
- **Responses are described by `apps/api/src/schemas.ts`.** Each schema there is held to the
  domain type the handlers return: `exact<T>()` does not compile unless both describe the same
  values. A field added to a domain type must be added to its schema.
- **Every JSON response in the test suite is checked** against the schema its route declares,
  and so is its status. A mismatch fails the test that caused it, with a 500 that names the
  route and the problem. This runs whenever `APP_ENV=test`, in the API tests and the browser
  tests alike.
- `apps/api/test/openapi.test.ts` validates the document against the OpenAPI 3.1 schema, checks
  that every route is in it once, and that every reference in it resolves.
