# GameWeld — Production Management System

Product and Functional Specification · Version 0.2 · 16 September 2026

**Status:** implementation baseline. All decisions required before implementation are recorded in Section 16; the implementation plan ([gameweld-implementation-plan.md](gameweld-implementation-plan.md)) tracks delivery. GameWeld is the confirmed product name.

This document consolidates the original concept and subsequent product decisions. Requirements identified as **Confirmed** reflect those decisions. In earlier drafts, **Proposed** rules made the draft concrete while still requiring a product decision, and **Open** questions were collected in Section 16. As of v0.2, every Proposed rule has been decided and is marked Confirmed, and no Open questions remain before implementation. Section 16 records the decisions and the items that must still be settled before the first shared deployment.

## 1. Product purpose

GameWeld is a web application for managing production work in small, agile game development teams. It connects the intended scope of a game with the tasks needed to produce it.

The central model is:

> Code and Assets are combined into Content that players experience.

The product supports three levels of organization:

1. A prioritized **Backlog** describes what the team intends to produce.
2. A **Breakdown** connects each backlog item to individual Code, Assets, and Content tasks.
3. A **Workboard** contains the current portion of production work and the team's chosen workflow.

The tool provides structure and visibility without prescribing how a Game Director defines scope, writes specifications, divides work, or organizes a production cycle.

### Design principles — Confirmed

- Every production task belongs to a backlog item.
- The Game Director controls backlog scope and priority.
- Backlog items may have any size or level of detail.
- Descriptions are free-form. Outcome and acceptance prompts may be offered, but must not be mandatory fields or activation gates.
- Code, Assets, and Content describe the nature of a task, not its progress.
- Teams define their own intermediate workflow columns.
- Only Done has mandatory completion semantics within a task workflow.
- Completing tasks and accepting the resulting backlog item are separate actions.
- Bug tracking remains in the team's existing bug database and workflow.

## 2. Terminology and product naming

### Interface terminology — Confirmed

| Term | Meaning |
| --- | --- |
| Backlog | Prioritized production scope and completed outcomes. |
| Backlog Item | A user-defined unit of intended production. |
| Breakdown | An item's tasks, grouped by Code, Assets, and Content. It describes decomposition, not a deployment environment or a mandatory phase. |
| Workboard | A board holding the current portion of work. It may represent a sprint, week, milestone, or continuous period. |
| Ready for Review | All constituent tasks are complete; the item awaits acceptance. |
| Done | A completed task or an accepted backlog item, depending on context. |
| Out-of-scope task | A task whose parent item is not included in the receiving Workboard's scope. This refers to board scope, not unauthorized work. |

The role names are **Game Director**, **Developer**, and **Tester**. Developer includes artists, designers, audio specialists, and other production contributors.

### System name — Confirmed

The product name is **GameWeld**. It suggests bringing code, assets, and content together into a game. Because the name alone does not convey the production-management purpose, use it with a descriptive subtitle, for example “GameWeld — Production Management System”.

Alternative names considered during drafting (Playwork, Content Forge, Game Assembly, Production Board) are no longer under consideration. Trademark, domain, repository, and package-name availability is outside the scope of this document.

## 3. Product boundary

### Included — Confirmed

- Projects, teams, users, and project-specific roles.
- A prioritized backlog using MoSCoW categories: Must Have, Should Have, Could Have, and Won't Have.
- Task breakdown into Code, Assets, and Content.
- Configurable Workboard columns and task movement.
- Descriptions, assignees, comments, links, images, and attachments.
- Workboard scope limits and controlled access to work beyond that scope.
- Item-level acceptance after task completion.

### Outside the initial product — Confirmed or deliberately deferred

- A built-in bug database or replacement bug workflow.
- Mandatory estimates, story points, sprint lengths, or prescribed item granularity.
- Mandatory structured acceptance criteria.
- Source control, asset storage, engine integration, or build automation as production systems of record. Attachments and external links are sufficient initially.
- Complex automation rules, advanced reporting, and resource scheduling.

**MVP boundary — Confirmed:** one active Workboard per project. The data model allows multiple Workboards; the first release preserves archived boards while limiting active work to one, and the one-board rule is enforced in a single place so it can be lifted later.

## 4. Users and permissions

**Confirmed:** roles are assigned per project, and a user may hold multiple roles in the same project.

