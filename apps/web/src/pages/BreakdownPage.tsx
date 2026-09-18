import type { BacklogItem, BacklogLane } from '@gameweld/domain';
import { BACKLOG_LANES, LANE_LABELS, laneOf } from '@gameweld/domain';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router';
import { api } from '../api.ts';
import { ItemBreakdown } from './ItemBreakdown.tsx';
import { useProject } from './ProjectPage.tsx';

/**
 * Breakdown tab (specification Section 13): pick an item from the horizontal navigation, then
 * inspect its description and its Code, Assets, and Content task columns.
 */
export function BreakdownPage() {
  const { project } = useProject();
  const { itemId } = useParams<{ itemId?: string }>();
  const [items, setItems] = useState<BacklogItem[] | null>(null);

  const reload = useCallback(async () => {
    setItems(await api.backlog(project.id));
  }, [project.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => {
    const map = new Map<BacklogLane, BacklogItem[]>(BACKLOG_LANES.map((l) => [l, []]));
    for (const item of items ?? []) map.get(laneOf(item))!.push(item);
    return map;
  }, [items]);

  return (
    <div className="breakdown-layout">
      <nav className="item-nav" aria-label="Backlog items" data-testid="item-nav">
        {items === null ? (
          <p className="muted small">Loading…</p>
        ) : items.length === 0 ? (
          <p className="muted small">No backlog items yet. Add some on the Backlog tab.</p>
        ) : (
          BACKLOG_LANES.map((lane) => {
            const laneItems = grouped.get(lane)!;
            if (laneItems.length === 0) return null;
            return (
              <section key={lane}>
                <h4>{LANE_LABELS[lane]}</h4>
                <ul>
                  {laneItems.map((item) => (
                    <li key={item.id}>
                      <NavLink
                        to={`/projects/${project.id}/breakdown/${item.id}`}
                        className={({ isActive }) => (isActive ? 'active' : '')}
                      >
                        <span className="item-nav-title">{item.title}</span>
                        <span className="muted small">
                          {item.taskCounts.completed}/{item.taskCounts.total}
                        </span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </nav>
      <div className="breakdown-main">
        {itemId ? (
          <ItemBreakdown key={itemId} itemId={itemId} onChanged={reload} />
        ) : (
          <p className="muted">Choose a backlog item to see its breakdown.</p>
        )}
      </div>
    </div>
  );
}
