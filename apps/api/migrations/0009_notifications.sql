-- Notifications: what happened that one member should know about, because it concerns their
-- work or waits for their decision. One row per recipient. The titles shown with a notification
-- are read from the task and the item when it is listed, so they stay current; a notification
-- goes with its task, item, or project when that is deleted.
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  kind        text NOT NULL,
  task_id     uuid REFERENCES tasks (id) ON DELETE CASCADE,
  item_id     uuid REFERENCES backlog_items (id) ON DELETE CASCADE,
  detail      text NOT NULL DEFAULT '',          -- a decision's note, or the start of a comment
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
