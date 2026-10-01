import {
  GARMENTS, SIZES, MEASURE_LABELS, BODY_MEASURES, DEFAULT_BODY, FIT_BANDS,
  recommendSize, fitLabel, easeFor, cmToIn, inToCm, validateCustom, clampBody,
} from './data/sizes.js';
import { CONSTRUCTIONS, FIBERS, GSM_RANGE, blendFabric, setFiberShare, normalizeBlend, blendLabel } from './data/fabrics.js';
import { makeBody } from './sim/body.js';
import { makePattern } from './garment/pattern.js';
import { buildGarment } from './garment/build.js';
import { Cloth, windAt } from './sim/cloth.js';
import { Studio } from './render/scene.js';

const STEP = 1 / 60;
const CUSTOM = 'Custom';
const STORE_KEY = 'drape.v2';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---- state -----------------------------------------------------------------

const saved = (() => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
})();

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function validFabric(f) {
  return f && CONSTRUCTIONS[f.construction] && Number.isFinite(f.gsm) && f.blend ? { ...f, blend: normalizeBlend(f.blend) } : null;
}

const state = {
  garment: GARMENTS[params.get('g')] ? params.get('g') : GARMENTS[saved.garment] ? saved.garment : 'tee',
  size: SIZES.includes(params.get('size')) ? params.get('size') : 'M',
  color: Object.fromEntries(Object.keys(GARMENTS).map((id) => [id, 0])),
  body: clampBody(saved.body || DEFAULT_BODY),
  fabric: Object.fromEntries(Object.entries(GARMENTS).map(([id, g]) => [id, validFabric(saved.fabric?.[id]) || clone(g.fabric)])),
  custom: Object.fromEntries(Object.keys(GARMENTS).map((id) => [id, saved.custom?.[id] || null])),
  units: saved.units === 'in' ? 'in' : 'cm',
  wind: params.has('wind'),
  windStrength: 6,
  paused: false,
};

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      garment: state.garment, body: state.body, fabric: state.fabric, custom: state.custom, units: state.units,
    }));
  } catch { /* storage unavailable: settings last for this visit only */ }
}

const garment = () => GARMENTS[state.garment];
const fabricSpec = () => state.fabric[state.garment];
/** Measurements of the selected size, chart or custom, in cm. */
const measurements = () => (state.size === CUSTOM ? state.custom[state.garment] : garment().chart[state.size]);

// ---- simulation ------------------------------------------------------------

const studio = new Studio($('viewport'));
let body = null;
let cloth = null;
let framedGroup = null;

function drape() {
  body = makeBody(state.body);
  studio.setBody(body);
  const fabric = blendFabric(fabricSpec());
  const topo = buildGarment(makePattern(state.garment, measurements(), body), fabric);
  cloth = new Cloth(topo, fabric, body);
  // ?warm=3 pre-simulates a few seconds (handy for screenshots of the settled drape).
  const warm = Number(params.get('warm')) || 0;
  for (let t = 0; t < warm; t += STEP) cloth.step(STEP);
  studio.setCloth(cloth, fabric, garment().colors[state.color[state.garment]].hex);
  studio.sync();
  frame();
}

/** Point the camera at the part of the body this garment covers. */
function frame(instant = false) {
  const group = garment().group;
  if (group === framedGroup && !instant) return;
  framedGroup = group;
  const k = state.body.height / 176;
  if (group === 'Tops') studio.focus(1.2 * k, 2.7 * k);
  else studio.focus(0.62 * k, 3.1 * k);
  if (instant && studio.goal) {
    studio.controls.target.copy(studio.goal.target);
    studio.camera.position.copy(studio.goal.position);
    studio.goal = null;
  }
}

// ---- UI helpers ------------------------------------------------------------

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
const unitLen = (cm) => (state.units === 'cm' ? `${Math.round(cm * 10) / 10} cm` : `${cmToIn(cm)} in`);
const num = (cm) => (state.units === 'cm' ? `${cm}` : `${cmToIn(cm)}`);

// ---- garment & colour ------------------------------------------------------

