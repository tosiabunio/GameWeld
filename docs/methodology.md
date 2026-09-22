# The GameWeld Method

How small game teams build a game that always works, one layer at a time.

GameWeld is a production tool built around a way of working. This document describes that way of working: what it assumes, who decides what, and how work moves from an idea to an accepted part of the game. It is written for teams that are thinking of using GameWeld, and for anyone who wants to understand why the tool behaves the way it does.

## 1. Who the method is for

The method is meant for small projects: independent games made by teams of a few people, usually fewer than ten. It assumes a team that manages itself. People choose their own tasks, talk to each other directly, and do not need a manager to hand out work.

It borrows from agile methods, mainly Scrum's prioritised backlog and Kanban's flow of work across a board. It leaves out most of their ceremony. It does not require sprints, fixed-length iterations, estimates, stand-ups, or retrospectives. A team may use any of these, but none of them is part of the method.

## 2. The core idea: a game that always works

**A game grows from a working core by adding layers, and it stays playable after every layer.**

The team starts with the smallest version of the game that runs, and keeps adding to it. Each addition, called a **layer**, is a new piece of functionality or new content in the game that already exists. A layer should not break what is already there. It should leave behind a new, better version of the game that someone can play.

Early layers are mostly systems: movement, the core loop, saving, the first enemy. As production goes on, the work moves towards content (levels, characters, quests, dialogue, music) and then towards finishing the game (polish, balance, performance, the front end).

This has consequences:

- **The game can be seen and judged at any time.** Because there is always a working version, the team and the Game Director can play it whenever they like. They can check the game's assumptions, its planned scope, and the plans for what comes next against something real, rather than against a document.
- **Milestones become observations, not phases.** The method has no fixed stages. Prototype, vertical slice, alpha, and beta are not phases the team moves through. They are descriptions of the current game, and the Game Director decides when they apply. At any moment the Game Director can ask what the current version is missing to count as, say, a vertical slice, and put those layers at the top of the Backlog. A team that has to deliver milestones to a publisher does it the same way: the milestone is a set of layers that must be accepted by a date.
- **Work is not stored up for later.** A layer should make the current game richer. It should not be a fragment of work that will only be used at some point in the future. This is not always possible, since some work needs several layers before it shows in the game. It is still the goal of every layer, and the Game Director should prefer layers that meet it.

Some layers do not change the game itself. A layer that builds a level editor, an import pipeline, or a debug tool leaves the game as it was. The game must still work afterwards, and the new tool must work too.

The method does not say how "working" is checked. One team plays a build after every layer, another runs automated tests, and a third has the Game Director try it on Fridays. What matters is that the team treats a broken game as something to fix now, not later.

## 3. Layers

A layer is a unit of intended production. In GameWeld it is a **Backlog Item**, and the two words mean the same thing: this document says "layer" when talking about the method, and "Backlog Item" when talking about the tool.

Other methods split this idea into epics, features, user stories, and so on, each with its own size and format. The GameWeld method has one kind of layer. It sets no rules for:

- **Size.** "Ranged enemy", "Chapter 2", and "Fix the jump arc" are all layers.
- **Format.** A layer's description is free text. It may be one line, a short design note, or a link to a longer document. Suggested headings (what the result should be, how it will be checked) are available, but they are optional.
- **Naming.** A team may call its layers features, stories, or anything else.

A layer's size shows in how many tasks it has. The method uses no estimates or story points. A layer with twenty tasks is a bigger piece of work than one with three, and for a small team that is usually enough. GameWeld's task counts show how much of a layer's work is finished. They do not claim to show how much effort is left, or how far the whole game has come.

## 4. The Backlog and its priorities

All planned layers live in one **Backlog**, sorted with the MoSCoW method:

| Category | Meaning |
| --- | --- |
| **Must Have** | Layers the game cannot ship without. The top of this list is what the team should be working on next. |
| **Should Have** | Layers that matter and are planned, but the game could ship without them if it had to. |
| **Could Have** | Layers the game would be better for, done if time allows. |
| **Won't Have** | Layers that are out, at least for now. |

