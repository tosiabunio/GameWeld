import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { useDisplayOptions } from '../displayOptions.ts';
import { useCardSensors } from '../dragSensors.ts';
import { t, tp } from '../i18n/index.ts';
import { LANE_PAGE, shownCards, type ShownBefore } from '../lanePaging.ts';
import { isCardClick } from '../taskLinks.ts';

/**
 * Generic lanes of draggable cards, shared by the Backlog (items) and later the Workboard (tasks).
 *
 * Dragging updates a local copy of the lanes immediately so the card follows the pointer across
 * lanes; on drop, `onMove` is called with the card's new neighbours and the parent reloads the
 * authoritative order. Keyboard dragging (space to pick up, arrows to move, space to drop) comes
 * from dnd-kit, so the drag path is accessible without a pointer.
 *
 * A long lane stays manageable in two ways. It is at most as tall as the window below the strip,
 * and its cards scroll inside it, so its head and its footer (the form for a new card) stay in
 * sight. And it draws only its first cards, LANE_PAGE unless it says otherwise, with buttons for
 * the rest (see lanePaging.ts).
 */
export interface Lane<T> {
  id: string;
  title: string;
  /** Shown in the lane's head in place of the plain title, for a title that can be edited. */
  titleNode?: ReactNode;
  items: T[];
  /** How many cards the lane holds when `items` are only those that pass a filter. */
  total?: number;
  /** Cards may be dropped into this lane. */
  droppable: boolean;
  className?: string;
  footer?: ReactNode;
  actions?: ReactNode;
  /** How many cards show before the rest wait behind "Show more"; LANE_PAGE unless given. */
  limit?: number;
  /** The cards past the first ones are older rather than lower in priority: the buttons say so. */
  older?: boolean;
  /**
   * Puts the cards under headings, such as the month an item was accepted in, each of which
   * folds its cards away. Only while the cards that show fall under more than one.
   */
  groupOf?: (item: T) => string;
}

export interface CardRenderContext {
  index: number;
  count: number;
  isDragging: boolean;
}

export interface CardLanesProps<T extends { id: string }> {
  lanes: Lane<T>[];
  /** Whether the current user may drag at all. */
  canDrag: boolean;
  /** Per-card override, for example to pin cards that are not open. */
  isDraggable?: (item: T) => boolean;
  /** Per-card, per-lane rule on top of `lane.droppable`, for example category-specific columns. */
  canDrop?: (item: T, laneId: string) => boolean;
  renderCard: (item: T, ctx: CardRenderContext) => ReactNode;
  /** Files dragged in from outside the page and dropped on a card. Omit to ignore them. */
  onFilesDrop?: ((item: T, files: File[]) => void) | undefined;
  /**
   * A click anywhere on a card that is not on a control inside it. A press that moves is a drag
   * instead: the pointer sensor waits for six pixels, and dnd-kit swallows the click that ends it.
   */
  onCardClick?: ((item: T) => void) | undefined;
  onMove: (
    item: T,
    laneId: string,
    afterId: string | null,
    beforeId: string | null,
  ) => Promise<void>;
  testIdPrefix?: string;
  /** Remembers which lanes this viewer collapsed, in this browser, under this key. */
  collapseKey?: string;
  /**
   * False while a filter hides cards: a place among the cards that show says nothing about the
   * hidden ones between them, so a card dropped in its own lane goes back, and one dropped in
   * another lane joins its end.
   */
  reorder?: boolean;
}

const COLLAPSED_PREFIX = 'gameweld:collapsed:';

/** Collapsed lanes are a per-viewer convenience; storage may be missing or refuse. */
export function useCollapsedLanes(key: string | undefined) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (!key) return new Set();
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(COLLAPSED_PREFIX + key) ?? '[]');
      return new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback(
    (laneId: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(laneId)) next.add(laneId);
        if (key) {
          try {
            localStorage.setItem(COLLAPSED_PREFIX + key, JSON.stringify([...next]));
          } catch {
            // Collapsing still works for this visit.
          }
        }
        return next;
      }),
    [key],
  );
  return [collapsed, toggle] as const;
}

