import type { Label, Task } from '@gameweld/domain';

/** A date kept as YYYY-MM-DD is a day on the viewer's calendar, not a moment in some time zone. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Whole days from today to the day; negative once it has passed. */
export function daysUntil(day: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDay(day).getTime() - today.getTime()) / 86_400_000);
}

export const formatDay = (day: string) =>
  parseDay(day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(parseDay(day).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });

export function LabelChip({ label }: { label: Pick<Label, 'name' | 'color'> }) {
  return <span className={`label-chip label-${label.color}`}>{label.name}</span>;
}

/** A task's labels, as the first thing on its card. Nothing when it has none. */
export function LabelChips({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="label-chips">
      {labels.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}
    </div>
  );
}

/** "Blocked" and the task's date, among a card's other badges. */
export function TaskFlags({
  task,
}: {
  task: Pick<Task, 'blocked' | 'blockedReason' | 'dueDate' | 'completed'>;
}) {
  const left = task.dueDate ? daysUntil(task.dueDate) : null;
  // A date says something about work still to do; on finished work it is only a date.
  const urgency =
    left === null || task.completed ? '' : left < 0 ? ' overdue' : left <= 1 ? ' soon' : '';
  return (
    <>
      {task.blocked && (
        <span className="badge blocked" title={task.blockedReason || 'Blocked'}>
          Blocked
        </span>
      )}
      {task.dueDate && (
        <span
          className={`due-date${urgency}`}
          title={
            urgency === ' overdue'
              ? `Was due ${formatDay(task.dueDate)}`
              : `Due ${formatDay(task.dueDate)}`
          }
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
            <rect
              x="2"
              y="3"
              width="12"
              height="11"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <span className="sr-only">{urgency === ' overdue' ? 'Overdue, was due ' : 'Due '}</span>
          {formatDay(task.dueDate)}
        </span>
      )}
    </>
  );
}