Priority works at two levels:

1. **The category** is the coarse priority. It says roughly how important a layer is.
2. **The position within a category** is the fine priority. The layer at the top of Must Have is the most important unfinished layer in the game. The one below it comes next, and so on.

The method does not say what planning horizon a category covers. For most teams Must Have means "needed for release", but a team may equally use it for the next milestone. It helps to write the team's choice down in the project's description.

**Won't Have** is more than a bin. It is where the Game Director:

- **cuts scope**: moves out layers the game will not get, so that everyone can see the decision;
- **defines scope early**: settles what the game is not, before anyone spends time on it;
- **keeps rejected ideas**: stores ideas that were considered and turned down, with the reasoning, so the same discussion does not happen twice.

Beside the four planning categories, the Backlog shows the layers that are **Ready for Review** and those that are **Done**. A layer keeps its category when it moves there. If it is reopened, it goes back to where it was planned.

### Planning is continuous

Planning at the level of layers never stops. There is no planning phase and no fixed moment for it. The Game Director keeps the Backlog in order: adds new layers, moves layers between categories, and reorders them within a category. This usually happens in response to playing the current version of the game, to playtests the Game Director ran or asked for, or to what the team has learned while building.

Changing priorities does not disturb work that has already started. Layers the team is working on stay where they are. The new order decides what comes next. A Game Director who prefers to work in cycles, such as sprints or milestones, may wait until a cycle ends before changing anything. The method allows both approaches.

## 5. Code, Assets, and Content

A layer is built by completing a set of **tasks**. Each task is one piece of work that one person can pick up. Every task belongs to exactly one of three categories:

| Category | What it covers | Examples |
| --- | --- | --- |
| **Code** | Functionality of the game or of the team's tools. | Enemy targeting, the save system, a level-import script, a shader. |
| **Assets** | The raw material: graphics, animation, sound, music, models, fonts. | The ranged enemy's model and attack animation, footstep sounds, the level's tileset. |
| **Content** | What players actually experience, made by combining code and assets in the game. | Placing and tuning enemies in a level, building a level from its tileset, writing a quest, setting up a dialogue, balancing a weapon. |

The name GameWeld comes from this model: **code and assets are welded into content.**

A layer may have tasks in any mix of categories. A new mechanic may be mostly Code. A new level may be mostly Content with some Assets. A layer that replaces the sound effects may be Assets alone. No category is required, and there is no expected ratio. In some stretches of production one category may not come up at all, for example no Content early on, or little Code near the end.

A task keeps its category from start to finish. The category describes what kind of work the task is. It says nothing about how far the task has progressed.

### Where design goes

Design is not a fourth category. It belongs with the thing being designed:

- **The design of the game as a whole** (its vision, pillars, core loop, and overall structure) is a layer of its own, made of Content tasks. It describes what players will experience, which is what Content means.
- **The design of a single feature** sits in that feature's layer, as a task in the category it shapes. Designing a new combat mechanic before implementing it is a Code task. Deciding the look of a character before modelling it is an Assets task. Laying out a level on paper before building it is a Content task.

The rule of thumb: ask what the design will become. The design task takes the category of that result.

## 6. Roles and who decides what

GameWeld has three roles. A person may hold more than one of them, which is common in small teams: a Game Director who also programs, or a designer who also tests.

| Role | Responsibility |
| --- | --- |
| **Game Director** | Owns the Backlog: which layers exist, their priority, and which layers the team works on now. Accepts finished layers. |
| **Developer** | Builds the game. Programmers, artists, designers, writers, sound designers, and everyone else who produces work are Developers. |
| **Tester** | Checks that work is really done. Optional, and only needed if the team wants tasks verified before they count as finished. |

The method separates two kinds of decision.

**What to build, and in what order, is the Game Director's decision.** Only the Game Director adds layers to the Backlog, changes their priority, and decides which ones the team works on now.

