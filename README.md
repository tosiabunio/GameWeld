# GameWeld

Production management system for small, agile game development teams.

GameWeld is a web application that connects the intended scope of a game with the tasks needed to produce it. A prioritized backlog (MoSCoW) holds the production scope; each backlog item is broken down into Code, Assets, and Content tasks; and Workboards carry the current portion of work through to completion and acceptance.

## Status

Pre-implementation. The product and functional specification is a discussion draft (v0.1) and is being reviewed before implementation planning begins. No application code exists yet.

## Documents

| Document | Description |
| --- | --- |
| [Production specification v0.1](docs/gameweld-production-specification-v0.1.md) | Product purpose, terminology, data model, backlog and Workboard behavior, permissions, MVP acceptance scenarios, and open decisions. |
| [Specification review notes](docs/gameweld-spec-review-notes.md) | Review findings and gaps to fold into the specification's open decisions (Polish). |

## Key concepts

- **Backlog** — prioritized production scope using Must Have, Should Have, Could Have, and Won't Have.
- **Backlog Item** — a user-defined unit of intended production.
- **Breakdown** — an item's tasks, grouped by Code, Assets, and Content.
- **Workboard** — a board holding the current portion of work; may represent a sprint, week, milestone, or continuous period.
- **Ready for Review** — all constituent tasks are complete and the item awaits acceptance.

Roles in the first specification are **Game Director**, **Developer**, and **Tester**.

## Repository layout

```
docs/   Product specification and review notes
```

Application code, tooling, and contribution guidelines will be added once the specification is approved.

## License

This project is licensed under the [MIT License](LICENSE).
