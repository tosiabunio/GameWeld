# Reading the history

`get_history` returns entries newest first. Each has `at` (UTC), `action`, `who` (a name, or
`system` for changes the application made itself), `via` (the API token, when one was used),
`entity` (its type, id, and current title), and `before` and `after`: the fields the change
concerned, as they were and as they became.

People inside `before` and `after` appear as ids (`assigneeId`, for instance). Turn them into
names with the members from `get_project`.

Filter with `actions` (comma-separated; `task.*` means every task action), `actorId`, `from`
and `to`, or one `entityType` and `entityId`: a `backlog_item` (with its tasks), a `task` (with
its requests), or a `workboard` (with its columns, cards, scope, and requests). Page back with
`before` set to the oldest entry's id.

## Actions

| Action                                                  | What happened                                                   | Worth reading in `before` / `after`                         |
| ------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `item.created`                                          | An item was added                                               | `after.title`, `after.category`                             |
| `item.updated`                                          | An item was edited                                              | the fields                                                  |
| `item.reordered`, `item.recategorized`                  | Its place, or its MoSCoW category, changed                      | `before.category`, `after.category`                         |
| `item.archived`, `item.restored`                        | Archived or restored                                            |                                                             |
| `item.ready_for_review`                                 | All its tasks are complete                                      | `after.reason`                                              |
| `item.reopened`                                         | Back to Open from review or Done                                | `after.reason`                                              |
| `item.accepted`, `item.rejected`                        | Accepted as Done, or rejected in review                         | `after.note`                                                |
| `task.created`                                          | A task was added                                                | `after.title`, `after.category`, `after.assigneeId`         |
| `task.updated`                                          | A task was edited                                               | the task's fields before and after: compare them            |
| `task.completed`, `task.reopened`                       | Completed or reopened                                           | `after.reason`                                              |
| `task.placed`, `task.placed_as_exception`               | Put on a board, as in-scope or out-of-scope work                | `after.boardId`                                             |
| `task.moved`                                            | Its card changed column                                         | `before.columnId`, `after.columnId`                         |
| `task.returned`                                         | Its card left the board, back to the Backlog                    | `after.reason`                                              |
| `task.reparented`, `task.archived`, `task.restored`     | Moved to another item, archived, restored                       |                                                             |
| `scope.added`, `scope.removed`                          | An item came into or left a board's scope                       | `after.reason` (such as `item accepted`)                    |
| `board.created`, `board.updated`, `board.archived`      | A Workboard was started, changed, archived                      |                                                             |
| `column.created`, `column.updated`, `column.deleted`    | A column was added, renamed or moved, deleted                   | `after.name`                                                |
| `request.created`                                       | An out-of-scope request was made                                | `after.reason`                                              |
| `request.approved`, `request.rejected`, `request.withdrawn` | It was decided, or withdrawn                                | `after.note`                                                |
| `member.added`, `member.updated`, `member.removed`      | Membership changed                                              | `after.roles`                                               |
| `attachment.added`, `dependency.added`, `item.link_added` | Files, dependencies, and links                                |                                                             |

`task.updated` records the task's fields both before and after the change, not only the ones
that changed, so compare the two to see what did: a block raised is `before.blocked` false and
`after.blocked` true, a new assignee is a different `after.assigneeId`.

Column ids in `task.moved` are easier to read as stays: `get_column_stays` turns the moves into
time spent per column, with column names.