**How to build it is the team's decision.** Everyone in the project may:

- add tasks to any layer, at any time;
- comment on anything;
- pick up any task that is open for work;
- propose work outside the current plan (Section 8).

Assigning a task is optional. An assignment made in advance signals who is expected to do the work. It does not reserve the task, and anyone may still pick it up. When someone starts working on a task, they should assign it to themselves, so the whole team can see who is doing what.

## 7. Breakdown: turning a layer into tasks

The tasks of a layer, grouped by Code, Assets, and Content, are called its **Breakdown**. In GameWeld the Breakdown is a view of a layer, not a stage it has to pass through.

The Game Director and the rest of the team write a layer's tasks together. This can happen at any point:

- right after the layer is defined, as a first sketch of the work;
- just before work starts, when the people who will do it know the most;
- during the work, as it turns out what is still needed.

A layer can start with no tasks at all. The team does not have to write every task before it starts. A layer counts as done only when its tasks are, so the list of tasks is the layer's working definition, and it can change as the team learns.

**Every task belongs to exactly one layer.** A task cannot exist on its own, and one task never belongs to two layers. When a piece of work serves several layers (a shared animation rig, say), it belongs to the layer that needs it first, and the other layers refer to that layer as a dependency. Dependencies between layers are for information only. They show that one layer builds on another, but they do not stop anyone from working.

## 8. Doing the work: the Workboard

Work happens on a **Workboard**, a Kanban board.

### Choosing the layers to work on

The Game Director chooses which layers the team is working on. These layers are the Workboard's **scope**, and their tasks become cards on the board. The Game Director respects the priorities and normally takes layers from the top of the Backlog, that is, from the top of Must Have while it has any. The Game Director still has some freedom: a layer further down may fit the team's free hands better, or build on work that has just been finished. GameWeld suggests the next layer in priority but does not force it. The only layers that never come in are those in Won't Have. When a layer becomes more important than its place says, the Game Director moves it up the Backlog, so the order keeps telling the team what matters.

The team usually works on several layers at once. Layers do not divide the work evenly: an artist may have finished everything in one layer while the programmers still have days of work in it. With several layers in scope, everyone has something useful to do, and the order of the Backlog still decides which layers those are. The project sets a limit on how many layers can be in scope at a time, so that the team finishes layers instead of starting too many.

### Work outside the scope

Sometimes a team member has time for a task whose layer is not in scope. An artist with nothing left to do, for example, might want to start the animations for the next enemy. They ask the Game Director, who can approve the single task without bringing its whole layer into scope. Such a task is marked **Out of scope** on the board, and it counts towards its own layer like any other task. The team gets the flexibility, and the Game Director stays in control of what the team is working on.

### The flow of a task

A Workboard has:

- three **To Do** columns, one each for Code, Assets, and Content, where tasks wait to be picked up;
- any number of columns in between, named and arranged by the team;
- a final **Done** column.

The simplest workflow needs no columns in between. Someone picks a task from To Do, works on it, and moves it to Done. A team that wants more steps adds them, for example *In progress*, *In review*, and *Check in game*. These columns mean whatever the team decides. GameWeld attaches no rules to them.

A team that wants every task checked before it counts as finished can require that only Testers move tasks into Done. The person who did the work then leaves the task in a column before Done, and a Tester moves it on after checking it. Checking a task this way is separate from accepting a layer (Section 9).

### Rhythm

A Workboard can stand for a sprint, a week, a milestone, or simply the team's current work without an end date. The method takes no side. A team working continuously keeps one board and brings new layers into its scope as others are finished. A team working in cycles archives the board at the end of each cycle and starts a new one. Stand-ups, reviews, and retrospectives are the team's own choice.

## 9. Finishing a layer

Finishing a layer takes two steps, and they are separate on purpose.