function renderGarments() {
  const groups = {};
  for (const g of Object.values(GARMENTS)) (groups[g.group] ||= []).push(g);
  $('garments').replaceChildren(...Object.entries(groups).map(([name, items]) => {
    const wrap = el('div', { class: 'garment-group' });
    const chips = el('div', { class: 'chips' });
    chips.append(...items.map((g) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(g.id === state.garment) }, g.name);
      b.onclick = () => {
        if (state.garment === g.id) return;
        state.garment = g.id;
        customDraft = null;
        if (state.size === CUSTOM && !state.custom[g.id]) state.custom[g.id] = { ...g.chart.M };
        persist();
        renderAll();
        drape();
      };
      return b;
    }));
    wrap.append(el('span', {}, name), chips);
    return wrap;
  }));
}

function renderSwatches() {
  const g = garment();
  const idx = state.color[g.id];
  $('color-name').textContent = g.colors[idx].name;
  $('swatches').replaceChildren(...g.colors.map((c, i) => {
    const b = el('button', { type: 'button', class: 'swatch', 'aria-pressed': String(i === idx), title: c.name, 'aria-label': c.name });
    b.style.background = c.hex;
    b.onclick = () => {
      state.color[g.id] = i;
      studio.setColor(c.hex);
      renderSwatches();
    };
    return b;
  }));
}

// ---- fabric ----------------------------------------------------------------

const FIBER_TINT = {
  cotton: '#c9b48f', polyester: '#8aa0b8', elastane: '#c27a8a', wool: '#9a8670',
  linen: '#b5a77a', viscose: '#a08bb8', nylon: '#7fb0a6', silk: '#d6b46a',
};

let refabricTimer = 0;
function fabricChanged() {
  persist();
  renderFabric();
  clearTimeout(refabricTimer);
  refabricTimer = setTimeout(drape, 150);
}

function summary() {
  const f = blendFabric(fabricSpec());
  return `${f.name} · ${f.gsm} gsm · ${blendLabel(f.blend)} · about ${f.stretchPct}% stretch`;
}

function renderBlendBar() {
  const bar = $('blend-bar');
  if (!bar) return;
  bar.replaceChildren(...Object.entries(fabricSpec().blend).map(([k, v]) => {
    const i = el('i', { title: `${v}% ${FIBERS[k].name}` });
    i.style.width = `${v}%`;
    i.style.background = FIBER_TINT[k];
    return i;
  }));
}

function renderFabric() {
  const spec = fabricSpec();
  $('constructions').replaceChildren(...Object.entries(CONSTRUCTIONS).map(([key, c]) => {
    const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(key === spec.construction) }, c.name);
    b.onclick = () => {
      if (spec.construction === key) return;
      spec.construction = key;
      spec.gsm = c.refGsm;
      fabricChanged();
    };
    return b;
  }));

  const gsm = $('gsm');
  gsm.min = GSM_RANGE[0];
  gsm.max = GSM_RANGE[1];
  gsm.value = spec.gsm;
  $('gsm-value').textContent = `${spec.gsm} gsm`;

  const fibers = Object.entries(spec.blend).sort((a, b) => b[1] - a[1]);
  const only = fibers.length === 1;
  const rows = fibers.map(([key, pct]) => {
    const id = `fiber-${key}`;
    const row = el('div', { class: 'fiber' });
    const out = el('output', { for: id }, `${pct}%`);
    const remove = el('button', { type: 'button', class: 'remove', 'aria-label': `Remove ${FIBERS[key].name}`, title: 'Remove' }, '×');
    remove.hidden = only;
    remove.onclick = () => {
      spec.blend = setFiberShare(spec.blend, key, 0);
      fabricChanged();
    };
    const input = el('input', { id, type: 'range', min: '0', max: '100', step: '1', value: String(pct) });
    input.disabled = only; // a single fibre is 100% by definition
    input.oninput = () => {
      spec.blend = setFiberShare(spec.blend, key, Number(input.value));
      // Update the other rows live without rebuilding the slider being dragged.
      for (const [k, v] of Object.entries(spec.blend)) {
        const o = document.querySelector(`output[for="fiber-${k}"]`);
        if (o) o.textContent = `${v}%`;
        const r = $(`fiber-${k}`);
        if (r && r !== input) r.value = v;
      }
      renderBlendBar();
      $('fabric-summary').textContent = summary();
    };
    input.onchange = () => fabricChanged();
    row.append(el('label', { for: id }, FIBERS[key].name), out, remove, input);
    return row;
  });
  $('blend').replaceChildren(...rows, el('div', { class: 'blend-bar', id: 'blend-bar', 'aria-hidden': 'true' }));
  renderBlendBar();

  const add = $('add-fiber');
  const missing = Object.keys(FIBERS).filter((k) => !(k in spec.blend));
  add.replaceChildren(
    el('option', { value: '' }, missing.length ? '+ Add a fibre' : 'All fibres added'),
    ...missing.map((k) => el('option', { value: k }, FIBERS[k].name)),
  );
  add.disabled = !missing.length;
  add.value = '';
  $('fabric-summary').textContent = summary();
}

