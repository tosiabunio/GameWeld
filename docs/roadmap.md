# Roadmap: what GameWeld still lacks

**Status: proposal, 19 September 2026.** This compares what is implemented with similar tools,
especially the simpler ones: Trello, Planka, and Wekan, and then Taiga and Plane. The gaps below
were checked against the code, not guessed. Nothing here is decided; an entry becomes a decision
when it moves into the [specification](gameweld-production-specification-v0.2.md) or the
[implementation plan](gameweld-implementation-plan.md).

The short version: next to the simple tools, GameWeld most lacks notifications, live updates, and
a handful of small things on a card (Markdown, checklists, labels, dates). Before a first real
team, it needs real sign-in and backups.

## Where GameWeld stands

**The core the other tools do not have.** A MoSCoW Backlog broken down into Code, Assets, and
Content tasks; a Workboard with a scope limit and a priority rule; requests for out-of-scope work
that a Game Director approves; item acceptance that is invalidated when a task reopens; a Done
column that can be reserved for Testers; consistency rules that leave nothing stranded; edit
conflicts detected by version; and a full activity history. Trello, Planka, and Wekan cannot
enforce such a process at all; Taiga and Plane only in part.

**The board layer.** Dragging by pointer and keyboard, custom and collapsible columns, covers,
attachments, links, comments, assignees with avatars, "My tasks" in the member's own order,
notifications in the app with a list of what waits for the viewer's decision, live updates of
every open page, Markdown with @mentions in descriptions and comments, checklists inside tasks,
labels, a "blocked" flag and an optional date on tasks, an optional end date on the Workboard,
archived Workboards that can be opened and looked at, import from Trello and export of the whole
project, quick open on Cmd+K, a Polish interface, filters and title search, the task in a window over its board, dark mode, a phone layout,
archive and restore instead of hard deletion, and continuous deployment.

## What is missing

Each entry says who has it, so the comparison stays honest. "All five" means Trello, Planka,
Wekan, Taiga, and Plane.

### 1. Blockers before a real team uses it

| Missing | Who has it | Notes |
| --- | --- | --- |
| Real sign-in and invitations | All five | Planned as Phase 8 (Google OIDC). Today anyone who reaches the instance can sign in as a Game Director. |
| Backups | n/a | [backup-plan.md](backup-plan.md) describes them; nothing is set up. |
| Notifications by e-mail | All five | The app has a bell (since 19 September 2026): events that concern the viewer, and what waits for their decision. It reaches only someone who has the app open. E-mail needs real addresses, so it follows real sign-in. |

### 2. Everyday comfort that even the simplest tools offer

- **Reordering a checklist.** Items keep the order they were added in; the simple tools let
  them be dragged.
- **Labels and dates on backlog items.** Tasks have them; an item, which is what a publisher
  asks about, has neither, and the Backlog cannot be filtered by label.
- **Reminders of a date.** A task's date turns amber the day before and red after; nobody is
  told. That needs a scheduler, which the application does not have, and then e-mail.
- **Keyboard shortcuts** beyond quick open (Cmd+K), such as moving between sections or
  assigning a card to oneself.
- **Card operations:** copying a task, task templates, selecting several cards at once.
- **"My tasks" across projects** (Trello's home, Plane's "Your work"). Today it is per project.

### 3. Adoption and surroundings

- **Import of card members and attachments from Trello.** The import brings lists, cards,
  labels, dates, checklists, comments, and links; Trello's members have no accounts here to
  map onto, and its attachments are files behind Trello's sign-in.
- **Import of an exported project.** The JSON export is complete enough to restore from, but
  nothing reads it back yet; it is a copy to keep and to analyse.
- **Webhooks, and notifications to Discord or Slack.** Game teams live on Discord, and it is the
  cheapest notification channel to build. Deferred for now (19 September 2026).
- **API tokens and API documentation.** Today the API is reachable only with a browser session.
  A member needs a token of their own that acts as they do, under the same permissions, named so
  that it can be revoked, and either read-only or read-write; and the routes need a published
  description (OpenAPI). Everything below about AI tools stands on these two.
