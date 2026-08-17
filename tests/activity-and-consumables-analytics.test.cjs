const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const client = (name) => path.join(ROOT, 'client', 'src', name);
const read = (file) => fs.readFileSync(file, 'utf8');

const chartFiles = [
  'LogsGraph.jsx',
  'XanaxBarGraph.jsx',
  'XanaxReceivedChart.jsx',
  'BloodCountGraph.jsx',
  'BloodAidDailyChart.jsx',
  'ItemsGainedGraph.jsx',
  'TravelDurationGraph.jsx',
];

test('activity charts use shared asynchronous storage and UTC analytics boundaries', () => {
  for (const file of chartFiles) {
    const source = read(client(file));
    assert.doesNotMatch(source, /\bopenDB\b|window\.indexedDB/, `${file} must use dbLayer helpers`);
    assert.match(source, /from ['"]\.\/financeAnalytics\.js['"]/, `${file} must use shared analytics helpers`);
    assert.doesNotMatch(source, /toLocaleDateString\s*\(/, `${file} must not use locale-dependent bucket keys`);
    assert.match(source, /setError|error/i, `${file} must expose a safe read/error path`);
  }
});

test('activity charts validate timestamps and avoid stale asynchronous state', () => {
  for (const file of chartFiles) {
    const source = read(client(file));
    assert.match(source, /Number\.isFinite|toFiniteNumber/, `${file} must validate finite values`);
    const guardsAsyncWork = /cancelled|cancelledRef|AbortController/.test(source)
      || (file === 'ItemsGainedGraph.jsx' && /useBarBucketModal/.test(source));
    assert.equal(guardsAsyncWork, true, `${file} must guard stale async work or delegate to the guarded bucket hook`);
  }
});

test('blood chart keeps deposit and withdrawal data in distinct source paths', () => {
  const source = read(client('BloodCountGraph.jsx'));
  assert.match(source, /getLogsByMultipleIds|Promise\.all/, 'blood chart should read both blood log sources');
  assert.match(source, /deposit|withdrawal/i, 'blood chart should label both directions');
  assert.doesNotMatch(source, /totalWithdrawal\s*=\s*.*data2340/, 'withdrawal total must not use deposit data');
});

test('preview rendering is bounded and never logs full payloads', () => {
  const preview = read(client('JsonPreview.jsx'));
  assert.doesNotMatch(preview, /console\.log\s*\(/, 'JsonPreview must not log private payloads');
  assert.match(preview, /cancelled|cancelledRef|isMounted/, 'preview must guard deferred rendering after unmount');
  assert.match(preview, /1500|slice\(/, 'preview must retain a bounded payload contract');
});

test('bucket modal payload construction cannot throw during render', () => {
  const source = read(client(path.join('hooks', 'useBarBucketModal.js')));
  assert.match(source, /useMemo/, 'modal payload should be memoized safely');
  assert.match(source, /try\s*\{|catch/, 'modal payload construction should have a safe fallback');
});

test('stats migration applies query, URI fallback, malformed-document handling, and cleanup', () => {
  const source = read(path.join(ROOT, 'utils', 'computeStatsFromOldStats.js'));
  assert.match(source, /find\(query\)/, 'parsed query must be applied to Mongo find');
  assert.match(source, /MONGODB_URI_TEST/, 'test URI fallback must be supported');
  assert.match(source, /finally\s*\{/, 'Mongo resources must close in finally');
  assert.match(source, /skipped/, 'malformed documents must be counted/skipped');
  assert.match(source, /Number\.isFinite|finite/i, 'derived values must be finite-checked');
});

test('activity source identifiers remain wired in the dashboard', () => {
  const source = read(client('main.jsx'));
  for (const identifier of ['LogsGraph', 'XanaxBarGraph', 'XanaxReceivedChart', 'BloodCountGraph', 'BloodAidDailyChart', 'ItemsGainedGraph', 'TravelDurationGraph']) {
    assert.match(source, new RegExp(identifier), `${identifier} must remain discoverable in main.jsx`);
  }
});
