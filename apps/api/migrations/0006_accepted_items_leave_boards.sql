-- An accepted item leaves the active Workboard with all its tasks (specification Section 8, D6).
-- Apply the rule to items that were accepted while the earlier rule kept them on the board.
WITH accepted AS (
  SELECT b.id AS item_id, b.project_id, w.id AS board_id
    FROM backlog_items b JOIN workboards w ON w.project_id = b.project_id
   WHERE b.state = 'done' AND w.state = 'active'
), closed AS (
  UPDATE task_placements p
     SET is_current = false, removed_at = now(), removed_reason = 'item accepted',
         last_column_id = p.column_id
    FROM tasks t, accepted a
   WHERE p.task_id = t.id AND t.item_id = a.item_id AND p.board_id = a.board_id AND p.is_current
  RETURNING a.item_id, a.board_id
), unscoped AS (
  DELETE FROM workboard_scope s USING accepted a
   WHERE s.item_id = a.item_id AND s.board_id = a.board_id
  RETURNING s.item_id, s.board_id
)
INSERT INTO activity (project_id, action, entity_type, entity_id, next)
SELECT a.project_id, 'scope.removed', 'backlog_item', a.item_id,
       jsonb_build_object(
         'boardId', a.board_id,
         'reason', 'item accepted',
         'wasInScope', EXISTS (SELECT 1 FROM unscoped u WHERE u.item_id = a.item_id AND u.board_id = a.board_id),
         'removedTasks', (SELECT count(*) FROM closed c WHERE c.item_id = a.item_id AND c.board_id = a.board_id)
       )
  FROM accepted a
 WHERE EXISTS (SELECT 1 FROM unscoped u WHERE u.item_id = a.item_id AND u.board_id = a.board_id)
    OR EXISTS (SELECT 1 FROM closed c WHERE c.item_id = a.item_id AND c.board_id = a.board_id);
