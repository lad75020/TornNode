'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('main imports every React Router component it renders', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'main.jsx'), 'utf8');
  if (/<Link\b/.test(source)) {
    assert.match(source, /import\s*\{[\s\S]*?\bLink\b[\s\S]*?\}\s*from\s*['"]react-router-dom['"]/);
  }
});

test('wsTorn test route renders its declared component only once', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'main.jsx'), 'utf8');
  const routes = source.match(/path="\/ws-torn-test"/g) || [];

  assert.equal(routes.length, 1, 'the wsTorn route must not be shadowed by a duplicate route');
  assert.doesNotMatch(source, /\bMemoryGraphExplorer\b/, 'removed MemoryGraphExplorer must not be rendered');
  assert.match(source, /path="\/ws-torn-test"[\s\S]{0,500}<WsTornTestPage\b/);
});
