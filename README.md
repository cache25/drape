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

- **Eight garments.** Tops: Classic Tee, Long Sleeve Tee, Tank Top, Crewneck Sweatshirt,
  Cream Hoodie. Bottoms: Trousers, Shorts, Skirt.
- **Fabric.** Pick a construction (single jersey, brushed fleece, twill, plain weave, satin), a
  weight in gsm, and a fibre blend in percent (cotton, polyester, elastane, wool, linen, viscose,
  nylon, silk). The blend drives the physics: elastane adds stretch, viscose and silk drape,
  linen is crisp, synthetics are slicker and shinier.
- **Mannequin.** A full-body form you can resize: height, neck, shoulder width, chest, waist,
  hips, back waist length and arm length.
- **Sizes XS–XXL or custom measurements.** Every garment has its own size chart (cm / in);
  enter your own measurements to cut a custom size. Fit is shown as ease on a Snug →
  Oversized scale, with a recommended size for the current mannequin.
- **Pull the fabric**, turn on **wind**, pause, re-drape.

## How it works

| Piece | File |
| --- | --- |
| Garment catalogue, size charts, mannequin measurements, fit | `src/data/sizes.js` |
| Constructions, fibres and blend → solver parameters | `src/data/fabrics.js` |
| Flat sewing patterns cut to the mannequin (tops, tank, trousers, skirt, hood) | `src/garment/pattern.js` |
| Grids panels, sews seams, adds hood + drawstrings, ribbed bands | `src/garment/build.js` |
| XPBD cloth solver: stretch/shear/bend, sewing, air & wind, friction | `src/sim/cloth.js` |
| Full-body mannequin as a round-cone SDF (collision and visible mesh) | `src/sim/body.js` |
| Three.js studio, knit normal maps, drag-to-pull | `src/render/` |

The garment is built the way garment CAD does it. Flat front and back panels start in front of and
behind the form, and seam constraints close over ~0.6 s (sleeves first, so they wrap the arms
before the body seams tighten). Then gravity eases in. Stiffnesses are physical (N/m) and masses come from
fabric weight (180 gsm jersey, 320 gsm fleece), so the two fabrics hang and move differently.

URL parameters, handy for screenshots: `?g=hoodie`, `?size=XL`, `?chest=104`, `?wind`,
`?warm=3` (pre-simulate 3 s), `?cam=x,y,z`.
