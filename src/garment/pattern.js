// Flat sewing patterns, in metres. Panel coordinates are x across, y DOWN from the
// panel's top line (a top's shoulder line, a bottom's waistband). Each polygon edge
// carries a label: 'seam' edges are sewn front-to-back; 'neck', 'hem', 'cuff', 'armhole',
// 'waist' and 'face' edges stay open; 'attach' edges join another piece.
// Patterns are cut for the mannequin they will be placed on (sleeve angle, armhole depth,
// trouser rise and leg position all follow its landmarks).
import { ARM_ANGLE, makeBody } from '../sim/body.js';

const STYLE = {
  tee: {
    panel: 'top', shoulderInset: 0.03, drop: 0.03,
    neckHalf: 0.085, neckFront: 0.085, neckBack: 0.022,
    armWidth: (m) => 0.19 + (m.chest - 100) * 0.0008,
    cuffWidth: (m) => 0.165 + (m.chest - 100) * 0.0007,
    rib: { neck: 0.02, hem: 0.022, cuff: 0.02 },
  },
  longsleeve: {
    panel: 'top', shoulderInset: 0.03, drop: 0.03,
    neckHalf: 0.085, neckFront: 0.085, neckBack: 0.022,
    armWidth: (m) => 0.18 + (m.chest - 100) * 0.0008,
    cuffWidth: (m) => 0.125 + (m.chest - 100) * 0.0004,
    rib: { neck: 0.02, hem: 0.022, cuff: 0.04 },
  },
  tank: {
    panel: 'tank', drop: 0.025, strap: 0.045,
    neckHalf: 0.1, neckFront: 0.13, neckBack: 0.05,
    rib: { neck: 0.015, armhole: 0.015, hem: 0.02 },
  },
  crewneck: {
    panel: 'top', shoulderInset: 0.02, drop: 0.035,
    neckHalf: 0.088, neckFront: 0.07, neckBack: 0.022,
    armWidth: (m) => 0.2 + (m.chest - 108) * 0.0008,
    cuffWidth: (m) => 0.135 + (m.chest - 108) * 0.0004,
    rib: { neck: 0.025, hem: 0.065, cuff: 0.065 },
  },
  hoodie: {
    panel: 'top', shoulderInset: 0.02, drop: 0.035,
    neckHalf: 0.095, neckFront: 0.075, neckBack: 0.025,
    armWidth: (m) => 0.2 + (m.chest - 110) * 0.0008,
    cuffWidth: (m) => 0.135 + (m.chest - 110) * 0.0004,
    rib: { neck: 0, hem: 0.065, cuff: 0.065 },
    hoodHeight: 0.36,
  },
  trousers: {
    panel: 'pants', rise: 0.27,
    legOpen: (m) => 0.2 + (m.hip - 102) * 0.0006,
    rib: { waist: 0.04 },
  },
  shorts: {
    panel: 'pants', rise: 0.27,
    legOpen: (m) => 0.3 + (m.hip - 104) * 0.0008,
    rib: { waist: 0.04 },
  },
  skirt: {
    panel: 'skirt', flare: 0.07,
    rib: { waist: 0.035 },
  },
};

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

const neckCurve = (st, depth, K = 8) => {
  const out = [];
  for (let k = 0; k < K; k++) {
    const a = (Math.PI / 2) * (k / K);
    out.push([[st.neckHalf * Math.sin(a), depth * Math.cos(a)], 'neck']);
  }
  return out;
};

function topPanel(st, m, neckDepth, body, topY) {
  const halfW = m.chest / 400;
  const L = m.length / 100;
  const S = m.sleeve / 100;
  const wArm = st.armWidth(m);
  const wCuff = st.cuffWidth(m);
  const S0 = [halfW - st.shoulderInset, st.drop];

  // Sleeve angle: a dropped shoulder puts the sleeve's top edge well above the arm, so the
  // sleeve is cut a little steeper than the arm until its centreline meets the arm at the cuff.
  const [jx, jy] = body.armJoint;
  const above = (S0[0] - jx) * Math.sin(ARM_ANGLE) + (topY - S0[1] - jy) * Math.cos(ARM_ANGLE);
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

  const right = neckCurve(st, neckDepth);
  right.push([[st.neckHalf, 0], 'seam'], [S0, 'seam'], [S1, 'cuff'], [S2, 'seam'], [U, 'seam'], [H, 'hem']);
  return { ...mirrorHalf(right), sleeve: { S0, d, n, tU: t, wArm, S, wCuff } };
}

