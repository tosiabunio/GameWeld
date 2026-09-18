import type { Task } from '@gameweld/domain';

/** Section 7: each task shows whether it is unplaced, on a Workboard, or complete. */
export function TaskStatus({ task }: { task: Task }) {
  if (task.archived) return <span className="badge warn">Deleted</span>;
  if (task.completed) return <span className="badge done">Complete</span>;
  if (task.placement) {
    return (
      <span className="badge">
        On {task.placement.boardName} · {task.placement.columnName}
        {task.placement.enteredAsException ? ' · Out of scope' : ''}
      </span>
    );
  }
  return <span className="badge neutral">Unplaced</span>;
}
