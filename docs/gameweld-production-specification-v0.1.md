# GameWeld — Production Management System

Preliminary Product and Functional Specification · Version 0.1 · 16 September 2026

**Status:** discussion draft, suitable for product review and implementation planning. GameWeld is the confirmed product name.

This document consolidates the original concept and subsequent product decisions. Requirements identified as **Confirmed** reflect that discussion. **Proposed** rules make the draft concrete but still require a product decision. **Open** questions are collected in Section 16. Recommendations in this document do not imply approval to implement them.

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

### Recommended interface terminology — Proposed

| Original term | Recommended term | Meaning |
| --- | --- | --- |
| Backlog | Backlog | Prioritized production scope and completed outcomes. |
| Backlog Item | Backlog Item | A user-defined unit of intended production. |
| Staging Area | Breakdown | An item's tasks, grouped by Code, Assets, and Content. The name describes decomposition without implying a deployment environment or mandatory phase. |
| Work Stage | Workboard | A board holding the current portion of work. It may represent a sprint, week, milestone, or continuous period. |
| Finalized | Ready for Review | All constituent tasks are complete; the item awaits acceptance. “Finalized” could be mistaken for final approval. |
| Done | Done | A completed task or an accepted backlog item, depending on context. |
| Task outside the active scope | Out-of-scope task | A task whose parent item is not included in the receiving Workboard's scope. This refers to board scope, not unauthorized work. |

Retain the role names **Game Director**, **Developer**, and **Tester** for the first specification. Developer includes artists, designers, audio specialists, and other production contributors. **Contributor** is an optional interface alternative if Developer proves too narrow.

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

**Proposed MVP boundary:** retain one active Workboard per project, as in the earlier MVP recommendation. The intended product model allows multiple Workboards; the first release can preserve completed boards while limiting active work to one. This boundary needs confirmation because some desired scenarios refer to selecting among multiple active boards.

## 4. Users and permissions

**Confirmed:** roles are assigned per project, and a user may hold multiple roles in the same project.

| Action | Game Director | Developer | Tester |
| --- | --- | --- | --- |
| View the project backlog, breakdowns, and boards | Yes | Yes | Yes |
| Create, edit, reprioritize, or remove backlog items | Yes | No | No |
| Select Workboard scope | Yes | No | No |
| Work on tasks, add comments, and attach material | Yes | Yes | Yes, proposed |
| Move tasks into Done | According to the project's completion policy | According to the project's completion policy | According to the project's completion policy |
| Accept a backlog item as Done | Yes | No | Only if explicitly granted acceptance permission, proposed |
| Approve out-of-scope work | Yes, proposed | No | No |

### Proposed permission defaults

- Developers can create and edit tasks under existing backlog items. This does not give them authority to activate an item on a Workboard.
- Developers can add tasks to a Workboard when the parent item is already in that board's scope.
- Directors manage boards, project settings, and membership in the MVP.
- Task removal is an archive operation available to Directors, with an audit record.
- Users may comment on and move unassigned tasks; assignment does not create exclusive editing rights.

### Completion permissions

**Confirmed:** a project can optionally restrict movement into the Done column to users with the relevant permission, typically Testers.

**Proposed:** when this restriction is off, task editors can complete tasks. When it is on, Done requires the task-completion permission. Director status alone does not silently bypass the restriction; a Director can also hold the Tester role or the relevant permission.

Backlog acceptance is a separate permission. Its default holder is the Game Director. Granting it to a lead tester should not require a new role in the MVP.

## 5. Core data model

| Entity | Minimum information and relationships |
| --- | --- |
| Project | Name, description, team access, project settings. |
| Team | Name and members; can be associated with projects. Exact team-to-project cardinality is open. |
| Project Membership | User, project, and one or more roles. |
| Backlog Item | Title, free-form description, MoSCoW category, order within that category, lifecycle state, optional cover and links. |
| Task | Exactly one parent item, title, category, description, optional assignee, comments, attachments, and completion/placement information. |
| Workboard | Name, optional description, lifecycle state, ordered columns, included backlog items, and scope limit. |
| Column | Workboard, name, position, and any required system marker. Intermediate names carry no system-defined meaning. |
| Task Placement | Task, Workboard, column, ordering, and placement history. |
| Work Request | Proposed entity: requester, task, target board, reason, status, and decision record. |
| Dependency | Proposed MVP relationship between backlog items. It does not share task ownership. |
| Activity Record | Actor, action, affected entity, timestamp, and relevant previous/new values. |

