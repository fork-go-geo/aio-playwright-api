const assert = require('assert');

const hooks = require('../index.js').__lightBudgetTestHooks;
const {
  parseSubpageJsonLdLightHtml,
  fetchOfficialAccountListingEvidenceV1_,
  buildOfficialListingExternalProfileObservationV1_
} = hooks;

const entryKey = 'https://fixture.invalid/';
const sourceRunId = 'run-listing-a';
const parent = parseSubpageJsonLdLightHtml(
  entryKey,
  'https://fixture.invalid/about/',
  200,
  '<main><a href="/social/" aria-label="公式アカウント一覧">公式アカウント一覧はこちら</a></main>',
  'generic'
);

let fetchCalls = 0;
const fetchImpl = async url => {
  fetchCalls += 1;
  assert.equal(url, 'https://fixture.invalid/social/');
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    text: async () => [
      '<h1>架空企業株式会社 公式アカウント一覧</h1>',
      '<a href="https://x.com/acme">架空企業株式会社</a>',
      '<a href="https://x.com/acme/">架空企業株式会社</a>',
      '<a href="https://x.com/acme_service">架空サービス by 架空企業株式会社</a>'
    ].join('')
  };
};

(async () => {
  // A: explicit same-origin listing discovery, B: one existing safe subpage fetch.
  assert.equal(parent.officialListingLinks.length, 1);
  const listing = await fetchOfficialAccountListingEvidenceV1_(parent, {
    sourceRunId,
    entryKey,
    fetchImpl
  });
  assert.equal(fetchCalls, 1);
  assert.equal(listing.sourceRunId, sourceRunId);
  assert.equal(listing.entryKey, entryKey);
  assert.equal(listing.externalProfileLinkEvidence.length, 2);

  // C: only the exact corporate account from the verified listing can become official.
  const finalObservation = buildOfficialListingExternalProfileObservationV1_(
    { externalProfileLinkEvidence: [{ href: 'https://x.com/direct', text: '公式 X' }] },
    listing,
    {
      sourceRunId,
      entryKey,
      linksObserved: true,
      operatorIdentityFormal: true,
      operatorIdentity: { companyName: '架空企業株式会社', hasCompanyName: true, conflict: false }
    }
  );
  assert.equal(finalObservation.checked, true);
  assert.equal(finalObservation.completeness, 'complete');
  assert.equal(finalObservation.candidateCount, 3);
  assert.equal(finalObservation.officialProfileCount, 2);
  assert.equal(finalObservation.relationConfirmed, true);
  assert.equal(finalObservation.profiles.find(row => row.href === 'https://x.com/acme').relationConfirmed, true);
  assert.equal(finalObservation.profiles.find(row => row.href === 'https://x.com/acme_service').relationConfirmed, false);

  // Verified-listing evidence is rejected wholesale when identity or run/entry integrity is absent.
  const listingOnly = {};
  const mismatchedRun = buildOfficialListingExternalProfileObservationV1_(listingOnly, listing, {
    sourceRunId: 'different-run', entryKey, linksObserved: true, operatorIdentityFormal: true,
    operatorIdentity: { companyName: '架空企業株式会社', hasCompanyName: true, conflict: false }
  });
  assert.equal(mismatchedRun.candidateCount, 0);
  const mismatchedEntry = buildOfficialListingExternalProfileObservationV1_(listingOnly, listing, {
    sourceRunId, entryKey: 'https://other.invalid/', linksObserved: true, operatorIdentityFormal: true,
    operatorIdentity: { companyName: '架空企業株式会社', hasCompanyName: true, conflict: false }
  });
  assert.equal(mismatchedEntry.candidateCount, 0);
  const missingIdentity = buildOfficialListingExternalProfileObservationV1_(listingOnly, listing, {
    sourceRunId, entryKey, linksObserved: true, operatorIdentityFormal: true, operatorIdentity: null
  });
  assert.equal(missingIdentity.candidateCount, 0);
  const conflictedIdentity = buildOfficialListingExternalProfileObservationV1_(listingOnly, listing, {
    sourceRunId, entryKey, linksObserved: true, operatorIdentityFormal: true,
    operatorIdentity: { companyName: '架空企業株式会社', hasCompanyName: true, conflict: true }
  });
  assert.equal(conflictedIdentity.candidateCount, 0);
  const incompleteListing = buildOfficialListingExternalProfileObservationV1_(listingOnly, Object.assign({}, listing, { observationComplete: false }), {
    sourceRunId, entryKey, linksObserved: true, operatorIdentityFormal: true,
    operatorIdentity: { companyName: '架空企業株式会社', hasCompanyName: true, conflict: false }
  });
  assert.equal(incompleteListing.candidateCount, 0);

  // No discovery/child request is attempted if the explicit listing link is absent or budget is exhausted.
  const noListingParent = Object.assign({}, parent, { officialListingLinks: [] });
  assert.equal(await fetchOfficialAccountListingEvidenceV1_(noListingParent, { sourceRunId, entryKey, fetchImpl }), null);
  assert.equal(await fetchOfficialAccountListingEvidenceV1_(parent, { sourceRunId, entryKey, remainingBudget: false, fetchImpl }), null);
  assert.equal(fetchCalls, 1);

  // Evidence is deduplicated before the fixed ten-item cap is applied.
  const manyLinks = Array.from({ length: 12 }, (_, index) =>
    '<a href="https://x.com/acme_' + index + '">架空企業株式会社</a>'
  ).join('') + '<a href="https://x.com/acme_0/">架空企業株式会社</a>';
  const capped = parseSubpageJsonLdLightHtml(entryKey, 'https://fixture.invalid/capped/', 200, manyLinks, 'generic');
  assert.equal(capped.externalProfileLinkEvidence.length, 10);
  console.log('external profile listing integration: PASS');
})().catch(err => { console.error(err); process.exit(1); });
