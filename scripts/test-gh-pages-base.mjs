import assert from 'node:assert/strict';
import {
  filmLabOpenPathForBase,
  normalizeViteBase,
  resolveViteBaseFromProcessEnv,
} from './lib/gh-pages-base.mjs';

assert.equal(normalizeViteBase(''), '/');
assert.equal(normalizeViteBase('/'), '/');
assert.equal(normalizeViteBase('x'), '/x/');
assert.equal(normalizeViteBase('/y'), '/y/');
assert.equal(normalizeViteBase('/z/'), '/z/');
assert.equal(normalizeViteBase('//'), '/');

assert.equal(filmLabOpenPathForBase('/'), '/film-lab');
assert.equal(filmLabOpenPathForBase('//'), '/film-lab');
assert.equal(filmLabOpenPathForBase('/a/'), '/a/film-lab');

const v = process.env.VITE_BASE;
const g = process.env.GH_PAGES_REPO;
try {
  delete process.env.VITE_BASE;
  delete process.env.GH_PAGES_REPO;
  assert.equal(resolveViteBaseFromProcessEnv(), null);

  process.env.GH_PAGES_REPO = 'r1';
  assert.equal(resolveViteBaseFromProcessEnv(), '/r1/');

  delete process.env.GH_PAGES_REPO;
  process.env.VITE_BASE = '/c/';
  assert.equal(resolveViteBaseFromProcessEnv(), '/c/');

  process.env.GH_PAGES_REPO = 'ignored';
  assert.equal(resolveViteBaseFromProcessEnv(), '/c/');
} finally {
  if (v === undefined) {
    delete process.env.VITE_BASE;
  } else {
    process.env.VITE_BASE = v;
  }
  if (g === undefined) {
    delete process.env.GH_PAGES_REPO;
  } else {
    process.env.GH_PAGES_REPO = g;
  }
}

process.stdout.write('PASS gh-pages-base\n');
