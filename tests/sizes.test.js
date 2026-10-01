import { describe, it, expect } from 'vitest';
import { GARMENTS, SIZES, recommendSize, fitLabel, cmToIn, inToCm, validateCustom, CUSTOM_LIMITS } from '../src/data/sizes.js';

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

  it('converts inches back to the nearest half centimetre', () => {
    expect(inToCm(40)).toBe(101.5);
    expect(inToCm(cmToIn(110))).toBe(110);
  });
});

describe('custom measurements', () => {
  it('accepts values inside the limits', () => {
    expect(validateCustom('tee', { chest: 104, length: 71, sleeve: 22 })).toEqual({});
  });
  it('flags missing and out-of-range values with readable messages', () => {
    const e = validateCustom('hoodie', { chest: 300, length: NaN, sleeve: 58 });
    expect(Object.keys(e).sort()).toEqual(['chest', 'length']);
    expect(e.chest).toBe('Chest must be between 84 cm and 170 cm.');
    expect(e.length).toBe('Enter a length measurement.');
  });
  it('states the limits in inches when showing inches', () => {
    expect(validateCustom('tee', { chest: 50, length: 70, sleeve: 20 }, 'in').chest).toBe('Chest must be between 29.9 in and 63 in.');
  });
  it('keeps every chart size inside the custom limits', () => {
    for (const [id, g] of Object.entries(GARMENTS)) {
      for (const s of SIZES) expect(validateCustom(id, g.chart[s])).toEqual({});
    }
    expect(Object.keys(CUSTOM_LIMITS).sort()).toEqual(Object.keys(GARMENTS).sort());
  });
});
