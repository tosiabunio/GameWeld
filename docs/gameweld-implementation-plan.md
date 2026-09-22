# GameWeld — Implementation Plan

Version 0.1 · 16 September 2026

**Basis:** [Production specification v0.2](gameweld-production-specification-v0.2.md) and the [specification review notes](gameweld-spec-review-notes.md).

**Status:** proposal. Section 2 lists the decisions this plan assumes; each one is a starting point taken from the specification's "Recommended starting point" column or from the review notes, not an approved decision. Confirming or changing them is the first step of the plan.

## 1. Goal and scope

Deliver the MVP described in Sections 3, 15, and 16 of the specification: a self-hosted web application in which a Game Director manages a MoSCoW backlog, the team breaks items into Code, Assets, and Content tasks, one active Workboard per project carries the work, and items move through Ready for Review to accepted Done.

The plan is organized so that every phase ends with something demonstrable and testable against the Section 15 acceptance scenarios. Phases are ordered by dependency: nothing in a later phase is needed to demonstrate an earlier one.

Out of scope for the MVP, as in the specification: bug tracking, estimates, structured acceptance criteria, engine or source-control integration, automation rules, reporting, resource scheduling, and multiple active Workboards.

## 2. Decisions assumed by this plan

The plan adopts the following defaults so that design and implementation can start. Each row must be confirmed or overturned in the kickoff review (Phase 0). Rows D1–D12 come from specification Section 16; R1–R7 come from the review notes.

| ID | Decision | Assumed answer |
| --- | --- | --- |
| D1 | Active Workboards per project | One. The data model supports several; the UI and rules enforce one. |
| D2 | Out-of-scope placement | Developers submit a request; Directors approve or place directly. |
| D3 | Task creation, editing, reparenting | Developers create and edit tasks; Directors authorize reparenting and archival. |
| D4 | Accepted work changes | Adding or reopening an unfinished task reopens the parent; earlier acceptance stays in history. |
| D5 | Who accepts items | Directors by default; a separate acceptance permission can be granted per project. |
| D6 | Scope-limit counting | All included items count until they are accepted or the Director removes them from scope. Revised 2026-09-18; before, accepted items stayed until removed. |
| D7 | Full-item activation outside priority rule | Not supported in the MVP; use individual out-of-scope tasks. |
| D8 | New tasks under an active item | Placed automatically while the item is in scope (revised in testing after Phase 7); "Add to Workboard" remains for returned tasks. |
| D9 | Dependencies | Informational item-to-item links only. |
| D10 | Teams and projects | Deferred: the MVP uses project membership only. A Team entity is not implemented until a concrete need appears. |
| D11 | Reopening completed tasks | Task editors may reopen, with a visible warning about the effect on the parent's acceptance. |
| D12 | Board archival with unfinished tasks | Blocked until each unfinished task is explicitly returned to Breakdown. |
| R1 | Task completion state | Stored on the task as an explicit `completed` flag with timestamp and actor, set on entering Done, cleared on leaving it. Column position alone is not the source of truth. |
| R2 | Leaving Done under a Done restriction | Requires the same permission as entering Done. |
| R3 | Accepted items in scope | Acceptance removes the item from the active Workboard's scope with all its tasks, which frees its place under the limit (D6). Archived Workboards keep them and mark accepted items distinctly. Revised 2026-09-18. |
| R4 | Out-of-scope task visibility | The Workboard header shows the item count against the limit and, separately, the out-of-scope task count. |
| R5 | Removing an item from scope while a task is in an intermediate column | The task returns to Breakdown and its column position is discarded; re-placement starts in To Do. History records the previous column. |
| R6 | Activation asymmetry | Withdrawn with the D8 revision. |
| R7 | Source of truth for permissions | The permission table in Section 4 is authoritative once D2 is confirmed; Section 16 will reference it rather than restate it. |
| T1 | Authentication | Mock sign-in for Phases 0–7: a persona picker with seeded Director, Developer, and Tester accounts, available only in local and test configurations. Real sign-in arrives in Phase 8 as OpenID Connect with Google as the only configured provider, no local accounts, no domain restriction, and access by per-project invitation only: any account from any configured provider can be invited by e-mail address. Identities are stored as provider and subject from the start, so the mock provider and Google are two entries in the same model. |
| T2 | Attachment storage | Local filesystem volume in the MVP, behind an interface that also supports S3-compatible storage. Card covers are served as 800×450 WebP renditions made with sharp on first request and kept beside the original; they can be deleted at any time and are made again, so backups may skip them. |
| T3 | Running work-in-progress builds | On the development Mac under OrbStack, through single-command scripts in the repository (Section 3.1). No image registry, watcher, or remote host until Phase 8. |

