// Dress-form mannequin described as a union of round cones (capsules with two radii).
// The same primitive list drives both the collision SDF and the visible mesh, so what
// you see is exactly what the cloth collides with.

const DEG = Math.PI / 180;
export const ARM_ANGLE = 40 * DEG; // arms slope down from the shoulder, A-pose
export const BASE_CHEST = 90; // cm, chest circumference of the unscaled form

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

export function makeBody(chestCm = 92) {
  const s = chestCm / BASE_CHEST;
  const Z = 0.72; // torso depth / width
  const shoulder = 0.15 * Math.sqrt(s);
  const jx = shoulder + 0.04;
  const jy = 1.44;
  const armLen = 0.55;
  const dx = Math.cos(ARM_ANGLE), dy = -Math.sin(ARM_ANGLE);

  const prims = [
    roundCone([0, 0.86, 0], [0, 1.1, 0], 0.17 * s, 0.135 * s, Z), // hips → waist
    roundCone([0, 1.1, 0], [0, 1.29, 0], 0.135 * s, 0.165 * s, Z), // waist → bust
    roundCone([0, 1.29, 0], [0, 1.38, 0], 0.165 * s, 0.15 * s, Z), // bust → shoulder dome
    roundCone([-shoulder, 1.42, 0], [shoulder, 1.42, 0], 0.055, 0.055, 0.9), // shoulder line
    roundCone([0, 1.45, 0], [0, 1.53, 0], 0.05, 0.048, 1), // neck stub
  ];
  for (const side of [1, -1]) {
    const a = [side * jx, jy, 0];
    const b = [side * (jx + dx * armLen), jy + dy * armLen, 0];
    prims.push(roundCone(a, b, 0.04, 0.027, 1));
  }

  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of prims) {
    const r = Math.max(p.ra, p.rb);
    for (const pt of [p.a, p.b]) {
      for (let k = 0; k < 3; k++) {
        bounds.min[k] = Math.min(bounds.min[k], pt[k] - r);
        bounds.max[k] = Math.max(bounds.max[k], pt[k] + r);
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

  return { chestCm, prims, bounds, sdf, normal, armJoint: [jx, jy] };
}