**Confirmed:** a task has one parent backlog item. It is never copied merely to show it in another view.

**Proposed:** a task has at most one current Workboard placement. Historical board activity remains available. Views show the same task and completion state rather than maintaining independent copies.

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

### Priority and lifecycle — Proposed representation

Store MoSCoW category separately from lifecycle state. An item retains its category when it moves to Ready for Review or Done, allowing it to return to the correct planning lane after reopening.

Use three item lifecycle states: **Open**, **Ready for Review**, and **Done**. Whether an item is included in an active Workboard is a separate property, visible as a board badge. No additional mandatory planning states are needed.

The system does not enforce what Must Have or Won't Have means for a particular team. A project or board description may explain the intended planning horizon. Formal release management is deferred.

### Card information — Proposed

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

**Proposed:** creating a task in Breakdown does not automatically place it on a Workboard. If its parent is already in scope, offer an explicit “Add to Workboard” action. The item can therefore contain planned work that is not currently placed on the execution board.

## 8. Workboard behavior

### Meaning — Confirmed

A Workboard represents a user-defined portion of work. The product does not infer deadlines, sprint rules, or milestone acceptance from its name.

### Structure — Confirmed

Every Workboard has:

- Three initial To Do columns, one each for Code, Assets, and Content.
- Any number of intermediate columns, named by the team.
- A final column with the system marker **Done**.

Intermediate columns do not receive mandatory meanings such as In Progress, Review, or Blocked. Their names do not determine permissions or completion.

**Proposed:** task placement starts in the matching category's To Do column. These three columns remain category-specific; intermediate columns and Done may contain tasks from all categories. Movement can skip intermediate columns, subject to Done permission.

### Scope selection

**Confirmed:** the Game Director selects backlog items for a Workboard. A configurable limit constrains how many items can be included. The normal selection path follows the highest-priority Must Have items.

**Proposed:** enforce that rule for full-item activation in the MVP and handle exceptions through individual out-of-scope tasks. Supporting broader full-item overrides remains an open decision.

Adding an item places its existing unfinished, unplaced tasks in the appropriate To Do columns. Completed tasks remain complete and are visible through Breakdown. An empty item may be selected, but cannot automatically become Ready for Review.

**Proposed scope-limit definition:** count all included items until the Director removes them from board scope. Done does not silently alter the scope list. Optional batch locking, which prevents replenishment until the current scope is accepted, is deferred.

### Creating a task directly on a Workboard — Confirmed

- If exactly one backlog item is in scope, use it as the default parent and show that association.
- If several items are in scope, selecting a parent is required before the task appears on the board.
- A task can never appear without a parent backlog item.

**Proposed:** if no items are in scope, the creator must select an existing parent and follow the out-of-scope placement policy. Selecting a parent outside scope always invokes that policy, including when there is only one in-scope item.

### Board lifecycle — Proposed

Support Active and Archived boards in the MVP. Archiving a board with unfinished tasks requires explicitly returning those tasks to their item breakdowns or, when multiple active boards are supported, transferring them. No task is automatically marked complete. Board history remains readable.

## 9. Individual work outside board scope

### Required capability — Confirmed

An individual task may be added to a Workboard without including its parent backlog item in that board's scope. It retains its parent, appears with a prominent **Out of scope** badge, and contributes to that parent's task completion.

The badge is relative to the receiving Workboard. If the parent later enters its scope, the badge disappears; the activity history preserves how the task originally entered.

### Request workflow — Proposed

1. A Developer browses an item's Breakdown and selects an unfinished task.
2. The Developer requests placement on a target Workboard and may explain the reason.
3. The request appears in a lightweight pending-request list visible to the Game Director.
4. The Director approves or rejects it, optionally recording a note.
5. Approval places the existing task in the matching To Do column. Rejection leaves its placement unchanged.

The requester can withdraw a pending request. The Director can add an out-of-scope task directly; that action is recorded as an approved exception.