| Action | Game Director | Developer | Tester |
| --- | --- | --- | --- |
| View the project backlog, breakdowns, and boards | Yes | Yes | Yes |
| Create, edit, reprioritize, or remove backlog items | Yes | No | No |
| Select Workboard scope | Yes | No | No |
| Work on tasks, add comments, and attach material | Yes | Yes | Yes |
| Move tasks into Done | According to the project's completion policy | According to the project's completion policy | According to the project's completion policy |
| Accept a backlog item as Done | Yes | No | Only if explicitly granted acceptance permission |
| Approve out-of-scope work | Yes | No | No |

This table is the source of truth for permissions. Other sections describe behavior that follows from it and do not restate it.

### Permission defaults — Confirmed

- Developers can create and edit tasks under existing backlog items. This does not give them authority to activate an item on a Workboard.
- Developers can add tasks to a Workboard when the parent item is already in that board's scope.
- Directors manage boards, project settings, and membership in the MVP.
- Task removal is available to Directors as **Delete task**, with confirmation and an audit record. Internally it is a reversible archive operation: it closes the current placement, hides the task from the active Breakdown, and excludes it from completion checks without marking it complete. Pending placement requests are rejected. Deleted tasks remain accessible through “Show deleted tasks” and can be restored. Restoring an unfinished task whose item is in the active Workboard scope places it directly in its category’s To Do column.
- Users may comment on and move unassigned tasks; assignment does not create exclusive editing rights.

### Completion permissions

**Confirmed:** a project can optionally restrict movement into the Done column to users with the relevant permission, typically Testers.

**Confirmed:** when this restriction is off, task editors can complete tasks. When it is on, Done requires the task-completion permission. Director status alone does not silently bypass the restriction; a Director can also hold the Tester role or the relevant permission. Moving a task out of the Done column requires the same permission as moving it in.

Backlog acceptance is a separate permission. Its default holder is the Game Director. Granting it to a lead tester should not require a new role in the MVP.

## 5. Core data model

| Entity | Minimum information and relationships |
| --- | --- |
| Project | Name, description, team access, project settings. |
| Team | Not implemented in the MVP. Access is by project membership; a Team entity is added only when a concrete need appears. |
| Project Membership | User, project, and one or more roles. |
| Backlog Item | Title, free-form description, MoSCoW category, order within that category, lifecycle state, optional cover and links. |
| Task | Exactly one parent item, title, category, description, optional assignee, comments, attachments, an explicit completion flag with timestamp and actor, and placement information. |
| Workboard | Name, optional description, lifecycle state, ordered columns, included backlog items, and scope limit. |
| Column | Workboard, name, position, and any required system marker. Intermediate names carry no system-defined meaning. |
| Task Placement | Task, Workboard, column, ordering, and placement history. |
| Work Request | Requester, task, target board, reason, status, and decision record. |
| Dependency | Informational relationship between backlog items. It does not share task ownership. |
| Activity Record | Actor, action, affected entity, timestamp, and relevant previous/new values. |

**Confirmed:** a task has one parent backlog item. It is never copied merely to show it in another view.

**Confirmed:** a task has at most one current Workboard placement. Historical board activity remains available. Views show the same task and completion state rather than maintaining independent copies.

Board scope membership and task placement are separate relationships. This is what permits an individual task to be worked on without activating its entire parent item.

## 6. Backlog behavior

### Layout — Confirmed

The Backlog contains:

- Must Have
- Should Have
- Could Have
- Won't Have
- Ready for Review
- Done

Only the Game Director may change an item's definition, priority category, or order. Other project members may browse the backlog.

### Priority and lifecycle — Confirmed

Store MoSCoW category separately from lifecycle state. An item retains its category when it moves to Ready for Review or Done, allowing it to return to the correct planning lane after reopening.

Use three item lifecycle states: **Open**, **Ready for Review**, and **Done**. Whether an item is included in an active Workboard is a separate property, visible as a board badge. No additional mandatory planning states are needed.

The system does not enforce what Must Have or Won't Have means for a particular team. A project or board description may explain the intended planning horizon. Formal release management is deferred.

### Card information — Confirmed

Display the title, optional cover, task completion counts, category totals, and active board membership. Counts describe task completion only; they must not be presented as effort-based or overall game-completion percentages.

## 7. Breakdown

