# Drape

Realistic 3D garment mockups in the browser: a **Classic Tee** and a **Cream Hoodie** sewn onto a
dress form with a live cloth simulation, plus size charts and fit guidance.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: sizes, patterns, cloth physics
npm run build    # static site in dist/
```

## What you can do

- **Pull the fabric.** Drag any part of the garment; release and it falls back and settles.
- **Wind.** Gusty, direction-wandering wind with a strength slider.
- **Sizes XS–XXL.** Click a size or a size-chart row (cm / in). The garment is rebuilt from its
  pattern at that size and re-draped.
- **Mannequin chest.** Resizes the form, recommends a size and shows ease on a Snug → Oversized scale.
- **Colours**, pause and re-drape.

## How it works

| Piece | File |
| --- | --- |
| Size charts, recommendation, fit labels | `src/data/sizes.js` |
| Flat sewing patterns (front, back, hood) with labelled edges | `src/garment/pattern.js` |
| Grids panels, sews seams, adds hood + drawstrings, ribbed bands | `src/garment/build.js` |
| XPBD cloth solver: stretch/shear/bend, sewing, air & wind, friction | `src/sim/cloth.js` |
| Dress form as round-cone SDF (collision and visible mesh) | `src/sim/body.js` |
| Three.js studio, knit normal maps, drag-to-pull | `src/render/` |

The garment is built the way garment CAD does it. Flat front and back panels start in front of and
behind the form, and seam constraints close over ~0.6 s (sleeves first, so they wrap the arms
before the body seams tighten). Then gravity eases in. Stiffnesses are physical (N/m) and masses come from
fabric weight (180 gsm jersey, 320 gsm fleece), so the two fabrics hang and move differently.

URL parameters, handy for screenshots: `?g=hoodie`, `?size=XL`, `?chest=104`, `?wind`,
`?warm=3` (pre-simulate 3 s), `?cam=x,y,z`.
