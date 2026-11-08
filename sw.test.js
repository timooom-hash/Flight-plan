// Run with `node --test`. Keeps the offline cache in step with the files the app ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const source = readFileSync(new URL('sw.js', here), 'utf8');
const cached = [...source.match(/const FILES = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

test('every file the service worker caches exists', () => {
  for (const file of cached.filter(f => f !== './')) assert.ok(existsSync(new URL(file, here)), `missing ${file}`);
});

test('every file the app loads is cached for offline use', () => {
  const shipped = readdirSync(here).filter(
    f => /\.(html|css|js|webmanifest|png|woff2)$/.test(f) && f !== 'sw.js' && !f.endsWith('.test.js'),
  );
  for (const file of shipped) assert.ok(cached.includes(file), `${file} is not in FILES in sw.js`);
});
