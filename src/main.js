import { GARMENTS, SIZES, recommendSize, fitLabel, cmToIn } from './data/sizes.js';
import { makeBody } from './sim/body.js';
import { makePattern } from './garment/pattern.js';
import { buildGarment } from './garment/build.js';
import { Cloth, FABRICS, windAt } from './sim/cloth.js';
import { Studio } from './render/scene.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const state = {
  garment: GARMENTS[params.get('g')] ? params.get('g') : 'tee',
  size: SIZES.includes(params.get('size')) ? params.get('size') : 'M',
  color: { tee: 0, hoodie: 0 },
  bodyChest: Number(params.get('chest')) || 96,
  units: 'cm',
  wind: params.has('wind'),
  windStrength: 4.5,
  paused: false,
};

const studio = new Studio($('viewport'));
if (params.get('cam')) studio.camera.position.fromArray(params.get('cam').split(',').map(Number));
let body = null;
let cloth = null;

function garment() { return GARMENTS[state.garment]; }
function fabric() { return FABRICS[garment().fabric]; }

function drape() {
  body = makeBody(state.bodyChest);
  studio.setBody(body);
  const topo = buildGarment(makePattern(state.garment, garment().chart[state.size], body.armJoint), fabric());
  cloth = new Cloth(topo, fabric(), body);
  // ?warm=3 pre-simulates a few seconds (handy for screenshots of the settled drape).
  const warm = Number(params.get('warm')) || 0;
  for (let t = 0; t < warm; t += STEP) cloth.step(STEP);
  studio.setCloth(cloth, fabric(), garment().colors[state.color[state.garment]].hex);
  studio.sync();
}

// ---- UI --------------------------------------------------------------------

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderGarments() {
  const box = $('garments');
  box.replaceChildren(...Object.values(GARMENTS).map((g) => {
    const b = el('button', { role: 'tab', 'aria-selected': String(g.id === state.garment) }, g.name);
    b.onclick = () => {
      if (state.garment === g.id) return;
      state.garment = g.id;
      renderAll();
      drape();
    };
    return b;
  }));
  const f = fabric();
  $('fabric').textContent = `${f.name} · ${f.gsm} gsm · ${f.stretchPct}% stretch`;
}

function renderSwatches() {
  const g = garment();
  const idx = state.color[g.id];
  $('color-name').textContent = g.colors[idx].name;
  $('swatches').replaceChildren(...g.colors.map((c, i) => {
    const b = el('button', { class: 'swatch', 'aria-pressed': String(i === idx), title: c.name, 'aria-label': c.name });
    b.style.background = c.hex;
    b.onclick = () => {
      state.color[g.id] = i;
      studio.setColor(c.hex);
      renderSwatches();
    };
    return b;
  }));
}

const fmt = (cm) => (state.units === 'cm' ? `${cm}` : `${cmToIn(cm)}`);

function renderBody() {
  const u = state.units;
  $('body-value').textContent = u === 'cm' ? `${state.bodyChest} cm` : `${cmToIn(state.bodyChest)} in`;
  const rec = recommendSize(state.garment, state.bodyChest);
  const r = $('recommend');
  r.replaceChildren('Recommended for this chest: ', el('b', {}, rec));
  if (rec !== state.size) {
    const b = el('button', {}, `Try ${rec}`);
    b.onclick = () => selectSize(rec);
    r.append(' · ', b);
  }
}

function renderSizes() {
  const rec = recommendSize(state.garment, state.bodyChest);
  $('sizes').replaceChildren(...SIZES.map((s) => {
    const b = el('button', { 'aria-pressed': String(s === state.size), class: s === rec ? 'rec' : '', title: s === rec ? 'Recommended' : '' }, s);
    b.onclick = () => selectSize(s);
    return b;
  }));

  const ease = garment().chart[state.size].chest - state.bodyChest;
  const pos = Math.min(100, Math.max(0, ((ease + 2) / 34) * 100));
  const easeText = state.units === 'cm' ? `${ease > 0 ? '+' : ''}${ease} cm` : `${ease > 0 ? '+' : ''}${cmToIn(ease)} in`;
  $('fit').innerHTML = `
    <div class="fit-row"><span class="fit-label">${fitLabel(ease)} fit</span><span class="fit-ease">${easeText} ease at chest</span></div>
    <div class="fit-bar"><i style="left:${pos}%"></i></div>
    <div class="fit-scale"><span>Snug</span><span>Regular</span><span>Relaxed</span><span>Oversized</span></div>`;

  const chart = garment().chart;
  $('chart').replaceChildren(...SIZES.map((s) => {
    const m = chart[s];
    const tr = el('tr', { class: s === state.size ? 'sel' : '' });
    tr.append(el('td', {}, s), el('td', {}, fmt(m.chest)), el('td', {}, fmt(m.length)), el('td', {}, fmt(m.sleeve)));
    tr.onclick = () => selectSize(s);
    return tr;
  }));
}

function selectSize(s) {
  if (s === state.size) return;
  state.size = s;
  renderSizes();
  renderBody();
  drape();
}

function renderAll() {
  renderGarments();
  renderSwatches();
  renderBody();
  renderSizes();
}

$('body').value = state.bodyChest;
$('body').addEventListener('input', (e) => {
  state.bodyChest = Number(e.target.value);
  renderBody();
  renderSizes();
});
$('body').addEventListener('change', () => drape());

for (const b of document.querySelectorAll('.units button')) {
  b.onclick = () => {
    state.units = b.dataset.units;
    for (const o of document.querySelectorAll('.units button')) o.setAttribute('aria-pressed', String(o === b));
    renderBody();
    renderSizes();
  };
}

function setWind(on) {
  state.wind = on;
  $('wind').setAttribute('aria-pressed', String(on));
  $('wind-strength-wrap').hidden = !on;
}
$('wind').onclick = () => setWind(!state.wind);
$('wind-strength').oninput = (e) => (state.windStrength = Number(e.target.value));
$('pause').onclick = () => {
  state.paused = !state.paused;
  $('pause').setAttribute('aria-pressed', String(state.paused));
  $('pause').querySelector('.label').textContent = state.paused ? 'Play' : 'Pause';
};
$('redrape').onclick = () => drape();
studio.onGrab = () => $('hint').classList.add('hide');

// ---- loop ------------------------------------------------------------------

let last = performance.now();
let acc = 0;
let simMs = 0;
let frames = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!state.paused && cloth) {
    acc += elapsed;
    let steps = 0;
    const t0 = performance.now();
    // Fall behind gracefully on slow machines rather than spiralling.
    while (acc >= STEP && steps < 2) {
      const wind = state.wind ? windAt(cloth.time, state.windStrength) : [0, 0, 0];
      cloth.step(STEP, { wind });
      acc -= STEP;
      steps++;
    }
    if (steps) {
      simMs = simMs * 0.9 + ((performance.now() - t0) / steps) * 0.1;
      studio.sync();
    }
    if (acc > STEP) acc = 0;
  }
  studio.render();
  if (++frames % 20 === 0 && cloth) $('stats').textContent = `${cloth.n.toLocaleString()} particles · ${simMs.toFixed(1)} ms/step`;
  requestAnimationFrame(frame);
}

renderAll();
setWind(state.wind);
drape();
requestAnimationFrame(frame);
window.__drape = { state, get cloth() { return cloth; }, studio };