**Confirmed:** Breakdown is a view, not a mandatory lifecycle stage.

It can be opened from a Backlog card or from the list of scoped backlog items on a Workboard. It displays the item description and three task groups: Code, Assets, and Content.

- An item may contain tasks from any combination of categories.
- No minimum proportion or presence of any category is required.
- Tasks retain their category throughout execution, regardless of their current column.
- Each task shows whether it is unplaced, on a Workboard, or complete, with a link to its current placement where applicable.
- Task creation and editing remain possible after work has started, subject to project permissions.

Optional writing prompts may suggest a desired result or acceptance method. They are dismissible guidance, not required form fields.

**Confirmed (revised 16 September 2026):** creating a task in Breakdown under an item that is in the active Workboard's scope places the task in its category's To Do column immediately. Tasks whose item is outside the scope stay unplaced. **Revised 18 September 2026:** individual cards have no “Return to Breakdown” action. A placed task is worked through to completion or deleted from its Backlog Item. Returning unfinished tasks to Breakdown remains part of removing a whole item from scope or archiving a Workboard; such tasks can later be added to a Workboard again.

## 8. Workboard behavior

### Meaning — Confirmed

A Workboard represents a user-defined portion of work. The product does not infer deadlines, sprint rules, or milestone acceptance from its name.

### Structure — Confirmed

Every Workboard has:

- Three initial To Do columns, one each for Code, Assets, and Content.
- Any number of intermediate columns, named by the team.
- A final column with the system marker **Done**.

Intermediate columns do not receive mandatory meanings such as In Progress, Review, or Blocked. Their names do not determine permissions or completion.

**Confirmed:** task placement starts in the matching category's To Do column. These three columns remain category-specific; intermediate columns and Done may contain tasks from all categories. Movement can skip intermediate columns, subject to Done permission.

### Scope selection

**Confirmed:** the Game Director selects backlog items for a Workboard. A configurable limit constrains how many items can be included. The normal selection path follows the highest-priority Must Have items.

**Confirmed:** that rule is enforced for full-item activation in the MVP, and exceptions are handled through individual out-of-scope tasks. A full-item override outside the priority rule is not supported.

Adding an item places its existing unfinished, unplaced tasks in the appropriate To Do columns. Completed tasks remain complete and are visible through Breakdown. An empty item may be selected, but cannot automatically become Ready for Review.

**Scope-limit definition — Confirmed:** count all included items until the Director removes them from board scope, including accepted items. Done does not silently alter the scope list. The Workboard shows accepted items distinctly and offers one-click removal from scope. The board header shows the item count against the limit and, separately, the number of out-of-scope tasks. Optional batch locking, which prevents replenishment until the current scope is accepted, is deferred.

### Creating a task directly on a Workboard — Confirmed

- If exactly one backlog item is in scope, use it as the default parent and show that association.
- If several items are in scope, selecting a parent is required before the task appears on the board.
- A task can never appear without a parent backlog item.

**Confirmed:** if no items are in scope, the creator must select an existing parent and follow the out-of-scope placement policy. Selecting a parent outside scope always invokes that policy, including when there is only one in-scope item.

### Board lifecycle — Confirmed

Support Active and Archived boards in the MVP. Archiving a board with unfinished tasks is blocked until each unfinished task is explicitly returned to its item breakdown. Transfer to another board becomes available when multiple active boards are supported. No task is automatically marked complete. Board history remains readable.

## 9. Individual work outside board scope

### Required capability — Confirmed

An individual task may be added to a Workboard without including its parent backlog item in that board's scope. It retains its parent, appears with a prominent **Out of scope** badge, and contributes to that parent's task completion.

The badge is relative to the receiving Workboard. If the parent later enters its scope, the badge disappears; the activity history preserves how the task originally entered.

### Request workflow — Confirmed

1. A Developer browses an item's Breakdown and selects an unfinished task.
2. The Developer requests placement on a target Workboard and may explain the reason.
3. The request appears in a lightweight pending-request list visible to the Game Director.
4. The Director approves or rejects it, optionally recording a note.
5. Approval places the existing task in the matching To Do column. Rejection leaves its placement unchanged.

The requester can withdraw a pending request. The Director can add an out-of-scope task directly; that action is recorded as an approved exception.

