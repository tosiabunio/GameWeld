# Where work waits

For questions like "where are cards stuck", "what is our bottleneck", "how long do things sit in
review", "what was blocked and for how long", or "how often do items come back from review".
Answer first in a sentence, then show the evidence, then at most three suggestions that follow
from it.

## Time in columns

`get_column_stays` for the active board (or the one asked about), optionally with `from` and
`to`. Each stay is one card in one column, with `hours`; `leftAt` is null for a card still there.

- Leave out stays in the Done column (`kind: "done"`): that is finished work.
- Per column: how many stays, the median and the longest hours.
- Open stays, longest first, are the cards waiting right now. Get their assignees and blocked
  flags from `get_workboard`.
- A long wait in a To Do column means work not started; in an intermediate column, work in
  progress or waiting for someone (review, testing, a hand-over). The column where cards wait
  longest relative to the others is the bottleneck.
- Hours are calendar hours, nights and weekends included: give days for anything over two days.
  With more than a few dozen stays, compute the figures with code rather than by eye.
- Ask why a card waits, not only how long: its owner (a queue behind one person), a block, or
  work it depends on (tuning needs the mechanic, placement needs the system).

## Blocks

`get_history` with `actions: "task.updated"` for the period. A block was raised where
`before.blocked` is false and `after.blocked` is true (the reason is in `after.blockedReason`),
and cleared where it goes back. Pair them per task for how long each block lasted. Cards blocked
now are flagged in `get_workboard`.

## Returns from review

`get_history` with `actions: "item.ready_for_review,item.rejected,item.reopened,item.accepted"`.
Per item, count the rejections (their notes are in `after.note`) and the returns to Open (the
reason is in `after.reason`, such as a reopened or added task). The share of items that came back
at least once before being accepted is the return rate.

## Out-of-scope pressure

`get_history` with `actions: "request.*"`: how many tasks were asked onto the board from outside
the scope, and how many were approved. Many requests suggest the scope does not match the work
the team finds it needs.

## Caveats to state

A board started recently, or a handful of stays, does not show a pattern yet; say so rather than
over-reading it.