Before approval, the system rechecks that the task is unfinished, the target board is active, and no conflicting placement exists. A request must never overwrite a newer task placement silently.

**Proposed defaults:** require approval for out-of-scope placement; do not count the parent against the board's item limit; display a separate count of out-of-scope tasks. No separate exception limit is needed initially. These tasks still represent real workload and remain visible alongside scoped work.

When another team member creates a new task under an inactive backlog item, creation and board placement are separate actions. Creating the task does not itself authorize out-of-scope execution.

## 10. Supporting and unplanned production work

**Proposal:** use ordinary backlog items and tasks, preserving the one-parent rule and avoiding another workflow.

- If unplanned work directly supports an existing item, create the task under that item.
- If it has an independent purpose, the Director creates an ordinary backlog item such as “Improve level iteration tooling” or “Reduce scene loading time.”
- If it must be performed outside the board's current scope, use the same out-of-scope placement mechanism.
- For very small miscellaneous work, a team may choose a temporary umbrella item such as “Production support — September.” This is a convention, not a required item type.

Open-ended support items may remain open indefinitely. That is allowed, although finite support items give clearer completion information. The system must not enforce either convention.

Bug reports, reproduction steps, triage, and bug status stay in the existing bug database. A task or item may link to a bug where useful. The MVP does not import bugs, mirror their status, or require duplicate cards for ordinary bug fixes.

## 11. Completion and acceptance

### Task completion — Confirmed

A task is complete when it is in the system-marked Done column, subject to the project's completion permission. A column named “Done” without that marker does not create a second completion mechanism.

### Backlog-item completion — Confirmed

When all constituent tasks are complete, the item moves to Ready for Review. An authorized user then explicitly accepts it as Done.

Acceptance may rely on free-form descriptions, comments, attachments, external builds, or the team's own conventions. The application does not require a build link or structured test checklist.

### Edge-case rules — Proposed

- Automatic readiness requires at least one non-archived task. Empty items do not become ready by default.
- Readiness considers every non-archived task belonging to the item, including tasks not placed on a board or completed as out-of-scope work.
- Archiving a task excludes it from completion checks but does not count it as completed work.
- Adding or reopening an unfinished task returns a Ready for Review item to Open.
- Adding or reopening an unfinished task under an accepted item also returns it to Open and invalidates the current acceptance. The earlier acceptance remains in history, and the UI states the consequence before the change.
- The accept action rechecks the current task states to avoid accepting an item that changed during review.
- An acceptance rejection may reopen an existing task or add a follow-up task. If no task change is made, the item stays Ready for Review with the rejection comment visible; no extra rejection state is introduced.

Changing a description or adding a comment does not automatically reopen an item.

## 12. Change handling and dependencies

### Proposed consistency rules

- Removing an item from board scope preserves its tasks. The Director must explicitly choose whether unfinished placed tasks return to Breakdown or remain as out-of-scope exceptions.
- Moving a task to another parent requires Director permission. The system recalculates readiness and out-of-scope status for the affected items and board.
- Archiving a backlog item with unfinished board tasks requires resolving their placements first. The operation must not leave active cards attached to an inaccessible parent.
- A nonempty intermediate column cannot be deleted until its tasks have a selected destination.
- The Done marker cannot be removed, duplicated, or reassigned casually in the MVP.
- Priority changes do not automatically change board scope or eject already selected work.

### Dependencies — Proposed minimal scope

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
| Requests | Proposed lightweight list or panel for pending out-of-scope work requests. |
| Project settings | Membership, role assignments, completion policy, board scope limit, and board management. |

Backlog item references always open the same Breakdown. Task references always open the same task detail. Completed items and archived boards remain discoverable without cluttering active work.

## 14. Operational and technical requirements

**Confirmed:** web application with straightforward deployment. The application stack and hosting provider are not selected.

**Proposed implementation baseline:**

- Provide a documented container-based deployment, for example Docker Compose, with application, database, and persistent attachment storage.
- Keep application state, uploaded files, and backups outside ephemeral application containers.
- Include setup, upgrade, backup, and restore instructions. Verify database and attachment restoration together before the first production release.
- Enforce project access and action permissions on the server, including attachment downloads.
- Apply scope limits, task moves, request approvals, and acceptance transitions atomically.
- Detect conflicting edits and surface a refresh/retry path instead of silently losing another user's changes.
- Use stable ordering for backlog items and columns.
- Record scope changes, completion, acceptance, role changes, exceptions, reparenting, and archival in activity history.
- Provide a non-drag alternative for moving cards, and communicate category and out-of-scope status with text as well as color.

