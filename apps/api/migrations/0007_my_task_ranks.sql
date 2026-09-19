-- "My tasks": the order in which one member wants to work through the tasks assigned to them.
-- It is that member's own and changes nothing for anyone else. A task without a row has not been
-- ordered yet and follows the ordered ones. Fractional index keys compare bytewise, hence "C".
CREATE TABLE my_task_ranks (
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  task_id  uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  rank     text COLLATE "C" NOT NULL,
  PRIMARY KEY (user_id, task_id)
);
CREATE INDEX my_task_ranks_task_idx ON my_task_ranks (task_id);