$('gsm').addEventListener('input', (e) => {
  fabricSpec().gsm = Number(e.target.value);
  $('gsm-value').textContent = `${fabricSpec().gsm} gsm`;
  $('fabric-summary').textContent = summary();
});
$('gsm').addEventListener('change', () => fabricChanged());
$('add-fiber').addEventListener('change', (e) => {
  const key = e.target.value;
  if (!key) return;
  // A new fibre comes in at a typical share: a little elastane, otherwise a fifth.
  fabricSpec().blend = setFiberShare(fabricSpec().blend, key, key === 'elastane' ? 5 : 20);
  fabricChanged();
});
$('fabric-reset').onclick = () => {
  state.fabric[state.garment] = clone(garment().fabric);
  fabricChanged();
};

// ---- mannequin -------------------------------------------------------------

function renderBodySliders() {
  $('body-sliders').replaceChildren(...BODY_MEASURES.map(({ key, label, min, max }) => {
    const id = `body-${key}`;
    const row = el('label', { class: 'slider-row', for: id });
    const out = el('output', { for: id }, unitLen(state.body[key]));
    const input = el('input', { id, type: 'range', min: String(min), max: String(max), step: '1', value: String(state.body[key]) });
    input.oninput = () => {
      state.body[key] = Number(input.value);
      out.textContent = unitLen(state.body[key]);
      renderSizes();
    };
    input.onchange = () => {
      persist();
      drape();
    };
    row.append(el('span', {}, label), out, input);
    return row;
  }));
}

$('body-reset').onclick = () => {
  state.body = { ...DEFAULT_BODY };
  persist();
  renderBodySliders();
  renderSizes();
  drape();
};

// ---- sizes -----------------------------------------------------------------

let customDraft = null; // custom values being edited, in cm

function renderSizes() {
  const g = garment();
  const rec = recommendSize(state.garment, state.body);
  const buttons = SIZES.map((s) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(s === state.size), class: s === rec ? 'rec' : '', title: s === rec ? 'Recommended' : '' }, s);
    b.onclick = () => selectSize(s);
    return b;
  });
  const custom = el('button', { type: 'button', class: 'custom-btn', 'aria-pressed': String(state.size === CUSTOM), 'aria-expanded': String(state.size === CUSTOM) }, 'Custom measurements');
  custom.onclick = openCustom;
  $('sizes').replaceChildren(...buttons, custom);
  renderCustomForm();

  const r = $('recommend');
  const on = BODY_MEASURES.find((m) => m.key === g.fit.body).label.toLowerCase();
  r.replaceChildren(`Recommended for ${unitLen(state.body[g.fit.body])} ${on}: `, el('b', {}, rec));
  if (rec !== state.size) {
    const b = el('button', { type: 'button' }, `Try ${rec}`);
    b.onclick = () => selectSize(rec);
    r.append(' · ', b);
  }

  // Fit: ease on the garment's fit measurement, placed on a scale coloured by fit band.
  const ease = Math.round(easeFor(state.garment, measurements(), state.body) * 10) / 10;
  const bands = FIT_BANDS[g.group];
  const span = g.group === 'Tops' ? [-2, 32] : [-2, 22];
  const at = (v) => Math.min(100, Math.max(0, ((v - span[0]) / (span[1] - span[0])) * 100));
  const colors = ['#c9a37b', '#9bb38f', '#8aa6b8', '#a593b8'];
  let prev = 0;
  const stops = bands.map(([, upTo], i) => {
    const end = upTo === Infinity ? 100 : at(upTo);
    const s = `${colors[i]} ${prev}% ${end}%`;
    prev = end;
    return s;
  }).join(', ');
  const sign = ease > 0 ? '+' : '';
  $('fit').innerHTML = `
    <div class="fit-row"><span class="fit-label">${fitLabel(ease, g.group)} fit</span><span class="fit-ease">${sign}${unitLen(ease)} ease at ${MEASURE_LABELS[g.fit.garment].toLowerCase()}</span></div>
    <div class="fit-bar" style="background: linear-gradient(90deg, ${stops})"><i style="left:${at(ease)}%"></i></div>
    <div class="fit-scale">${bands.map(([n]) => `<span>${n}</span>`).join('')}</div>`;

  renderChart();
}

