import { describe, it, expect } from 'vitest';
import { GARMENTS, SIZES, recommendSize, fitLabel, cmToIn } from '../src/data/sizes.js';

describe('size charts', () => {
  it('lists every size, growing in every measurement', () => {
    for (const g of Object.values(GARMENTS)) {
      let prev = null;
      for (const s of SIZES) {
        const m = g.chart[s];
        expect(m).toBeDefined();
        if (prev) for (const k of ['chest', 'length', 'sleeve']) expect(m[k]).toBeGreaterThan(prev[k]);
        prev = m;
      }
    }
  });

  it('recommends the smallest size with at least the minimum ease', () => {
    expect(recommendSize('tee', 90)).toBe('M'); // S leaves only 4 cm, tee wants 6
    expect(recommendSize('tee', 94)).toBe('M');
    expect(recommendSize('tee', 95)).toBe('L');
    expect(recommendSize('hoodie', 96)).toBe('M'); // 110 - 96 = 14 >= 12
    expect(recommendSize('hoodie', 200)).toBe('XXL');
  });

  it('labels fit by ease', () => {
    expect(fitLabel(2)).toBe('Snug');
    expect(fitLabel(8)).toBe('Regular');
    expect(fitLabel(14)).toBe('Relaxed');
    expect(fitLabel(30)).toBe('Oversized');
  });

  it('converts to inches', () => {
    expect(cmToIn(100)).toBe(39.4);
  });
});
