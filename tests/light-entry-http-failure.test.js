const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const hooks = require('../index.js').__lightBudgetTestHooks;
const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
// Exercise the actual final browser-attempt status gate: only failed HTTP
// responses are classified; healthy entries and authenticated runs bypass it.
const start = source.indexOf('      if (signalsFirstLight && !authenticatedRun && !isSuccessfulEntryStatusV1_(entryStatus))');
const end = source.indexOf('      // A 2xx challenge/error page', start);
assert.ok(start > 0 && end > start);
const gate = source.slice(start, end);
for (const status of [403, 404, 429, 500, null]) {
  let error;
  try { vm.runInNewContext(gate, { signalsFirstLight: true, authenticatedRun: false,
    entryStatus: status, isSuccessfulEntryStatusV1_: (s) => s >= 200 && s < 300,
    createLightEntryHttpFailureV1_: hooks.createLightEntryHttpFailureV1_ }); } catch (e) { error = e; }
  assert.equal(error.code, 'LIGHT_ENTRY_HTTP_FAILURE');
  const response = { status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } };
  hooks.sendLightEntryHttpFailureV1_(response, error, { remainingMs: 139656 });
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.entryHttpStatus, status);
  assert.equal(response.body.diagnostics.deadlineExceeded, false);
  assert.equal(response.body.diagnostics.coreSignalsReady, false);
  assert.equal(response.body.diagnostics.remainingMs, 139656);
}
for (const settings of [{entryStatus:200, authenticatedRun:false}, {entryStatus:403, authenticatedRun:true}]) {
  vm.runInNewContext(gate, Object.assign({signalsFirstLight:true,
    isSuccessfulEntryStatusV1_: (s) => s >= 200 && s < 300,
    createLightEntryHttpFailureV1_: () => {throw new Error('must not classify');}}, settings));
}
assert.ok(source.includes("if (err && err.code === 'LIGHT_ENTRY_HTTP_FAILURE') throw err;"));
console.log('light entry HTTP failure classification: passed');