function tankPanel(st, m, neckDepth, body, topY) {
  const halfW = m.chest / 400;
  const L = m.length / 100;
  const sx = st.neckHalf + st.strap;
  // Armhole bottom sits a few centimetres below the arm where it crosses the side seam.
  const [jx, jy] = body.armJoint;
  const armBottom = jy - Math.max(0, halfW - jx) * Math.tan(ARM_ANGLE) - 0.045;
  const ad = Math.min(L - 0.1, Math.max(0.15, topY - armBottom + 0.03));
  const right = neckCurve(st, neckDepth);
  right.push([[st.neckHalf, 0], 'seam'], [[sx, st.drop], 'armhole']);
  const K = 8;
  for (let k = 1; k < K; k++) {
    const t = k / K;
    right.push([[sx + (halfW - sx) * t * t, st.drop + (ad - st.drop) * t], 'armhole']);
  }
  right.push([[halfW, ad], 'seam'], [[halfW, L], 'hem']);
  return mirrorHalf(right);
}

function pantsPanel(st, m, body, topY) {
  const wH = m.waist / 400, hH = Math.max(m.hip / 400, wH);
  const L = m.length / 100;
  const hd = Math.min(topY - body.hipY, L * 0.6);
  // The crotch seam must sit just below the form's crotch, whatever the style's nominal rise.
  const rise = Math.min(L - 0.06, Math.max(st.rise, topY - body.crotchY + 0.025));
  const open = st.legOpen(m);
  const legX = body.legCenterX(topY - L);
  const iH = Math.max(0.012, legX - open / 2), oH = iH + open;
  const pts = [[-wH, 0], [wH, 0], [hH, hd], [oH, L], [iH, L], [0, rise], [-iH, L], [-oH, L], [-hH, hd]];
  const labels = ['waist', 'seam', 'seam', 'hem', 'seam', 'seam', 'hem', 'seam', 'seam'];
  return { pts, labels };
}

function skirtPanel(st, m, body, topY) {
  const wH = m.waist / 400, hH = Math.max(m.hip / 400, wH);
  const L = m.length / 100;
  const hd = Math.min(topY - body.hipY, L * 0.6);
  const hemH = hH + st.flare * Math.max(0, L - hd) / 0.4;
  return {
    pts: [[-wH, 0], [wH, 0], [hH, hd], [hemH, L], [-hemH, L], [-hH, hd]],
    labels: ['waist', 'seam', 'seam', 'hem', 'seam', 'seam'],
  };
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

export const isBottom = (garmentId) => ['pants', 'skirt'].includes(STYLE[garmentId].panel);

/** Cut the pattern for `garmentId` at the given measurements (cm), fitted to `body`. */
export function makePattern(garmentId, measurements, body = makeBody()) {
  const st = STYLE[garmentId];
  const m = measurements;
  const bottom = isBottom(garmentId);
  const topY = bottom ? body.waistY + 0.03 : body.topY;
  let front, back;
  if (st.panel === 'top') {
    front = topPanel(st, m, st.neckFront, body, topY);
    back = topPanel(st, m, st.neckBack, body, topY);
  } else if (st.panel === 'tank') {
    front = tankPanel(st, m, st.neckFront, body, topY);
    back = tankPanel(st, m, st.neckBack, body, topY);
  } else {
    const panel = st.panel === 'pants' ? pantsPanel : skirtPanel;
    front = panel(st, m, body, topY);
    back = panel(st, m, body, topY);
  }
  return {
    garmentId,
    kind: bottom ? 'bottom' : 'top',
    topY,
    // Panels start this far in front of / behind the form: clear of its deepest point.
    gap: Math.max(0.2, body.bounds.max[2] + 0.04),
    // A waistband bigger than the form's waist is drawn in, as a belt or drawcord would.
    waistCinch: bottom ? Math.min(1, (body.measures.waist + 3) / m.waist) : 1,
    rib: st.rib,
    front,
    back,
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
