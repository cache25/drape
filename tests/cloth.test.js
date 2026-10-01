import { describe, it, expect } from 'vitest';
import { makeBody, ellipseCirc, ARM_ANGLE } from '../src/sim/body.js';
import { makePattern } from '../src/garment/pattern.js';
import { buildGarment } from '../src/garment/build.js';
import { Cloth, windAt } from '../src/sim/cloth.js';
import { blendFabric } from '../src/data/fabrics.js';
import { GARMENTS, DEFAULT_BODY } from '../src/data/sizes.js';

function drape(id, size, seconds, bodyMeasures = DEFAULT_BODY, fabricSpec) {
  const body = makeBody(bodyMeasures);
  const g = GARMENTS[id];
  const fabric = blendFabric(fabricSpec || g.fabric);
  const m = typeof size === 'string' ? g.chart[size] : size;
  const topo = buildGarment(makePattern(id, m, body), fabric);
  const cloth = new Cloth(topo, fabric, body);
  for (let t = 0; t < seconds; t += 1 / 60) cloth.step(1 / 60);
  return { body, topo, cloth };
}

const dist = (p, a, b) => Math.hypot(p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2]);

/** Highest cloth point above the right arm's axis at `along` metres from the shoulder joint. */
function clothAboveArm(body, cloth, along) {
  const [jx, jy] = body.armJoint;
  const d = [Math.cos(ARM_ANGLE), -Math.sin(ARM_ANGLE)];
  let top = -Infinity;
  for (let i = 0; i < cloth.n; i++) {
    const x = cloth.pos[3 * i] - jx, y = cloth.pos[3 * i + 1] - jy;
    const a = x * d[0] + y * d[1], q = -x * d[1] + y * d[0];
    if (Math.abs(a - along) < 0.02 && Math.hypot(q, cloth.pos[3 * i + 2]) < 0.15) top = Math.max(top, q);
  }
  return top;
}

describe('mannequin', () => {
  const b = makeBody();
  it('is solid inside and empty outside', () => {
    expect(b.sdf(0, 1.2, 0)).toBeLessThan(0);
    expect(b.sdf(0, 1.2, 0.5)).toBeGreaterThan(0);
    expect(b.sdf(0, 2.2, 0)).toBeGreaterThan(0);
  });

  it('has a full body: head at the top, feet on the floor, legs apart', () => {
    expect(b.sdf(0, b.height - 0.01, 0.005)).toBeLessThan(0);
    expect(b.sdf(0, b.height + 0.02, 0)).toBeGreaterThan(0);
    const foot = b.prims.find((p) => p.part === 'foot');
    expect(b.sdf(foot.a[0], 0.004, 0)).toBeLessThan(0); // the sole touches the floor
    expect(b.sdf(foot.a[0], -0.004, 0)).toBeGreaterThan(0);
    expect(b.sdf(0, 0.5, 0)).toBeGreaterThan(0.02); // gap between the knees
  });

  it('matches its chest, waist and hip measurements', () => {
    const chest = b.prims.filter((p) => p.part === 'torso')[1].rb;
    expect(ellipseCirc(chest, chest * 0.72) * 100).toBeCloseTo(DEFAULT_BODY.chest, 0);
    const pelvis = b.prims.find((p) => p.part === 'pelvis');
    expect(ellipseCirc(0.09 + pelvis.ra, pelvis.ra * 0.85) * 100).toBeCloseTo(DEFAULT_BODY.hips, 0);
  });

  it('responds to every measurement', () => {
    const tall = makeBody({ ...DEFAULT_BODY, height: 195 });
    expect(tall.height).toBeCloseTo(1.95, 5);
    expect(tall.topY).toBeGreaterThan(b.topY);
    expect(makeBody({ ...DEFAULT_BODY, shoulder: 50 }).armJoint[0]).toBeGreaterThan(b.armJoint[0]);
    expect(makeBody({ ...DEFAULT_BODY, backWaist: 48 }).waistY).toBeLessThan(b.waistY);
    const longArm = makeBody({ ...DEFAULT_BODY, arm: 68 }).prims.filter((p) => p.part === 'hand')[0];
    expect(longArm.b[0]).toBeGreaterThan(b.prims.filter((p) => p.part === 'hand')[0].b[0]);
    const neck = (m) => m.prims.find((p) => p.part === 'neck').ra;
    expect(neck(makeBody({ ...DEFAULT_BODY, neck: 42 }))).toBeGreaterThan(neck(b));
  });
});

describe('garment topology', () => {
  const { topo } = drape('hoodie', 'M', 0);
  it('has valid triangles and positive masses', () => {
    for (const i of topo.tris) expect(i).toBeLessThan(topo.n);
    for (const m of topo.mass) expect(m).toBeGreaterThan(0);
  });
  it('stitches front to back and attaches the hood and drawstrings', () => {
    expect(topo.cons.filter((c) => c.kind === 'sew').length).toBeGreaterThan(100);
    expect(topo.ropes.length).toBe(2);
  });
  it('starts from unstretched panels', () => {
    for (const c of topo.cons) if (c.kind === 'stretch') expect(Math.abs(dist(topo.pos, c.a, c.b) - c.rest)).toBeLessThan(1e-4);
  });
});

