import { describe, it, expect } from 'vitest';
import { makePattern, segmentsIntersect } from '../src/garment/pattern.js';
import { makeBody } from '../src/sim/body.js';
import { GARMENTS, SIZES } from '../src/data/sizes.js';

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

const body = makeBody();

describe('patterns', () => {
  for (const [id, g] of Object.entries(GARMENTS)) {
    it(`${id}: every size cuts simple, labelled panels`, () => {
      for (const size of SIZES) {
        const p = makePattern(id, g.chart[size], body);
        for (const panel of [p.front, p.back, p.hood].filter(Boolean)) {
          expect(panel.labels.length).toBe(panel.pts.length);
          expect(simple(panel)).toBe(true);
        }
      }
    });

    it(`${id}: stays a valid pattern at every corner of the custom limits`, () => {
      const keys = g.measures;
      const corners = keys.reduce((acc, k) => acc.flatMap((m) => g.limits[k].map((v) => ({ ...m, [k]: v }))), [{}]);
      for (const m of corners) {
        if (m.waist > m.hip) continue; // rejected by the form
        const p = makePattern(id, m, body);
        for (const panel of [p.front, p.back]) expect(simple(panel)).toBe(true);
      }
    });
  }

  it('cuts a top half the chest wide at the hem, at the garment length', () => {
    const m = GARMENTS.tee.chart.M;
    const p = makePattern('tee', m, body);
    const [x, y] = p.front.pts[p.front.labels.indexOf('hem')];
    expect(2 * Math.abs(x)).toBeCloseTo(m.chest / 200, 5);
    expect(y).toBeCloseTo(m.length / 100, 5);
  });

  it('cuts the front neck deeper than the back', () => {
    const p = makePattern('tee', GARMENTS.tee.chart.M, body);
    expect(p.front.pts[0][1]).toBeGreaterThan(p.back.pts[0][1]);
  });

  it('gives tanks open armholes instead of sleeves', () => {
    const p = makePattern('tank', GARMENTS.tank.chart.M, body);
    expect(p.front.labels).toContain('armhole');
    expect(p.front.labels).not.toContain('cuff');
  });

  it('puts the trouser crotch below the form’s crotch and the waistband at its waist', () => {
    const p = makePattern('trousers', GARMENTS.trousers.chart.M, body);
    const crotch = p.front.pts.find(([x, y]) => x === 0 && y > 0);
    expect(p.topY - crotch[1]).toBeLessThan(body.crotchY);
    expect(p.topY).toBeGreaterThan(body.waistY);
  });

  it('cinches waistbands that are too big for the form', () => {
    expect(makePattern('skirt', GARMENTS.skirt.chart.XXL, body).waistCinch).toBeLessThan(1);
    expect(makePattern('skirt', GARMENTS.skirt.chart.XS, body).waistCinch).toBe(1);
  });
});
