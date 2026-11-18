// The UI: renders the two screens, handles taps, and remembers settings, the last plan and its flipped fixes.
// Every rule lives in plan.js.
import { AIRPORT, DEFAULTS, FIRST, PLANES, generate, limits, ranges, step } from './plan.js';

const KEY = 'flight-plan';
const LIMITS = ['waypoint', 'level', 'combo'];
const MODULES = ['fast', 'vip', 'airport', 'alternate'];
const $ = selector => document.querySelector(selector);

const state = load();
render();
navigator.serviceWorker?.register('sw.js').catch(() => {});

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.fix) return flip(button);
  const { action, limit, delta, module } = button.dataset;
  if (limit) state.settings = step(state.settings, limit, Number(delta));
  if (module) state.settings = { ...state.settings, [module]: !state.settings[module] };
  if (action === 'generate') {
    state.plan = generate(state.settings);
    state.flipped = [];
  }
  if (action) state.screen = action === 'setup' ? 'setup' : 'plan';
  save();
  render(action === 'generate');
});

// Only the tapped fix changes, so its turn can animate.
function flip(button) {
  const key = button.dataset.fix;
  const flipped = !state.flipped.includes(key);
  state.flipped = flipped ? [...state.flipped, key] : state.flipped.filter(k => k !== key);
  button.setAttribute('aria-pressed', flipped);
  save();
}

function render(fresh = false) {
  const { settings, plan, screen } = state;
  document.body.dataset.screen = screen;

  const value = limits(settings);
  const range = ranges(settings);
  for (const key of LIMITS) {
    $(`output[data-limit="${key}"]`).value = value[key] === Infinity ? '∞' : value[key];
    $(`button[data-limit="${key}"][data-delta="-1"]`).disabled = value[key] <= range[key].min;
    $(`button[data-limit="${key}"][data-delta="1"]`).disabled = value[key] === Infinity;
  }
  for (const key of MODULES) $(`[data-module="${key}"]`).setAttribute('aria-checked', settings[key]);
  $('[data-action="plan"]').hidden = !plan;
  if (plan) renderPlan(plan, fresh);
}

function renderPlan(plan, fresh) {
  const bay = $('.bay');
  const stamps = plan.some(p => p.fast || p.vip);
  bay.classList.toggle('has-alternate', 'alternate' in plan[0]);
  bay.classList.toggle('has-stamps', stamps);
  bay.classList.toggle('fresh', fresh);
  bay.innerHTML = [plan.slice(0, FIRST), plan.slice(FIRST)]
    .map((half, h) => `<ol start="${h * FIRST + 1}">${half.map((p, i) => strip(p, h * FIRST + i, stamps)).join('')}</ol>`)
    .join('');
}

function strip(p, index, stamps) {
  const { color, number } = p.callsign;
  const kinds = p.alternate ? ['entry', 'exit', 'alternate'] : ['entry', 'exit'];
  return `
    <li class="strip" style="--i: ${index}">
      <div>
        <span class="tab ${color}" role="img" aria-label="${color === 'green' ? 'Green' : 'Yellow'} ${number}">${number}</span>
        ${kinds.map(kind => fix(p[kind], kind, `${index}:${kind}`)).join('')}
        ${stamps ? `<span class="stamps">${p.fast ? '<span class="stamp">FAST</span>' : ''}${p.vip ? '<span class="stamp">VIP</span>' : ''}</span>` : ''}
      </div>
    </li>`;
}

// A fix is a card: its front shows the point and level, its back is blank.
function fix({ point, level }, kind, key) {
  const name = point === AIRPORT ? 'AIRPORT' : point;
  const label = `${kind[0].toUpperCase()}${kind.slice(1)} ${say({ point, level })}`;
  return `
    <button class="fix ${kind}" data-fix="${key}" aria-pressed="${state.flipped.includes(key)}" aria-label="${label}">
      <span class="face front"><span class="point">${name}</span>${level === null ? '' : `<span class="level">${level}</span>`}</span>
      <span class="face back"></span>
    </button>`;
}

function say({ point, level }) {
  return level === null ? point : `${point} ${level}`;
}

function load() {
  const start = { settings: { ...DEFAULTS }, plan: null, flipped: [], screen: 'setup' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved) return start;
    const settings = { ...DEFAULTS, ...saved.settings };
    for (const key of LIMITS) settings[key] ??= Infinity; // JSON stores Infinity as null
    const plan = Array.isArray(saved.plan) && saved.plan.length === PLANES ? saved.plan : null;
    const flipped = plan && Array.isArray(saved.flipped) ? saved.flipped : [];
    return { settings, plan, flipped, screen: plan && saved.screen === 'plan' ? 'plan' : 'setup' };
  } catch {
    return start;
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing or full storage: everything still works, it just won't be remembered.
  }
}
