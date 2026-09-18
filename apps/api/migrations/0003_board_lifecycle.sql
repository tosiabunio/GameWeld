-- Keep deleted intermediate columns available to placement and activity history.
ALTER TABLE board_columns ADD COLUMN deleted_at timestamptz;
ALTER TABLE board_columns ADD CONSTRAINT board_columns_only_intermediate_deleted
  CHECK (deleted_at IS NULL OR kind = 'intermediate');

-- Repair unfinished tasks stranded on archived boards by earlier reopen/creation flows.
WITH returned AS (
  UPDATE task_placements p
     SET is_current = false, removed_at = now(), last_column_id = p.column_id,
         removed_reason = 'released from archived board'
    FROM workboards w, tasks t
   WHERE p.board_id = w.id AND p.task_id = t.id
     AND w.state = 'archived' AND p.is_current AND NOT t.completed
  RETURNING p.task_id, p.board_id, p.column_id, w.project_id
)
INSERT INTO activity (project_id, action, entity_type, entity_id, previous, next)
SELECT project_id, 'task.returned', 'task', task_id,
       jsonb_build_object('columnId', column_id),
       jsonb_build_object('boardId', board_id, 'reason', 'released from archived board')
  FROM returned;

-- Requests on archived boards cannot be decided through the active-board routes.
WITH rejected AS (
  UPDATE work_requests r
     SET status = 'rejected', decided_at = now(), decision_note = 'Workboard archived',
         version = r.version + 1
    FROM workboards w
   WHERE r.board_id = w.id AND w.state = 'archived' AND r.status = 'pending'
  RETURNING r.id, r.task_id, r.board_id, w.project_id
)
INSERT INTO activity (project_id, action, entity_type, entity_id, next)
SELECT project_id, 'request.rejected', 'work_request', id,
       jsonb_build_object('taskId', task_id, 'boardId', board_id, 'note', 'Workboard archived')
  FROM rejected;

-- SVG and other non-previewable attachments remain downloadable, but are no longer covers.
UPDATE backlog_items b SET cover_attachment_id = NULL, version = b.version + 1, updated_at = now()
  FROM attachments a
 WHERE b.cover_attachment_id = a.id
   AND a.content_type NOT IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp');
