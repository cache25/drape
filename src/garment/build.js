// Turns flat patterns into a sewn particle mesh: grids each panel, merges the front and
// back along their seam edges, attaches the hood and drawstrings, and emits the
// constraints and triangles the solver and renderer need.
import { TOP_Y, pointInPolygon, closestOnOutline } from './pattern.js';

const key = (i, j) => `${i},${j}`;
const conKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const PANEL_GAP = 0.2;

/** Regular grid of square cells over a polygon. Boundary vertices snap onto the outline. */
export function gridPanel(poly, h) {
  const xs = poly.pts.map((p) => p[0]), ys = poly.pts.map((p) => p[1]);
  const i0 = Math.floor(Math.min(...xs) / h) - 1, i1 = Math.ceil(Math.max(...xs) / h) + 1;
  const j0 = Math.floor(Math.min(...ys) / h) - 1, j1 = Math.ceil(Math.max(...ys) / h) + 1;

  const cells = [];
  const counts = new Map();
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      if (!pointInPolygon(poly.pts, (i + 0.5) * h, (j + 0.5) * h)) continue;
      cells.push([i, j]);
      for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
        const k = key(a, b);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
  }

  const verts = new Map();
  for (const [k, count] of counts) {
    const [i, j] = k.split(',').map(Number);
    const v = { i, j, x: i * h, y: j * h, boundary: count < 4, label: null };
    if (v.boundary) {
      const c = closestOnOutline(poly, v.x, v.y);
      v.label = c.label;
      if (c.dist < 0.75 * h) { v.x = c.x; v.y = c.y; }
    }
    verts.set(k, v);
  }
  return { cells, verts, h };
}

class TopoBuilder {
  constructor() {
    this.flat = []; this.pos = []; this.shade = []; this.thick = []; this.mass = [];
    this.rib = [];
    this.tris = [];
    this.cons = new Map();
  }
  addParticle(fx, fy, p, { shade = 1, thick = 0.006, rib = false } = {}) {
    this.flat.push(fx, fy);
    this.pos.push(p[0], p[1], p[2]);
    this.shade.push(shade);
    this.thick.push(thick);
    this.rib.push(rib ? 1 : 0);
    this.mass.push(0);
    return this.pos.length / 3 - 1;
  }
  addCon(a, b, kind, rest) {
    if (a === b) return;
    const k = conKey(a, b);
    if (this.cons.has(k)) return;
    if (rest === undefined) rest = Math.hypot(this.flat[2 * a] - this.flat[2 * b], this.flat[2 * a + 1] - this.flat[2 * b + 1]);
    this.cons.set(k, { a, b, kind, rest });
  }
  /** Seam stitch: rest length starts at the current gap and is shrunk to zero by the solver. */
  addSew(a, b) {
    const p = this.pos;
    const gap = Math.hypot(p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2]);
    this.addCon(a, b, 'sew', gap);
  }
  addTri(a, b, c, density) {
    this.tris.push(a, b, c);
    const f = this.flat;
    const area = Math.abs((f[2 * b] - f[2 * a]) * (f[2 * c + 1] - f[2 * a + 1]) - (f[2 * c] - f[2 * a]) * (f[2 * b + 1] - f[2 * a + 1])) / 2;
    for (const v of [a, b, c]) this.mass[v] += (density * area) / 3;
  }
}

/**
 * Emit one panel. `place(v)` returns the vertex's initial world position, `share(v)` may
 * return an existing particle index to reuse (seams), `opts(v)` gives per-particle extras.
 */
function emitPanel(tb, grid, { place, share, opts, flip, density }) {
  const idx = new Map();
  for (const [k, v] of grid.verts) {
    const shared = share ? share(v) : undefined;
    idx.set(k, shared !== undefined ? shared : tb.addParticle(v.x, v.y, place(v), opts ? opts(v) : undefined));
  }
  const edges = new Set();
  const get = (i, j) => idx.get(key(i, j));
  for (const [i, j] of grid.cells) {
    const a = get(i, j), b = get(i + 1, j), c = get(i + 1, j + 1), d = get(i, j + 1);
    tb.addCon(a, b, 'stretch'); tb.addCon(b, c, 'stretch');
    tb.addCon(c, d, 'stretch'); tb.addCon(d, a, 'stretch');
    tb.addCon(a, c, 'shear'); tb.addCon(b, d, 'shear');
    edges.add(`h${i},${j}`); edges.add(`h${i},${j + 1}`);
    edges.add(`v${i},${j}`); edges.add(`v${i + 1},${j}`);
    if (flip) { tb.addTri(a, b, d, density); tb.addTri(b, c, d, density); }
    else { tb.addTri(a, d, b, density); tb.addTri(b, d, c, density); }
  }
  // Bending: skip-one-vertex springs along straight runs of the grid.
  for (const v of grid.verts.values()) {
    const { i, j } = v;
    if (edges.has(`h${i},${j}`) && edges.has(`h${i + 1},${j}`)) tb.addCon(get(i, j), get(i + 2, j), 'bend');
    if (edges.has(`v${i},${j}`) && edges.has(`v${i},${j + 1}`)) tb.addCon(get(i, j), get(i, j + 2), 'bend');
  }
  return idx;
}