## 3. Technical baseline — Proposed

The specification leaves the stack open. The plan proposes the following as a default that fits a small team, a single-container deployment, and a relational, transaction-heavy domain. It should be confirmed in Phase 0; any equivalent stack works with the rest of the plan unchanged.

| Concern | Proposal | Reason |
| --- | --- | --- |
| Language | TypeScript across server and client | One language, shared domain types and validation between API and UI. |
| Server | Node.js HTTP API with a thin framework (for example Fastify) | Straightforward request handling; all rules live in explicit service functions, not framework magic. |
| Client | React single-page application built with Vite | Board and drag-and-drop UI benefit from a component model; no server rendering needed for an internal tool. |
| Database | PostgreSQL | Transactions, row locking, and constraints are central to the invariants in Section 4 of this plan. |
| Data access | SQL-first with a typed query layer and versioned migrations | Invariants are easier to enforce and audit in explicit SQL than through an ORM's implicit behavior. |
| Attachments | Storage interface with a filesystem implementation | See T2. |
| Deployment | Docker Compose: app, PostgreSQL, attachment volume; reverse proxy with TLS added in Phase 8 | Specification Section 14. The same Compose file serves the local Mac and, later, production. |
| Testing | Unit tests for domain rules, API integration tests against a real PostgreSQL, browser end-to-end tests for the Section 15 scenarios | Most defects will be rule interactions; those need database-backed tests. |
| CI | GitHub Actions: lint, type-check, unit, integration, end-to-end, image build | Every commit to `main` is proven buildable and tested. Publishing images to a registry is a Phase 8 addition. |

**Repository layout**

```
apps/api/        HTTP API, domain services, migrations
apps/web/        React client
packages/domain/ Shared types, permission matrix, validation schemas
deploy/          Docker Compose files, reverse proxy config, backup scripts
docs/            Specification, plan, operations guide
Makefile         Single-command entry points (Section 3.1)
```

### 3.1 Running work-in-progress builds on the development Mac

The person testing progress should not need Docker knowledge. OrbStack provides the `docker` and `docker compose` commands; everything else is hidden behind a handful of `make` targets in the repository root. Each target prints what it did and the URL to open.

| Command | What it does |
| --- | --- |
| `make up` | Builds the application image from the current source, starts the app and PostgreSQL containers, runs pending migrations, seeds demo data if the database is empty, and prints `http://localhost:8090` (the port is configurable through `APP_PORT`). Safe to run repeatedly: it rebuilds and restarts only what changed. |
| `make down` | Stops the containers. Data is kept. |
| `make reset` | Stops the containers, deletes the database and attachment volumes, and starts fresh with seed data. Used when a migration changes shape during development or when a clean state is wanted for a walkthrough. |
| `make logs` | Follows application logs, for when something looks wrong. |
| `make test` | Runs unit, integration, and browser end-to-end tests against a throwaway database, without touching the running instance. |
| `make status` | Shows whether the stack is running, the current image build time, and the migration version. |

Supporting rules:

- **Seed data** creates the three personas from T1 and a demo project with the Section 17 worked example (Ranged enemy, Flying enemy, September production board), so every fresh instance is immediately usable.
- **Mock sign-in** is the landing page in local configuration: pick Director, Developer, or Tester and you are in. Switching persona is one click, so scenarios that involve two roles can be run in one browser. The mock provider refuses to load unless the configuration explicitly enables it, and the production image build fails a check if it is enabled.
- **Workflow:** every implementation task ends with `make test` green and `make up` run, so the change is live at the printed URL. The summary for the task states the URL and what to try by hand, phrased as the relevant Section 15 scenarios.
- **Data across rebuilds:** `make up` keeps the database, so hand-entered test data survives ordinary rebuilds. Only `make reset` discards it.
- **OrbStack extras** such as `*.orb.local` hostnames are optional and unused by default. Plain `localhost` with a fixed port keeps the setup identical to what CI runs and avoids OAuth redirect restrictions later.

