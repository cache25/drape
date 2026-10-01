// Small-steps XPBD cloth: many substeps, one constraint pass each. Stiffnesses are
// physical (N/m), masses come from the fabric's areal density, and air is modelled
// per-triangle so the same code gives both air drag and wind.

export const FABRICS = {
  jersey: {
    key: 'jersey', name: 'Cotton jersey', gsm: 180, stretchPct: 5,
    density: 0.18, stretch: 900, shear: 90, bend: 0.9,
    friction: 0.5, damping: 0.25,
    look: { roughness: 0.88, sheen: 0.6, sheenRoughness: 0.45, normalScale: 0.55, tile: 0.05 },
  },
  fleece: {
    key: 'fleece', name: 'Brushed cotton fleece', gsm: 320, stretchPct: 3,
    density: 0.32, stretch: 1600, shear: 180, bend: 3.2,
    friction: 0.6, damping: 0.35,
    look: { roughness: 0.95, sheen: 1.0, sheenRoughness: 0.75, normalScale: 0.35, tile: 0.08 },
  },
};

const RHO_AIR = 1.2;
const MAX_SPEED = 12;
export const SEW_TIME = 0.6;

export class Cloth {
  constructor(topo, fabric, body) {
    this.topo = topo;
    this.fabric = fabric;
    this.body = body;
    const n = (this.n = topo.n);
    this.pos = Float32Array.from(topo.pos);
    this.prev = Float32Array.from(topo.pos);
    this.vel = new Float32Array(3 * n);
    this.force = new Float32Array(3 * n);
    this.thick = topo.thick;
    this.invMass = new Float32Array(n);
    for (let i = 0; i < n; i++) this.invMass[i] = topo.mass[i] > 0 ? 1 / topo.mass[i] : 0;
    this.baseInvMass = Float32Array.from(this.invMass);
    this.tris = topo.tris;

    const m = topo.cons.length;
    this.ca = new Int32Array(m);
    this.cb = new Int32Array(m);
    this.rest = new Float32Array(m);
    this.compliance = new Float32Array(m);
    const k = {
      stretch: fabric.stretch, shear: fabric.shear, bend: fabric.bend,
      sew: 0, rope: 0, ropeBend: 0.08,
    };
    topo.cons.forEach((c, i) => {
      this.ca[i] = c.a; this.cb[i] = c.b; this.rest[i] = c.rest;
      let stiff = k[c.kind];
      if (c.rib && (c.kind === 'stretch' || c.kind === 'bend')) stiff *= 3;
      this.compliance[i] = stiff > 0 ? 1 / stiff : 0;
    });

    this.sew = [];
    topo.cons.forEach((c, i) => { if (c.kind === 'sew') this.sew.push(i); });
    this.sewRest = Float32Array.from(this.sew, (i) => this.rest[i]);

    this.grabbed = -1;
    this.grabTarget = [0, 0, 0];
    this.time = 0;
  }

  grab(i, target) {
    this.release();
    this.grabbed = i;
    this.grabTarget = [...target];
    this.invMass[i] = 0;
  }

  moveGrab(target) {
    this.grabTarget = [...target];
  }

  release() {
    if (this.grabbed >= 0) this.invMass[this.grabbed] = this.baseInvMass[this.grabbed];
    this.grabbed = -1;
  }

