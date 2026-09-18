import { useState, type ReactNode } from 'react';

/** A side-column disclosure. It starts open when it has something to show, then obeys the viewer. */
export function ResourcePanel({
  title,
  count,
  children,
}: {
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
        {title} <span className="count">{count}</span>
      </summary>
      <div className="resource-content">{children}</div>
    </details>
  );
}
