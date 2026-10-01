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

// Twill: raised diagonal wales, the 2/1 weave of chinos and denim.
function twillHeight() {
  const hf = new Float32Array(N * N);
  const pitch = N / 24;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = ((x + y) % pitch) / pitch; // diagonal phase
      const thread = 0.5 + 0.5 * Math.cos((y / N) * Math.PI * 2 * 64); // fine weft
      hf[y * N + x] = Math.pow(Math.sin(Math.PI * u), 0.8) * 0.85 + thread * 0.15;
    }
  }
  return hf;
}

// Linen: plain over-under weave with irregular slubs in the yarn.
function linenHeight() {
  const hf = new Float32Array(N * N);
  const cells = 48;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const slubX = Array.from({ length: cells }, () => 0.75 + rand() * 0.5);
  const slubY = Array.from({ length: cells }, () => 0.75 + rand() * 0.5);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cx = Math.floor((x / N) * cells), cy = Math.floor((y / N) * cells);
      const fx = ((x / N) * cells) % 1, fy = ((y / N) * cells) % 1;
      const over = (cx + cy) % 2 === 0; // warp over weft, alternating
      const warp = Math.sin(Math.PI * fx) * slubX[cx];
      const weft = Math.sin(Math.PI * fy) * slubY[cy];
      hf[y * N + x] = over ? warp * 0.8 + weft * 0.3 : weft * 0.8 + warp * 0.3;
    }
  }
  return hf;
}

// Satin: long floats give a smooth face with only faint warp lines.
function satinHeight() {
  const hf = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      hf[y * N + x] = 0.5 + 0.5 * Math.sin((x / N) * Math.PI * 2 * 96) * 0.6 + ((x * 7 + y * 3) % 16 === 0 ? 0.3 : 0);
    }
  }
  return hf;
}

const MAKERS = {
  jersey: () => heightToNormal(jerseyHeight(), 2.2),
  fleece: () => heightToNormal(fleeceHeight(), 1.4),
  twill: () => heightToNormal(twillHeight(), 1.6),
  linen: () => heightToNormal(linenHeight(), 1.8),
  satin: () => heightToNormal(satinHeight(), 0.6),
};

export const FABRIC_KINDS = Object.keys(MAKERS);

export function makeFabricNormalMap(kind, renderer) {
  const data = MAKERS[kind]();
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  tex.needsUpdate = true;
  return tex;
}
