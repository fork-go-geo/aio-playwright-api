const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;
const { parseSubpageJsonLdLightHtml, attachOfficialListingExternalProfileObservationV1_ } = hooks;

const entryKey = 'https://fixture.invalid/';
const sourceRunId = '11111111-1111-4111-8111-111111111111';
const parent = parseSubpageJsonLdLightHtml(
  entryKey,
  'https://fixture.invalid/about/',
  200,
  '<a href="/social/">公式SNS一覧</a>',
  'generic'
);

function makeSignals(identity = true) {
  const geo = {
    observed: { links: { externalProfileLinkEvidence: [{ href: 'https://x.com/direct', text: '公式 X' }] } },
    externalProfileObservationV1: { checked: true, limited: false, candidateCount: 1, officialProfileCount: 1 },
    trustSignals: {}
  };
  if (identity) geo.trustSignals.operatorIdentityInfo = {
    hasOperatorInfo: true, hasCompanyName: true, companyName: '架空企業株式会社', conflict: false
  };
  return geo;
}

let fetchCalls = 0;
const fetchImpl = async url => {
  fetchCalls += 1;
  assert.equal(url, 'https://fixture.invalid/social/');
  return {
    ok: true, status: 200, headers: { get: () => 'text/html' },
    text: async () => '<a href="https://x.com/acme">架空企業株式会社</a><a href="https://x.com/brand">架空ブランド</a>'
  };
};

(async () => {
  // This is the same bridge invoked by attachCoverageSignalsToGeoSignalsLight_
  // from scrapeOnce, not a direct call to the final relation function.
  const geo = makeSignals(true);
  const applied = await attachOfficialListingExternalProfileObservationV1_(geo, [parent], {
    sourceRunId, entryKey, fetchImpl
  });
  assert.equal(applied.reason, 'listing_applied');
  assert.equal(fetchCalls, 1);
  assert.equal(geo.externalProfileObservationV1.candidateCount, 3);
  assert.equal(geo.externalProfileObservationV1.officialProfileCount, 2);
  assert.equal(geo.externalProfileObservationV1.profiles.find(row => row.href === 'https://x.com/acme').relationConfirmed, true);
  assert.equal(geo.externalProfileObservationV1.profiles.find(row => row.href === 'https://x.com/brand').relationConfirmed, false);
  assert.strictEqual(geo.observed.externalProfileObservationV1, geo.externalProfileObservationV1);

  const noIdentity = makeSignals(false);
  const identityMissing = await attachOfficialListingExternalProfileObservationV1_(noIdentity, [parent], {
    sourceRunId, entryKey, fetchImpl
  });
  assert.equal(identityMissing.reason, 'formal_identity_or_run_missing');
  assert.equal(fetchCalls, 1);
  assert.equal(noIdentity.externalProfileObservationV1.officialProfileCount, 1);

  const noListing = makeSignals(true);
  const listingMissing = await attachOfficialListingExternalProfileObservationV1_(noListing, [], {
    sourceRunId, entryKey, fetchImpl
  });
  assert.equal(listingMissing.reason, 'official_listing_link_not_observed');
  assert.equal(fetchCalls, 1);
  assert.equal(noListing.externalProfileObservationV1.officialProfileCount, 1);
  console.log('external profile listing normal request path: PASS');
})().catch(error => { console.error(error); process.exit(1); });
