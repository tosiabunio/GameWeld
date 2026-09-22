# Long Backlog lanes: a plan

**Status: built, 22 September 2026.** Proposed and built the same day. The
[specification](gameweld-production-specification-v0.2.md) records the result in Section 6, under
"Long lanes"; [As built](#as-built) at the end says where the build differs from the proposal.
The sections before it describe the code as it stood before the change.

## The problem

A project of even modest size will hold hundreds of Backlog items. Must Have, Should Have, and
Could Have empty out as items are worked, but Done only ever grows, and its role is informative.
Older accepted items should stop taking up the screen without being archived: they belong on the
Overview's map and in its figures, and archiving takes them off both.

## Where the code stands

- The Backlog fetches every item that is not archived in one request (`listBacklog`), and the
  six lanes grow downwards with the page. A lane's head with its count, and the "New backlog
  item" form in its footer, leave the screen once a lane holds a few dozen cards.
- Done and Ready for Review sort by `updatedAt`, so a comment on an item accepted months ago
  lifts it to the top of Done. An item carries no "accepted at"; the time lives only in the
  `acceptances` table, on the row whose `invalidated_at` is null.
- The Overview counts and maps everything that is not archived, on the server. Hiding cards in
  the Backlog changes nothing there, which is why the whole problem can be solved in the view,
  with no change to the data and no archiving.
- Filters, collapsed lanes, and the display options are per-viewer conveniences kept in the
  browser; the new mechanisms fit into them.

## Mechanisms

### 1. Done: a window of recent items, and "Show older"

- Done shows the items accepted in the last 30 days by default, but never fewer than the ten
  newest, so a quiet month does not leave the lane empty. Below them, one button, "Show older
  (143)", brings in the rest in batches or all at once.
- Older items come grouped under the month they were accepted in ("August 2026"), each group
  collapsible. Grouping by the Workboard they were accepted on would read better for a team that
  plans by board, but it means recording the board at acceptance; the month is free.
- Prerequisite: an item gets `acceptedAt`, taken from its current acceptance by one join in the
  existing item query, and Done sorts and groups by it instead of `updatedAt`. That fixes today's
  ordering on its own.
- The lane's head already shows "10/153" when fewer cards show than the lane holds, so the full
  count stays visible. While the search or a filter is on, the window is off: a filter searches
  the whole of Done, not the part that shows.
- The threshold (30 days, 90 days, everything) is a display option next to "Collapse empty
  columns", in the same browser storage.

### 2. Lanes that scroll on their own, with the head and footer pinned

- A lane gets a maximum height of the window, its list of cards scrolls inside it, and the head
  with the count and the add form stay in place, as in Trello and Planka. This is CSS plus a
  change in `CardLanes`: dnd-kit has to auto-scroll the lane instead of the page. It handles
  scrollable ancestors, but a drag from a long lane into a short one needs checking.
- Alternatively, or as well, the "New backlog item" form moves to the top of the lane. New items
  go to the end of their category anyway; where the field sits is only a matter of reach.
- The phone layout already shows one lane per screen, so there the inner scrolling is enough.

### 3. Paging in every lane: the first N cards and "Show 50 more"

- A generic mechanism in `CardLanes`, at fifty cards or so, that serves Won't Have too and later
  the Workboard. It complements mechanism 2 rather than replacing it: with three hundred cards
  in Should Have the scrolling stays long, but the page no longer renders three hundred covers
  at once.
- Dragging stays correct with no change to the API. A card dropped after the last card that
  shows gets the neighbours "last shown" and "first hidden", and `moveItem` takes exactly such a
  pair of `afterId` and `beforeId`. The neighbours must be read from the whole lane, not from
  the cards that show, as "Move up" and "Move down" already do while a filter is on.

### 4. Won't Have treated like Done

- This lane also only grows, and it is informative: the Overview's map already leaves it out.
  Collapsed to its stub on a viewer's first visit, or under the window of mechanism 1 by
  `updatedAt`. Collapsing exists; only a sensible default is missing.

### 5. The server, once the payload itself is the problem

- Today one request returns everything, and at hundreds of items that is still fine. Each item
  does run three subqueries over its tasks, so at a thousand items they should become one
  `GROUP BY`.
- Then `listBacklog` takes `state` and `acceptedSince`, the client fetches Done separately and
  lazily behind "Show older", and an index on `(project_id, state, archived_at)` goes in with
  it. The same parameters reach the MCP tool and the skill, so an assistant can ask for "what
  was accepted this month" without reading the whole Backlog.

### 6. Archiving stays what it is

- Archiving by hand takes an item off the map and out of the figures, so it is not the tool for
  tidying Done. If a need to "close a chapter" ever appears, for instance after a release, the
  better answer is a mechanism of its own, a milestone or a version, that groups accepted items
  without dropping them from the statistics. That is a product decision, not a matter of a long
  list.

## Proposed order

1. `acceptedAt` on the item and Done sorted by it, then the window of the last 30 days with
   "Show older" grouped by month. The smallest cost, and it settles the one lane that grows
   without end.
2. Lanes that scroll on their own with the head and the add form pinned. The largest change in
   the feel of Must, Should, and Could.
3. Paging at fifty cards in `CardLanes`, and Won't Have collapsed by default.
4. The server parameters and the index, once projects pass a few hundred items.

Steps 1 and 2 are independent and can be done in either order. Each step comes with its browser
tests, and the API changes of step 5 with their mention in [api.md](api.md), the OpenAPI
description, the MCP tool, and the skill.

## As built

- **Done** lists items by when they were accepted, which items now carry as `acceptedAt`. It
  shows those accepted in the last 30 days, at least ten and at most fifty, and the rest behind
  "Show older", under headings for the month of acceptance that fold. The display options offer
  30 days, 90 days, or no window. A search or a filter looks through all of Done.
- **Every lane**, on the Backlog and on the Workboard, is at most as tall as the window below
  the strip of lanes, and never under 360 pixels. Its cards scroll inside it; the head with the
  count and the form for a new card stay in sight. The form stayed at the bottom.
- **Paging** is fifty cards, with "Show 50 more", "Show the rest", and "Show fewer". A card that
  joins a lane, and a card that showed before and is still in it, show wherever they are, so
  nothing added or moved one place down disappears (`apps/web/src/lanePaging.ts`). Dragging into
  a lane scrolled to its end was checked, and is covered by a browser test.
- **Won't Have is not collapsed by default.** The redesign of 18 September 2026 made collapsing
  a lane the viewer's choice alone: a browser test checks that a new project shows every lane
  open, and "Collapse empty columns" is off unless chosen. Won't Have pages like the other lanes,
  and one click collapses it for good in that browser. A window by last change, the other way
  proposed, would have reordered a lane that is ordered by rank.
- **The server.** `listBacklog` takes `state`, `acceptedSince`, and `acceptedBefore`. An item's
  tasks are counted in one pass instead of three subqueries, per item, which also serves the
  routes that read one item; a project-wide `GROUP BY` would have counted a whole project to
  answer for one item. Migration 0014 indexes items by project and state, leaving out archived
  ones. On the way, an item that an archived Workboard kept in its scope while it was also in
  the active one's was listed twice; now it is listed once.
- **Not built: fetching Done lazily.** The app still reads the whole Backlog in one request. At
  hundreds of items that is not the problem, and fetching Done in parts would need counts from
  the server and would stop the search from looking through all of it. The parameters above are
  what it would use, once a project passes a few thousand items.
- **The AI tools.** `get_backlog` lists the Done items accepted in the last 30 days, each with
  when, and counts the older ones as `olderDone`; `acceptedSince` reaches further back. The skill
  and [api.md](api.md) say so, and the weekly summary uses it for what was delivered.
