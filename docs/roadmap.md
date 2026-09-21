# Roadmap: what GameWeld still lacks

**Status: proposal, 19 September 2026; last updated 21 September 2026.** This compares what is
implemented with similar tools, especially the simpler ones: Trello, Planka, and Wekan, and then
Taiga and Plane. The gaps below were checked against the code, not guessed. Nothing here is
decided; an entry becomes a decision when it moves into the
[specification](gameweld-production-specification-v0.2.md) or the
[implementation plan](gameweld-implementation-plan.md).

The short version: next to the simple tools, GameWeld most lacked notifications, live updates, and
a handful of small things on a card (Markdown, checklists, labels, dates); those are done, and so
are the AI tools, which none of them has. Before a first real team, it needs backups and Google
sign-in switched on at gameweld.eu.

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
archive and restore instead of hard deletion, continuous deployment, and an Overview of each
project: its figures (items by state; tasks complete, in progress, waiting, blocked, overdue,
unassigned), progress by priority and by kind of work, and a map of the Backlog in which each
item's area is its number of tasks, its colour its priority, and its fill how far its tasks are;
accepted items stand apart in the colour of Done, and Won't Have items are left off it.

**The API.** Every route of the application is open to scripts and assistants through a member's
own API token, read-only or read-write, which acts as that member under the same permissions and
cannot manage tokens itself. Every change made through one is marked in the history and in
notifications with the token's name. An OpenAPI 3.1 description of every route is served at
`/api/openapi.json`, put together from the routes themselves and checked against every response
the test suite sees ([api.md](api.md)).

**AI tools.** An MCP server at `/api/mcp` lets an assistant work in a project as the member whose
token it uses: read the Backlog, a breakdown, the Workboard, and what waits for the member; add
and reprioritise items, break them down into tasks, edit and complete tasks, bring items into
scope, move cards, comment, and ask for out-of-scope work. Deleting, archiving, accepting,
deciding on requests, and membership stay with people. For analysis, the history can be read by
time, person, and action, and a card's stays in each column come with their length in hours. A
skill for Claude Code, which every instance serves as a plugin, teaches an assistant the
vocabulary and rules and the common jobs: breaking an item down into Code, Assets, and Content
tasks, the week's summary, and where work waits ([api.md](api.md)).

## What is missing

Each entry says who has it, so the comparison stays honest. "All five" means Trello, Planka,
Wekan, Taiga, and Plane.

### 1. Blockers before a real team uses it

| Missing | Who has it | Notes |
| --- | --- | --- |
| Real sign-in and invitations | All five | Built (Phase 8): Google sign-in, access by invitation only ([google-sign-in.md](google-sign-in.md)). gameweld.eu still runs the open persona sign-in until it is switched over. |
| Backups | n/a | [backup-plan.md](backup-plan.md) describes them; nothing is set up. Deferred (decided 21 September 2026): the AI tools come first, and gameweld.eu holds only demo data. Needed before gameweld.eu switches to Google sign-in or holds a pilot team's work. |
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
- **A read-only role or a public link** for a publisher or stakeholder (Trello's observers,
  Plane's guests).
- **Translated server messages.** The interface is in English and Polish; what the server says
  when it refuses something (a conflict, a rule) is still English in both.

### 4. Deliberately outside

The specification excludes mandatory estimates and story points, burndown and advanced reports,
Butler-style automation, a bug database, a wiki, and custom fields. Taiga and Plane have them,
but they are not the simple tools, and chasing them is not the goal. How long a task stayed in
each column is served to assistants (the column stays), so questions like these can be asked of
an assistant without the product growing a reporting module.

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

1. **Phase 8:** real sign-in and backups. Google sign-in by invitation is built (21 September
   2026); gameweld.eu still runs the persona sign-in. Backups are deferred behind step 8 (decided
   21 September 2026).
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
8. **AI tools**, now first (decided 21 September 2026): API tokens and an OpenAPI description
   first, then the MCP server with the history routes for analysis, then the skill. Tokens and the
   description are done (21 September 2026), with every change made through a token marked in
   the history, and so are the MCP server, the history routes, and the skill (21 September
   2026). Done.
9. **Polish translation, the touch fix on phones, and Cmd+K.** Done (20 September 2026).

Steps 2 to 4 do the most to make daily use feel like Trello. Steps 1 and 7 decide whether anyone
other than the author really starts using it. Step 8 is the one thing here that the simple tools
do not have.

## Keeping this current

When an entry ships, move it to "Where GameWeld stands" in a sentence and delete it from the
gaps, in the same commit as the feature. When an entry is rejected, move it to "Deliberately
outside" with the reason.