1. **The tasks are done.** When every task of a layer is in Done, the layer becomes **Ready for Review** on its own. This means the work is finished. It does not yet mean the layer is accepted.
2. **The Game Director accepts the layer.** The Game Director checks the result in whatever way suits the layer (playing a build, watching a video, reading the tool's output) and accepts it as **Done**. An accepted layer leaves the Workboard, and its place in the scope is freed for the next layer.

The method does not prescribe how a layer is checked. It asks only one question: is the game now better in the way this layer promised, and does it still work?

### When a layer fails review

If the result is not good enough, the Game Director sends the layer back, with a note saying why. The Game Director then adds the missing tasks, or reopens and changes existing ones, and the layer returns to work. There is no separate "rejected" list. A layer that is sent back is simply open again, with more to do.

The right to accept or send back layers can also be given to a lead tester. This is a permission granted to that person, not an extra role or an extra list.

### Reopening accepted work

Accepted layers are not closed forever. If a new task is added to an accepted layer, or a finished task is reopened, the layer becomes open again and needs to be accepted anew. The earlier acceptance stays in the history. Changing a description or adding a comment does not reopen a layer.

## 10. Changing course

The method expects plans to change, and gives each kind of change an ordinary place:

- **New ideas** become new layers in the Backlog, in whichever category the Game Director thinks right, including Won't Have.
- **Cut features** move to Won't Have, where the decision stays visible.
- **Work nobody planned for** is handled with ordinary layers and tasks. If it supports an existing layer, it becomes a task in that layer. If it has a purpose of its own, such as "Speed up level loading" or "Improve the build pipeline", it becomes a new layer. For small miscellaneous work, a team may keep a general layer such as "Production support: September". This is a convention the team can adopt. GameWeld does not need it.
- **Bugs** stay in the team's bug tracker. GameWeld deliberately does not track bugs, so teams do not end up keeping two lists. A task or a layer can link to a bug when that helps, and fixing a group of bugs can be a layer of its own.

## 11. What the method leaves out

These are deliberate choices, not missing features:

- **No estimates or story points.** A layer's complexity is shown by the number of its tasks. Estimates may be added later as an option, but the method does not depend on them.
- **No fixed phases or milestones.** The game's stage is read from the game itself (Section 2).
- **No mandatory rituals** or iteration lengths.
- **No required format for layers**, and no required acceptance criteria.
- **No bug database.**
- **No meaning attached to the team's own columns.** Only Done carries a meaning.

## 12. When the method fits, and when it doesn't

The method works best when:

- the team is small enough that everyone knows what everyone else is doing;
- one person, the Game Director, is trusted to decide scope and priority;
- the game can be kept in a playable state from early on.

It fits less well when a large team needs many teams, formal plans, and resource scheduling, or when a contract requires detailed estimates up front. Such projects can still use GameWeld for day-to-day work, but they will need the missing parts from somewhere else.

## 13. An example

1. The Game Director adds **Ranged enemy** near the top of Must Have. The description is two lines: "An enemy that keeps its distance and shoots. Should make the player use cover."
2. In the Breakdown, the team adds a Code task for targeting and for keeping distance, an Assets task for the model and the attack animation, and a Content task for placing and tuning the enemy in the first two levels.
3. The Game Director brings Ranged enemy into the Workboard's scope. Its tasks appear in their To Do columns.
4. A programmer and an artist each assign themselves a task and move it through the team's columns, *Making* and *Check in game*.
5. The artist finishes early. They notice an animation task under **Flying enemy**, which is not in scope yet, and ask to work on it. The Game Director approves, and the task appears on the board marked Out of scope.
6. All tasks of Ranged enemy reach Done, and the layer is Ready for Review.
7. The Game Director plays the build, and finds the enemy shoots too fast to react to. They send the layer back with a note and add a Content task: "Slow the attack wind-up and retest." Ranged enemy is open again.
8. The designer finishes the task. The layer is Ready for Review again, and the Game Director accepts it. The game now has a ranged enemy in two levels. That is a better game than the one before, and it still works.

At no point did anyone estimate the work, fix a sprint length, fill in an acceptance checklist, or record a bug in GameWeld.