export function CardLanes<T extends { id: string }>({
  lanes,
  canDrag,
  isDraggable,
  canDrop,
  renderCard,
  onFilesDrop,
  onCardClick,
  onMove,
  testIdPrefix = 'lane',
  collapseKey,
  reorder = true,
}: CardLanesProps<T>) {
  const [chosen, toggleChosen] = useCollapsedLanes(collapseKey);
  const { collapseEmpty } = useDisplayOptions();
  // With "Collapse empty columns" on, a lane without cards is a stub until it gets one, unless
  // the viewer opened it during this visit, for instance to type a new card into it. Emptiness
  // follows the loaded lanes, not a drag in progress, so lanes do not fold under the pointer.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const emptyLanes = lanes
    .filter((lane) => lane.items.length === 0)
    .map((lane) => lane.id)
    .join('\n');
  const collapsed = useMemo(() => {
    if (!collapseEmpty || emptyLanes === '') return chosen;
    const all = new Set(chosen);
    for (const id of emptyLanes.split('\n')) if (!opened.has(id)) all.add(id);
    return all;
  }, [chosen, collapseEmpty, emptyLanes, opened]);
  const toggleLane = (laneId: string) => {
    if (!collapseEmpty || !emptyLanes.split('\n').includes(laneId)) return toggleChosen(laneId);
    // An empty lane: opening it overrides both reasons it may be shut; closing it hands it back.
    if (collapsed.has(laneId) && chosen.has(laneId)) toggleChosen(laneId);
    setOpened((was) => {
      const next = new Set(was);
      if (collapsed.has(laneId)) next.add(laneId);
      else next.delete(laneId);
      return next;
    });
  };
  const [local, setLocal] = useState<Record<string, T[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const laneStrip = useRef<HTMLDivElement>(null);

  // Paging. `limits` holds the lanes whose viewer asked for more; what each lane showed when it
  // was last drawn decides which cards past the limit still show (lanePaging.ts). A filter
  // turning on or off, or a lane asking for fewer cards than before, starts afresh.
  const [limits, setLimits] = useState<Record<string, number>>({});
  const lastShown = useRef(new Map<string, ShownBefore & { reorder: boolean; limit: number }>());
  const limitOf = useCallback(
    (lane: Lane<T>) => limits[lane.id] ?? lane.limit ?? LANE_PAGE,
    [limits],
  );
  const shownByLane = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const lane of lanes) {
      const was = lastShown.current.get(lane.id);
      const limit = limitOf(lane);
      const before = was && was.reorder === reorder && was.limit <= limit ? was : undefined;
      const ids = lane.items.map((item) => item.id);
      map.set(lane.id, shownCards(ids, lane.total ?? ids.length, limit, before, reorder));
    }
    return map;
  }, [lanes, limitOf, reorder]);
  useLayoutEffect(() => {
    for (const lane of lanes)
      lastShown.current.set(lane.id, {
        ids: lane.items.map((item) => item.id),
        total: lane.total ?? lane.items.length,
        shown: shownByLane.get(lane.id)!,
        reorder,
        limit: limitOf(lane),
      });
  }, [lanes, shownByLane, reorder, limitOf]);
  const showMore = (lane: Lane<T>, count: number) =>
    setLimits((was) => ({ ...was, [lane.id]: limitOf(lane) + count }));
  const showFewer = (lane: Lane<T>) => {
    lastShown.current.delete(lane.id);
    setLimits(({ [lane.id]: _dropped, ...rest }) => rest);
  };
  /** Headings folded away, by lane and heading. */
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const foldKey = (laneId: string, group: string) => `${laneId}\n${group}`;
  const toggleGroup = (key: string) =>
    setFolded((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // A lane is at most as tall as the window below the strip, so the strip's place on the page is
  // measured for the stylesheet. Whatever the page shows above it moves it, so after every draw.
  const measureTop = useCallback(() => {
    const strip = laneStrip.current;
    if (!strip) return;
    const top = `${Math.round(strip.getBoundingClientRect().top + window.scrollY)}px`;
    if (strip.style.getPropertyValue('--lanes-top') !== top)
      strip.style.setProperty('--lanes-top', top);
  }, []);
  useLayoutEffect(measureTop);
  useEffect(() => {
    window.addEventListener('resize', measureTop);
    return () => window.removeEventListener('resize', measureTop);
  }, [measureTop]);
  const [mobileLane, setMobileLane] = useState(lanes[0]?.id ?? '');
  const [hidden, setHidden] = useState({ left: 0, right: 0 });
  const shownIndex = Math.max(
    0,
    lanes.findIndex((lane) => lane.id === mobileLane),
  );

  // Lanes that do not fit are counted per side, so the page can say that there are more.
  const markHiddenLanes = useCallback(() => {
    const strip = laneStrip.current;
    if (!strip) return;
    const view = strip.getBoundingClientRect();
    const rects = Array.from(strip.children, (lane) => lane.getBoundingClientRect());
    const left = rects.filter((lane) => lane.left < view.left - 1).length;
    const right = rects.filter((lane) => lane.right > view.right + 1).length;
    setHidden((was) => (was.left === left && was.right === right ? was : { left, right }));
  }, []);

  function scrollLanes(direction: -1 | 1) {
    const strip = laneStrip.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    strip?.scrollBy({
      left: direction * strip.clientWidth * 0.8,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  // A phone shows one lane at a time, so the strip takes that lane's height rather than the
  // tallest lane's, which would leave a gap above whatever follows the lanes. A drag needs every
  // lane at full height to drop into.
  useEffect(() => {
    const strip = laneStrip.current;
    if (!strip) return;
    const phone = window.matchMedia('(max-width: 560px)');
    const lane = strip.children[shownIndex] as HTMLElement | undefined;
    const fit = () => {
      const style = getComputedStyle(strip);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      strip.style.height =
        phone.matches && lane && !activeId ? `${lane.offsetHeight + padding}px` : '';
      markHiddenLanes();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(strip);
    if (lane) observer.observe(lane);
    phone.addEventListener('change', fit);
    return () => {
      observer.disconnect();
      phone.removeEventListener('change', fit);
    };
  }, [shownIndex, activeId, collapsed, markHiddenLanes]);

  // Before paint: a filter changes the lanes on every keystroke, and a frame of the cards it
  // just hid would flicker.
  useLayoutEffect(() => {
    if (activeId) return; // do not clobber an in-progress drag with a stale reload
    setLocal(Object.fromEntries(lanes.map((l) => [l.id, l.items])));
  }, [lanes, activeId]);

  /**
   * What each lane draws: the cards that show, those under folded headings left out, with the
   * headings between them. Each card keeps its place among all the lane's cards, which moving it
   * up or down goes by.
   */
  type Row = { heading: string; key: string; count: number } | { item: T; index: number };
  const views = lanes.map((lane) => {
    const all = local[lane.id] ?? lane.items;
    const shown = shownByLane.get(lane.id)!;
    const showing = all.filter((item) => item.id === activeId || shown.has(item.id));
    const groups = lane.groupOf ? showing.map(lane.groupOf) : [];
    const headed = new Set(groups).size > 1;
    const indexOf = new Map(all.map((item, index) => [item.id, index]));
    const rows: Row[] = [];
    const cards: T[] = [];
    showing.forEach((item, n) => {
      if (headed) {
        const group = groups[n]!;
        const key = foldKey(lane.id, group);
        if (group !== groups[n - 1])
          rows.push({ heading: group, key, count: groups.filter((g) => g === group).length });
        if (folded.has(key)) return;
      }
      rows.push({ item, index: indexOf.get(item.id)! });
      cards.push(item);
    });
    return { lane, all, rows, cards, hidden: all.length - showing.length };
  });
  const drawn = Object.fromEntries(views.map((view) => [view.lane.id, view.cards]));

  // The keyboard sensor keeps the options it had when the drag began, so the coordinate getter
  // reads the lanes through a ref rather than from a stale closure.
  const layout = useRef({ lanes, local, drawn, canDrop, collapsed });
  useLayoutEffect(() => {
    layout.current = { lanes, local, drawn, canDrop, collapsed };
  });
  /** Where the last keyboard step aimed; the collision detection honours it exactly. */
  const keyboardTarget = useRef<string | null>(null);

  /**
   * Keyboard moves that follow the lanes. dnd-kit's sortable getter picks the nearest target
   * "to the right" by comparing left edges, and a card in the same lane can sit a subpixel to the
   * right of the dragged one, so Right moved cards up their own lane instead of across. Here Up
   * and Down step within the lane, and Left and Right jump to the next lane that accepts the
   * card, landing above its first card.
   */
  const laneKeyboardCoordinates: KeyboardCoordinateGetter = useCallback((event, { context }) => {
    const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 1, ArrowLeft: -1 }[event.code];
    const { active, over, collisionRect, droppableRects } = context;
    if (step === undefined || !active || !collisionRect) return undefined;
    event.preventDefault();
    const { lanes, local, drawn, canDrop } = layout.current;
    const activeId = String(active.id);
    const from = Object.keys(local).find((id) => local[id]!.some((i) => i.id === activeId));
    if (!from) return undefined;

    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      // The card's slot is the card it is over; items only reorder in state on drop. Only drawn
      // cards have a place to step to.
      const items = drawn[from] ?? [];
      const start = items.findIndex((i) => i.id === activeId);
      const at = items.findIndex((i) => i.id === over?.id);
      let next = (at === -1 ? start : at) + step;
      if (items[next]?.id === activeId) next += step;
      const target = items[next];
      const rect = target && droppableRects.get(target.id);
      if (!rect) return undefined;
      keyboardTarget.current = target.id;
      // Moving down aligns bottoms, as dnd-kit does, so cards of different heights still land.
      return { x: rect.left, y: next > start ? rect.bottom - collisionRect.height : rect.top };
    }

    const dragged = local[from]!.find((i) => i.id === activeId)!;
    const order = lanes.map((l) => l.id);
    for (let i = order.indexOf(from) + step; i >= 0 && i < order.length; i += step) {
      const lane = lanes[i]!;
      if (!lane.droppable || (canDrop && !canDrop(dragged, lane.id))) continue;
      const first = drawn[lane.id]?.[0];
      // A collapsed lane renders no cards, so aim at the lane and the card joins its end.
      const aim = first && droppableRects.has(first.id) ? first.id : lane.id;
      const rect = droppableRects.get(aim);
      if (rect) {
        keyboardTarget.current = aim;
        return { x: rect.left, y: rect.top };
      }
    }
    return undefined;
  }, []);

  /**
   * dnd-kit's closest corners, with two exceptions. A keyboard step lands exactly where the
   * getter aimed. A pointer over a collapsed lane lands in it: a card-wide rectangle over a
   * narrow stub mostly covers the next lane, which would otherwise win.
   */
  const collide: CollisionDetection = useCallback((args) => {
    const pick = (id: string) => {
      const container = args.droppableContainers.find((c) => c.id === id);
      return container ? [{ id, data: { droppableContainer: container, value: 0 } }] : null;
    };
    const aimed = keyboardTarget.current && pick(keyboardTarget.current);
    if (aimed) return aimed;
    const pointer = args.pointerCoordinates;
    if (pointer) {
      for (const id of layout.current.collapsed) {
        const r = args.droppableRects.get(id);
        const inside =
          r &&
          pointer.x >= r.left &&
          pointer.x <= r.right &&
          pointer.y >= r.top &&
          pointer.y <= r.bottom;
        const hit = inside && pick(id);
        if (hit) return hit;
      }
    }
    return closestCorners(args);
  }, []);

  const sensors = useCardSensors(laneKeyboardCoordinates);

  const byId = useMemo(() => {
    const map = new Map<string, T>();
    for (const lane of lanes) for (const item of lane.items) map.set(item.id, item);
    return map;
  }, [lanes]);

  const laneOfId = (id: string): string | undefined => {
    if (id in local) return id;
    return Object.keys(local).find((laneId) => local[laneId]!.some((i) => i.id === id));
  };

  function onDragStart(e: DragStartEvent) {
    keyboardTarget.current = null;
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const fromLane = laneOfId(String(active.id));
    const toLane = laneOfId(String(over.id));
    if (!fromLane || !toLane || fromLane === toLane) return;
    if (!lanes.find((l) => l.id === toLane)?.droppable) return;
    const dragged = byId.get(String(active.id));
    if (dragged && canDrop && !canDrop(dragged, toLane)) return;

    if (keyboardTarget.current && !collapsed.has(toLane))
      keyboardTarget.current = String(active.id);
    setLocal((prev) => {
      const source = prev[fromLane]!;
      const target = prev[toLane]!;
      const item = source.find((i) => i.id === active.id);
      if (!item) return prev;
      const overIndex = target.findIndex((i) => i.id === over.id);
      // Dropping over the lane itself puts the card after the last one that shows, before those
      // behind "Show more"; into a collapsed lane, at its end. Over a card, at that card's place.
      const shown = shownByLane.get(toLane);
      let end = target.length;
      if (shown && !collapsed.has(toLane)) {
        end = 0;
        target.forEach((i, n) => {
          if (shown.has(i.id)) end = n + 1;
        });
      }
      let insertAt = overIndex === -1 ? end : overIndex;
      if (overIndex !== -1 && active.rect.current.translated) {
        const below = active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        insertAt = overIndex + (below ? 1 : 0);
      }
      const nextTarget = [...target];
      nextTarget.splice(insertAt, 0, item);
      return {
        ...prev,
        [fromLane]: source.filter((i) => i.id !== active.id),
        [toLane]: nextTarget,
      };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const id = String(active.id);
    keyboardTarget.current = null;
    setActiveId(null);
    const lane = laneOfId(id);
    const item = byId.get(id);
    if (!lane || !item) return;

    if (!reorder) {
      const home = lanes.find((l) => l.items.some((i) => i.id === id));
      if (home && home.id !== lane) await onMove(item, lane, null, null);
      return;
    }

    let items = local[lane]!;
    if (over && over.id !== id) {
      const overLane = laneOfId(String(over.id));
      if (overLane === lane) {
        const from = items.findIndex((i) => i.id === id);
        const to = items.findIndex((i) => i.id === over.id);
        if (from !== -1 && to !== -1 && from !== to) {
          items = [...items];
          items.splice(to, 0, items.splice(from, 1)[0]!);
          setLocal((prev) => ({ ...prev, [lane]: items }));
        }
      }
    }
    const index = items.findIndex((i) => i.id === id);
    const afterId = items[index - 1]?.id ?? null;
    const beforeId = items[index + 1]?.id ?? null;

    // Only call the server when something actually changed.
    const originalLane = lanes.find((l) => l.items.some((i) => i.id === id));
    const originalIndex = originalLane?.items.findIndex((i) => i.id === id) ?? -1;
    if (originalLane?.id === lane && originalIndex === index) return;
    await onMove(item, lane, afterId, beforeId);
  }

  const activeItem = activeId ? byId.get(activeId) : undefined;

  // A released file must not make the browser leave the app to show it, whether it lands beside
  // a card or on lanes whose cards take no files.
  useEffect(() => {
    const guard = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => {
        keyboardTarget.current = null;
        setActiveId(null);
      }}
    >
      <label className="lane-navigation">
        {t('Column')}
        <select
          aria-label={t('Visible column')}
          value={lanes[shownIndex]?.id ?? ''}
          onChange={(event) => {
            const id = event.target.value;
            setMobileLane(id);
            const index = lanes.findIndex((lane) => lane.id === id);
            const container = laneStrip.current;
            const lane = container?.children[index];
            if (container && lane)
              container.scrollLeft +=
                lane.getBoundingClientRect().left - container.getBoundingClientRect().left;
          }}
        >
          {lanes.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.title} · {lane.items.length}
            </option>
          ))}
        </select>
      </label>
      {(hidden.left > 0 || hidden.right > 0) && (
        <div className="lane-scroll">
          {hidden.left > 0 && (
            <button
              type="button"
              className="link"
              onClick={() => scrollLanes(-1)}
              aria-label={t('Show earlier columns, {count} hidden', { count: hidden.left })}
            >
              {t('← {count} more', { count: hidden.left })}
            </button>
          )}
          {hidden.right > 0 && (
            <button
              type="button"
              className="link"
              onClick={() => scrollLanes(1)}
              aria-label={t('Show later columns, {count} hidden', { count: hidden.right })}
            >
              {t('{count} more →', { count: hidden.right })}
            </button>
          )}
        </div>
      )}
      <div
        className="lanes"
        ref={laneStrip}
        onScroll={() => {
          markHiddenLanes();
          const container = laneStrip.current;
          if (!container || !window.matchMedia('(max-width: 560px)').matches) return;
          const left = container.getBoundingClientRect().left;
          const distances = Array.from(container.children, (child) =>
            Math.abs(child.getBoundingClientRect().left - left),
          );
          const nearest = distances.indexOf(Math.min(...distances));
          if (lanes[nearest]) setMobileLane(lanes[nearest].id);
        }}
      >
        {views.map(({ lane, all, rows, cards, hidden }) => (
          <LaneView
            key={lane.id}
            lane={lane}
            items={all}
            sortable={cards.map((item) => item.id)}
            testId={`${testIdPrefix}-${lane.id}`}
            rejects={
              activeItem !== undefined && canDrop !== undefined && !canDrop(activeItem, lane.id)
            }
            collapsed={collapsed.has(lane.id)}
            onToggle={() => toggleLane(lane.id)}
            more={
              <LaneMore
                hidden={hidden}
                older={lane.older === true}
                expanded={limits[lane.id] !== undefined}
                onMore={(count) => showMore(lane, count)}
                onFewer={() => showFewer(lane)}
              />
            }
          >
            {rows.map((row) =>
              'heading' in row ? (
                <li key={row.key} className="lane-group">
                  <button
                    type="button"
                    aria-expanded={!folded.has(row.key)}
                    onClick={() => toggleGroup(row.key)}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                      <path
                        d="M4 6l4 4 4-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="lane-group-name">{row.heading}</span>
                    <span className="count">{row.count}</span>
                  </button>
                </li>
              ) : (
                <Card
                  key={row.item.id}
                  id={row.item.id}
                  disabled={
                    !canDrag || !lane.droppable || (isDraggable ? !isDraggable(row.item) : false)
                  }
                  onFiles={onFilesDrop && ((files) => onFilesDrop(row.item, files))}
                  onOpen={onCardClick && (() => onCardClick(row.item))}
                >
                  {renderCard(row.item, {
                    index: row.index,
                    count: all.length,
                    isDragging: row.item.id === activeId,
                  })}
                </Card>
              ),
            )}
          </LaneView>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="card overlay">
            {renderCard(activeItem, { index: 0, count: 0, isDragging: true })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * One lane. Collapsed, it is a narrow stub with its name running down it; it stays a drop target,
 * and a card dropped there joins the end of the lane. Its cards are not rendered, which the drag
 * overlay allows even for the card being dragged.
 */
function LaneView<T extends { id: string }>({
  lane,
  items,
  sortable,
  testId,
  rejects,
  collapsed,
  onToggle,
  more,
  children,
}: {
  lane: Lane<T>;
  items: T[];
  /** The ids of the cards drawn, in order: the ones a drag can move between. */
  sortable: string[];
  testId: string;
  rejects: boolean;
  collapsed: boolean;
  onToggle: () => void;
  more: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: lane.id,
    disabled: !lane.droppable || rejects,
  });
  const cards = `${items.length} ${tp(items.length, 'card')}`;
  return (
    <section
      ref={setNodeRef}
      className={`lane${lane.className ? ` ${lane.className}` : ''}${isOver && lane.droppable && !rejects ? ' over' : ''}${rejects ? ' rejects' : ''}${collapsed ? ' collapsed' : ''}`}
      aria-label={lane.title}
      data-testid={testId}
    >
      {collapsed ? (
        <button
          type="button"
          className="lane-stub"
          aria-expanded={false}
          aria-label={t('Expand {lane}, {cards}', { lane: lane.title, cards })}
          title={t('Expand {lane}', { lane: lane.title })}
          onClick={onToggle}
        >
          <span className="count">{items.length}</span>
          <span className="lane-stub-title">{lane.title}</span>
        </button>
      ) : (
        <>
          <div className="lane-head">
            <h3>
              {lane.titleNode ?? lane.title}{' '}
              <span className="count">
                {lane.total === undefined || lane.total === items.length
                  ? items.length
                  : `${items.length}/${lane.total}`}
              </span>
            </h3>
            <button
              type="button"
              className="lane-toggle"
              aria-expanded={true}
              aria-label={t('Collapse {lane}', { lane: lane.title })}
              title={t('Collapse {lane}', { lane: lane.title })}
              onClick={onToggle}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                <path
                  d="M10 3.5 5.5 8l4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {lane.actions}
          </div>
          {/* The cards scroll here, under the lane's head and above its footer. */}
          <div className="lane-body">
            <SortableContext items={sortable} strategy={verticalListSortingStrategy}>
              <ul className="cards">{children}</ul>
            </SortableContext>
            {more}
            {items.length === 0 && (
              <p className="lane-empty">
                {lane.total ? t('No matching cards') : t('No cards yet')}
              </p>
            )}
          </div>
          {lane.footer}
        </>
      )}
    </section>
  );
}

/**
 * The buttons under a lane's cards: the next page of hidden cards, the rest at once, and, once
 * the viewer has asked for more, back to the first page.
 */
function LaneMore({
  hidden,
  older,
  expanded,
  onMore,
  onFewer,
}: {
  hidden: number;
  older: boolean;
  expanded: boolean;
  onMore: (count: number) => void;
  onFewer: () => void;
}) {
  if (hidden === 0 && !expanded) return null;
  const next = Math.min(LANE_PAGE, hidden);
  return (
    <div className="lane-more">
      {hidden > 0 && (
        <button type="button" className="link" onClick={() => onMore(LANE_PAGE)}>
          {older
            ? t('Show {count} older', { count: next })
            : t('Show {count} more', { count: next })}
        </button>
      )}
      {hidden > LANE_PAGE && (
        <button type="button" className="link" onClick={() => onMore(Infinity)}>
          {t('Show the rest ({count})', { count: hidden })}
        </button>
      )}
      {expanded && (
        <button type="button" className="link" onClick={onFewer}>
          {t('Show fewer')}
        </button>
      )}
    </div>
  );
}

const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

function Card({
  id,
  disabled,
  onFiles,
  onOpen,
  children,
}: {
  id: string;
  disabled: boolean;
  onFiles?: ((files: File[]) => void) | undefined;
  onOpen?: (() => void) | undefined;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  // The card itself is the drag handle. Without naming it, dnd-kit takes Enter and Space from any
  // button inside the card as the start of a keyboard drag and swallows the button's click.
  const ref = (node: HTMLLIElement | null) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };
  // Native file drags are separate from dnd-kit's pointer drags. Entering a child fires
  // dragenter before the parent's dragleave, so a depth count keeps the highlight steady.
  const depth = useRef(0);
  const [fileOver, setFileOver] = useState(false);
  const fileDrop = onFiles && {
    onDragEnter: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setFileOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setFileOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setFileOver(false);
      onFiles(Array.from(e.dataTransfer.files));
    },
  };
  return (
    <li
      ref={ref}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`card${isDragging ? ' dragging' : ''}${disabled ? '' : ' draggable'}${onOpen ? ' clickable' : ''}${fileOver ? ' file-over' : ''}`}
      data-testid="item-card"
      onClick={onOpen && ((e) => isCardClick(e) && onOpen())}
      {...(disabled ? {} : { ...attributes, ...listeners })}
      {...fileDrop}
    >
      {children}
    </li>
  );
}
