import { describe, it, expect } from 'vitest';
import { blendFabric, normalizeBlend, setFiberShare, blendLabel, CONSTRUCTIONS, FIBERS } from '../src/data/fabrics.js';

const sum = (b) => Object.values(b).reduce((a, v) => a + v, 0);
const fab = (blend, construction = 'jersey', gsm = 180) => blendFabric({ construction, gsm, blend });

describe('fibre blends', () => {
  it('normalises to whole percentages that sum to 100', () => {
    const b = normalizeBlend({ cotton: 1, polyester: 1, elastane: 1 });
    expect(sum(b)).toBe(100);
    expect(normalizeBlend({})).toEqual({ cotton: 100 });
    expect(normalizeBlend({ cotton: 60, unobtainium: 40 })).toEqual({ cotton: 100 });
  });

  it('rescales the other fibres when one share changes', () => {
    const b = setFiberShare({ cotton: 60, polyester: 30, elastane: 10 }, 'polyester', 50);
    expect(b.polyester).toBe(50);
    expect(sum(b)).toBe(100);
    expect(b.cotton / b.elastane).toBeCloseTo(6, 0); // cotton:elastane kept at 60:10
  });

  it('drops a fibre set to zero and adds a new one', () => {
    expect(setFiberShare({ cotton: 95, elastane: 5 }, 'elastane', 0)).toEqual({ cotton: 100 });
    expect(setFiberShare({ cotton: 100 }, 'wool', 20)).toEqual({ cotton: 80, wool: 20 });
  });

  it('labels the blend largest share first', () => {
    expect(blendLabel({ elastane: 5, cotton: 95 })).toBe('95% Cotton · 5% Elastane');
  });
});

describe('fabric physics', () => {
  it('makes a few percent elastane noticeably stretchier', () => {
    const cotton = fab({ cotton: 100 }), stretch = fab({ cotton: 95, elastane: 5 });
    expect(stretch.stretch).toBeLessThan(cotton.stretch * 0.6);
    expect(stretch.stretchPct).toBeGreaterThan(cotton.stretchPct * 1.6);
  });

  it('drapes viscose and silk more softly than cotton, linen more crisply', () => {
    const bend = (blend) => fab(blend, 'plain', 190).bend;
    expect(bend({ viscose: 100 })).toBeLessThan(bend({ cotton: 100 }));
    expect(bend({ silk: 100 })).toBeLessThan(bend({ viscose: 100 }));
    expect(bend({ linen: 100 })).toBeGreaterThan(bend({ cotton: 100 }));
  });

  it('gets heavier and stiffer with weight', () => {
    const light = fab({ cotton: 100 }, 'jersey', 140), heavy = fab({ cotton: 100 }, 'jersey', 280);
    expect(heavy.density).toBeCloseTo(light.density * 2, 5);
    expect(heavy.bend).toBeCloseTo(light.bend * 4, 5); // bending grows with thickness squared
  });

  it('makes synthetics shinier and slicker', () => {
    const cotton = fab({ cotton: 100 }), nylon = fab({ nylon: 100 });
    expect(nylon.look.sheen).toBeGreaterThan(cotton.look.sheen);
    expect(nylon.friction).toBeLessThan(cotton.friction);
  });

  it('produces valid parameters for every construction and fibre', () => {
    for (const construction of Object.keys(CONSTRUCTIONS)) {
      for (const fiber of Object.keys(FIBERS)) {
        const f = fab({ [fiber]: 100 }, construction, 200);
        for (const k of ['density', 'stretch', 'shear', 'bend', 'friction', 'damping']) {
          expect(Number.isFinite(f[k]) && f[k] > 0).toBe(true);
        }
        expect(f.look.roughness).toBeGreaterThanOrEqual(0.25);
      }
    }
  });
});
