# Breaking an item down

A breakdown turns a Backlog item into tasks that one person can each finish in a few days, that
someone else can check, and that together make the item playable. The team works from these
cards every day, so a clear, complete breakdown is worth more than a long one.

## 1. Read

- `get_item`: the description, the tasks it already has (with their categories and state), and
  the comments, which often hold decisions or open questions.
- `get_project`: the members and their roles, if you may need to suggest assignees, and the
  labels the team uses.

If the description leaves the goal unclear (what the player gets, what "done" means), ask one
or two questions, or state your assumptions with the draft so the user can correct them.

## 2. Draft

Sort the work into the three categories the way game teams split it:

- **code**: gameplay and systems programming, tools, UI behaviour, save data, networking,
  performance, and hooking assets and content into the build.
- **assets**: what is made in art and audio tools: models, textures, sprites, animation, VFX, UI
  art, sound effects, music, recorded voice.
- **content**: what designers and writers make in the editor or in documents: level and
  encounter layout, tuning values, quests, dialogue and on-screen text, tutorials, localisation,
  balancing passes.

Rules of thumb that make a breakdown useful:

- Start each title with a verb and name the thing: "Model the grappling hook", not "Hook".
- Keep a task to one person and a few days. Split anything bigger; merge crumbs.
- Say in the description when it is done, in a sentence: "Done when the hook attaches to any
  surface tagged grapple and the rope swings with momentum."
- Cover the whole path to playable: an asset usually needs integration (code) and set-up or
  tuning (content) to reach the player. A missing link is the most common hole.
- Skip what the existing tasks already cover, and say so.
- Don't add testing tasks unless the team works that way: Testers check work as it reaches Done.
- Leave tasks unassigned unless the user asks. If they do, match people by role and by the work
  they already have; GameWeld records no skills, so ask when unsure.

## 3. Propose

Show the draft grouped by category, one line each with its "done when", and note what you left
out and why. Ask the user to confirm or adjust. If the item is Ready for Review or Done, warn
that adding a task returns it to Open and voids an acceptance.

## 4. Create

Create the confirmed tasks with one `create_tasks` call. Tasks of an item that is in the active
Workboard's scope land straight in their To Do columns. Tasks are created one by one; if one is
refused, the ones before it stay, and the answer says which failed and why.

## 5. Report

Say how many tasks were created per category and where they are (on the board or in the
Backlog). Put any open questions where the team will see them, as a comment on the item with
`add_comment`, if the user wants them kept.
