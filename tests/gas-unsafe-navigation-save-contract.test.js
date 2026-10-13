// Source-level contract only: Apps Script is not executed locally.  This
// verifies that a non-200 Cloud Run response cannot enter the success-only
// save section of the production GAS source.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const gasPath = '/Users/go/Desktop/geo-work/main/geo-gas/code.js';
const source = fs.readFileSync(gasPath, 'utf8');

const non200At = source.indexOf('if (code !== 200) {');
const non200ReturnAt = source.indexOf('return buildRenderNon200FetchResultV1_(code, api, errorText, contentType);', non200At);
const successGateAt = source.indexOf('if (sigRes && sigRes.ok && sigRes.sig && typeof sigRes.sig === \'object\') {');
const saveAt = source.indexOf('var saveRes = setDiagnosisDetailToSheet(origin, dateJST, detailPayload, meta2);');

assert.ok(non200At >= 0, 'Cloud Run non-200 branch exists');
assert.ok(non200ReturnAt > non200At, 'Cloud Run non-200 branch returns failure payload');
assert.ok(successGateAt >= 0, 'success-only audit signal gate exists');
assert.ok(saveAt > successGateAt, 'detail save occurs only after success gate in this route');

console.log(JSON.stringify({
  pass: true,
  fixture: 'gas_unsafe_navigation_save_contract_v1',
  mode: 'source_contract_only',
  non200StopsBeforeSuccessPayload: true,
  detailSaveIsAfterSuccessGate: true
}));
