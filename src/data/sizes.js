// Size charts and fit logic. All garment measurements are in centimetres:
// chest = finished chest circumference, length = high point of shoulder to hem,
// sleeve = shoulder point to cuff.

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export const GARMENTS = {
  tee: {
    id: 'tee',
    name: 'Classic Tee',
    fabric: 'jersey',
    minEase: 6,
    chart: {
      XS: { chest: 88, length: 66, sleeve: 19 },
      S: { chest: 94, length: 69, sleeve: 20 },
      M: { chest: 100, length: 72, sleeve: 21 },
      L: { chest: 108, length: 74, sleeve: 22 },
      XL: { chest: 116, length: 76, sleeve: 23 },
      XXL: { chest: 124, length: 78, sleeve: 24 },
    },
    colors: [
      { name: 'Optic White', hex: '#f3f1ec' },
      { name: 'Heather Grey', hex: '#a3a5a8' },
      { name: 'Washed Black', hex: '#2b2c30' },
      { name: 'Navy', hex: '#28334d' },
      { name: 'Sage', hex: '#9db095' },
    ],
  },
  hoodie: {
    id: 'hoodie',
    name: 'Cream Hoodie',
    fabric: 'fleece',
    minEase: 12,
    chart: {
      XS: { chest: 98, length: 64, sleeve: 56 },
      S: { chest: 104, length: 67, sleeve: 57 },
      M: { chest: 110, length: 70, sleeve: 58 },
      L: { chest: 118, length: 72, sleeve: 59 },
      XL: { chest: 126, length: 74, sleeve: 60 },
      XXL: { chest: 134, length: 76, sleeve: 61 },
    },
    colors: [
      { name: 'Cream', hex: '#ece3cf' },
      { name: 'Oat', hex: '#d6c4a2' },
      { name: 'Charcoal', hex: '#3d3e43' },
      { name: 'Forest', hex: '#2f4a3b' },
      { name: 'Clay', hex: '#b2735c' },
    ],
  },
};

/** Smallest size that leaves at least the garment's minimum ease over the body chest. */
export function recommendSize(garmentId, bodyChestCm) {
  const g = GARMENTS[garmentId];
  for (const size of SIZES) {
    if (g.chart[size].chest - bodyChestCm >= g.minEase) return size;
  }
  return SIZES[SIZES.length - 1];
}

/** Ease is garment chest minus body chest, in cm. */
export function fitLabel(easeCm) {
  if (easeCm < 4) return 'Snug';
  if (easeCm < 12) return 'Regular';
  if (easeCm < 20) return 'Relaxed';
  return 'Oversized';
}

export const cmToIn = (cm) => Math.round((cm / 2.54) * 10) / 10;
