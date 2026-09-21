/**
 * Treemap layout: areas proportional to values, in plain rectangles. Groups are laid out as bands
 * in their given order along the longer side, so the map reads in that order; within a group, the
 * squarified algorithm (Bruls, Huizing, and van Wijk) keeps each rectangle as close to square as
 * it can, which is what leaves room for a label.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Weighted<T> {
  value: number;
  data: T;
}

export type Placed<T> = Rect & { data: T };

/** Lays the values out in the rectangle, largest first, each with an area proportional to it. */
export function squarify<T>(items: Weighted<T>[], rect: Rect): Placed<T>[] {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const queue = items
    .filter((i) => i.value > 0)
    .map((i) => ({ area: i.value * scale, data: i.data }))
    .sort((a, b) => b.area - a.area);
  const placed: Placed<T>[] = [];
  let free = { ...rect };
  let row: typeof queue = [];

  // The worst aspect ratio of a row laid along a side of the given length.
  const worst = (areas: number[], side: number) => {
    const sum = areas.reduce((s, a) => s + a, 0);
    const max = Math.max(...areas);
    const min = Math.min(...areas);
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layRow = () => {
    const sum = row.reduce((s, r) => s + r.area, 0);
    if (free.w >= free.h) {
      // A column at the left of the free space.
      const width = sum / free.h;
      let y = free.y;
      for (const r of row) {
        const h = r.area / width;
        placed.push({ x: free.x, y, w: width, h, data: r.data });
        y += h;
      }
      free = { x: free.x + width, y: free.y, w: free.w - width, h: free.h };
    } else {
      // A row along the top.
      const height = sum / free.w;
      let x = free.x;
      for (const r of row) {
        const w = r.area / height;
        placed.push({ x, y: free.y, w, h: height, data: r.data });
        x += w;
      }
      free = { x: free.x, y: free.y + height, w: free.w, h: free.h - height };
    }
    row = [];
  };

  for (const item of queue) {
    const side = Math.min(free.w, free.h);
    const areas = row.map((r) => r.area);
    if (row.length === 0 || worst([...areas, item.area], side) <= worst(areas, side))
      row.push(item);
    else {
      layRow();
      row.push(item);
    }
  }
  if (row.length) layRow();
  return placed;
}

/**
 * Groups as bands, in order, along the rectangle's longer side, each as wide as its share of the
 * total; the items of each group squarified inside its band.
 */
export function bandedTreemap<G, T>(
  groups: { key: G; items: Weighted<T>[] }[],
  rect: Rect,
): { key: G; band: Rect; cells: Placed<T>[] }[] {
  const sums = groups.map((g) => g.items.reduce((s, i) => s + i.value, 0));
  const total = sums.reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  const across = rect.w >= rect.h;
  let offset = 0;
  return groups.flatMap((group, i) => {
    if (sums[i]! <= 0) return [];
    const share = sums[i]! / total;
    const band: Rect = across
      ? { x: rect.x + offset, y: rect.y, w: rect.w * share, h: rect.h }
      : { x: rect.x, y: rect.y + offset, w: rect.w, h: rect.h * share };
    offset += across ? band.w : band.h;
    return [{ key: group.key, band, cells: squarify(group.items, band) }];
  });
}