Archiving a Workboard rejects its pending placement requests with the note “Workboard archived”, preserving the requester and decision history. The task can then be requested on a later Workboard.

Before approval, the system rechecks that the task is unfinished, the target board is active, and no conflicting placement exists. A request must never overwrite a newer task placement silently.

**Confirmed defaults:** require approval for out-of-scope placement; do not count the parent against the board's item limit; display a separate count of out-of-scope tasks. No separate exception limit is needed initially. These tasks still represent real workload and remain visible alongside scoped work.

When another team member creates a new task under an inactive backlog item, creation and board placement are separate actions. Creating the task does not itself authorize out-of-scope execution.

## 10. Supporting and unplanned production work

**Confirmed:** use ordinary backlog items and tasks, preserving the one-parent rule and avoiding another workflow.

- If unplanned work directly supports an existing item, create the task under that item.
- If it has an independent purpose, the Director creates an ordinary backlog item such as “Improve level iteration tooling” or “Reduce scene loading time.”
- If it must be performed outside the board's current scope, use the same out-of-scope placement mechanism.
- For very small miscellaneous work, a team may choose a temporary umbrella item such as “Production support — September.” This is a convention, not a required item type.

Open-ended support items may remain open indefinitely. That is allowed, although finite support items give clearer completion information. The system must not enforce either convention.

Bug reports, reproduction steps, triage, and bug status stay in the existing bug database. A task or item may link to a bug where useful. The MVP does not import bugs, mirror their status, or require duplicate cards for ordinary bug fixes.

## 11. Completion and acceptance

### Task completion — Confirmed

A task carries an explicit completion flag, recorded with timestamp and actor. The flag is set when the task enters the system-marked Done column, subject to the project's completion permission, and cleared when it leaves that column. The flag, not the column position, is the source of truth for completion; this keeps completion unambiguous when boards are archived or placement changes. A column named “Done” without the system marker does not create a second completion mechanism.

### Backlog-item completion — Confirmed

When all constituent tasks are complete, the item moves to Ready for Review. An authorized user then explicitly accepts it as Done.

Acceptance may rely on free-form descriptions, comments, attachments, external builds, or the team's own conventions. The application does not require a build link or structured test checklist.

### Edge-case rules — Confirmed

- Automatic readiness requires at least one non-archived task. Empty items do not become ready by default.
- Readiness considers every non-archived task belonging to the item, including tasks not placed on a board or completed as out-of-scope work.
- Archiving a task excludes it from completion checks but does not count it as completed work.
- Adding or reopening an unfinished task returns a Ready for Review item to Open. Task editors may reopen completed tasks, subject to the Done permission rule in Section 4, and the UI shows the effect on the parent item's acceptance before the change.
- Adding or reopening an unfinished task under an accepted item also returns it to Open and invalidates the current acceptance. The earlier acceptance remains in history, and the UI states the consequence before the change.
- Reopening a task whose placement is on an archived Workboard returns it to Breakdown. Its former placement and Done column remain in history, and the task can be placed on the active Workboard.
- The accept action rechecks the current task states to avoid accepting an item that changed during review.
- An acceptance rejection may reopen an existing task or add a follow-up task. If no task change is made, the item stays Ready for Review with the rejection comment visible; no extra rejection state is introduced.

Changing a description or adding a comment does not automatically reopen an item.

## 12. Change handling and dependencies

### Consistency rules — Confirmed

- Removing an item from board scope preserves its tasks. The Director must explicitly choose whether unfinished placed tasks return to Breakdown or remain as out-of-scope exceptions. A task returned to Breakdown from an intermediate column loses its column position and re-enters To Do when placed again; the activity history records the previous column.
- Moving a task to another parent requires Director permission. The system recalculates readiness and out-of-scope status for the affected items and board.
- Archiving a backlog item with unfinished board tasks requires resolving their placements first. The operation must not leave active cards attached to an inaccessible parent.
- A nonempty intermediate column cannot be deleted until its tasks have a selected destination.
- The Done marker cannot be removed, duplicated, or reassigned casually in the MVP.
- Priority changes do not automatically change board scope or eject already selected work.

### Dependencies — Confirmed minimal scope

Allow one backlog item to reference another as a dependency. Show the link and the referenced item's state. Do not automatically block task movement or require the dependency to be Done before work starts: reusable code or assets can be available before the entire parent item is accepted.

