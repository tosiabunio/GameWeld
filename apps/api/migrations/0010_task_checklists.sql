-- A checklist inside a task: the small steps of one piece of work, which would otherwise become
-- tiny tasks of their own or a list in the description. Ticking them is a convenience for whoever
-- does the task. It decides nothing: completion stays the task's own flag.
CREATE TABLE task_checklist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  done        boolean NOT NULL DEFAULT false,
  rank        text COLLATE "C" NOT NULL,          -- fractional index within the task
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_checklist_items_task_rank_idx ON task_checklist_items (task_id, rank);
