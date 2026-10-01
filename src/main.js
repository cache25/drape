import { GARMENTS, SIZES, MEASURES, recommendSize, fitLabel, cmToIn, inToCm, validateCustom } from './data/sizes.js';
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
  windStrength: 6,
  paused: false,
  custom: loadCustom(), // per garment: { chest, length, sleeve } in cm, or null
};

const CUSTOM = 'Custom';
const CUSTOM_KEY = 'drape.custom';
function loadCustom() {
  try { return { tee: null, hoodie: null, ...JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}') }; }
  catch { return { tee: null, hoodie: null }; }
}
function saveCustom() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.custom)); } catch { /* storage unavailable */ }
}

const studio = new Studio($('viewport'));
if (params.get('cam')) studio.camera.position.fromArray(params.get('cam').split(',').map(Number));
let body = null;
let cloth = null;

function garment() { return GARMENTS[state.garment]; }
/** Measurements of the selected size, chart or custom, in cm. */
function measurements() {
  return state.size === CUSTOM ? state.custom[state.garment] : garment().chart[state.size];
}
function fabric() { return FABRICS[garment().fabric]; }

function drape() {
  body = makeBody(state.bodyChest);
  studio.setBody(body);
  const topo = buildGarment(makePattern(state.garment, measurements(), body.armJoint), fabric());
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
      customDraft = null;
      if (state.size === CUSTOM && !state.custom[g.id]) state.custom[g.id] = { ...g.chart.M };
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
  const buttons = SIZES.map((s) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(s === state.size), class: s === rec ? 'rec' : '', title: s === rec ? 'Recommended' : '' }, s);
    b.onclick = () => selectSize(s);
    return b;
  });
  const custom = el('button', { type: 'button', class: 'custom-btn', 'aria-pressed': String(state.size === CUSTOM), 'aria-expanded': String(state.size === CUSTOM) }, 'Custom measurements');
  custom.onclick = openCustom;
  $('sizes').replaceChildren(...buttons, custom);
  renderCustomForm();

  const ease = Math.round((measurements().chest - state.bodyChest) * 10) / 10;
  const pos = Math.min(100, Math.max(0, ((ease + 2) / 34) * 100));
  const easeText = state.units === 'cm' ? `${ease > 0 ? '+' : ''}${ease} cm` : `${ease > 0 ? '+' : ''}${cmToIn(ease)} in`;
  $('fit').innerHTML = `
    <div class="fit-row"><span class="fit-label">${fitLabel(ease)} fit</span><span class="fit-ease">${easeText} ease at chest</span></div>
    <div class="fit-bar"><i style="left:${pos}%"></i></div>
    <div class="fit-scale"><span>Snug</span><span>Regular</span><span>Relaxed</span><span>Oversized</span></div>`;

  const rows = SIZES.map((s) => [s, garment().chart[s]]);
  if (state.custom[state.garment]) rows.push([CUSTOM, state.custom[state.garment]]);
  $('chart').replaceChildren(...rows.map(([s, m]) => {
    const tr = el('tr', { class: s === state.size ? 'sel' : '' });
    tr.append(el('td', {}, s), el('td', {}, fmt(m.chest)), el('td', {}, fmt(m.length)), el('td', {}, fmt(m.sleeve)));
    tr.onclick = () => selectSize(s);
    return tr;
  }));
}

// ---- custom measurements ---------------------------------------------------

let customDraft = null; // values being edited, in cm

function openCustom() {
  if (state.size === CUSTOM) return;
  customDraft = { ...(state.custom[state.garment] || measurements()) };
  state.size = CUSTOM;
  if (!state.custom[state.garment]) {
    // Nothing saved yet: start from the size that was showing, so the drape doesn't change.
    state.custom[state.garment] = { ...customDraft };
    saveCustom();
  }
  renderSizes();
  renderBody();
  $('custom-fields').querySelector('input')?.focus();
}

const toUnits = (cm) => (state.units === 'cm' ? cm : cmToIn(cm));

function renderCustomForm() {
  const form = $('custom-form');
  form.hidden = state.size !== CUSTOM;
  if (form.hidden) return;
  if (!customDraft) customDraft = { ...state.custom[state.garment] };
  const unit = state.units;
  $('custom-fields').replaceChildren(...MEASURES.map(({ key, label }) => {
    const input = el('input', { id: `custom-${key}`, type: 'number', inputmode: 'decimal', step: '0.5', value: String(toUnits(customDraft[key])), 'aria-describedby': 'custom-error' });
    input.oninput = () => {
      const v = parseFloat(input.value);
      customDraft[key] = unit === 'cm' ? v : inToCm(v);
    };
    const field = el('span', { class: 'field' });
    field.append(input, el('span', { class: 'unit' }, unit));
    const wrap = el('label', { for: `custom-${key}` }, label);
    wrap.append(field);
    return wrap;
  }));
  $('custom-error').textContent = '';
}

$('custom-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const errors = validateCustom(state.garment, customDraft, state.units);
  for (const { key } of MEASURES) $(`custom-${key}`).parentElement.classList.toggle('invalid', !!errors[key]);
  const messages = Object.values(errors);
  $('custom-error').textContent = messages.join(' ');
  if (messages.length) return;
  state.custom[state.garment] = { ...customDraft };
  saveCustom();
  renderSizes();
  renderBody();
  drape();
});

function selectSize(s) {
  if (s === state.size) return;
  if (s === CUSTOM) return openCustom();
  state.size = s;
  customDraft = null;
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
if (matchMedia('(pointer: coarse)').matches) $('hint').textContent = 'Drag the fabric to pull it · drag around it to orbit';

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