Defer task-level dependency graphs and automatic scheduling. A shared task has one owning item; other items reference that item rather than duplicating ownership.

## 13. Screens and navigation

| Screen | Primary purpose |
| --- | --- |
| Project selection | Open or create a project and see accessible projects. |
| Backlog | Define, prioritize, inspect, review, and accept backlog items. |
| Breakdown | Inspect one item's description and its three task categories. |
| Workboard | Execute tasks, view current item scope, and identify out-of-scope work. |
| Task detail | Edit task content, assignment, comments, links, and attachments. Show parent and current placement. |
| Requests | Lightweight list or panel for pending out-of-scope work requests. |
| Project settings | Membership, role assignments, completion policy, board scope limit, and board management. |

Backlog item references always open the same Breakdown. Task references always open the same task detail. Completed items and archived boards remain discoverable without cluttering active work.

## 14. Operational and technical requirements

**Confirmed:** web application with straightforward deployment.

**Confirmed technical baseline:** TypeScript across server and client, a Fastify HTTP API, a React client built with Vite, PostgreSQL, and Docker Compose for deployment.

**Confirmed authentication:** no local accounts. During development a mock sign-in with seeded personas is used, available only in local and test configurations. Before the first shared deployment, sign-in is OpenID Connect with Google as the only configured provider, with an optional Workspace domain restriction and a per-project invitation list. Identities are stored as provider and subject so further providers are configuration, not code.

**Confirmed attachment storage:** a local filesystem volume, behind an interface that also supports S3-compatible storage.

**Confirmed implementation baseline:**

- Provide a documented container-based deployment, for example Docker Compose, with application, database, and persistent attachment storage.
- Keep application state, uploaded files, and backups outside ephemeral application containers.
- Include setup, upgrade, backup, and restore instructions. Verify database and attachment restoration together before the first production release.
- Enforce project access and action permissions on the server, including attachment downloads.
- Apply scope limits, task moves, request approvals, and acceptance transitions atomically.
- Detect conflicting edits and surface a refresh/retry path instead of silently losing another user's changes.
- Use stable ordering for backlog items and columns.
- Record scope changes, completion, acceptance, role changes, exceptions, reparenting, and archival in activity history.
- Provide a non-drag alternative for moving cards, and communicate category and out-of-scope status with text as well as color.

Expected user counts, attachment volume, supported browsers, retention, and hosting environment are decided against the first shared deployment and documented as operational limits (see Section 16).

## 15. MVP acceptance scenarios

These scenarios verify system behavior without prescribing the team's production methodology.

| Scenario | Expected result |
| --- | --- |
| Director creates a vague or very large backlog item | It is accepted without required estimates, outcome fields, or acceptance criteria. |
| Item contains only Code tasks | It follows the same workflow as a mixed-category item. |
| Item contains only Content tasks | It does not require placeholder Code or Assets tasks. |
| Director activates a permitted item | Its unfinished unplaced tasks enter matching To Do columns; the item remains accessible in Backlog. |
| User exceeds the configured scope limit | Full-item activation is rejected with a clear explanation. |
| Developer creates a card with one item in scope | That parent is shown and selected by default. |
| Developer creates a card with several items in scope | A parent is required before board placement. |
| Developer requests work on an inactive item | The task remains unplaced until approval. |
| Director approves that request | Only the selected task enters the board, with an Out of scope badge. |
| The parent later enters board scope | The existing task loses the badge; no duplicate is created. |
| Two Directors approve conflicting placement requests | At most one current placement results; the other action receives a conflict response. |
| Team renames an intermediate column | No completion rules or permissions change. |
| Done restriction is enabled | A user without completion permission cannot complete a task through the UI or API. |
| All tasks of an item finish | The item becomes Ready for Review, not Done. |
| Director accepts the item | It becomes Done with an acceptance record. |
| An unfinished task is added to a Done item | The item reopens and the earlier acceptance remains in history. |
| A bug is reported externally | The system requires no duplicate bug record. |
| A deployment is restored from backup | Item relationships, permissions, task placement, and attachments remain intact. |

## 16. Decisions

All decisions required before implementation were made at the Phase 0 kickoff and are recorded here. D1–D12 resolve the questions listed in earlier drafts, R1–R7 resolve the gaps raised in the specification review, and T1–T3 fix the technical baseline.

