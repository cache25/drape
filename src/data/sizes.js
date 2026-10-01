// Garment catalogue, size charts, mannequin measurements and fit logic.
// Every measurement is in centimetres.
//   chest / waist / hip: finished circumference of the garment
//   length: tops from the high point of the shoulder to the hem; bottoms from the waistband
//   sleeve: from the shoulder point to the cuff

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export const MEASURE_LABELS = { chest: 'Chest', waist: 'Waist', hip: 'Hip', length: 'Length', sleeve: 'Sleeve' };

const chart = (rows, keys) =>
  Object.fromEntries(SIZES.map((s, i) => [s, Object.fromEntries(keys.map((k, j) => [k, rows[j][i]]))]));

const TOP = ['chest', 'length', 'sleeve'];
const BOTTOM = ['waist', 'hip', 'length'];

const TEE_COLORS = [
  { name: 'Optic White', hex: '#f3f1ec' },
  { name: 'Heather Grey', hex: '#a3a5a8' },
  { name: 'Washed Black', hex: '#2b2c30' },
  { name: 'Navy', hex: '#28334d' },
  { name: 'Sage', hex: '#9db095' },
];
const FLEECE_COLORS = [
  { name: 'Cream', hex: '#ece3cf' },
  { name: 'Oat', hex: '#d6c4a2' },
  { name: 'Charcoal', hex: '#3d3e43' },
  { name: 'Forest', hex: '#2f4a3b' },
  { name: 'Clay', hex: '#b2735c' },
];
const TWILL_COLORS = [
  { name: 'Khaki', hex: '#c2ab83' },
  { name: 'Olive', hex: '#6b6b45' },
  { name: 'Navy', hex: '#2a3247' },
  { name: 'Stone', hex: '#d9d2c2' },
  { name: 'Black', hex: '#262626' },
];
const LINEN_COLORS = [
  { name: 'Natural', hex: '#e2d6c0' },
  { name: 'Rust', hex: '#a95a3b' },
  { name: 'Sky', hex: '#9fb6c9' },
  { name: 'Black', hex: '#2a2928' },
  { name: 'Ivory', hex: '#f1ece1' },
];

/**
 * `fit` names the body measurement the garment is judged on and how much ease it needs:
 * the recommended size is the smallest one with at least `minEase` over the body.
 * `limits` bound what the custom-measurement form accepts. `fabric` is the default
 * construction, weight and fibre blend (see fabrics.js).
 */
export const GARMENTS = {
  tee: {
    id: 'tee', name: 'Classic Tee', group: 'Tops', fabric: { construction: 'jersey', gsm: 180, blend: { cotton: 100 } }, measures: TOP,
    fit: { garment: 'chest', body: 'chest', minEase: 6 },
    chart: chart([[88, 94, 100, 108, 116, 124], [66, 69, 72, 74, 76, 78], [19, 20, 21, 22, 23, 24]], TOP),
    limits: { chest: [76, 160], length: [50, 95], sleeve: [12, 40] },
    colors: TEE_COLORS,
  },
  longsleeve: {
    id: 'longsleeve', name: 'Long Sleeve Tee', group: 'Tops', fabric: { construction: 'jersey', gsm: 190, blend: { cotton: 95, elastane: 5 } }, measures: TOP,
    fit: { garment: 'chest', body: 'chest', minEase: 6 },
    chart: chart([[88, 94, 100, 108, 116, 124], [67, 70, 73, 75, 77, 79], [61, 62, 64, 65, 66, 67]], TOP),
    limits: { chest: [76, 160], length: [50, 95], sleeve: [45, 72] },
    colors: TEE_COLORS,
  },
  tank: {
    id: 'tank', name: 'Tank Top', group: 'Tops', fabric: { construction: 'jersey', gsm: 150, blend: { cotton: 60, polyester: 40 } }, measures: ['chest', 'length'],
    fit: { garment: 'chest', body: 'chest', minEase: 4 },
    chart: chart([[84, 90, 96, 104, 112, 120], [64, 67, 70, 72, 74, 76]], ['chest', 'length']),
    limits: { chest: [74, 156], length: [50, 95] },
    colors: TEE_COLORS,
  },
  crewneck: {
    id: 'crewneck', name: 'Crewneck Sweatshirt', group: 'Tops', fabric: { construction: 'fleece', gsm: 320, blend: { cotton: 80, polyester: 20 } }, measures: TOP,
    fit: { garment: 'chest', body: 'chest', minEase: 10 },
    chart: chart([[96, 102, 108, 116, 124, 132], [63, 66, 69, 71, 73, 75], [60, 61, 62, 63, 64, 65]], TOP),
    limits: { chest: [84, 170], length: [50, 95], sleeve: [45, 72] },
    colors: FLEECE_COLORS,
  },
  hoodie: {
    id: 'hoodie', name: 'Cream Hoodie', group: 'Tops', fabric: { construction: 'fleece', gsm: 330, blend: { cotton: 80, polyester: 20 } }, measures: TOP,
    fit: { garment: 'chest', body: 'chest', minEase: 12 },
    chart: chart([[98, 104, 110, 118, 126, 134], [64, 67, 70, 72, 74, 76], [60, 61, 62, 63, 64, 65]], TOP),
    limits: { chest: [84, 170], length: [50, 95], sleeve: [45, 72] },
    colors: FLEECE_COLORS,
  },
  trousers: {
    id: 'trousers', name: 'Trousers', group: 'Bottoms', fabric: { construction: 'twill', gsm: 270, blend: { cotton: 98, elastane: 2 } }, measures: BOTTOM,
    fit: { garment: 'hip', body: 'hips', minEase: 4 },
    chart: chart([[72, 76, 80, 86, 92, 98], [94, 98, 102, 108, 114, 120], [100, 102, 104, 106, 108, 110]], BOTTOM),
    limits: { waist: [60, 130], hip: [80, 150], length: [80, 115] },
    colors: TWILL_COLORS,
  },
  shorts: {
    id: 'shorts', name: 'Shorts', group: 'Bottoms', fabric: { construction: 'twill', gsm: 240, blend: { cotton: 100 } }, measures: BOTTOM,
    fit: { garment: 'hip', body: 'hips', minEase: 6 },
    chart: chart([[72, 76, 80, 86, 92, 98], [96, 100, 104, 110, 116, 122], [44, 45, 46, 47, 48, 49]], BOTTOM),
    limits: { waist: [60, 130], hip: [80, 150], length: [30, 60] },
    colors: TWILL_COLORS,
  },
  skirt: {
    id: 'skirt', name: 'Skirt', group: 'Bottoms', fabric: { construction: 'plain', gsm: 190, blend: { linen: 100 } }, measures: BOTTOM,
    fit: { garment: 'hip', body: 'hips', minEase: 4 },
    chart: chart([[64, 68, 72, 78, 84, 90], [92, 96, 100, 106, 112, 118], [58, 59, 60, 61, 62, 63]], BOTTOM),
    limits: { waist: [56, 130], hip: [80, 150], length: [35, 90] },
    colors: LINEN_COLORS,
  },
};

