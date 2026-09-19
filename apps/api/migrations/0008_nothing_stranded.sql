-- Nothing is left stranded. The application now keeps these rules whenever a task, an item, or a
-- membership changes; this applies them once to what earlier versions left behind, and records
-- each repair in the activity history (without an actor: nobody did it).
--
--   1. An archived item keeps no place in an active Workboard's scope and no cards on it.
--   2. An unfinished task of an item in the active Workboard's scope is on that board.
--   3. A request never waits for a task that no longer needs it.
--   4. Unfinished work is not assigned to someone who is no longer a member of the project.
DO $$
DECLARE
  r record;
  target_column uuid;
  last_rank text;
  closed integer;
BEGIN
  -- 1. Archived items leave active boards with their cards, as accepted items do.
  FOR r IN
    SELECT DISTINCT w.id AS board_id, b.id AS item_id, b.project_id
      FROM backlog_items b
      JOIN workboards w ON w.project_id = b.project_id AND w.state = 'active'
     WHERE b.archived_at IS NOT NULL
       AND (EXISTS (SELECT 1 FROM workboard_scope s WHERE s.board_id = w.id AND s.item_id = b.id)
         OR EXISTS (SELECT 1 FROM task_placements p JOIN tasks t ON t.id = p.task_id
                     WHERE p.board_id = w.id AND p.is_current AND t.item_id = b.id))
  LOOP
    UPDATE task_placements p
       SET is_current = false, removed_at = now(), removed_reason = 'item archived',
           last_column_id = p.column_id
      FROM tasks t
     WHERE p.task_id = t.id AND t.item_id = r.item_id AND p.board_id = r.board_id AND p.is_current;
    GET DIAGNOSTICS closed = ROW_COUNT;
    DELETE FROM workboard_scope WHERE board_id = r.board_id AND item_id = r.item_id;
    INSERT INTO activity (project_id, action, entity_type, entity_id, next)
    VALUES (r.project_id, 'scope.removed', 'backlog_item', r.item_id,
            jsonb_build_object('boardId', r.board_id, 'reason', 'item archived',
                               'removedTasks', closed));
  END LOOP;

  -- 2. Unfinished tasks of items in scope go to the end of their To Do column, oldest first.
  --    A fractional index key with a letter appended sorts right after the key itself.
  FOR r IN
    SELECT t.id AS task_id, t.project_id, t.category, w.id AS board_id
      FROM tasks t
      JOIN backlog_items b ON b.id = t.item_id AND b.archived_at IS NULL
      JOIN workboard_scope s ON s.item_id = t.item_id
      JOIN workboards w ON w.id = s.board_id AND w.state = 'active'
     WHERE NOT t.completed AND t.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM task_placements p WHERE p.task_id = t.id AND p.is_current)
     ORDER BY t.created_at, t.id
  LOOP
    SELECT id INTO target_column FROM board_columns
     WHERE board_id = r.board_id AND kind::text = 'todo_' || r.category::text AND deleted_at IS NULL;
    SELECT max(rank COLLATE "C") INTO last_rank FROM task_placements
     WHERE column_id = target_column AND is_current;
    INSERT INTO task_placements (task_id, board_id, column_id, rank)
    VALUES (r.task_id, r.board_id, target_column, coalesce(last_rank || 'V', 'a0'));
    INSERT INTO activity (project_id, action, entity_type, entity_id, next)
    VALUES (r.project_id, 'task.placed', 'task', r.task_id,
            jsonb_build_object('boardId', r.board_id, 'reason', 'its item is in scope'));
  END LOOP;

  -- 3. Pending requests for tasks that are on a board already, are finished or deleted, or
  --    belong to an archived item.
  FOR r IN
    SELECT q.id, q.task_id, q.board_id, t.project_id,
           EXISTS (SELECT 1 FROM task_placements p WHERE p.task_id = t.id AND p.is_current) AS placed,
           t.completed, t.archived_at IS NOT NULL AS deleted
      FROM work_requests q
      JOIN tasks t ON t.id = q.task_id
      JOIN backlog_items b ON b.id = t.item_id
     WHERE q.status = 'pending'
       AND (t.completed OR t.archived_at IS NOT NULL OR b.archived_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM task_placements p WHERE p.task_id = t.id AND p.is_current))
  LOOP
    UPDATE work_requests
       SET status = (CASE WHEN r.placed THEN 'approved' ELSE 'rejected' END)::request_status,
           decided_at = now(), version = version + 1,
           decision_note = CASE WHEN r.placed THEN 'Task already on the Workboard'
                                WHEN r.completed THEN 'Task completed'
                                WHEN r.deleted THEN 'Task deleted'
                                ELSE 'Backlog item archived' END
     WHERE id = r.id;
    INSERT INTO activity (project_id, action, entity_type, entity_id, next)
    VALUES (r.project_id, CASE WHEN r.placed THEN 'request.approved' ELSE 'request.rejected' END,
            'work_request', r.id,
            jsonb_build_object('taskId', r.task_id, 'boardId', r.board_id, 'note', 'repair'));
  END LOOP;

  -- 4. Unfinished tasks of people who left the project go back to nobody.
  FOR r IN
    SELECT t.id AS task_id, t.project_id, t.assignee_id
      FROM tasks t
     WHERE t.assignee_id IS NOT NULL AND NOT t.completed
       AND NOT EXISTS (SELECT 1 FROM project_memberships m
                        WHERE m.project_id = t.project_id AND m.user_id = t.assignee_id)
  LOOP
    UPDATE tasks SET assignee_id = NULL, version = version + 1, updated_at = now()
     WHERE id = r.task_id;
    DELETE FROM my_task_ranks WHERE task_id = r.task_id;
    INSERT INTO activity (project_id, action, entity_type, entity_id, previous, next)
    VALUES (r.project_id, 'task.updated', 'task', r.task_id,
            jsonb_build_object('assigneeId', r.assignee_id),
            jsonb_build_object('assigneeId', NULL, 'reason', 'member removed'));
  END LOOP;
END $$;
