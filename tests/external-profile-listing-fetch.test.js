const assert = require('assert');
const { fetchOfficialAccountListingEvidenceV1_ } = require('../index.js').__lightBudgetTestHooks;
const parent = { ok: true, observationComplete: true, url: 'https://fixture.invalid/about/', finalUrl: 'https://fixture.invalid/about/', officialListingLinks: [{ href: 'https://fixture.invalid/social/', sameOrigin: true, observationComplete: true, text: '公式アカウント一覧' }] };
let calls = 0;
const fetchImpl = async url => { calls += 1; return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<a href="https://x.com/acme">架空企業</a>' }; };
(async () => {
  const result = await fetchOfficialAccountListingEvidenceV1_(parent, { sourceRunId: 'run-a', entryKey: 'https://fixture.invalid', fetchImpl });
  assert.equal(calls, 1); assert.equal(result.sourceRunId, 'run-a'); assert.equal(result.externalProfileLinkEvidence.length, 1);
  assert.equal(await fetchOfficialAccountListingEvidenceV1_(parent, { remainingBudget: false, fetchImpl }), null);
  assert.equal(calls, 1);
  console.log('external profile listing fetch: PASS');
})().catch(err => { console.error(err); process.exit(1); });
