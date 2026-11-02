const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
assert.match(source, /const rawRunId = String\(req && req\.query && req\.query\.runId \|\| ''\)\.trim\(\);/);
assert.match(source, /if \(rawRunId && !runId\) return res\.status\(400\)\.json\(\{ ok:false, error:'invalid_run_id' \}\);/);
assert.match(source, /if \(runId\) signalsResponsePayload\.runId = runId;/);
assert.match(source, /if \(runId\) shortPayload\.runId = runId;/);
console.log('scrape runId response contract: PASS');
