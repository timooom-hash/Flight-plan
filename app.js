// The UI: renders the two screens, handles taps, and remembers settings and the last plan.
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
  const { action, limit, delta, module } = button.dataset;
  if (limit) state.settings = step(state.settings, limit, Number(delta));
  if (module) state.settings = { ...state.settings, [module]: !state.settings[module] };
  if (action === 'generate') state.plan = generate(state.settings);
  if (action) state.screen = action === 'setup' ? 'setup' : 'plan';
  save();
  render(action === 'generate');
});

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
  const spoken = [`${color === 'green' ? 'Green' : 'Yellow'} ${number}: ${say(p.entry)} to ${say(p.exit)}`];
  if (p.alternate) spoken.push(`alternate ${say(p.alternate)}`);
  if (p.fast) spoken.push('fast');
  if (p.vip) spoken.push('VIP');
  return `
    <li class="strip" style="--i: ${index}" aria-label="${spoken.join(', ')}">
      <div aria-hidden="true">
        <span class="tab ${color}">${number}</span>
        ${fix(p.entry, 'entry')}
        ${fix(p.exit, 'exit')}
        ${p.alternate ? fix(p.alternate, 'alternate') : ''}
        ${stamps ? `<span class="stamps">${p.fast ? '<span class="stamp">FAST</span>' : ''}${p.vip ? '<span class="stamp">VIP</span>' : ''}</span>` : ''}
      </div>
    </li>`;
}

function fix({ point, level }, kind) {
  const name = point === AIRPORT ? 'AIRPORT' : point;
  return `<span class="fix ${kind}"><span class="point">${name}</span>${level === null ? '' : `<span class="level">${level}</span>`}</span>`;
}

function say({ point, level }) {
  return level === null ? point : `${point} ${level}`;
}

function load() {
  const start = { settings: { ...DEFAULTS }, plan: null, screen: 'setup' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved) return start;
    const settings = { ...DEFAULTS, ...saved.settings };
    for (const key of LIMITS) settings[key] ??= Infinity; // JSON stores Infinity as null
    const plan = Array.isArray(saved.plan) && saved.plan.length === PLANES ? saved.plan : null;
    return { settings, plan, screen: plan && saved.screen === 'plan' ? 'plan' : 'setup' };
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