describe('cloth simulation', () => {
  for (const id of Object.keys(GARMENTS)) {
    it(`${id} M sews shut and stays on the form`, () => {
      const { body, topo, cloth } = drape(id, 'M', 2.5);
      const p = cloth.pos;
      let maxY = -Infinity;
      for (let i = 0; i < cloth.n; i++) {
        expect(Number.isFinite(p[3 * i])).toBe(true);
        expect(body.sdf(p[3 * i], p[3 * i + 1], p[3 * i + 2])).toBeGreaterThan(-0.005);
        maxY = Math.max(maxY, p[3 * i + 1]);
      }
      const top = GARMENTS[id].group === 'Tops' ? body.topY - 0.12 : body.waistY - 0.1;
      expect(maxY).toBeGreaterThan(top); // still hanging where it belongs, not on the floor
      expect(cloth.strain().mean).toBeLessThan(0.05);
      const open = topo.cons.filter((c) => c.kind === 'sew' && dist(p, c.a, c.b) > 0.03).length;
      expect(open).toBe(0);
    });
  }

  for (const id of ['skirt', 'shorts', 'trousers']) {
    it(`${id} XXL is held up by its waistband`, () => {
      const { body, cloth } = drape(id, 'XXL', 2.5);
      const maxY = cloth.pos.filter((_, k) => k % 3 === 1).reduce((a, v) => Math.max(a, v), -Infinity);
      expect(maxY).toBeGreaterThan(body.hipY);
    });
  }

  for (const [id, m] of [
    ['tee', { chest: 76, length: 50, sleeve: 40 }],
    ['tee', { chest: 160, length: 95, sleeve: 12 }],
    ['hoodie', { chest: 84, length: 50, sleeve: 72 }],
    ['hoodie', { chest: 170, length: 95, sleeve: 45 }],
    ['trousers', { waist: 130, hip: 150, length: 115 }],
    ['skirt', { waist: 56, hip: 80, length: 35 }],
  ]) {
    it(`${id} at custom extremes ${JSON.stringify(m)} stays stable`, () => {
      const { body, cloth } = drape(id, m, 2);
      for (let i = 0; i < cloth.n; i++) {
        expect(Number.isFinite(cloth.pos[3 * i + 1])).toBe(true);
        expect(body.sdf(cloth.pos[3 * i], cloth.pos[3 * i + 1], cloth.pos[3 * i + 2])).toBeGreaterThan(-0.005);
      }
      expect(cloth.strain().mean).toBeLessThan(0.15); // a garment much smaller than the body stretches
    });
  }

  it('fits a much larger and a much smaller mannequin', () => {
    for (const bodyM of [
      { ...DEFAULT_BODY, height: 200, chest: 130, waist: 120, hips: 135, shoulder: 52, arm: 68 },
      { ...DEFAULT_BODY, height: 152, chest: 80, waist: 62, hips: 84, shoulder: 37, arm: 51 },
    ]) {
      const { body, cloth } = drape('longsleeve', 'M', 2, bodyM);
      // Within the cloth's own collision thickness.
      for (let i = 0; i < cloth.n; i++) expect(body.sdf(cloth.pos[3 * i], cloth.pos[3 * i + 1], cloth.pos[3 * i + 2])).toBeGreaterThan(-0.008);
      expect(clothAboveArm(body, cloth, 0.2)).toBeGreaterThan(0.02);
    }
  });

  it('keeps hoodie sleeves on top of the arm down the forearm', () => {
    const { body, cloth } = drape('hoodie', 'M', 2.5);
    for (const at of [0.15, 0.3, 0.45]) expect(clothAboveArm(body, cloth, at)).toBeGreaterThan(0.02);
  });

  it('drapes a satin blend softer than a stiff twill', () => {
    const sag = (spec) => {
      const { cloth } = drape('skirt', 'M', 2.5, DEFAULT_BODY, spec);
      let minY = Infinity;
      for (let i = 0; i < cloth.n; i++) minY = Math.min(minY, cloth.pos[3 * i + 1]);
      return minY;
    };
    // A soft fabric collapses closer to the legs, so its hem hangs lower than a stiff one that flares.
    const soft = sag({ construction: 'satin', gsm: 120, blend: { viscose: 100 } });
    const stiff = sag({ construction: 'twill', gsm: 380, blend: { linen: 100 } });
    expect(soft).toBeLessThan(stiff + 0.02);
  });

  it('drags a grabbed particle toward the cursor', () => {
    const { cloth } = drape('tee', 'M', 1.5);
    const i = 10;
    const target = [cloth.pos[3 * i], cloth.pos[3 * i + 1] + 0.1, cloth.pos[3 * i + 2] + 0.25];
    cloth.grab(i, target);
    for (let f = 0; f < 30; f++) cloth.step(1 / 60);
    expect(Math.hypot(...[0, 1, 2].map((k) => cloth.pos[3 * i + k] - target[k]))).toBeLessThan(0.01);
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
      for (let i = 0; i < windy.n; i++) maxDisp = Math.max(maxDisp, Math.hypot(...[0, 1, 2].map((k) => windy.pos[3 * i + k] - calm.pos[3 * i + k])));
    }
    expect(maxDisp).toBeGreaterThan(0.02);
  });
});