## 4. Architecture

### 4.1 Domain model

Entities follow specification Section 5. The relationships that carry the most rules:

- **Task → Backlog Item:** exactly one parent, enforced by a non-null foreign key. Reparenting is a dedicated operation, not a plain update.
- **Task Placement:** at most one current placement per task, enforced by a partial unique index on `(task_id) WHERE current = true`. Historical placements stay as rows.
- **Workboard Scope:** a join table between Workboard and Backlog Item. Scope membership and task placement are independent, which is what allows out-of-scope tasks.
- **Column:** ordered within a Workboard; exactly one column per board carries the `done` marker, enforced by a partial unique index. Three category To Do columns are created with the board and cannot be deleted.
- **Work Request:** requester, task, target board, reason, status (pending, approved, rejected, withdrawn), decision actor, decision note.
- **Activity Record:** append-only; every state-changing service call writes at least one row in the same transaction.

### 4.2 Invariants enforced on the server

These are checked inside the transaction that performs the change, never only in the UI.

1. A task always has a parent backlog item; a backlog item with unfinished placed tasks cannot be archived.
2. A task has at most one current placement, and that placement's board must be active.
3. A task's `completed` flag is true if and only if its current placement is in the board's Done column, or it was completed and later returned to Breakdown without being reopened.
4. Entering or leaving the Done column requires the completion permission when the project's Done restriction is on.
5. A backlog item is Ready for Review when it has at least one non-archived task and every non-archived task is completed. This is recalculated after every task change inside the same transaction.
6. Accepting an item rechecks rule 5 at commit time.
7. Full-item activation fails if the board's item count, under D6, would exceed the limit, or if the item is not open or is in Won't Have (D7, revised 2026-09-22: before, it had to be the next eligible item under the priority rule).
8. Placing a task whose parent is out of scope requires either an approved Work Request or Director permission, and records the exception.
9. Approving a Work Request rechecks that the task is unfinished, the board is active, and no current placement exists.
10. A nonempty column cannot be deleted; the Done marker cannot be moved or removed.

### 4.3 Permissions

The permission matrix from specification Section 4 becomes a single table in `packages/domain`, consumed by both the API (enforced) and the client (to hide unavailable actions). Every API route declares the permission it needs; a test iterates the matrix and calls every route as every role to prove there is no gap.

### 4.4 Concurrency

- Every mutable entity carries a `version` integer. Clients send the version they read; the server rejects a write against a newer version with a conflict response, and the client offers refresh and retry. This covers Section 14's "no silent loss" requirement.
- Ordering (backlog items within a category, columns within a board, tasks within a column) uses fractional ranks so that a single move is a single-row update and does not renumber neighbors.
- Operations that touch several rows (activation, request approval, acceptance, scope removal, archival) run in one transaction with `SELECT ... FOR UPDATE` on the affected board and item.

### 4.5 Activity history

One `activity` table with actor, action, entity type and id, timestamp, and a JSON payload of previous and new values. The UI shows it per task, per item, and per board. The Section 14 list of events that must be recorded becomes the acceptance test for this feature.

## 5. Phases

Sizing uses S (days), M (one to two weeks), L (two to four weeks) for a single developer working full time, and is intended for ordering and comparison, not commitment.

### Phase 0 — Kickoff and foundation (M)

Deliverables:

- Section 2 decisions confirmed or changed; specification updated to v0.2 with Section 16 rewritten accordingly and the review-note gaps folded in.
- Stack confirmed; repository layout created; lint, type-check, and test runners wired into CI.
- Docker Compose with the app and PostgreSQL, a migration runner that executes on container start, and the `make` targets from Section 3.1, verified under OrbStack on the development Mac.
- Migration 0001 with the full MVP schema from 4.1, including indexes for the invariants.
- Session handling and the identity model (provider plus subject, email for display), with the mock provider as its first implementation: persona picker, seeded Director, Developer, and Tester accounts, one-click persona switch, hard-disabled outside local and test configuration.
- Seed data with the demo project from the Section 17 worked example.
- A short `docs/running-locally.md` that says: install OrbStack, clone, run `make up`, open the URL.

Exit: on the development Mac, `make up` from a fresh clone ends with a working sign-in as any persona and the demo project visible; `make test` passes; CI is green on the same commands.

