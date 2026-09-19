# GameWeld

Production management system for small, agile game development teams.

GameWeld is a web application that connects the intended scope of a game with the tasks needed to produce it. A prioritized backlog (MoSCoW) holds the production scope; each backlog item is broken down into Code, Assets, and Content tasks; and Workboards carry the current portion of work through to completion and acceptance.

## Status

Phase 0 (foundation) in progress. The product and functional specification (v0.2) is the implementation baseline; delivery follows the implementation plan.

## Documents

| Document | Description |
| --- | --- |
| [Production specification v0.2](docs/gameweld-production-specification-v0.2.md) | Product purpose, terminology, data model, backlog and Workboard behavior, permissions, MVP acceptance scenarios, and recorded decisions. |
| [Specification review notes](docs/gameweld-spec-review-notes.md) | Review findings and gaps to fold into the specification's open decisions (Polish). |
| [Implementation plan](docs/gameweld-implementation-plan.md) | Assumed decisions, proposed technical baseline, architecture and invariants, phased delivery mapped to the acceptance scenarios, test strategy, and risks. |
| [Roadmap](docs/roadmap.md) | What is still missing next to Trello, Planka, Wekan, Taiga, and Plane, checked against the code, with a proposed order. A proposal, not a decision. |

## Key concepts

- **Backlog** — prioritized production scope using Must Have, Should Have, Could Have, and Won't Have.
- **Backlog Item** — a user-defined unit of intended production.
- **Breakdown** — an item's tasks, grouped by Code, Assets, and Content.
- **Workboard** — a board holding the current portion of work; may represent a sprint, week, milestone, or continuous period.
- **Ready for Review** — all constituent tasks are complete and the item awaits acceptance.

Roles in the first specification are **Game Director**, **Developer**, and **Tester**.

## Running locally

```
make up
```

Builds and starts the application with a PostgreSQL database under Docker (OrbStack on macOS), seeds a demo project, and prints the URL. See [Running GameWeld locally](docs/running-locally.md) for the other commands, and `make test` to run the whole test suite.

## Repository layout

```
apps/api/          Fastify API, domain services, SQL migrations, integration tests
apps/web/          React client built with Vite
packages/domain/   Shared types, permission matrix, personas, unit tests
e2e/               Browser tests for the specification's acceptance scenarios
docs/              Specification, implementation plan, review notes, running guide
compose.yml        Local stack; driven by the Makefile
Dockerfile         Application image (API plus built client)
```

## License

This project is licensed under the [MIT License](LICENSE).
