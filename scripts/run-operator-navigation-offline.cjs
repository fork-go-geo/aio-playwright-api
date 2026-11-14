'use strict';
// Usage: NODE_PATH=<existing dependencies> node scripts/run-operator-navigation-offline.cjs <saved terms HTML> <output directory>
// No package install, Docker, HTTP, source rewriting, or production route changes.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const htmlPath = path.resolve(process.argv[2] || 'MISSING_HTML');
assert.ok(process.argv[3], 'Supply an isolated output directory');
const out = path.resolve(process.argv[3]);
assert.ok(!out.startsWith(repo + path.sep), 'Keep investigation outputs outside the checkout');
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const htmlHash = hash(fs.readFileSync(htmlPath));
assert.equal(htmlHash, '707ff431373c4b3e26cb328883989014755f4282e5980f122544bdf4562f7851', 'Use the captured HTML, not a fresh fetch');
const refs = { baseline: 'f85aed248d2de7ce7f3e705fd00a354f5986c63c', formal: 'fb34abb11c5979c5cbabfce30368c893f260eb08' };
const sources = { fixed: path.join(repo, 'index.js') };
for (const [kind, ref] of Object.entries(refs)) {
  sources[kind] = path.join(out, kind + '-index.js');
  fs.writeFileSync(sources[kind], cp.execFileSync('git', ['show', ref + ':index.js'], { cwd: repo, maxBuffer: 8 * 1024 * 1024 }), { mode: 0o600 });
}
const sourceHashes = Object.fromEntries(Object.entries(sources).map(([key, filename]) => [key, hash(fs.readFileSync(filename))]));
const preload = path.join(repo, 'tests/helpers/operator-deny-network.cjs');
const runs = [], matrices = {};
function run(label, test, extra = {}) {
  const log = path.join(out, label + '.log');
  const fd = fs.openSync(log, 'w', 0o600);
  const start = Date.now();
  const env = { ...process.env };
  for (const key of ['OPERATOR_FIXTURE_SOURCE', 'OPERATOR_FIXTURE_MAX_OBSERVE', 'OPERATOR_FIXTURE_REPORT', 'OPERATOR_TERMS_HTML_PATH', 'OPERATOR_CONTROL_SOURCE', 'EXPECT_COVERAGE_CONFLICT_BLOCK', 'EXPECT_NAVIGATION_NAME_BUG']) delete env[key];
  Object.assign(env, extra);
  const child = cp.spawnSync(process.execPath, ['--require', preload, path.join(repo, test)], {
    cwd: repo, env, stdio: ['ignore', fd, fd], timeout: 45000
  });
  fs.closeSync(fd);
  const result = { label, test, exitCode: child.status, signal: child.signal, error: child.error?.code || null, elapsedMs: Date.now() - start, log };
  runs.push(result);
  console.log(JSON.stringify({ label, exitCode: result.exitCode, error: result.error }));
  return result.exitCode === 0;
}
run('navigation-real-html', 'tests/operator-identity-navigation-fallback.test.js', {
  OPERATOR_TERMS_HTML_PATH: htmlPath, OPERATOR_CONTROL_SOURCE: sources.baseline
});
for (const kind of ['baseline', 'formal', 'fixed']) {
  for (const count of [2, 5]) {
    const label = kind + '-' + count;
    const report = path.join(out, label + '.json');
    if (run(label, 'tests/operator-identity-coverage-conflict-probe.test.js', {
      OPERATOR_FIXTURE_SOURCE: sources[kind], OPERATOR_FIXTURE_MAX_OBSERVE: String(count),
      OPERATOR_FIXTURE_REPORT: report, OPERATOR_TERMS_HTML_PATH: htmlPath,
      EXPECT_COVERAGE_CONFLICT_BLOCK: kind === 'baseline' ? '1' : '0',
      EXPECT_NAVIGATION_NAME_BUG: kind !== 'fixed' ? '1' : '0'
    })) matrices[label] = JSON.parse(fs.readFileSync(report, 'utf8'));
  }
}
const browserTests = new Set(['operator-identity-compact-footer-group.test.js', 'operator-identity-link-collection-integration.test.js', 'coverage-candidate-dom-ready.test.js', 'breadcrumb-ui-observation.test.js']);
const selected = fs.readdirSync(path.join(repo, 'tests')).filter(name =>
  /^(?:operator-identity-|shop-facility-operator-|coverage-|phase4-(?:faq|service)-|breadcrumb-iframe-)/.test(name) && name.endsWith('.test.js') &&
  !browserTests.has(name) && !['operator-identity-navigation-fallback.test.js', 'operator-identity-coverage-conflict-probe.test.js'].includes(name)).sort();
for (const name of selected) run(name.replace('.test.js', ''), 'tests/' + name);
const parity = [];
for (const count of [2, 5]) {
  const before = matrices['baseline-' + count], after = matrices['fixed-' + count];
  if (!before || !after) continue;
  for (const [index, row] of before.rows.entries()) {
    // Both fixtures start with the same scenarios; legacy-only branches later
    // have a different count, so compare using kind/siteMode instead of index.
    const other = after.rows.find(item => item.kind === row.kind && item.siteMode === row.siteMode);
    if (!other) continue;
    const unchanged = row.coverageSha256 === other.coverageSha256 &&
      JSON.stringify(row.representatives.map(({ companyName, ...rest }) => rest)) ===
      JSON.stringify(other.representatives.map(({ companyName, ...rest }) => rest));
    parity.push({ count, kind: row.kind, siteMode: row.siteMode, unchanged });
  }
}
assert.equal(hash(fs.readFileSync(htmlPath)), htmlHash, 'Captured HTML must be unchanged');
for (const [kind, filename] of Object.entries(sources)) assert.equal(hash(fs.readFileSync(filename)), sourceHashes[kind]);
const summary = { nodeVersion: process.version, htmlHash, sourceHashes, runs, parity,
  realTerms: Object.fromEntries(Object.entries(matrices).map(([key, value]) => [key, value.rows.find(row => row.kind === 'real_terms')])),
  notRun: [...browserTests],
  limitations: ['Only terms HTML is an actual saved page; other pages and formal profiles use existing synthetic fixtures.',
    'No live five-site re-fetch; no GAS scoring/cards/summary/save/PDF/position end-to-end execution.',
    'Navigation is excluded from text fallback; explicit structured company fields still veto conflicting formal names even without their own brand relation.'] };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
const failed = runs.filter(run => run.exitCode !== 0);
console.log(JSON.stringify({ passed: runs.length - failed.length, failed: failed.map(run => run.label), parityCases: parity.length, parityFailures: parity.filter(row => !row.unchanged), summary: path.join(out, 'summary.json') }));
if (failed.length || parity.some(row => !row.unchanged)) process.exitCode = 1;