  /** Aerodynamic force per triangle: pressure on the normal component of relative wind. */
  computeAir(wind) {
    const { pos, vel, tris, force } = this;
    force.fill(0);
    const cd = 1.1 * 0.5 * RHO_AIR;
    for (let t = 0; t < tris.length; t += 3) {
      const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
      const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
      const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-12) continue;
      const area = len / 2;
      nx /= len; ny /= len; nz /= len;
      const rx = wind[0] - (vel[a] + vel[b] + vel[c]) / 3;
      const ry = wind[1] - (vel[a + 1] + vel[b + 1] + vel[c + 1]) / 3;
      const rz = wind[2] - (vel[a + 2] + vel[b + 2] + vel[c + 2]) / 3;
      const vn = rx * nx + ry * ny + rz * nz;
      const fn = (cd * area * vn * Math.abs(vn)) / 3;
      const ft = (0.02 * area) / 3; // skin friction
      const fx = fn * nx + ft * rx, fy = fn * ny + ft * ry, fz = fn * nz + ft * rz;
      force[a] += fx; force[a + 1] += fy; force[a + 2] += fz;
      force[b] += fx; force[b + 1] += fy; force[b + 2] += fz;
      force[c] += fx; force[c + 1] += fy; force[c + 2] += fz;
    }
  }

  step(dt, env = {}) {
    const wind = env.wind || [0, 0, 0];
    const substeps = env.substeps || 10;
    const h = dt / substeps;
    // Sewing: seam gaps close over SEW_TIME, then stay stitched.
    const sewLeft = Math.max(0, 1 - (this.time + dt) / SEW_TIME);
    for (let k = 0; k < this.sew.length; k++) this.rest[this.sew[k]] = this.sewRest[k] * sewLeft;
    this.computeAir(wind);
    // Scripted hand: a temporary push, e.g. folding a hood back once it has been sewn.
    const nudge = this.topo.nudge;
    if (nudge && this.time >= nudge.from && this.time < nudge.to) {
      for (const i of nudge.ids) {
        const m = 1 / this.baseInvMass[i];
        for (let c = 0; c < 3; c++) this.force[3 * i + c] += nudge.accel[c] * m;
      }
    }
    for (let s = 0; s < substeps; s++) this.substep(h, s / substeps);
    this.time += dt;
  }

  substep(h, frac) {
    const { n, pos, prev, vel, invMass, force } = this;
    // Gravity eases in as the seams finish closing, so panels don't fall while being sewn.
    const ramp = Math.min(1, Math.max(0, (this.time - 0.6 * SEW_TIME) / (0.6 * SEW_TIME)));
    const g = -9.81 * ramp * ramp * (3 - 2 * ramp);
    const damp = Math.exp(-this.fabric.damping * h);
    if (this.grabbed >= 0) {
      // Ease the held point toward the cursor so a fast drag doesn't tear the mesh.
      const i = 3 * this.grabbed, t = this.grabTarget;
      const k = Math.min(1, 0.15 + frac * 0.1);
      for (let c = 0; c < 3; c++) pos[i + c] += (t[c] - pos[i + c]) * k;
    }
    for (let i = 0; i < n; i++) {
      const i3 = 3 * i;
      prev[i3] = pos[i3]; prev[i3 + 1] = pos[i3 + 1]; prev[i3 + 2] = pos[i3 + 2];
      const w = invMass[i];
      if (w === 0) continue;
      vel[i3] = (vel[i3] + force[i3] * w * h) * damp;
      vel[i3 + 1] = (vel[i3 + 1] + (g + force[i3 + 1] * w) * h) * damp;
      vel[i3 + 2] = (vel[i3 + 2] + force[i3 + 2] * w * h) * damp;
      pos[i3] += vel[i3] * h; pos[i3 + 1] += vel[i3 + 1] * h; pos[i3 + 2] += vel[i3 + 2] * h;
    }
    if (this.grabbed >= 0) {
      // Keep the held particle's own displacement out of prev so it doesn't inherit a velocity spike.
      const i = 3 * this.grabbed;
      prev[i] = pos[i]; prev[i + 1] = pos[i + 1]; prev[i + 2] = pos[i + 2];
    }

    this.solveConstraints(h);
    this.collide();

    const inv = 1 / h;
    for (let i = 0; i < n; i++) {
      const i3 = 3 * i;
      if (invMass[i] === 0) { vel[i3] = vel[i3 + 1] = vel[i3 + 2] = 0; continue; }
      let vx = (pos[i3] - prev[i3]) * inv, vy = (pos[i3 + 1] - prev[i3 + 1]) * inv, vz = (pos[i3 + 2] - prev[i3 + 2]) * inv;
      const sp2 = vx * vx + vy * vy + vz * vz;
      if (sp2 > MAX_SPEED * MAX_SPEED) {
        const f = MAX_SPEED / Math.sqrt(sp2); vx *= f; vy *= f; vz *= f;
      }
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
    }
  }

  solveConstraints(h) {
    const { pos, invMass, ca, cb, rest, compliance } = this;
    const ih2 = 1 / (h * h);
    for (let c = 0, m = ca.length; c < m; c++) {
      const i = ca[c], j = cb[c];
      const wi = invMass[i], wj = invMass[j];
      const w = wi + wj;
      if (w === 0) continue;
      const i3 = 3 * i, j3 = 3 * j;
      const dx = pos[j3] - pos[i3], dy = pos[j3 + 1] - pos[i3 + 1], dz = pos[j3 + 2] - pos[i3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const C = len - rest[c];
      const s = C / (w + compliance[c] * ih2) / len;
      pos[i3] += wi * s * dx; pos[i3 + 1] += wi * s * dy; pos[i3 + 2] += wi * s * dz;
      pos[j3] -= wj * s * dx; pos[j3 + 1] -= wj * s * dy; pos[j3 + 2] -= wj * s * dz;
    }
  }

  collide() {
    const { n, pos, prev, invMass, thick, body } = this;
    const { min, max } = body.bounds;
    const mu = this.fabric.friction;
    for (let i = 0; i < n; i++) {
      if (invMass[i] === 0) continue;
      const i3 = 3 * i;
      let x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      const r = thick[i];
      if (y < r) { pos[i3 + 1] = y = r; }
      if (x < min[0] - r || x > max[0] + r || y < min[1] - r || y > max[1] + r || z < min[2] - r || z > max[2] + r) continue;
      const d = body.sdf(x, y, z) - r;
      if (d >= 0) continue;
      const nrm = body.normal(x, y, z);
      x -= nrm[0] * d; y -= nrm[1] * d; z -= nrm[2] * d;
      // Coulomb-style friction on the substep's tangential motion.
      const mx = x - prev[i3], my = y - prev[i3 + 1], mz = z - prev[i3 + 2];
      const mn = mx * nrm[0] + my * nrm[1] + mz * nrm[2];
      const tx = mx - mn * nrm[0], ty = my - mn * nrm[1], tz = mz - mn * nrm[2];
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tl > 0) {
        const f = tl < mu * -d ? 1 : Math.min(1, (mu * -d) / tl);
        x -= tx * f; y -= ty * f; z -= tz * f;
      }
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
    }
  }

  /** Mean and max relative stretch over structural constraints (for tests and diagnostics). */
  strain() {
    let sum = 0, max = 0, count = 0;
    this.topo.cons.forEach((c, k) => {
      if (c.kind !== 'stretch' || this.rest[k] === 0) return;
      const a = 3 * c.a, b = 3 * c.b, p = this.pos;
      const e = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]) / this.rest[k] - 1;
      sum += e; max = Math.max(max, e); count++;
    });
    return { mean: sum / count, max };
  }
}

/** Gusty wind: slowly wandering direction, layered sine "noise" on strength. */
export function windAt(t, strength) {
  if (strength <= 0) return [0, 0, 0];
  const gust = 0.55 + 0.25 * Math.sin(t * 1.3) + 0.15 * Math.sin(t * 3.7 + 1.2) + 0.08 * Math.sin(t * 9.1 + 0.4);
  const ang = -Math.PI / 2 + 0.35 * Math.sin(t * 0.4) + 0.4;
  const s = strength * Math.max(0.1, gust);
  return [Math.cos(ang) * s * -1, 0.08 * s * Math.sin(t * 2.1), Math.sin(ang) * s * -1];
}
