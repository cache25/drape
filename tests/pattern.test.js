import { describe, it, expect } from 'vitest';
import { makePattern, segmentsIntersect } from '../src/garment/pattern.js';
import { GARMENTS, SIZES, CUSTOM_LIMITS } from '../src/data/sizes.js';

const simple = ({ pts }) => {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
};

describe('patterns', () => {
  for (const id of Object.keys(GARMENTS)) {
    for (const size of SIZES) {
      const m = GARMENTS[id].chart[size];
      const p = makePattern(id, m);
      it(`${id} ${size}: panels are simple polygons with labelled edges`, () => {
        for (const panel of [p.front, p.back, p.hood].filter(Boolean)) {
          expect(panel.labels.length).toBe(panel.pts.length);
          expect(simple(panel)).toBe(true);
        }
      });
      it(`${id} ${size}: hem spans half the chest and sits at the garment length`, () => {
        const hemPts = p.front.pts.filter((_, i) => p.front.labels[i] === 'hem');
        const [x, y] = hemPts[0];
        expect(2 * Math.abs(x)).toBeCloseTo(m.chest / 200, 5);
        expect(y).toBeCloseTo(m.length / 100, 5);
      });
    }
  }

  it('cuts the front neck deeper than the back', () => {
    const p = makePattern('tee', GARMENTS.tee.chart.M);
    expect(p.front.pts[0][1]).toBeGreaterThan(p.back.pts[0][1]);
  });

  it('stays a valid pattern at every corner of the custom limits', () => {
    for (const [id, lim] of Object.entries(CUSTOM_LIMITS)) {
      for (const chest of lim.chest) for (const length of lim.length) for (const sleeve of lim.sleeve) {
        const p = makePattern(id, { chest, length, sleeve });
        for (const panel of [p.front, p.back]) expect(simple(panel)).toBe(true);
      }
    }
  });
});