function renderChart() {
  const g = garment();
  const head = el('tr');
  head.append(el('th', {}, 'Size'), ...g.measures.map((k) => el('th', {}, MEASURE_LABELS[k])));
  $('chart-head').replaceChildren(head);
  const rows = SIZES.map((s) => [s, g.chart[s]]);
  if (state.custom[g.id]) rows.push([CUSTOM, state.custom[g.id]]);
  $('chart').replaceChildren(...rows.map(([s, m]) => {
    const tr = el('tr', { class: s === state.size ? 'sel' : '' });
    tr.append(el('td', {}, s), ...g.measures.map((k) => el('td', {}, num(m[k]))));
    tr.onclick = () => selectSize(s);
    return tr;
  }));
  $('chart-note').textContent = g.group === 'Tops'
    ? 'Garment measurements. Chest is the full circumference; length is from the high point of the shoulder; sleeve from the shoulder seam.'
    : 'Garment measurements. Waist and hip are full circumferences; length is from the top of the waistband.';
}

function selectSize(s) {
  if (s === state.size) return;
  if (s === CUSTOM) return openCustom();
  state.size = s;
  customDraft = null;
  renderSizes();
  drape();
}

function openCustom() {
  if (state.size === CUSTOM) return;
  customDraft = { ...(state.custom[state.garment] || measurements()) };
  state.size = CUSTOM;
  if (!state.custom[state.garment]) {
    // Nothing saved yet: start from the size that was showing, so the drape doesn't change.
    state.custom[state.garment] = { ...customDraft };
    persist();
  }
  renderSizes();
  $('custom-fields').querySelector('input')?.focus();
}

const toUnits = (cm) => (state.units === 'cm' ? cm : cmToIn(cm));

function renderCustomForm() {
  const form = $('custom-form');
  form.hidden = state.size !== CUSTOM;
  if (form.hidden) return;
  if (!customDraft) customDraft = { ...state.custom[state.garment] };
  const unit = state.units;
  const fields = $('custom-fields');
  fields.style.gridTemplateColumns = `repeat(${garment().measures.length}, minmax(0, 1fr))`;
  fields.replaceChildren(...garment().measures.map((key) => {
    const input = el('input', { id: `custom-${key}`, type: 'number', inputmode: 'decimal', step: '0.5', value: String(toUnits(customDraft[key])), 'aria-describedby': 'custom-error' });
    input.oninput = () => {
      const v = parseFloat(input.value);
      customDraft[key] = unit === 'cm' ? v : inToCm(v);
    };
    const field = el('span', { class: 'field' });
    field.append(input, el('span', { class: 'unit' }, unit));
    const wrap = el('label', { for: `custom-${key}` }, MEASURE_LABELS[key]);
    wrap.append(field);
    return wrap;
  }));
  $('custom-error').textContent = '';
}

$('custom-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const errors = validateCustom(state.garment, customDraft, state.units);
  for (const key of garment().measures) $(`custom-${key}`).parentElement.classList.toggle('invalid', !!errors[key]);
  const messages = Object.values(errors);
  $('custom-error').textContent = messages.join(' ');
  if (messages.length) return;
  state.custom[state.garment] = { ...customDraft };
  persist();
  renderSizes();
  drape();
});

function renderUnits() {
  for (const o of document.querySelectorAll('.units button')) o.setAttribute('aria-pressed', String(o.dataset.units === state.units));
}
for (const b of document.querySelectorAll('.units button')) {
  b.onclick = () => {
    state.units = b.dataset.units;
    persist();
    renderUnits();
    renderBodySliders();
    renderSizes();
  };
}

function renderAll() {
  renderGarments();
  renderSwatches();
  renderFabric();
  renderBodySliders();
  renderUnits();
  renderSizes();
}

// ---- stage tools -----------------------------------------------------------

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
function tick(now) {
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
  requestAnimationFrame(tick);
}

renderAll();
setWind(state.wind);
drape();
frame(true);
if (params.get('cam')) studio.camera.position.fromArray(params.get('cam').split(',').map(Number));
requestAnimationFrame(tick);
window.__drape = { state, get cloth() { return cloth; }, studio };
