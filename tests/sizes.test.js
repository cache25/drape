import { describe, it, expect } from 'vitest';
import {
  GARMENTS, SIZES, DEFAULT_BODY, BODY_MEASURES,
  recommendSize, fitLabel, easeFor, cmToIn, inToCm, validateCustom, clampBody,
} from '../src/data/sizes.js';

describe('size charts', () => {
  it('lists every size, growing in every measurement', () => {
    for (const g of Object.values(GARMENTS)) {
      let prev = null;
      for (const s of SIZES) {
        const m = g.chart[s];
        for (const k of g.measures) expect(m[k]).toBeGreaterThan(prev ? prev[k] : 0);
        prev = m;
      }
    }
  });

  it('keeps every chart size inside the custom limits', () => {
    for (const [id, g] of Object.entries(GARMENTS)) {
      for (const s of SIZES) expect(validateCustom(id, g.chart[s])).toEqual({});
    }
  });

  it('recommends the smallest size with enough ease on the right measurement', () => {
    const body = { ...DEFAULT_BODY, chest: 90, hips: 98 };
    expect(recommendSize('tee', body)).toBe('M'); // S leaves 4 cm of chest ease, the tee wants 6
    expect(recommendSize('tee', { ...body, chest: 95 })).toBe('L');
    expect(recommendSize('hoodie', { ...body, chest: 96 })).toBe('M');
    expect(recommendSize('trousers', body)).toBe('M'); // judged on hip: 102 - 98 = 4
    expect(recommendSize('skirt', { ...body, hips: 200 })).toBe('XXL');
  });

  it('measures ease on chest for tops and hip for bottoms', () => {
    expect(easeFor('tee', { chest: 100 }, { chest: 96 })).toBe(4);
    expect(easeFor('shorts', { waist: 80, hip: 104 }, { hips: 98 })).toBe(6);
  });

  it('labels fit by ease, with tighter bands for bottoms', () => {
    expect(fitLabel(2)).toBe('Snug');
    expect(fitLabel(8)).toBe('Regular');
    expect(fitLabel(14)).toBe('Relaxed');
    expect(fitLabel(30)).toBe('Oversized');
    expect(fitLabel(10, 'Bottoms')).toBe('Relaxed');
  });

  it('converts between cm and inches', () => {
    expect(cmToIn(100)).toBe(39.4);
    expect(inToCm(40)).toBe(101.5);
    expect(inToCm(cmToIn(110))).toBe(110);
  });
});

describe('custom measurements', () => {
  it('accepts values inside the limits', () => {
    expect(validateCustom('tee', { chest: 104, length: 71, sleeve: 22 })).toEqual({});
    expect(validateCustom('tank', { chest: 96, length: 70 })).toEqual({});
  });
  it('flags missing and out-of-range values with readable messages', () => {
    const e = validateCustom('hoodie', { chest: 300, length: NaN, sleeve: 62 });
    expect(Object.keys(e).sort()).toEqual(['chest', 'length']);
    expect(e.chest).toBe('Chest must be between 84 cm and 170 cm.');
    expect(e.length).toBe('Enter a length measurement.');
  });
  it('states the limits in inches when showing inches', () => {
    expect(validateCustom('tee', { chest: 50, length: 70, sleeve: 20 }, 'in').chest).toBe('Chest must be between 29.9 in and 63 in.');
  });
  it('rejects a waist larger than the hip', () => {
    expect(validateCustom('trousers', { waist: 110, hip: 100, length: 100 }).waist).toBe('Waist can’t be larger than the hip.');
  });
});

describe('mannequin measurements', () => {
  it('clamps to slider ranges and fills gaps with defaults', () => {
    const b = clampBody({ height: 999, chest: 'x' });
    expect(b.height).toBe(200);
    expect(b.chest).toBe(DEFAULT_BODY.chest);
    expect(Object.keys(b)).toEqual(BODY_MEASURES.map((m) => m.key));
  });
});
