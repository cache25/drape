// Procedural, seamlessly tiling normal maps for knit fabrics.
import * as THREE from 'three';

const N = 256;

function heightToNormal(hf, strength) {
  const data = new Uint8Array(N * N * 4);
  const at = (x, y) => hf[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = 4 * (y * N + x);
      data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  return data;
}

// Jersey: columns of V-shaped stitches, each stitch two leaning loops.
function jerseyHeight() {
  const hf = new Float32Array(N * N);
  const cols = 16, rows = 22;
  const cw = N / cols, ch = N / rows;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const lx = (x % cw) / cw, ly = (y % ch) / ch;
      let h = 0;
      for (const [cx, lean] of [[0.3, 1], [0.7, -1]]) {
        const ux = lx - cx, uy = ly - 0.5;
        const a = 0.45 * lean;
        const rx = ux * Math.cos(a) - uy * Math.sin(a);
        const ry = ux * Math.sin(a) + uy * Math.cos(a);
        const r2 = (rx / 0.2) ** 2 + (ry / 0.56) ** 2;
        h = Math.max(h, Math.max(0, 1 - r2) ** 0.6);
      }
      hf[y * N + x] = h;
    }
  }
  return hf;
}

// Fleece: soft periodic value-noise with a fine fuzz on top.
function fleeceHeight() {
  const hf = new Float32Array(N * N);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const octave = (cells, amp) => {
    const g = Array.from({ length: cells * cells }, rand);
    const at = (i, j) => g[((j + cells) % cells) * cells + ((i + cells) % cells)];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, fy = (y / N) * cells;
        const i = Math.floor(fx), j = Math.floor(fy);
        const tx = fx - i, ty = fy - j;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const v = (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
        hf[y * N + x] += v * amp;
      }
    }
  };
  octave(8, 0.6);
  octave(32, 0.3);
  octave(128, 0.25);
  return hf;
}

export function makeFabricNormalMap(kind, renderer) {
  const data = kind === 'jersey' ? heightToNormal(jerseyHeight(), 2.2) : heightToNormal(fleeceHeight(), 1.4);
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  tex.needsUpdate = true;
  return tex;
}
