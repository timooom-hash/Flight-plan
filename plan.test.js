// Run with `node --test`. Checks every rule from the outside, across all module combinations and limit edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, limits, ranges, step, DEFAULTS, WAYPOINTS, AIRPORT, LEVELS, COLORS, PLANES, FIRST } from './plan.js';

// Repeatable randomness (mulberry32), so a failing seed reproduces.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function check(plan, s) {
  const limit = limits(s);
  const points = s.airport ? [...WAYPOINTS, AIRPORT] : WAYPOINTS;
  const kinds = s.alternate ? ['entry', 'exit', 'alternate'] : ['entry', 'exit'];
  assert.equal(plan.length, PLANES);

  const callsigns = plan.map(p => `${p.callsign.color} ${p.callsign.number}`);
  assert.equal(new Set(callsigns).size, PLANES, 'callsign repeats');
  for (const { callsign } of plan) {
    assert.ok(COLORS.includes(callsign.color));
    assert.ok(Number.isInteger(callsign.number) && callsign.number >= 1 && callsign.number <= 8);
  }

  const count = new Map();
  const bump = key => count.set(key, (count.get(key) ?? 0) + 1);
  for (const p of plan) {
    assert.equal('alternate' in p, s.alternate, 'alternate only with its module');
    for (const kind of kinds) {
      const { point, level } = p[kind];
      assert.ok(points.includes(point), `unknown point ${point}`);
      if (point === AIRPORT) assert.equal(level, null, 'airport has no level');
      else assert.ok(LEVELS.includes(level), `bad level ${level}`);
      bump(`p:${point}`);
      if (level !== null) bump(`l:${level}`);
      bump(`c:${point} ${level}`);
    }
    if (s.alternate) {
      const same = p.alternate.point === p.exit.point && p.alternate.level === p.exit.level;
      assert.ok(!same, 'alternate identical to exit');
    }
  }
  const firstEntries = plan.slice(0, FIRST).map(p => p.entry.point);
  assert.equal(new Set(firstEntries).size, FIRST, 'planes 1–6 share an entry');

  for (const [key, n] of count) {
    const max = { p: limit.waypoint, l: limit.level, c: limit.combo }[key[0]];
    assert.ok(n <= max, `${key} used ${n}×, limit ${max}`);
  }

  for (const flag of ['fast', 'vip']) {
    const marked = plan.flatMap((p, i) => (p[flag] ? [i] : []));
    assert.equal(marked.length, s[flag] ? 1 : 0, `${flag} count`);
    if (marked.length) assert.ok(marked[0] < FIRST, `${flag} beyond plane 6`);
  }
}

const moduleSets = Array.from({ length: 16 }, (_, bits) => ({
  fast: !!(bits & 1),
  vip: !!(bits & 2),
  airport: !!(bits & 4),
  alternate: !!(bits & 8),
}));

test('defaults', () => {
  for (let seed = 0; seed < 500; seed++) check(generate(DEFAULTS, seeded(seed)), DEFAULTS);
});

test('every module combination, at the tightest, default and open limits', () => {
  for (const modules of moduleSets) {
    const base = { ...DEFAULTS, ...modules };
    const r = ranges(base);
    const variants = [
      base,
      { ...base, waypoint: r.waypoint.min, level: r.level.min },
      { ...base, waypoint: r.waypoint.min, level: r.level.min, combo: r.combo.min },
      { ...base, combo: r.combo.min },
      { ...base, waypoint: Infinity, level: Infinity, combo: Infinity },
    ];
    for (const s of variants) {
      for (let seed = 0; seed < 150; seed++) check(generate(s, seeded(seed)), s);
    }
  }
});

test('random settings', () => {
  const random = seeded(42);
  const pick = ({ min, top }) => (random() < 0.15 ? Infinity : min + Math.floor(random() * (top - min)));
  for (let i = 0; i < 3000; i++) {
    let s = { ...DEFAULTS, ...moduleSets[i % 16] };
    s = { ...s, waypoint: pick(ranges(s).waypoint), level: pick(ranges(s).level) };
    s = { ...s, combo: pick(ranges(s).combo) };
    check(generate(s, seeded(i)), s);
  }
});

test('limits start at the defaults', () => {
  assert.deepEqual(limits(DEFAULTS), { waypoint: 6, level: 12, combo: Infinity });
});

test('limits never drop below what 12 planes need', () => {
  const s = { ...DEFAULTS, waypoint: 4, level: 8, combo: 2 };
  assert.deepEqual(limits(s), { waypoint: 4, level: 8, combo: 2 });
  // Alternate adds 12 slots: 36 = 6 waypoints × 6 = 3 levels × 12.
  assert.deepEqual(limits({ ...s, alternate: true }), { waypoint: 6, level: 12, combo: 2 });
  assert.equal(step({ ...s, waypoint: 6, alternate: true }, 'waypoint', -1).waypoint, 6);
  assert.equal(step(s, 'waypoint', -1).waypoint, 4);
});

test('a limit that can no longer bind reads as no limit', () => {
  assert.equal(step({ ...DEFAULTS, waypoint: 18 }, 'waypoint', 1).waypoint, Infinity);
  assert.equal(step({ ...DEFAULTS, level: 23 }, 'level', 1).level, Infinity);
  // A combo can't appear more often than its point, so combo 6 under waypoint 6 is no limit.
  assert.equal(step({ ...DEFAULTS, combo: 5 }, 'combo', 1).combo, Infinity);
  assert.equal(step(DEFAULTS, 'combo', -1).combo, 5);
  assert.equal(limits({ ...DEFAULTS, combo: 5, waypoint: 5 }).combo, Infinity);
  assert.equal(limits({ ...DEFAULTS, combo: 5, waypoint: 7 }).combo, 5);
});

test('entry may equal exit, and an alternate may share the exit point at another level', () => {
  const s = { ...DEFAULTS, alternate: true };
  let entryIsExit = false;
  let sharedPoint = false;
  for (let seed = 0; seed < 300; seed++) {
    for (const p of generate(s, seeded(seed))) {
      entryIsExit ||= p.entry.point === p.exit.point;
      sharedPoint ||= p.alternate.point === p.exit.point;
    }
  }
  assert.ok(entryIsExit && sharedPoint);
});

test('fast and vip may land on the same plane', () => {
  const s = { ...DEFAULTS, fast: true, vip: true };
  const together = Array.from({ length: 300 }, (_, seed) => generate(s, seeded(seed))).some(plan =>
    plan.some(p => p.fast && p.vip),
  );
  assert.ok(together);
});

test('fast enough to feel instant', () => {
  const s = { ...DEFAULTS, airport: true, alternate: true, combo: 2 };
  const start = performance.now();
  for (let seed = 0; seed < 500; seed++) generate(s, seeded(seed));
  const each = (performance.now() - start) / 500;
  assert.ok(each < 10, `${each.toFixed(2)} ms per plan`);
});
