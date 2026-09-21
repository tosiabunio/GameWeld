import { describe, expect, it } from 'vitest';
import { bandedTreemap, squarify, type Rect } from '../src/treemap.ts';

const area = (r: Rect) => r.w * r.h;
const inside = (r: Rect, outer: Rect) =>
  r.x >= outer.x - 1e-9 &&
  r.y >= outer.y - 1e-9 &&
  r.x + r.w <= outer.x + outer.w + 1e-9 &&
  r.y + r.h <= outer.y + outer.h + 1e-9;
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 1e-9 &&
  b.x < a.x + a.w - 1e-9 &&
  a.y < b.y + b.h - 1e-9 &&
  b.y < a.y + a.h - 1e-9;

describe('squarify', () => {
  const rect = { x: 10, y: 20, w: 600, h: 400 };
  const values = [6, 6, 4, 3, 2, 2, 1];
  const cells = squarify(
    values.map((value, i) => ({ value, data: i })),
    rect,
  );

  it('gives every value an area proportional to it, filling the rectangle', () => {
    expect(cells).toHaveLength(values.length);
    const perUnit = area(rect) / values.reduce((s, v) => s + v, 0);
    for (const c of cells) expect(area(c)).toBeCloseTo(values[c.data]! * perUnit, 6);
    expect(cells.reduce((s, c) => s + area(c), 0)).toBeCloseTo(area(rect), 6);
  });

  it('keeps every rectangle inside the frame and apart from the others', () => {
    for (const c of cells) expect(inside(c, rect)).toBe(true);
    for (const a of cells) for (const b of cells) if (a !== b) expect(overlap(a, b)).toBe(false);
  });

  it('keeps the rectangles near square', () => {
    for (const c of cells) expect(Math.max(c.w / c.h, c.h / c.w)).toBeLessThan(3);
  });

  it('leaves out nothing to show', () => {
    expect(squarify([{ value: 0, data: 'none' }], rect)).toEqual([]);
    expect(squarify([], rect)).toEqual([]);
  });
});

describe('bandedTreemap', () => {
  const groups = [
    {
      key: 'must',
      items: [
        { value: 6, data: 'a' },
        { value: 2, data: 'b' },
      ],
    },
    { key: 'should', items: [{ value: 3, data: 'c' }] },
    { key: 'could', items: [] },
    { key: 'wont', items: [{ value: 1, data: 'd' }] },
  ];

  it('lays the groups out in order along the longer side, each by its share', () => {
    const wide = bandedTreemap(groups, { x: 0, y: 0, w: 1200, h: 400 });
    expect(wide.map((g) => g.key)).toEqual(['must', 'should', 'wont']);
    expect(wide.map((g) => g.band.x)).toEqual([0, 800, 1100]);
    expect(wide.map((g) => g.band.w)).toEqual([800, 300, 100]);
    const tall = bandedTreemap(groups, { x: 0, y: 0, w: 300, h: 1200 });
    expect(tall.map((g) => g.band.y)).toEqual([0, 800, 1100]);
  });

  it('keeps areas proportional across groups', () => {
    const cells = bandedTreemap(groups, { x: 0, y: 0, w: 1200, h: 400 }).flatMap((g) => g.cells);
    const perUnit = (1200 * 400) / 12;
    const value = { a: 6, b: 2, c: 3, d: 1 } as Record<string, number>;
    for (const c of cells) expect(area(c)).toBeCloseTo(value[c.data]! * perUnit, 6);
  });

  it('leaves a gap between bands, taken out before the side is shared', () => {
    const bands = bandedTreemap(groups, { x: 0, y: 0, w: 1220, h: 400 }, 10);
    expect(bands.map((g) => g.band.x)).toEqual([0, 810, 1120]);
    expect(bands.map((g) => g.band.w)).toEqual([800, 300, 100]);
    const tall = bandedTreemap(groups, { x: 0, y: 0, w: 300, h: 1220 }, 10);
    expect(tall.map((g) => g.band.y)).toEqual([0, 810, 1120]);
    // One band has nothing to keep apart from.
    const lone = bandedTreemap([groups[1]!], { x: 0, y: 0, w: 600, h: 400 }, 10);
    expect(lone[0]!.band).toEqual({ x: 0, y: 0, w: 600, h: 400 });
  });
});
