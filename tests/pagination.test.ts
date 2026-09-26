import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageWindow, pagination } from '../src/pagination.ts';

test('pagination covers every record once and clamps empty or out-of-range pages', () => {
  const rows = Array.from({ length: 121 }, (_, i) => i);
  assert.deepEqual([1, 2, 3].flatMap(page => pageWindow(rows, page).rows), rows);
  assert.equal(pageWindow(rows, 99).page, 3);
  assert.equal(pageWindow(rows, -1).page, 1);
  assert.equal(pageWindow(rows, NaN).page, 1);
  assert.equal(pageWindow([], 2).page, 1);
  assert.equal(pagination(pageWindow([]), 'stocks', 'en'), '');
  assert.match(pagination(pageWindow(rows), 'stocks', 'en'), /1–50 of 121/);
  assert.match(pagination(pageWindow(rows, 3), 'crypto', 'ja'), /121件中 101〜121件/);
});