export function buildGarment(pattern, fabric, h = 0.02) {
  const tb = new TopoBuilder();
  const density = fabric.density;
  const front = gridPanel(pattern.front, h);
  const back = gridPanel(pattern.back, h);

  // Ribbed bands (collar, cuffs, hem): stiffer and a touch darker, like a real knit trim.
  const ribOpts = (poly) => (v) => {
    const rib = Object.entries(pattern.rib).some(([label, w]) => w > 0 && closestOnOutline(poly, v.x, v.y, label).dist < w);
    return { rib, shade: rib ? 0.93 : 1 };
  };

  // Panels start flat, in front of and behind the form; sewing pulls the seams shut.
  const place = (v, z) => [v.x, TOP_Y - v.y, z];

  const frontIdx = emitPanel(tb, front, { place: (v) => place(v, PANEL_GAP), opts: ribOpts(pattern.front), flip: false, density });
  const backIdx = emitPanel(tb, back, { place: (v) => place(v, -PANEL_GAP), opts: ribOpts(pattern.back), flip: true, density });
  const isSeam = (v) => v && v.boundary && v.label === 'seam';
  const sl = pattern.front.sleeve;
  const inSleeve = (v) => (Math.abs(v.x) - sl.S0[0]) * sl.d[0] + (v.y - sl.S0[1]) * sl.d[1] > 0.02 && Math.abs(v.x) > sl.S0[0] - 0.01;
  for (const [k, v] of back.verts) {
    if (!isSeam(v) || !isSeam(front.verts.get(k))) continue;
    tb.addSew(frontIdx.get(k), backIdx.get(k));
    if (inSleeve(v)) tb.cons.get(conKey(frontIdx.get(k), backIdx.get(k))).pace = 0.5;
  }

  const ropes = [];
  let ropeMeta = null;
  if (pattern.hood) {
    const hood = gridPanel(pattern.hood, h);
    const { halfTop, neckHalf } = pattern.hood;
    // Hangs flat just behind the back panel; its top edge is sewn along the back neckline.
    const backNeck = [];
    for (const [k, v] of back.verts) if (v.label === 'neck' || (isSeam(v) && v.y < 0.02)) backNeck.push({ v, p: backIdx.get(k) });
    const idx = emitPanel(tb, hood, {
      place: (v) => [v.x, TOP_Y - 0.02 - v.y, -PANEL_GAP - 0.03],
      opts: (v) => ({ thick: 0.02, shade: closestOnOutline(pattern.hood, v.x, v.y, 'face').dist < 0.03 && v.y > 0.01 ? 0.94 : 1 }),
      flip: true, density: density * 2, // two layers of fleece
    });
    for (const [k, v] of hood.verts) {
      if (!(v.boundary && v.label === 'attach')) continue;
      const tx = (v.x / halfTop) * (neckHalf + 0.03);
      let best = backNeck[0];
      for (const c of backNeck) if (Math.abs(c.v.x - tx) + c.v.y < Math.abs(best.v.x - tx) + best.v.y) best = c;
      tb.addSew(idx.get(k), best.p);
    }

    // Drawstrings hang from the front neckline, either side of centre.
    const ropeLen = 0.32, segs = 14;
    for (const side of [1, -1]) {
      let anchor = null, best = Infinity;
      for (const [k, v] of front.verts) {
        if (v.label !== 'neck') continue;
        const dist = Math.abs(v.x - side * 0.035);
        if (dist < best) { best = dist; anchor = frontIdx.get(k); }
      }
      const ax = tb.pos[3 * anchor], ay = tb.pos[3 * anchor + 1], az = tb.pos[3 * anchor + 2];
      const ids = [anchor];
      for (let s = 1; s <= segs; s++) {
        const p = tb.addParticle(0, 0, [ax, ay - (s * ropeLen) / segs, az + 0.012], { thick: 0.03 });
        tb.mass[p] = 0.0015;
        ids.push(p);
      }
      tb.mass[ids[ids.length - 1]] = 0.004; // aglet
      for (let s = 0; s < segs; s++) tb.addCon(ids[s], ids[s + 1], 'rope', ropeLen / segs);
      for (let s = 0; s + 2 <= segs; s++) tb.addCon(ids[s], ids[s + 2], 'ropeBend', (2 * ropeLen) / segs);
      ropes.push(ids);
    }
    ropeMeta = { radius: 0.0045 };
  }

  // Snapped corner vertices can end up with only degenerate triangles; give every particle
  // a floor mass so none is mistaken for a pinned (infinite-mass) point.
  const minMass = density * h * h * 0.15;
  for (let i = 0; i < tb.mass.length; i++) tb.mass[i] = Math.max(tb.mass[i], minMass);
  const n = tb.pos.length / 3;
  const cons = [...tb.cons.values()];
  const ribFlag = tb.rib;
  return {
    n,
    pos: Float32Array.from(tb.pos),
    flat: Float32Array.from(tb.flat),
    shade: Float32Array.from(tb.shade),
    thick: Float32Array.from(tb.thick),
    mass: Float32Array.from(tb.mass),
    tris: Uint32Array.from(tb.tris),
    cons: cons.map((c) => ({ ...c, rib: ribFlag[c.a] || ribFlag[c.b] })),
    ropes,
    ropeMeta,
    stats: { front: front.verts.size, back: back.verts.size },
  };
}