// ---- mannequin -------------------------------------------------------------

export const BODY_MEASURES = [
  { key: 'height', label: 'Height', min: 150, max: 200, default: 176 },
  { key: 'neck', label: 'Neck', min: 30, max: 44, default: 38 },
  { key: 'shoulder', label: 'Shoulder width', min: 36, max: 54, default: 44 },
  { key: 'chest', label: 'Chest', min: 76, max: 140, default: 96 },
  { key: 'waist', label: 'Waist', min: 60, max: 130, default: 80 },
  { key: 'hips', label: 'Hips', min: 80, max: 140, default: 98 },
  { key: 'backWaist', label: 'Back waist length', min: 36, max: 52, default: 43 },
  { key: 'arm', label: 'Arm length', min: 50, max: 70, default: 60 },
];

export const DEFAULT_BODY = Object.fromEntries(BODY_MEASURES.map((m) => [m.key, m.default]));

/** Keeps every mannequin measurement inside its slider range; fills missing ones with defaults. */
export function clampBody(b = {}) {
  return Object.fromEntries(BODY_MEASURES.map(({ key, min, max }) => {
    const v = Number(b[key]);
    return [key, Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAULT_BODY[key]];
  }));
}

// ---- fit -------------------------------------------------------------------

/** Ease (garment minus body) on the measurement this garment is judged by. */
export function easeFor(garmentId, measurements, body) {
  const { garment, body: bodyKey } = GARMENTS[garmentId].fit;
  return measurements[garment] - body[bodyKey];
}

/** Smallest size that leaves at least the garment's minimum ease over the body. */
export function recommendSize(garmentId, body) {
  const g = GARMENTS[garmentId];
  for (const size of SIZES) {
    if (easeFor(garmentId, g.chart[size], body) >= g.fit.minEase) return size;
  }
  return SIZES[SIZES.length - 1];
}

/** Fit bands in cm of ease; bottoms are judged at the hip, where less ease reads looser. */
export const FIT_BANDS = {
  Tops: [['Snug', 4], ['Regular', 12], ['Relaxed', 20], ['Oversized', Infinity]],
  Bottoms: [['Snug', 3], ['Regular', 8], ['Relaxed', 14], ['Oversized', Infinity]],
};

export function fitLabel(easeCm, group = 'Tops') {
  return FIT_BANDS[group].find(([, upTo]) => easeCm < upTo)[0];
}

export const cmToIn = (cm) => Math.round((cm / 2.54) * 10) / 10;
export const inToCm = (inches) => Math.round(inches * 2.54 * 2) / 2;

/** Returns { key: message } for every out-of-range or missing value; empty when valid. */
export function validateCustom(garmentId, m, units = 'cm') {
  const g = GARMENTS[garmentId];
  const errors = {};
  const show = (cm) => (units === 'cm' ? `${cm} cm` : `${cmToIn(cm)} in`);
  for (const key of g.measures) {
    const label = MEASURE_LABELS[key];
    const [lo, hi] = g.limits[key];
    const v = m[key];
    if (!Number.isFinite(v)) errors[key] = `Enter a ${label.toLowerCase()} measurement.`;
    else if (v < lo || v > hi) errors[key] = `${label} must be between ${show(lo)} and ${show(hi)}.`;
  }
  if (!errors.waist && !errors.hip && m.waist > m.hip) errors.waist = 'Waist can’t be larger than the hip.';
  return errors;
}
