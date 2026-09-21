# Summarising a week or a sprint

A summary tells the team, or a publisher, what moved, what is at risk, and what comes next. It
is read in a minute, so it aggregates: numbers and named items, not a list of events.

## 1. Settle the period

Unless the user says otherwise, a week is the seven days up to now, and a sprint is the life of
the active Workboard (from its `createdAt` in `list_workboards`). History times are UTC; say so
if the day boundaries matter.

## 2. Gather

- `get_history` with `from` and `to` and `limit: 500`. If 500 come back, page with
  `before` set to the oldest entry's `id` until fewer come back.
- `get_workboard` for the state now: scope and progress, blocked cards, the next item in
  priority.
- `get_project` to turn the member ids in history entries into names.
- `get_column_stays` for the board, if you want to point out cards that have waited long.

[history.md](history.md) says what each action records.

## 3. Sort

- **Delivered:** `item.accepted`. This is the headline.
- **Progress:** `task.completed`, grouped by item; who completed what.
- **Review:** `item.ready_for_review`; `item.rejected`, with its note; `item.reopened`, with its
  reason.
- **Plan changes:** `scope.added` and `scope.removed`, `item.created`, `item.recategorized` and
  `item.reordered` (priority changes), `board.created` and `board.archived`.
- **Problems:** blocks raised and cleared (`task.updated` where `before.blocked` and
  `after.blocked` differ; the reason is `after.blockedReason`); out-of-scope requests made,
  approved, and rejected.
- **Now:** cards still blocked, cards that have waited longest, scope against the limit, and the
  next eligible item.

## 4. Write

Use this shape, and leave out any section with nothing in it:

```markdown
**<Project>: <period>**

<Two or three sentences: what was delivered, what moved, what is at risk.>

### Done
### Progress
### Review
### Changes to the plan
### Blocked and waiting
### Next
```

Name items and tasks by title and people by name, and give counts ("9 tasks completed, 6 of
them on Grappling hook"). Say that a change came through an API token only when it matters, for
instance when an assistant created a breakdown.
