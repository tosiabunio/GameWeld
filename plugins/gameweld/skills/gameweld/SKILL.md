---
name: gameweld
description: Work in GameWeld, the production tool for game teams, through its MCP tools. Plan and break down the Backlog, run the Workboard, and analyse a project's history. Use this whenever the user mentions GameWeld or their game project's Backlog, Workboard, breakdown, scope, MoSCoW priorities, tasks, cards, or out-of-scope requests; asks to break an item or feature down into tasks, summarise the week or sprint, find where work is stuck, blocked, or waiting, or decide what comes into scope next; or when the gameweld MCP tools are connected and the request is about their game's production, even if they do not say "GameWeld".
---

# GameWeld

GameWeld runs the production of a game: a prioritised Backlog, each item broken down into
tasks, and one Workboard where the work in scope moves from To Do to Done. You reach it through
the `gameweld` MCP tools, which act as the user whose API token they were set up with. In Claude
Code they are named `mcp__gameweld__<tool>`, such as `mcp__gameweld__get_backlog`. If no
gameweld tools are connected, the same things can be done over HTTP: see
[references/api.md](references/api.md).

## The model

- **Project.** Members hold one or more roles. A **Game Director** manages the Backlog, the
  Workboard, and its scope, and accepts finished items. **Developers** and **Testers** work on
  tasks. A member may also be allowed to accept items. If the project restricts Done, only
  Testers may move cards into or out of Done.
- **Backlog item.** A feature or piece of the game. Each has a MoSCoW **category** (`must`,
  `should`, `could`, `wont`) and a place within it: the Backlog is ordered. Its **state** is
  `open`, `ready_for_review`, or `done`.
- **Task.** One piece of work on an item, in one **category**: `code`, `assets`, or `content`.
  It may have an assignee, labels, a due date, a checklist, and a **blocked** flag with a
  reason. An item's tasks are its **breakdown**.
- **Workboard.** One is active per project. Its **scope** holds the items being worked on, up to
  the project's **scope limit**. The Game Director chooses which items come in, respecting
  the priorities but free to take another open item than the next one; Won't Have items never
  come in. `get_workboard` suggests the next item in priority, the first open one not yet in
  scope by category and then by its place in the Backlog, as `nextEligible`. The tasks of items
  in scope are **cards** in its columns: a To Do column per task category (named like "To Do ·
  Code"), any intermediate columns the team added, and Done. Moving a card into Done completes
  its task.
- **Out-of-scope request.** A task of an item outside the scope reaches the board only when a
  Game Director approves a request for it.
- **Review.** When every task of an item is complete, the item is Ready for Review. A Game
  Director, or a member allowed to, accepts it as Done, and it leaves the board with its tasks,
  or rejects it with a note, which stays on the item as a comment. Adding or reopening a task
  returns an item to Open and voids an acceptance.
- **History.** Every change is recorded: what, when, who, and through which API token.

The way of working behind this model, and the reasons for it, are in the GameWeld method, which
the application shows at `/method` (docs/methodology.md in the repository). Advice about how
to plan, break down, or accept work should follow it.

## How to work

**Find the project first.** Call `list_projects`. With one project, use it; with several, match
the user's words to a name, or ask. `get_project` gives the members (with ids), labels, the
active Workboard, and in `youMay` what the user may do. For "how are we doing" questions,
`get_overview` gives the figures and every item's progress in one call.

**Read before you change, and take ids from what you read.** Never guess an id or a column
name. Updates of items and tasks carry a version; if you read something a while ago and the
answer says it changed since, read it again rather than retrying blindly.

**Propose, then act.** For anything that creates or changes several things, such as a
breakdown, a reprioritisation, or bringing items into scope, show the plan in a few lines and
ask before doing it, unless the user already told you to go ahead. Do a single small change the
user asked for directly. Everything you do is recorded as the user, marked with the token's
name, and the team will see it, so stay within what they asked. Leave assignments, priorities,
and other people's work alone unless asked.

**Take a refusal as the rules speaking.** The server enforces the scope limit, what may come
into scope, who may complete tasks, and that nothing is left stranded, and it says why when it
refuses. Explain the reason in plain words and offer the legitimate route: a Game Director's
decision, an out-of-scope request, or moving an item out of Won't Have with the user's
agreement. Don't reach the same end another way, for instance by moving an item up just to get
it into scope, or by recreating something that could not be changed.

**Report plainly.** Name items and tasks by their titles, say where things ended up ("three
tasks, now in To Do on Sprint 4"), and mention anything you did not do and why.

## Tools

| For                                            | Tool                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Projects, you, roles                           | `list_projects`, `get_project`                               |
| The project at a glance, item by item          | `get_overview`                                               |
| The Backlog in priority order; what was accepted when | `get_backlog` (Done: the last 30 days unless `acceptedSince`) |
| An item with its breakdown, links, comments    | `get_item`                                                   |
| A task in full                                 | `get_task`                                                   |
| The board: scope, next item, columns and cards | `get_workboard`, `list_workboards`                           |
| The user's own queue                           | `get_my_tasks`, `get_waiting_for_me`                         |
| Finding things by words                        | `search`                                                     |
| What happened, and how long cards waited       | `get_history`, `get_column_stays`                            |
| Requests to let tasks onto the board           | `list_requests`, `request_out_of_scope`                      |
| Backlog changes                                | `create_item`, `update_item`, `move_item`                    |
| Breakdowns and task changes                    | `create_tasks`, `update_task`, `add_checklist_items`         |
| Board changes                                  | `add_to_scope`, `place_task`, `move_card`, `set_task_completed` |
| Discussion                                     | `add_comment`                                                |

Deleting, archiving, accepting or rejecting items, deciding on requests, and managing members and
boards are done by people in the app; say so when asked for one of them. A read-only token has
only the reading tools.

## Procedures

Read the one that fits before you start:

- Breaking an item down into tasks: [references/breakdown.md](references/breakdown.md)
- Summarising a week or a sprint: [references/weekly-summary.md](references/weekly-summary.md)
- Where work waits, what was blocked, how often items come back from review:
  [references/flow.md](references/flow.md)
- What to bring into scope next, and reprioritising: [references/planning.md](references/planning.md)
- Reading the history: its actions and what they record:
  [references/history.md](references/history.md)
