# GameWeld

Production management system for small, agile game development teams.

GameWeld is a web application that connects the intended scope of a game with the tasks needed to produce it. A prioritized backlog (MoSCoW) holds the production scope; each backlog item is broken down into Code, Assets, and Content tasks; and Workboards carry the current portion of work through to completion and acceptance.

## Try it

A demonstration instance runs at **[gameweld.eu](https://gameweld.eu)**. No account is needed: pick a persona on the sign-in page (Dana Director, Devin Developer, or Tess Tester) and you are in, with the rights of that role. "Switch persona" in the header goes back to the picker, so you can see the same project as a Game Director, a Developer, and a Tester in one browser.

It holds two sample projects:

- **Demo**, a small project with items in every Backlog lane, tasks in every Workboard column, comments, and pictures.
- **Lanternfall**, a project at the size of a real game: about 175 Backlog items, some 600 tasks, eight months of accepted work, and an active Workboard. Its Overview shows what a project looks like well into production.

Keep in mind:

- **It is open to everyone.** Anyone can sign in as any persona and change anything, so what you see may have been changed by other visitors, and what you enter is visible to them.
- **Do not enter real or private data.** The instance is for demonstration, has no backups, and its data may be reset to the samples at any time.
- It runs the latest build of `main`, so it can change from one day to the next.

[The GameWeld method](https://gameweld.eu/method) explains the way of working GameWeld is built for, in English and in Polish, without signing in.

## What it does

- **Backlog** in Must Have, Should Have, Could Have, and Won't Have lanes, with the Done items by time of acceptance.
- **Breakdown** of each item into Code, Assets, and Content tasks.
- **Workboard** with custom columns, a scope limit, a priority rule, and requests for out-of-scope work that a Game Director approves.
- **Acceptance**: an item whose tasks are all complete is Ready for Review, and reopening a task withdraws the acceptance.
- **Overview** of each project: figures, progress by priority and kind of work, and a map of the Backlog.
- **Everyday board tools**: dragging by pointer, touch, and keyboard; "My tasks"; notifications; live updates; Markdown with @mentions; checklists; labels, a "blocked" flag, and dates; covers and attachments; filters and quick open (Cmd+K / Ctrl+K); a full activity history; dark mode; a phone layout.
- **Import from Trello** and export of a whole project.
- **English and Polish** interface.
- **For scripts and AI assistants**: API tokens, an OpenAPI description, an MCP server, and a Claude Code plugin (below).

## Using it with an AI assistant

Every instance serves a [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp`, so Claude or any other MCP client can read a project and work in it as the member whose token it uses, under the same permissions. Make a token in your profile, which also shows the commands for Claude Code. For the demo instance:

```sh
claude mcp add --transport http --scope user gameweld https://gameweld.eu/api/mcp \
  --header "Authorization: Bearer gw_…"
```

A GameWeld skill for Claude Code teaches the assistant the vocabulary, the rules, and common jobs such as breaking an item down into tasks or writing the week's summary. Install it from the instance, or from this repository:

```text
/plugin marketplace add https://gameweld.eu/api/claude/marketplace.json
/plugin install gameweld@gameweld
```

See [The API](docs/api.md) for tokens, the tools the MCP server offers, and what stays with people.

## Status

GameWeld is in active development by one author and has not been released. Phases 0 to 7 of the [implementation plan](docs/gameweld-implementation-plan.md) are built: projects and permissions, the Backlog, breakdowns, the Workboard, acceptance, out-of-scope requests, collaboration, and history. Of Phase 8, Google sign-in by invitation and continuous deployment are built; backups are not yet. There is no tagged release, and the database schema may still change between commits (migrations are applied automatically).

The [roadmap](docs/roadmap.md) lists what is still missing next to Trello, Planka, Wekan, Taiga, and Plane, and a proposed order.

## Running your own instance

### Locally

You need Docker (on macOS, [OrbStack](https://orb.stack) or Docker Desktop), `make`, and Node.js 22 or newer.

```
git clone https://github.com/tosiabunio/GameWeld.git
cd GameWeld
make up
```

Builds and starts the application with a PostgreSQL database, seeds the Demo project, and prints the URL (http://localhost:8090). Sign-in uses the same personas as the demo. See [Running GameWeld locally](docs/running-locally.md) for the other commands, and `make test` to run the whole test suite.

### On a server

The image `ghcr.io/tosiabunio/gameweld` is published from every green build of `main`. It needs PostgreSQL and a volume for attachments. For a team, set up [Google sign-in](docs/google-sign-in.md): access is then by invitation only, and the persona sign-in is refused. [Deployment](docs/deployment.md) lists the environment for a team or a demonstration instance, and [the backup plan](docs/backup-plan.md) what to set up before the instance holds data worth keeping.

## Documents

| Document | Description |
| --- | --- |
| [The GameWeld method](docs/methodology.md) | The way of working GameWeld supports: a game that always works, built in layers; the MoSCoW Backlog; Code, Assets, and Content; who decides what; and how a layer is finished. For teams deciding whether to use GameWeld. The application shows it at `/method`, in English and in Polish ([docs/methodology.pl.md](docs/methodology.pl.md)). |
| [Running GameWeld locally](docs/running-locally.md) | Starting, stopping, resetting, and testing a local instance with `make`. |
| [Google sign-in](docs/google-sign-in.md) | Setting up sign-in with Google for an instance, invitations, troubleshooting, and the admin recovery commands. |
| [The API](docs/api.md) | API tokens for scripts and assistants, calling the API, the MCP server, the Claude Code skill, and the OpenAPI description at `/api/openapi.json`. |
| [Deployment](docs/deployment.md) | What a server instance needs, its environment for a team or a demo, the sample data, and continuous deployment. |
| [Backup plan](docs/backup-plan.md) | What to set up before an instance holds data worth keeping. |
| [Production specification v0.2](docs/gameweld-production-specification-v0.2.md) | Product purpose, terminology, data model, backlog and Workboard behavior, permissions, MVP acceptance scenarios, and recorded decisions. |
| [Specification review notes](docs/gameweld-spec-review-notes.md) | Review findings and gaps to fold into the specification's open decisions (Polish). |
| [Implementation plan](docs/gameweld-implementation-plan.md) | Assumed decisions, proposed technical baseline, architecture and invariants, phased delivery mapped to the acceptance scenarios, test strategy, and risks. |
| [Roadmap](docs/roadmap.md) | What is still missing next to Trello, Planka, Wekan, Taiga, and Plane, checked against the code, with a proposed order. A proposal, not a decision. |
| [Long Backlog lanes](docs/backlog-scaling-plan.md) | How the Backlog copes with hundreds of items, and a Done lane that only grows, without archiving them: a window of recently accepted items, lanes that scroll on their own, and paging. Built 22 September 2026, with where the build differs from the plan. |

## Key concepts

- **Backlog** — prioritized production scope using Must Have, Should Have, Could Have, and Won't Have.
- **Backlog Item** — a user-defined unit of intended production.
- **Breakdown** — an item's tasks, grouped by Code, Assets, and Content.
- **Workboard** — a board holding the current portion of work; may represent a sprint, week, milestone, or continuous period.
- **Ready for Review** — all constituent tasks are complete and the item awaits acceptance.

Roles in the first specification are **Game Director**, **Developer**, and **Tester**.

## Repository layout

```
apps/api/          Fastify API, domain services, MCP server, SQL migrations, integration tests
apps/web/          React client built with Vite
packages/domain/   Shared types, permission matrix, personas, unit tests
e2e/               Browser tests for the specification's acceptance scenarios
plugins/gameweld/  The GameWeld skill for Claude Code, served as a plugin
scripts/           Sample-data scripts for the demo instance
docs/              Method, specification, plans, and guides
compose.yml        Local stack; driven by the Makefile
Dockerfile         Application image (API plus built client)
```

## Feedback and contributing

Bug reports and ideas are welcome as [GitHub issues](https://github.com/tosiabunio/GameWeld/issues). If you tried the demo, say which project and persona you used. Before a pull request larger than a fix, open an issue first: the rules GameWeld enforces come from the [specification](docs/gameweld-production-specification-v0.2.md), and a change to them belongs there too. `make test` runs the unit, integration, and browser tests; CI also runs `npm run lint` and `npm run typecheck`.

## License

This project is licensed under the [MIT License](LICENSE).
