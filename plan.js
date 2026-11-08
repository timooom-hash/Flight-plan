// Flight plan generator. Pure functions, no DOM: every rule lives here, the UI only renders.
//
// A plan is 12 planes. Each plane gets
//   callsign   green or yellow, 1–8, never repeated
//   entry      a point, plus a flight level unless the point is the airport
//   exit       the same, and it may equal the entry
//   alternate  the same, only with the Alternate module, and never identical to the exit
//   fast, vip  true for one of planes 1–6 each (Fast / VIP modules); may be the same plane
// Planes 1–6 enter at six different points.
//
// Limits work like one shared bag across entry, exit and alternate:
//   waypoint   times any one point appears (the airport included)
//   level      times any one flight level appears
//   combo      times any one point + level appears (the airport is one combo)
// A limit never drops below what 12 planes need, and becomes Infinity ("no limit") once it can't bind.

export const WAYPOINTS = ['LALDO', 'LINDA', 'GLORY', 'MAIKO', 'IWADE', 'NARAH'];
export const AIRPORT = 'Airport';
export const LEVELS = [30, 31, 32];
export const COLORS = ['green', 'yellow'];
export const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
export const PLANES = 12;
export const FIRST = 6;

export const DEFAULTS = Object.freeze({
  waypoint: 6,
  level: 12,
  combo: Infinity,
  fast: false,
  vip: false,
  airport: false,
  alternate: false,
});

const slotCount = s => PLANES * (s.alternate ? 3 : 2);
const clamp = (value, { min, top }) => (value >= top ? Infinity : Math.max(value, min));

/** Per limit: `min`, the lowest value 12 planes fit in, and `top`, the first value that can no longer bind. */
export function ranges(s) {
  const slots = slotCount(s);
  // One point at most: once among planes 1–6's entries, every later entry, every exit and alternate.
  const waypoint = { min: Math.ceil(slots / WAYPOINTS.length), top: slots - FIRST + 1 };
  const level = { min: Math.ceil(slots / LEVELS.length), top: slots };
  // One combo at most: once among planes 1–6's entries, every later entry, one of exit/alternate per plane.
  const most = 1 + (PLANES - FIRST) + PLANES;
  const combo = {
    min: Math.ceil(slots / (WAYPOINTS.length * LEVELS.length)),
    top: Math.min(clamp(s.waypoint, waypoint), clamp(s.level, level), most),
  };
  return { waypoint, level, combo };
}

/** The limits in force. Stored values survive module toggles; these are clamped to what fits. */
export function limits(s) {
  const r = ranges(s);
  return {
    waypoint: clamp(s.waypoint, r.waypoint),
    level: clamp(s.level, r.level),
    combo: clamp(s.combo, r.combo),
  };
}

/** One stepper tap (`delta` is +1 or −1). Returns new settings. */
export function step(s, key, delta) {
  const { min, top } = ranges(s)[key];
  const value = limits(s)[key];
  const next = value === Infinity ? (delta < 0 ? top - 1 : Infinity) : value + delta;
  return { ...s, [key]: next >= top ? Infinity : Math.max(next, min) };
}

/** A fresh plan. `random` returns [0, 1); pass a seeded one for repeatable plans. */
export function generate(s, random = Math.random) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const plan = attemptPlan(s, random);
    if (plan) return plan;
  }
  throw new Error('No plan fits these settings');
}

