import { useState, type ReactNode } from 'react';
import { t } from '../i18n/index.ts';

/** A side-column disclosure. It starts open when it has something to show, then obeys the viewer. */
export function ResourcePanel({
  title,
  count,
  children,
}: {
  /** In English: it names the panel for tests as it is, and is shown in the viewer's language. */
  title: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);

  return (
    <details
      className="panel resource-section"
      data-testid={`resource-${title.toLowerCase()}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {t(title)} <span className="count">{count}</span>
      </summary>
      <div className="resource-content">{children}</div>
    </details>
  );
}
