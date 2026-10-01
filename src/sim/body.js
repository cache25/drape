// Full-body mannequin described as a union of round cones (capsules with two radii).
// The same primitive list drives both the collision SDF and the visible mesh, so what
// you see is exactly what the cloth collides with. Every slider measurement maps to a
// part: circumferences are solved so the elliptical cross-sections measure exactly that.
import { DEFAULT_BODY, clampBody } from '../data/sizes.js';

const DEG = Math.PI / 180;
export const ARM_ANGLE = 40 * DEG; // arms slope down from the shoulder, A-pose
const TORSO_DEPTH = 0.72; // torso depth / width

function roundCone(a, b, ra, rb, zs = 1) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = ra - rb;
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const br = Math.sqrt(l2) / 2 + Math.max(ra, rb); // bounding sphere radius (scaled space)
  return { a, b, ra, rb, zs, ba, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, c, br };
}

// Inigo Quilez' exact round-cone distance, evaluated in the primitive's z-scaled space.
function sdRoundCone(p, x, y, z) {
  const pax = x - p.a[0], pay = y - p.a[1], paz = z - p.a[2];
  const { ba, l2, rr, a2, il2 } = p;
  const yy = pax * ba[0] + pay * ba[1] + paz * ba[2];
  const zz = yy - l2;
  const qx = pax * l2 - ba[0] * yy, qy = pay * l2 - ba[1] * yy, qz = paz * l2 - ba[2] * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.rb;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.ra;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p.ra;
}

/** Ramanujan's ellipse perimeter. */
export const ellipseCirc = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

/** Half-width of an ellipse with depth ratio k whose perimeter is `circ`. */
const halfWidthFor = (circ, k) => circ / ellipseCirc(1, k);

