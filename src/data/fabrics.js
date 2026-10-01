// Fabrics as a textile person describes them: a construction (how the yarn is knitted or
// woven), a weight in gsm, and a fibre blend in percent. The blend sets the physics the
// solver uses, so 5% elastane really does make a knit stretch and viscose really does drape.

/**
 * Constructions, with the mechanics of 100% cotton at the reference weight.
 * stretch / shear / bend are spring stiffnesses in N/m; stretchPct is the comfortable stretch.
 */
export const CONSTRUCTIONS = {
  jersey: {
    name: 'Single jersey', texture: 'jersey', refGsm: 180, stretchPct: 5,
    stretch: 900, shear: 90, bend: 0.9, damping: 0.25, friction: 0.5,
    look: { roughness: 0.88, sheen: 0.6, sheenRoughness: 0.45, normalScale: 0.55, tile: 0.05 },
  },
  fleece: {
    name: 'Brushed fleece', texture: 'fleece', refGsm: 320, stretchPct: 3,
    stretch: 1600, shear: 180, bend: 3.2, damping: 0.35, friction: 0.6,
    look: { roughness: 0.95, sheen: 1, sheenRoughness: 0.75, normalScale: 0.35, tile: 0.08 },
  },
  twill: {
    name: 'Twill', texture: 'twill', refGsm: 260, stretchPct: 2,
    stretch: 3000, shear: 300, bend: 6, damping: 0.3, friction: 0.55,
    look: { roughness: 0.8, sheen: 0.35, sheenRoughness: 0.5, normalScale: 0.6, tile: 0.04 },
  },
  plain: {
    name: 'Plain weave', texture: 'linen', refGsm: 190, stretchPct: 1,
    stretch: 2200, shear: 160, bend: 1.6, damping: 0.25, friction: 0.5,
    look: { roughness: 0.9, sheen: 0.3, sheenRoughness: 0.6, normalScale: 0.7, tile: 0.05 },
  },
  satin: {
    name: 'Satin', texture: 'satin', refGsm: 130, stretchPct: 2,
    stretch: 1500, shear: 70, bend: 0.35, damping: 0.18, friction: 0.35,
    look: { roughness: 0.4, sheen: 0.6, sheenRoughness: 0.25, normalScale: 0.2, tile: 0.03 },
  },
};

/**
 * Fibres relative to cotton. `stretch` and `bend` multiply stiffness, `friction` multiplies
 * grip; `sheen` and `rough` shift the surface. Elastane is handled separately because a few
 * percent changes a fabric far more than its share suggests.
 */
export const FIBERS = {
  cotton: { name: 'Cotton', stretch: 1, bend: 1, friction: 1, density: 1, sheen: 0, rough: 0 },
  polyester: { name: 'Polyester', stretch: 1.2, bend: 1.15, friction: 0.8, density: 0.95, sheen: 0.25, rough: -0.08 },
  elastane: { name: 'Elastane', stretch: 1, bend: 0.6, friction: 1.1, density: 1, sheen: 0.2, rough: -0.05 },
  wool: { name: 'Wool', stretch: 0.8, bend: 1.5, friction: 1.2, density: 1.05, sheen: -0.1, rough: 0.05 },
  linen: { name: 'Linen', stretch: 1.6, bend: 2.2, friction: 1.05, density: 1.05, sheen: 0.05, rough: 0.03 },
  viscose: { name: 'Viscose', stretch: 0.8, bend: 0.45, friction: 0.9, density: 1.1, sheen: 0.3, rough: -0.12 },
  nylon: { name: 'Nylon', stretch: 1.1, bend: 0.9, friction: 0.7, density: 0.9, sheen: 0.4, rough: -0.18 },
  silk: { name: 'Silk', stretch: 0.9, bend: 0.35, friction: 0.75, density: 1, sheen: 0.5, rough: -0.25 },
};

export const GSM_RANGE = [90, 450];

/** Percentages that sum to 100, dropping zeros; the largest share absorbs rounding. */
export function normalizeBlend(blend) {
  const entries = Object.entries(blend).filter(([k, v]) => FIBERS[k] && v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return { cotton: 100 };
  const out = Object.fromEntries(entries.map(([k, v]) => [k, Math.round((v / total) * 100)]));
  const diff = 100 - Object.values(out).reduce((s, v) => s + v, 0);
  const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  out[top] += diff;
  return out;
}

/**
 * Set one fibre's share and rescale the others proportionally so the blend still sums to 100.
 */
export function setFiberShare(blend, fiber, pct) {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  const others = Object.entries(blend).filter(([k]) => k !== fiber);
  const rest = others.reduce((s, [, v]) => s + v, 0);
  const out = { [fiber]: pct };
  if (rest > 0) for (const [k, v] of others) out[k] = (v / rest) * (100 - pct);
  else if (pct < 100) out.cotton = (out.cotton || 0) + 100 - pct;
  return normalizeBlend(out);
}

export const blendLabel = (blend) =>
  Object.entries(blend).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}% ${FIBERS[k].name}`).join(' · ');

/** Solver-ready fabric: masses, stiffnesses and surface look from construction, weight and blend. */
export function blendFabric({ construction, gsm, blend }) {
  const c = CONSTRUCTIONS[construction];
  const b = normalizeBlend(blend);
  const share = (k) => (b[k] || 0) / 100;
  // Geometric mean of fibre multipliers, so blends land between their parts.
  const mix = (prop) => Math.exp(Object.entries(b).reduce((s, [k, v]) => s + (v / 100) * Math.log(FIBERS[k][prop]), 0));
  const lin = (prop) => Object.entries(b).reduce((s, [k, v]) => s + (v / 100) * FIBERS[k][prop], 0);
  const weight = gsm / c.refGsm;
  const elastic = 1 / (1 + 18 * share('elastane')); // 5% elastane roughly halves stretch stiffness

  return {
    key: c.texture,
    construction,
    name: c.name,
    gsm,
    blend: b,
    stretchPct: Math.round((c.stretchPct / (mix('stretch') * elastic)) * 10) / 10,
    density: (gsm / 1000) * lin('density'),
    stretch: c.stretch * weight * mix('stretch') * elastic,
    shear: c.shear * weight * mix('stretch') * elastic,
    bend: c.bend * weight * weight * mix('bend'), // bending stiffness grows with thickness squared
    friction: Math.min(0.9, c.friction * mix('friction')),
    damping: c.damping,
    look: {
      ...c.look,
      sheen: Math.min(1, Math.max(0, c.look.sheen + lin('sheen'))),
      roughness: Math.min(1, Math.max(0.25, c.look.roughness + lin('rough'))),
    },
  };
}
