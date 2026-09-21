# Without the MCP tools: the HTTP API

When no gameweld tools are connected but you can make HTTP requests (with `curl` in a shell,
for instance), the same work goes through GameWeld's API. You need the instance's address (such
as `https://gameweld.eu`) and an API token, which the user makes in their GameWeld profile under
API tokens. Ask for them rather than guessing, and keep the token out of files and logs: pass it
in an environment variable.

```sh
export GAMEWELD_URL=https://gameweld.eu GAMEWELD_TOKEN=gw_…
curl -s -H "Authorization: Bearer $GAMEWELD_TOKEN" "$GAMEWELD_URL/api/projects"
curl -s -X POST -H "Authorization: Bearer $GAMEWELD_TOKEN" -H 'Content-Type: application/json' \
  -d '{"title": "Rope physics", "category": "code"}' \
  "$GAMEWELD_URL/api/projects/$PROJECT/backlog/$ITEM/tasks"
```

Every route is described at `$GAMEWELD_URL/api/openapi.json` (no token needed): read it for
bodies and answers. A refusal comes back as `{ "message": "…" }` with status 400, 403, 404, or
409. Updates of items and tasks take the `version` they were read at.

What each tool does, as a route (paths under `/api/projects/{projectId}` are shortened to `…`):

| Tool                  | Route                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| `list_projects`       | `GET /api/me`, `GET /api/projects`                                     |
| `get_project`         | `GET …` and `GET …/boards`                                             |
| `get_backlog`         | `GET …/backlog`                                                        |
| `get_item`            | `GET …/backlog/{itemId}` and `GET …/backlog/{itemId}/tasks`            |
| `get_task`            | `GET …/tasks/{taskId}`                                                 |
| `get_workboard`       | `GET …/board` (the active one) or `GET …/boards/{boardId}`             |
| `list_workboards`     | `GET …/boards`                                                         |
| `get_my_tasks`        | `GET …/my-tasks`                                                       |
| `get_waiting_for_me`  | `GET /api/notifications`                                               |
| `search`              | `GET …/search?q=`                                                      |
| `get_history`         | `GET …/activity?from=&to=&actorId=&actions=&entityType=&entityId=&before=&limit=` |
| `get_column_stays`    | `GET …/column-stays?boardId=&taskId=&from=&to=`                        |
| `list_requests`       | `GET …/boards/{boardId}/requests`                                      |
| `create_item`         | `POST …/backlog`                                                       |
| `update_item`         | `PATCH …/backlog/{itemId}`                                             |
| `move_item`           | `POST …/backlog/{itemId}/move`                                         |
| `create_tasks`        | `POST …/backlog/{itemId}/tasks`, once per task                         |
| `update_task`         | `PATCH …/tasks/{taskId}`                                               |
| `set_task_completed`  | `POST …/tasks/{taskId}/complete` or `…/reopen`                         |
| `add_checklist_items` | `POST …/tasks/{taskId}/checklist`, once per step                       |
| `add_to_scope`        | `POST …/boards/{boardId}/scope`                                        |
| `place_task`          | `POST …/boards/{boardId}/placements`                                   |
| `move_card`           | `POST …/boards/{boardId}/placements/{taskId}/move` with a `columnId`   |
| `add_comment`         | `POST …/tasks/{taskId}/comments` or `POST …/backlog/{itemId}/comments` |
| `request_out_of_scope`| `POST …/boards/{boardId}/requests`                                     |

The answers are the full records the app uses, larger than the tools' compact ones; pick out what
you need.