function attemptPlan(s, random) {
  const limit = limits(s);
  const points = s.airport ? [...WAYPOINTS, AIRPORT] : WAYPOINTS;
  const kinds = s.alternate ? ['exit', 'alternate'] : ['exit'];
  const planes = Array.from({ length: PLANES }, () => ({}));

  // Fill the constrained slots first and the free ones (later entries) last.
  const order = [
    ...range(0, FIRST).map(i => [i, 'entry']),
    ...range(0, PLANES).flatMap(i => kinds.map(kind => [i, kind])),
    ...range(FIRST, PLANES).map(i => [i, 'entry']),
  ];

  // Usage counts, keyed p:<point>, l:<level>, c:<point level>.
  const used = new Map();
  const count = key => used.get(key) ?? 0;
  const left = (max, key) => max - count(key);
  const weight = (max, key) => (max === Infinity ? 1 : left(max, key));
  const comboKey = (point, level) => (level === null ? `c:${point}` : `c:${point} ${level}`);
  const keys = ({ point, level }) =>
    level === null ? [`p:${point}`, comboKey(point, level)] : [`p:${point}`, `l:${level}`, comboKey(point, level)];
  const add = (fix, delta) => keys(fix).forEach(key => used.set(key, count(key) + delta));
  const firstEntries = new Set();

  // Candidates in bag order: a point by its copies left, then a level by its copies left.
  function* candidates(plane, kind) {
    const exit = planes[plane].exit;
    for (const point of weightedShuffle(points, p => weight(limit.waypoint, `p:${p}`), random)) {
      if (kind === 'entry' && plane < FIRST && firstEntries.has(point)) continue;
      const levels =
        point === AIRPORT
          ? [null].filter(() => weight(limit.combo, comboKey(point, null)) > 0)
          : weightedShuffle(LEVELS, l => weight(limit.level, `l:${l}`) * weight(limit.combo, comboKey(point, l)), random);
      for (const level of levels) {
        if (kind === 'alternate' && exit.point === point && exit.level === level) continue;
        yield { point, level };
      }
    }
  }

  // Most slots the remaining limits can still fill: a max flow, points → combos → levels, as a min cut.
  function room() {
    let best = Infinity;
    for (let cut = 0; cut < 1 << LEVELS.length; cut++) {
      let total = 0;
      LEVELS.forEach((l, i) => cut & (1 << i) && (total += left(limit.level, `l:${l}`)));
      for (const w of WAYPOINTS) {
        let through = 0;
        LEVELS.forEach((l, i) => cut & (1 << i) || (through += left(limit.combo, comboKey(w, l))));
        total += Math.min(left(limit.waypoint, `p:${w}`), through);
      }
      best = Math.min(best, total);
    }
    if (s.airport) best += Math.min(left(limit.waypoint, `p:${AIRPORT}`), left(limit.combo, comboKey(AIRPORT, null)));
    return best;
  }

  let budget = 5000;
  function fill(i) {
    if (i === order.length) return true;
    if (--budget < 0) return false;
    const [plane, kind] = order[i];
    const first = kind === 'entry' && plane < FIRST;
    for (const fix of candidates(plane, kind)) {
      planes[plane][kind] = fix;
      add(fix, 1);
      if (first) firstEntries.add(fix.point);
      if (room() >= order.length - i - 1 && fill(i + 1)) return true;
      add(fix, -1);
      if (first) firstEntries.delete(fix.point);
      delete planes[plane][kind];
    }
    return false;
  }
  if (!fill(0)) return null;

  const callsigns = shuffle(COLORS.flatMap(color => NUMBERS.map(number => ({ color, number }))), random);
  const fast = s.fast ? Math.floor(random() * FIRST) : -1;
  const vip = s.vip ? Math.floor(random() * FIRST) : -1;
  return planes.map((p, i) => ({
    callsign: callsigns[i],
    entry: p.entry,
    exit: p.exit,
    ...(s.alternate && { alternate: p.alternate }),
    fast: i === fast,
    vip: i === vip,
  }));
}

const range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);

function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Order without replacement, heavier first more often (Efraimidis–Spirakis). Weight 0 drops out.
function weightedShuffle(items, weight, random) {
  return items
    .map(item => ({ item, w: weight(item) }))
    .filter(x => x.w > 0)
    .map(x => ({ item: x.item, key: random() ** (1 / x.w) }))
    .sort((a, b) => b.key - a.key)
    .map(x => x.item);
}