Expected user counts, attachment volume, supported browsers, authentication method, and hosting environment remain open. They should inform technical choices rather than be guessed in this draft.

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
| Developer requests work on an inactive item | Under the proposed policy, the task remains unplaced until approval. |
| Director approves that request | Only the selected task enters the board, with an Out of scope badge. |
| The parent later enters board scope | The existing task loses the badge; no duplicate is created. |
| Two Directors approve conflicting placement requests | At most one current placement results; the other action receives a conflict response. |
| Team renames an intermediate column | No completion rules or permissions change. |
| Done restriction is enabled | A user without completion permission cannot complete a task through the UI or API. |
| All tasks of an item finish | The item becomes Ready for Review, not Done. |
| Director accepts the item | It becomes Done with an acceptance record. |
| An unfinished task is added to a Done item | Under the proposed rule, the item reopens and the earlier acceptance remains in history. |
| A bug is reported externally | The system requires no duplicate bug record. |
| A deployment is restored from backup | Item relationships, permissions, task placement, and attachments remain intact. |

## 16. Decisions to resolve before implementation

| Priority | Decision | Recommended starting point |
| --- | --- | --- |
| High | One or multiple active Workboards in the MVP? | One active board per project, while preserving archive history and a model that can support several. |
| High | Must Developers request out-of-scope placement? | Yes. Directors may place exceptions directly. |
| High | Who can create and edit tasks and change their parent? | Developers create/edit tasks; Directors authorize reparenting and archival. |
| High | What happens when accepted work changes? | Unfinished task creation or reopening reopens the parent; prior acceptance stays in history. |
| High | Who can accept backlog items? | Directors by default; an explicit acceptance permission can also be granted to a lead tester. |
| High | What exactly does the scope limit count? | All included backlog items until explicitly removed from board scope. |
| Medium | Can a Director activate a full item outside the normal priority rule? | Initially use individual task exceptions; add a full-item override only if needed. |
| Medium | What happens when new tasks are created in Breakdown for an active item? | Offer explicit placement rather than placing them automatically. |
| Medium | Are dependencies included in the first release? | Simple informational item-to-item links only. |
| Medium | How do teams map to projects? | Select the simplest model that covers the intended first users; retain project-specific role assignment. |
| Medium | Who may reopen completed tasks? | Task editors, with a visible explanation of any effect on parent acceptance. |
| Medium | How should board archival handle unfinished work? | Require explicit return to Breakdown or transfer; never mark it complete automatically. |
| Before deployment | Authentication, hosting, load, attachments, and retention? | Decide against the actual first deployment and document operational limits. |
| Before public release | Final interface names? | The product name GameWeld is confirmed. Use Breakdown / Workboard / Ready for Review provisionally. |

## 17. Worked production example

1. The Director creates **Ranged enemy** in Must Have. Its description is free-form.
2. In Breakdown, the team creates a Code task for targeting, an Assets task for animation, and a Content task for configuring and placing the enemy.
3. The Director adds Ranged enemy to **September production**, an active Workboard. The tasks appear in their respective To Do columns.
4. The team moves tasks through its chosen columns, for example Making and Check in game. Neither column has mandatory system semantics.
5. An available artist notices an animation task under **Flying enemy**, which is outside the current board scope, and requests permission to work on it.
6. The Director approves. That task appears on September production with an Out of scope badge. Flying enemy itself does not enter board scope.
7. Completing the flying-enemy animation updates its parent item normally, without completing any other tasks belonging to that item.
8. All tasks for Ranged enemy reach Done. Ranged enemy moves to Ready for Review.
9. The Director tries the result in the game and requests a timing adjustment. A follow-up Content task returns the item to Open under the proposed reopening rule.
10. After that task finishes, the item returns to Ready for Review. The Director accepts it as Done.

This example requires no mandatory estimate, standardized item size, sprint length, structured acceptance checklist, or built-in bug workflow.