| ID | Decision | Resolution |
| --- | --- | --- |
| D1 | Active Workboards per project | One. The data model supports several; the UI and rules enforce one. |
| D2 | Out-of-scope placement | Developers submit a request; Directors approve or place directly. |
| D3 | Task creation, editing, and reparenting | Developers create and edit tasks; Directors authorize reparenting and archival. |
| D4 | Accepted work changes | Adding or reopening an unfinished task reopens the parent; the earlier acceptance stays in history. |
| D5 | Who accepts backlog items | Directors by default; a separate acceptance permission can be granted per project, for example to a lead tester. |
| D6 | Scope-limit counting | All included items count until the Director removes them from scope, including accepted ones. |
| D7 | Full-item activation outside the priority rule | Not supported in the MVP; individual out-of-scope tasks cover exceptions. |
| D8 | New tasks under an active item | Placed automatically in their To Do column while the item is in scope (revised during testing; the original decision was explicit placement). Returned tasks are re-placed through "Add to Workboard". |
| D9 | Dependencies | Informational item-to-item links only. |
| D10 | Teams and projects | Teams are not implemented in the MVP; access is by project membership only. |
| D11 | Reopening completed tasks | Task editors may reopen, with a visible warning about the effect on the parent's acceptance. |
| D12 | Board archival with unfinished tasks | Blocked until each unfinished task is explicitly returned to Breakdown. |
| R1 | Task completion state | Stored on the task as an explicit completion flag with timestamp and actor, set on entering Done and cleared on leaving it. Column position alone is not the source of truth. |
| R2 | Leaving Done under a Done restriction | Requires the same permission as entering Done. |
| R3 | Accepted items in scope | Count toward the limit (D6). The Workboard shows accepted items distinctly and offers one-click removal from scope. |
| R4 | Out-of-scope task visibility | The Workboard header shows the item count against the limit and, separately, the out-of-scope task count. |
| R5 | Removing an item from scope while a task is in an intermediate column | The task returns to Breakdown and its column position is discarded; re-placement starts in To Do. History records the previous column. |
| R6 | Activation asymmetry | Withdrawn with the revision of D8: creation and activation both place tasks, so there is no asymmetry to explain. |
| R7 | Source of truth for permissions | The permission table in Section 4 is authoritative; other sections reference it rather than restate it. |
| T1 | Authentication | Mock sign-in with seeded Director, Developer, and Tester personas during development, available only in local and test configurations. Before the first shared deployment: OpenID Connect with Google as the only configured provider, no local accounts, optional Workspace domain restriction, per-project invitation list. Identities are stored as provider and subject. |
| T2 | Attachment storage | Local filesystem volume, behind an interface that also supports S3-compatible storage. |
| T3 | Running work-in-progress builds | On the development Mac under OrbStack through single-command scripts in the repository. No image registry, watcher, or remote host until the operations phase. |

**Before first shared deployment**, decide and document as operational limits:

- Authentication provider setup: Google OAuth client, allowed domain, initial admin, invitation handling.
- Hosting environment and reverse proxy with TLS.
- Expected user counts and load.
- Attachment volume and storage sizing.
- Data retention and backup schedule.

## 17. Worked production example

1. The Director creates **Ranged enemy** in Must Have. Its description is free-form.
2. In Breakdown, the team creates a Code task for targeting, an Assets task for animation, and a Content task for configuring and placing the enemy.
3. The Director adds Ranged enemy to **September production**, an active Workboard. The tasks appear in their respective To Do columns.
4. The team moves tasks through its chosen columns, for example Making and Check in game. Neither column has mandatory system semantics.
5. An available artist notices an animation task under **Flying enemy**, which is outside the current board scope, and requests permission to work on it.
6. The Director approves. That task appears on September production with an Out of scope badge. Flying enemy itself does not enter board scope.
7. Completing the flying-enemy animation updates its parent item normally, without completing any other tasks belonging to that item.
8. All tasks for Ranged enemy reach Done. Ranged enemy moves to Ready for Review.
9. The Director tries the result in the game and requests a timing adjustment. A follow-up Content task returns the item to Open under the reopening rule.
10. After that task finishes, the item returns to Ready for Review. The Director accepts it as Done.

This example requires no mandatory estimate, standardized item size, sprint length, structured acceptance checklist, or built-in bug workflow.
