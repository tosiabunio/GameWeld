-- Task cards show a cover, like Backlog cards: the task's most recent previewable image.
ALTER TABLE tasks
  ADD COLUMN cover_attachment_id uuid REFERENCES attachments (id) ON DELETE SET NULL;

-- Tasks never had a cover to choose, so each starts with its newest image.
UPDATE tasks t
   SET cover_attachment_id = latest.id, version = t.version + 1, updated_at = now()
  FROM (
    SELECT DISTINCT ON (task_id) task_id, id
      FROM attachments
     WHERE task_id IS NOT NULL
       AND content_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')
     ORDER BY task_id, created_at DESC, id DESC
  ) latest
 WHERE latest.task_id = t.id;
