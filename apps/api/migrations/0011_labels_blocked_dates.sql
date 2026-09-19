-- What a card says about its task beyond its category: free labels, a "blocked" flag, and an
-- optional date. And an optional end date for a Workboard. None of them carries a rule: the
-- product infers no deadlines, a label means what the team says it means, and "blocked" stops
-- nothing. They are there to be seen and filtered by.

-- Labels belong to a project; their colour is one of a fixed palette the interface knows.
CREATE TABLE project_labels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  color       text NOT NULL CHECK (color IN ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'gray')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_labels_name_idx ON project_labels (project_id, lower(name));

CREATE TABLE task_labels (
  task_id   uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  label_id  uuid NOT NULL REFERENCES project_labels (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
CREATE INDEX task_labels_label_idx ON task_labels (label_id);

ALTER TABLE tasks
  ADD COLUMN due_date        date,
  ADD COLUMN blocked         boolean NOT NULL DEFAULT false,
  ADD COLUMN blocked_reason  text NOT NULL DEFAULT '',
  -- Finished work is not blocked, and a reason belongs to a block.
  ADD CONSTRAINT tasks_blocked_is_unfinished CHECK (NOT (blocked AND completed)),
  ADD CONSTRAINT tasks_reason_needs_block CHECK (blocked OR blocked_reason = '');

ALTER TABLE workboards ADD COLUMN ends_on date;