### Phase 1 — Projects, membership, permissions (M)

Deliverables:

- Project creation and settings: name, description, Done restriction toggle, scope limit.
- Membership and per-project roles; a user may hold several roles.
- Permission matrix in `packages/domain`, route-level enforcement, matrix-driven authorization test.
- Project selection screen and settings screen.

Exit: matrix test passes for every route and role; Section 15 scenario "Done restriction is enabled" has its permission half covered.

### Phase 2 — Backlog (M)

Deliverables:

- Backlog items with title, free-form description, MoSCoW category, fractional order, lifecycle state (Open, Ready for Review, Done), optional cover and links.
- Backlog screen with the six lanes; Director-only editing; drag and non-drag reordering.
- Card information: title, cover, task counts (once tasks exist), board badge placeholder.
- Activity records for item creation, edits, priority and order changes.

Exit: scenario "Director creates a vague or very large backlog item" passes; ordering survives concurrent moves in an integration test.

### Phase 3 — Breakdown and tasks (M)

Deliverables:

- Tasks with parent, category, title, description, assignee, `completed` flag (R1), archive flag.
- Breakdown screen: item description plus three category groups; task creation and editing; per-task status (unplaced, on board, complete).
- Task detail screen: content, assignment, parent, current placement.
- Dismissible writing prompts.
- Readiness recalculation (invariant 5) and item state transitions to and from Ready for Review, without acceptance yet.

Exit: scenarios "Item contains only Code tasks", "Item contains only Content tasks", and "All tasks of an item finish" pass at the API level.

### Phase 4 — Workboard (L)

Deliverables:

- Board creation with three To Do columns and a Done column; intermediate column management; archive state.
- Scope selection with the item limit (D6) and priority rule (D7); activation places unfinished unplaced tasks; activation dialog wording (R6).
- Task placement and movement, drag and keyboard alternatives; category-specific To Do columns; Done permission checks (invariant 4, R2).
- Creating a task on the board with parent selection rules from specification Section 8.
- Scope removal with the explicit choice from Section 12 and the column-reset rule (R5).
- Board header counts (R4); accepted items leave the active board with their tasks, and archived boards mark them (R3).
- Board archival rules (D12).
- Optimistic concurrency and conflict UI (4.4).

Exit: scenarios "Director activates a permitted item", "User exceeds the configured scope limit", both "Developer creates a card" scenarios, "Team renames an intermediate column", and "Done restriction is enabled" pass end to end.

### Phase 5 — Completion and acceptance (M)

Deliverables:

- Accept action with permission (D5), recheck at commit (invariant 6), acceptance record.
- Reopen rules from specification Section 11: adding or reopening a task returns Ready for Review and Done items to Open, with the UI warning and acceptance history (D4, D11).
- Rejection flow: reopen a task or add a follow-up task, or leave a comment with the item still Ready for Review.
- Backlog card counts and badges completed.

Exit: scenarios "All tasks of an item finish", "Director accepts the item", and "An unfinished task is added to a Done item" pass end to end.

### Phase 6 — Out-of-scope work requests (M)

Deliverables:

- Work Request entity and lifecycle; Requests panel for Directors; request, withdraw, approve, reject with notes.
- Direct Director placement recorded as an approved exception.
- Out of scope badge, badge removal when the parent enters scope, history preserved.
- Rechecks on approval (invariant 9) and conflict handling between two Directors.

Exit: scenarios "Developer requests work on an inactive item", "Director approves that request", "The parent later enters board scope", and "Two Directors approve conflicting placement requests" pass.

### Phase 7 — Collaboration and history (M)

Deliverables:

- Comments on tasks and items.
- Attachments and images via the storage interface (T2), with server-side download authorization; external links.
- Activity history views per task, item, and board, covering the Section 14 event list.
- Informational item dependencies (D9) with the referenced item's state.
- Task reparenting and task archival as Director operations with recalculation.

Exit: every event in the Section 14 list appears in history in an integration test; attachment download is denied to non-members.

### Phase 8 — Real sign-in, operations, and hardening (M to L)

Deliverables:

