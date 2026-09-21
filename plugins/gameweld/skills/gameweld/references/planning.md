# What comes into scope next, and reprioritising

## The rule

The Workboard's scope takes items strictly in priority order. Only one item may come in next:
the first open item that is not in scope yet, taking the categories in the order `must`,
`should`, `could`, and within a category the Backlog's order. Won't Have items never come in.
`get_workboard` names it as `nextEligible`, with how many of its tasks are not on the board yet.
The scope also has a limit (`scopeLimit`): accepted items leave the scope and free a place.

## Answering "what's next?"

1. `get_workboard`: the scope and how far each item is, the limit, and `nextEligible`.
2. `get_backlog`: the open items in order, to explain what comes after.
3. Say whether there is room, which item comes next and why (its category and place), and
   whether it is ready to start: an item with no tasks needs a breakdown first
   ([breakdown.md](breakdown.md)).

## Bringing the next item in

With the Game Director role and room in scope, `add_to_scope` with the `nextEligible` item. Its
unplaced tasks go to their To Do columns. Ask first unless the user asked for exactly this.

## When the user wants a different item

Two legitimate routes, and the choice is the user's:

- **Change the priorities.** Moving the item up the Backlog with `move_item` (to a higher
  category, or ahead of others in its own) makes it the next item. This changes the plan for the
  whole team, so say what it pushes back and get a clear yes.
- **Bring single tasks in.** When only some of the item's work is needed now, ask for those tasks
  with `request_out_of_scope`; a Game Director approves or rejects each request.

## Reprioritising the Backlog

When asked to reorder, first show the proposed order per category with a one-line reason for
each move, then apply it with `move_item`, one item at a time, using `afterId` and `beforeId` to
place each. Moving an item between categories is a statement about the game (a Should becoming a
Must), so name those moves explicitly in the proposal.