- **AI tools: changing a project and analysing its history with an assistant.** None of the five
  ships this. GameWeld is well placed for it: every rule is enforced on the server, so an
  assistant cannot leave a project in a state a person could not (scope limit, priority rule,
  completion permission, nothing stranded), and every change is already in the activity history
  with who made it and what it was before and after.
  - **An MCP server**, served by the application itself (streamable HTTP, a member's token),
    is the main way in, because one server works in every assistant that speaks MCP. Tools
    mirror what a member does: read the Backlog, a Breakdown, the Workboard, and "waiting for
    me"; create an item or a task, break an item down, move a card, comment, flag a block, ask
    for out-of-scope work. Deleting, archiving, and membership stay out of the first set.
  - **History for analysis.** The activity route pages the newest entries for the interface;
    analysis wants a range of dates, filters by kind and person, and the placement history
    (which column, from when to when). From those an assistant can answer what changed this
    week, where cards wait longest, how often items come back from review, and what was
    blocked and for how long, without the product growing a reporting module (see "Deliberately
    outside").
  - **A skill** on top, for assistants that load them: the vocabulary (item, task, scope,
    out-of-scope request, acceptance) and a few worked procedures, such as "break this item
    down into Code, Assets, and Content tasks" or "write the week's summary from the history".
    It calls the MCP server, or the API directly where MCP is not available.
  - **What a change made through a token says about itself.** The activity entry keeps the
    member as its actor and adds the token's name, so the history shows which changes came
    through an assistant, and a notification can say so.
- **A read-only role or a public link** for a publisher or stakeholder (Trello's observers,
  Plane's guests).
- **Translated server messages.** The interface is in English and Polish; what the server says
  when it refuses something (a conflict, a rule) is still English in both.

### 4. Deliberately outside

The specification excludes mandatory estimates and story points, burndown and advanced reports,
Butler-style automation, a bug database, a wiki, and custom fields. Taiga and Plane have them,
but they are not the simple tools, and chasing them is not the goal. One exception costs little:
how long a task stayed in each column can be computed from the placement history that already
exists.

**Swimlanes on the Workboard** (Wekan, Taiga, Plane), rejected 19 September 2026. They pay off
with a dozen streams of work on one board, which the scope limit exists to prevent: with a
handful of items in scope, the item's name on each card and the "Backlog item" filter do the
job. The board is already wide, with three To Do columns, the intermediate ones, and Done; rows
would multiply that into a grid of mostly empty cells, and on a phone into something hard to
show at all. Dragging between rows would mean nothing, since moving a task to another item is a
Game Director's separate action. How far each item is, the one thing rows by item would add for
this way of working, already shows in the scope popover, on the Backlog, and in the bell when an
item is ready for review. If someone on a team misses it on the board itself, the cheap answer
is a count per item in scope that filters the board by that item when clicked, not a second
dimension in the lanes.

## Proposed order

1. **Phase 8:** real sign-in and backups.
2. **Notifications.** Done in the app: the bell, with what waits for the viewer (requests to
   decide, items to accept). E-mail follows real sign-in, which gives it real addresses. A
   Discord webhook is deferred (decided 19 September 2026); it stays listed under adoption.
3. **Live updates.** Done (19 September 2026): server-sent events fed by Postgres NOTIFY.
4. **Markdown, @mentions, and checklists.** Done (19 September 2026).
5. **Labels with a "blocked" flag, and optional dates.** Done for tasks and the Workboard
   (19 September 2026).
6. **Opening archived Workboards.** Done (19 September 2026). Swimlanes were part of this step
   and are now deliberately outside; see above.
7. **Import from Trello, and export.** Done (20 September 2026).
8. **AI tools:** API tokens and an OpenAPI description first, then the MCP server with the
   history routes for analysis, then the skill. Tokens belong to real accounts, so this follows
   step 1.
9. **Polish translation, the touch fix on phones, and Cmd+K.** Done (20 September 2026).

Steps 2 to 4 do the most to make daily use feel like Trello. Steps 1 and 7 decide whether anyone
other than the author really starts using it. Step 8 is the one thing here that the simple tools
do not have.

## Keeping this current

When an entry ships, move it to "Where GameWeld stands" in a sentence and delete it from the
gaps, in the same commit as the feature. When an entry is rejected, move it to "Deliberately
outside" with the reason.