- Google sign-in (T1): generic OIDC provider implementation with Google configured; deployment setting for the initial admin e-mail, where the first matching sign-in receives admin rights; per-project invitations by e-mail, where a first sign-in whose provider-verified e-mail matches a pending invitation creates the account and binds the identity, and any other sign-in is refused. Google consent screen of type External, published, requesting only `openid email profile`, so any Google account can sign in and no Google verification is required. The mock provider remains for local and test use. Google Cloud OAuth client and consent screen created and documented.
- Image publishing from CI to GitHub Container Registry on every push to `main`, and a deployment Compose file that pulls the published image instead of building from source. Optional automatic update on a host through a registry watcher container, for a shared team instance.
- Production Docker Compose with reverse proxy and TLS, persistent volumes for database and attachments.
- Backup and restore scripts covering database and attachments together; a restore is rehearsed and documented.
- Setup, upgrade, backup, and restore guide in `docs/`, including Google OAuth client setup, invitations, and admin recovery.
- Accessibility pass: non-drag alternatives everywhere, text labels alongside color for category and out-of-scope status, keyboard navigation on boards.
- Performance check with a synthetic project of a few hundred items and a few thousand tasks.

Exit: the first team member other than the developer signs in through Google on a deployed instance; scenario "A deployment is restored from backup" passes on a fresh host; the operations guide is followed successfully by someone other than its author.

### Phase 9 — Pilot and release (S to M)

Deliverables:

- Pilot on one real project with the intended first team.
- Worked example from specification Section 17 executed as a scripted walkthrough.
- Defect fixes and wording adjustments from the pilot; specification updated to reflect any rule changes.
- Tagged 1.0 release with image and upgrade notes.

Exit: the pilot team runs one full production cycle without falling back to another tool for backlog, breakdown, or board.

## 6. Test strategy

- **Domain rules:** unit tests for readiness calculation, permission lookup, scope-limit checks, and ordering arithmetic, in `packages/domain`.
- **Invariants:** an integration test per invariant in 4.2, run against PostgreSQL, including the concurrent cases (two Directors approving, two users moving the same task, activation racing a task creation).
- **Permissions:** the matrix-driven test from 4.3, extended every time a route is added.
- **Acceptance scenarios:** each Section 15 row becomes one browser end-to-end test, named after the row, so coverage of the specification is visible in the test report.
- **Sign-in in tests:** browser tests sign in through the mock provider, so no test depends on Google. The Google provider gets its own integration test against recorded OIDC responses in Phase 8.
- **Operations:** backup and restore exercised in CI against a seeded database from Phase 8 onward.

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Section 2 decisions change after Phase 4 | Rework of board rules and tests | Close decisions in Phase 0; treat later changes as specification revisions with explicit re-planning. |
| Rule interactions between readiness, acceptance, reopening, and out-of-scope work | Subtle defects that surface in the pilot | Store state explicitly (R1), recalculate in one place, cover every interaction with an integration test before UI work. |
| Drag-and-drop board complexity | Time sink and accessibility gaps | Build the non-drag path first; add drag as an enhancement on top of the same API. |
| Multiple active boards requested during the pilot | Scope creep | Data model already supports several; keep the one-board rule in a single enforcement point so lifting it later is contained. |
| Undefined hosting and attachment needs | Late operational surprises | T2 keeps storage behind an interface; Phase 8 confirms it against the actual first deployment. |
| Mock sign-in reaches a deployed instance | Anyone can sign in as a Director | The mock provider is disabled unless explicitly enabled in local or test configuration, and the production image build fails if it is enabled; an integration test asserts the sign-in route returns not-found in production configuration. |
| Google as the only identity provider (Phase 8) | An outage or a revoked OAuth client locks everyone out | Accepted for an internal tool. The operations guide covers re-creating the OAuth client and the admin recovery path; the OIDC layer is provider-generic so a second issuer can be added by configuration. |
| Local-only testing hides deployment problems until Phase 8 | Late surprises in TLS, storage, or sign-in | The same Compose file runs locally and in production; only the environment file differs. Phase 8 is sized to absorb the difference. |

## 8. Definition of done for the MVP

- All Section 2 decisions are recorded as confirmed in specification v0.2.
- Every Section 15 scenario has a passing automated test.
- Every invariant in 4.2 has a passing integration test, including concurrent cases.
- The operations guide has been used to deploy, back up, and restore on a fresh host.
- The pilot team has completed one production cycle in GameWeld.
