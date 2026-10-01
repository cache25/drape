import { describe, it, expect } from 'vitest';
import { makeBody, ARM_ANGLE } from '../src/sim/body.js';
import { makePattern } from '../src/garment/pattern.js';
import { buildGarment } from '../src/garment/build.js';
import { Cloth, FABRICS, windAt } from '../src/sim/cloth.js';
import { GARMENTS } from '../src/data/sizes.js';

function drape(id, size, seconds, chest = 96) {
  const body = makeBody(chest);
  const g = GARMENTS[id];
  const fabric = FABRICS[g.fabric];
  const topo = buildGarment(makePattern(id, g.chart[size], body.armJoint), fabric);
  const cloth = new Cloth(topo, fabric, body);
  for (let t = 0; t < seconds; t += 1 / 60) cloth.step(1 / 60);
  return { body, topo, cloth };
}

describe('body SDF', () => {
  it('is negative inside the form and positive outside', () => {
    const b = makeBody(96);
    expect(b.sdf(0, 1.2, 0)).toBeLessThan(0);
    expect(b.sdf(0, 1.2, 0.5)).toBeGreaterThan(0);
    expect(b.sdf(0, 2.2, 0)).toBeGreaterThan(0);
  });
  it('grows with the chest measurement', () => {
    expect(makeBody(120).sdf(0.17, 1.29, 0)).toBeLessThan(makeBody(88).sdf(0.17, 1.29, 0));
  });
});

describe('garment topology', () => {
  const { topo } = drape('hoodie', 'M', 0);
  it('has valid triangles and positive masses', () => {
    for (const i of topo.tris) expect(i).toBeLessThan(topo.n);
    for (const m of topo.mass) expect(m).toBeGreaterThan(0);
  });
  it('stitches front to back and attaches the hood and drawstrings', () => {
    const sews = topo.cons.filter((c) => c.kind === 'sew').length;
    expect(sews).toBeGreaterThan(100);
    expect(topo.ropes.length).toBe(2);
  });
  it('starts from unstretched panels', () => {
    for (const c of topo.cons) {
      if (c.kind !== 'stretch') continue;
      const d = Math.hypot(...[0, 1, 2].map((k) => topo.pos[3 * c.a + k] - topo.pos[3 * c.b + k]));
      expect(Math.abs(d - c.rest)).toBeLessThan(1e-4);
    }
  });
});

describe('cloth simulation', () => {
  for (const [id, size] of [['tee', 'M'], ['tee', 'XXL'], ['hoodie', 'XS'], ['hoodie', 'M']]) {
    it(`${id} ${size} sews shut and settles on the form`, () => {
      const { body, topo, cloth } = drape(id, size, 2.5);
      const p = cloth.pos;
      let maxY = -Infinity;
      for (let i = 0; i < cloth.n; i++) {
        expect(Number.isFinite(p[3 * i])).toBe(true);
        expect(body.sdf(p[3 * i], p[3 * i + 1], p[3 * i + 2])).toBeGreaterThan(-0.005);
        maxY = Math.max(maxY, p[3 * i + 1]);
      }
      expect(maxY).toBeGreaterThan(1.45); // hanging from the shoulders, not on the floor
      expect(cloth.strain().mean).toBeLessThan(0.05);
      topo.cons.forEach((c, k) => {
        if (c.kind !== 'sew') return;
        const d = Math.hypot(...[0, 1, 2].map((j) => p[3 * c.a + j] - p[3 * c.b + j]));
        expect(d).toBeLessThan(0.04);
      });
    });
  }

  it('keeps sleeves on top of the arms', () => {
    const { body, topo, cloth } = drape('hoodie', 'M', 2);
    const [jx, jy] = body.armJoint;
    const d = [Math.cos(ARM_ANGLE), -Math.sin(ARM_ANGLE)];
    // Highest cloth point above the right arm's axis, mid-way along the arm, must be above the arm.
    let top = -Infinity;
    for (let i = 0; i < cloth.n; i++) {
      const x = cloth.pos[3 * i] - jx, y = cloth.pos[3 * i + 1] - jy;
      const along = x * d[0] + y * d[1];
      if (Math.abs(along - 0.3) < 0.02) top = Math.max(top, -x * d[1] + y * d[0]);
    }
    expect(top).toBeGreaterThan(0.03);
  });

  it('drags a grabbed particle toward the cursor', () => {
    const { cloth } = drape('tee', 'M', 1.5);
    const i = 10;
    const target = [cloth.pos[3 * i], cloth.pos[3 * i + 1] + 0.1, cloth.pos[3 * i + 2] + 0.25];
    cloth.grab(i, target);
    for (let f = 0; f < 30; f++) cloth.step(1 / 60);
    const d = Math.hypot(...[0, 1, 2].map((k) => cloth.pos[3 * i + k] - target[k]));
    expect(d).toBeLessThan(0.01);
    cloth.release();
    expect(cloth.invMass[i]).toBeGreaterThan(0);
  });

  it('moves in the wind', () => {
    const calm = drape('tee', 'L', 2.5).cloth;
    const windy = drape('tee', 'L', 2.5).cloth;
    let maxDisp = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) {
      calm.step(1 / 60);
      windy.step(1 / 60, { wind: windAt(windy.time, 8) });
      for (let i = 0; i < windy.n; i++) {
        maxDisp = Math.max(maxDisp, Math.hypot(...[0, 1, 2].map((k) => windy.pos[3 * i + k] - calm.pos[3 * i + k])));
      }
    }
    expect(maxDisp).toBeGreaterThan(0.02);
    expect(Number.isFinite(windy.strain().mean)).toBe(true);
  });
});
