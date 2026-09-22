-- Done only grows, while the other lanes empty out as items are worked. The Backlog can be read
-- by state (listBacklog's state), so its items are indexed by project and state, leaving out the
-- archived ones, which no list shows.
CREATE INDEX backlog_items_project_state_idx ON backlog_items (project_id, state)
  WHERE archived_at IS NULL;