export function makeBody(measures = DEFAULT_BODY) {
  const m = clampBody(measures);
  const k = m.height / 176; // proportional scale for lengths not set directly
  const dx = Math.cos(ARM_ANGLE), dy = -Math.sin(ARM_ANGLE);

  // Landmarks (world metres, floor at y = 0).
  const shoulderY = 1.44 * k;
  const nape = shoulderY + 0.045;
  const waistY = nape - m.backWaist / 100;
  const hipY = waistY - 0.2 * k;
  const bustY = nape - 0.21 * k;
  const kneeY = 0.5 * k;
  const ankleY = 0.085 * k;

  const chestA = halfWidthFor(m.chest / 100, TORSO_DEPTH);
  const waistA = halfWidthFor(m.waist / 100, TORSO_DEPTH);
  // Pelvis: a horizontal capsule between the hip joints, sized so its cross-section is the hip.
  const px = 0.09, pzs = 0.85;
  let lo = 0.03, hi = 0.3;
  for (let i = 0; i < 40; i++) {
    const r = (lo + hi) / 2;
    if (ellipseCirc(px + r, r * pzs) < m.hips / 100) lo = r; else hi = r;
  }
  const pelvisR = lo;
  const neckR = m.neck / 100 / (2 * Math.PI);
  const shoulderHalf = m.shoulder / 200;
  const jx = shoulderHalf - 0.02, jy = shoulderY;

  const prims = [];
  const add = (p, part) => { p.part = part; prims.push(p); return p; };

  // Head and neck
  add(roundCone([0, m.height / 100 - 0.16 * k, 0.012], [0, m.height / 100 - 0.095 * k, 0.005], 0.08 * k, 0.092 * k, 0.92), 'head');
  add(roundCone([0, nape - 0.05, 0], [0, nape + 0.09 * k, 0.005], neckR, neckR * 0.95, 1), 'neck');
  // Torso
  const lowR = Math.min(waistA * 1.04, pelvisR + px);
  add(roundCone([0, hipY + 0.05, 0], [0, waistY, 0], lowR, waistA, TORSO_DEPTH), 'torso');
  add(roundCone([0, waistY, 0], [0, bustY, 0], waistA, chestA, TORSO_DEPTH), 'torso');
  add(roundCone([0, bustY, 0], [0, nape - 0.1 * k, 0], chestA, Math.min(chestA, 0.15), TORSO_DEPTH), 'torso');
  add(roundCone([-(shoulderHalf - 0.055), shoulderY - 0.02, 0], [shoulderHalf - 0.055, shoulderY - 0.02, 0], 0.055, 0.055, 0.9), 'torso');
  add(roundCone([-px, hipY, 0], [px, hipY, 0], pelvisR, pelvisR, pzs), 'pelvis');
  const crotchY = Math.min(hipY - pelvisR, hipY + 0.05 - lowR);

  // Arms: upper arm, forearm and hand along one straight line, so sleeves can follow it.
  const armLen = m.arm / 100;
  const legs = [];
  for (const side of [1, -1]) {
    const at = (t) => [side * (jx + dx * t), jy + dy * t, 0];
    add(roundCone(at(0), at(armLen * 0.52), 0.045, 0.036), 'arm');
    add(roundCone(at(armLen * 0.52), at(armLen), 0.036, 0.028), 'arm');
    add(roundCone(at(armLen), at(armLen + 0.17 * k), 0.03, 0.022, 0.55), 'hand');

    // Legs: thighs start inside the pelvis and splay a little so trousers have a gap to sew in.
    const lx = Math.max(0.1, (px + pelvisR) * 0.52);
    const thighR = Math.min(0.09, lx - 0.03); // leaves a gap between the thighs for an inseam
    const hipJ = [side * lx, hipY - 0.03, 0], knee = [side * (lx + 0.025), kneeY, 0], ankle = [side * (lx + 0.04), ankleY, 0];
    add(roundCone(hipJ, knee, thighR, 0.055), 'leg');
    add(roundCone(knee, ankle, 0.055, 0.036), 'leg');
    add(roundCone([side * (lx + 0.04), 0.045, -0.05], [side * (lx + 0.05), 0.035, 0.13], 0.045, 0.033), 'foot');
    legs.push({ side, hip: hipJ, knee, ankle, thighR });
  }

  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of prims) {
    const r = Math.max(p.ra, p.rb);
    for (const pt of [p.a, p.b]) {
      for (let i = 0; i < 3; i++) {
        bounds.min[i] = Math.min(bounds.min[i], pt[i] - r);
        bounds.max[i] = Math.max(bounds.max[i], pt[i] + r);
      }
    }
  }

  const primSdf = (p, x, y, z) => sdRoundCone(p, x, y, z / p.zs) * p.zs;
  let nearest = prims[0];

  /** Signed distance to the form. Remembers the nearest primitive for normal(). */
  function sdf(x, y, z) {
    let d = Infinity;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      // Bounding-sphere lower bound lets us skip primitives that can't be closest.
      const zz = z / p.zs;
      const cx = x - p.c[0], cy = y - p.c[1], cz = zz - p.c[2];
      const lb = (Math.sqrt(cx * cx + cy * cy + cz * cz) - p.br) * p.zs;
      if (lb >= d) continue;
      // Non-uniform scale: multiplying by the smaller scale keeps the bound conservative.
      const di = sdRoundCone(p, x, y, zz) * p.zs;
      if (di < d) { d = di; nearest = p; }
    }
    return d;
  }

  const out = [0, 0, 0];
  /** Outward normal of the primitive found by the most recent sdf() call. */
  function normal(x, y, z) {
    const e = 1e-3, p = nearest;
    const nx = primSdf(p, x + e, y, z) - primSdf(p, x - e, y, z);
    const ny = primSdf(p, x, y + e, z) - primSdf(p, x, y - e, z);
    const nz = primSdf(p, x, y, z + e) - primSdf(p, x, y, z - e);
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    return out;
  }

  /** Centre of a leg at height y (linear along thigh, then shin). */
  function legCenterX(y) {
    const { hip, knee, ankle } = legs[0];
    const [a, b] = y > knee[1] ? [hip, knee] : [knee, ankle];
    const t = Math.min(1, Math.max(0, (a[1] - y) / (a[1] - b[1])));
    return a[0] + (b[0] - a[0]) * t;
  }

  return {
    measures: m, prims, bounds, sdf, normal, legCenterX,
    armJoint: [jx, jy],
    topY: shoulderY + 0.12, // where a top's shoulder line is first placed
    waistY, hipY, crotchY,
    height: m.height / 100,
  };
}
