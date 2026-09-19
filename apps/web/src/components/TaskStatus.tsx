import type { Task } from '@gameweld/domain';
import { t } from '../i18n/index.ts';

/** Section 7: each task shows whether it is unplaced, on a Workboard, or complete. */
export function TaskStatus({ task }: { task: Task }) {
  if (task.archived) return <span className="badge warn">{t('Deleted')}</span>;
  if (task.completed) return <span className="badge done">{t('Complete')}</span>;
  if (task.placement) {
    return (
      <span className="badge">
        {t('On {board} · {column}', {
          board: task.placement.boardName,
          column: task.placement.columnName,
        })}
        {task.placement.enteredAsException ? t(' · Out of scope') : ''}
      </span>
    );
  }
  return <span className="badge neutral">{t('Unplaced')}</span>;
}
