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
notifications in the app with a list of what waits for the viewer's decision, filters and title
search, the task in a window over its board, dark mode, a phone layout,
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
| Live updates | Trello, Planka, Wekan, Plane | A board refreshes only after the viewer's own action. Two people see different states until one of them hits an edit conflict. |

### 2. Everyday comfort that even the simplest tools offer

- **Finishing a task that is not on a Workboard.** The only way to complete a task in the
  interface is to drag its card into Done; a task that waits in the Breakdown has no such
  control, though the API can complete it. Found while building notifications.
- **Markdown and @mentions** in descriptions and comments. All five have them; GameWeld shows
  plain text.
- **Checklists inside a task** (Trello, Planka, Wekan). Without them people multiply tiny tasks
  or keep lists in the description.
- **Labels, and above all a "blocked" flag** (Taiga). Today a card has only its task category
  and its item's MoSCoW category; nothing marks a bug, polish, or a platform.
- **Dates.** The specification deliberately infers no deadlines. An optional date on an item, or
  a milestone date on a Workboard, does not break that, and all five have dates.
- **Swimlanes on the Workboard**, by backlog item or by person (Wekan, Taiga, Plane). With
  several items in scope this reads better than a filter.
- **Opening an archived Workboard.** Archived boards are a list of names; the API can return
  one, the interface has no view for it.
- **Global search and quick open** (Cmd+K), and keyboard shortcuts.
- **Card operations:** copying a task, task templates, selecting several cards at once.
- **"My tasks" across projects** (Trello's home, Plane's "Your work"). Today it is per project.

### 3. Adoption and surroundings

- **Import from Trello** (Planka, Wekan, and Taiga have one) and **JSON/CSV export**. Without an
  import nobody moves an existing board over; without an export nobody trusts it with their data.
- **Webhooks, and notifications to Discord or Slack.** Game teams live on Discord, and it is the
  cheapest notification channel to build.
- **API tokens and API documentation.**
- **A read-only role or a public link** for a publisher or stakeholder (Trello's observers,
  Plane's guests).
- **Translations.** The interface is English only; Planka, Wekan, and Taiga are multilingual.
- **Touch on a phone.** A draggable card takes the touch (`touch-action: none`), so a finger on a
  card cannot scroll the page. This is a defect rather than a missing feature.

### 4. Deliberately outside

The specification excludes mandatory estimates and story points, burndown and advanced reports,
Butler-style automation, a bug database, a wiki, and custom fields. Taiga and Plane have them,
but they are not the simple tools, and chasing them is not the goal. One exception costs little:
how long a task stayed in each column can be computed from the placement history that already
exists.

## Proposed order

1. **Phase 8:** real sign-in and backups.
2. **Notifications.** Done in the app: the bell, with what waits for the viewer (requests to
   decide, items to accept). Still to do: a Discord webhook per project, then e-mail once
   sign-in is real.
3. **Live updates** (server-sent events).
4. **Markdown, @mentions, and checklists.**
5. **Labels with a "blocked" flag, and optional dates.**
6. **Swimlanes, and opening archived Workboards.**
7. **Import from Trello, and export.**
8. **Polish translation, the touch fix on phones, and Cmd+K.**

Steps 2 to 4 do the most to make daily use feel like Trello. Steps 1 and 7 decide whether anyone
other than the author really starts using it.

## Keeping this current

When an entry ships, move it to "Where GameWeld stands" in a sentence and delete it from the
gaps, in the same commit as the feature. When an entry is rejected, move it to "Deliberately
outside" with the reason.
