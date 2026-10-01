// Flat sewing patterns, in metres. Panel coordinates are x across, y DOWN from the
// shoulder line. Each polygon edge carries a label: 'seam' edges are sewn front-to-back,
// 'neck' / 'hem' / 'cuff' / 'face' edges stay open, 'attach' edges join another piece.
import { ARM_ANGLE } from '../sim/body.js';

export const TOP_Y = 1.56; // world height of the pattern's shoulder line when first placed

const STYLE = {
  tee: {
    shoulderInset: 0.03, drop: 0.03,
    neckHalf: 0.085, neckFront: 0.085, neckBack: 0.022,
    armWidth: (m) => 0.19 + (m.chest - 100) * 0.0008,
    cuffWidth: (m) => 0.165 + (m.chest - 100) * 0.0007,
    rib: { neck: 0.02, hem: 0.022, cuff: 0.02 },
  },
  hoodie: {
    shoulderInset: 0.02, drop: 0.035,
    neckHalf: 0.095, neckFront: 0.075, neckBack: 0.025,
    armWidth: (m) => 0.2 + (m.chest - 110) * 0.0008,
    cuffWidth: () => 0.11,
    rib: { neck: 0, hem: 0.065, cuff: 0.065 },
    hoodHeight: 0.36,
  },
};

const quarterEllipse = (a, b) =>
  (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))) / 4;

/** Build a closed polygon from a right half (list of [point, labelOfEdgeToNext]) by mirroring. */
function mirrorHalf(right) {
  const pts = right.map(([p]) => p);
  const labels = right.map(([, l]) => l);
  for (let i = right.length - 1; i >= 1; i--) {
    pts.push([-right[i][0][0], right[i][0][1]]);
    labels.push(right[i - 1][1]);
  }
  return { pts, labels };
}

function bodyPanel(st, m, neckDepth, armJoint) {
  const halfW = m.chest / 400;
  const L = m.length / 100;
  const S = m.sleeve / 100;
  const wArm = st.armWidth(m);
  const wCuff = st.cuffWidth(m);
  const S0 = [halfW - st.shoulderInset, st.drop];

  // Sleeve angle: a dropped shoulder puts the sleeve's top edge well above the arm, so the
  // sleeve is cut a little steeper than the arm until its centreline meets the arm at the cuff.
  const [jx, jy] = armJoint;
  const above = (S0[0] - jx) * Math.sin(ARM_ANGLE) + (TOP_Y - S0[1] - jy) * Math.cos(ARM_ANGLE);
  const tilt = Math.asin(Math.min(0.25, Math.max(-0.15, (above - wCuff / 2) / S)));
  const ang = ARM_ANGLE + tilt;
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = [c, s]; // along the sleeve (y down)
  const n = [-s, c]; // across the sleeve, toward the underarm

  const S1 = [S0[0] + d[0] * S, S0[1] + d[1] * S];
  const S2 = [S1[0] + n[0] * wCuff, S1[1] + n[1] * wCuff];
  // Underarm: the point on the sleeve's underside line (wArm below the top) that meets the side seam.
  let t = (halfW - S0[0] - n[0] * wArm) / d[0];
  t = Math.min(Math.max(t, 0.02), S - 0.04);
  const U = [S0[0] + n[0] * wArm + d[0] * t, S0[1] + n[1] * wArm + d[1] * t];
  const H = [halfW, L];

  const K = 8;
  const right = [];
  for (let k = 0; k < K; k++) {
    const a = (Math.PI / 2) * (k / K);
    right.push([[st.neckHalf * Math.sin(a), neckDepth * Math.cos(a)], 'neck']);
  }
  right.push([[st.neckHalf, 0], 'seam'], [S0, 'seam'], [S1, 'cuff'], [S2, 'seam'], [U, 'seam'], [H, 'hem']);
  return { ...mirrorHalf(right), sleeve: { S0, d, n, tU: t, wArm, S, wCuff } };
}

/**
 * A hood worn down, as it reads on a form: a doubled, rounded flap lying on the upper back.
 * Coordinates are x across, y down from the back neckline; its top edge is sewn to the neck.
 */
function hoodPanel(st) {
  const top = st.neckHalf + 0.035; // reaches round the neck to just past the shoulder seam
  const wide = top + 0.05;
  const depth = st.hoodHeight * 0.8;
  const pts = [[-top, 0], [top, 0]];
  const labels = ['attach', 'face'];
  const K = 10;
  for (let k = 0; k <= K; k++) {
    const a = (Math.PI * k) / K; // round bottom, from the right side across to the left
    pts.push([wide * Math.cos(a), depth * 0.45 + depth * 0.55 * Math.sin(a)]);
    labels.push('face');
  }
  return { pts, labels, halfTop: top, neckHalf: st.neckHalf };
}

export function makePattern(garmentId, measurements, armJoint = [0.19, 1.44]) {
  const st = STYLE[garmentId];
  return {
    garmentId,
    halfWidth: measurements.chest / 400,
    length: measurements.length / 100,
    rib: st.rib,
    drop: st.drop,
    front: bodyPanel(st, measurements, st.neckFront, armJoint),
    back: bodyPanel(st, measurements, st.neckBack, armJoint),
    hood: st.hoodHeight ? hoodPanel(st) : null,
  };
}

// ---- polygon helpers -------------------------------------------------------

export function pointInPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Closest point on the polygon outline, optionally restricted to edges with a given label. */
export function closestOnOutline(poly, x, y, onlyLabel) {
  let best = { dist: Infinity, x: 0, y: 0, label: null };
  const { pts, labels } = poly;
  for (let i = 0; i < pts.length; i++) {
    if (onlyLabel && labels[i] !== onlyLabel) continue;
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const ex = bx - ax, ey = by - ay;
    const l2 = ex * ex + ey * ey || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2));
    const px = ax + ex * t, py = ay + ey * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best.dist) best = { dist, x: px, y: py, label: labels[i] };
  }
  return best;
}

export function segmentsIntersect(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
