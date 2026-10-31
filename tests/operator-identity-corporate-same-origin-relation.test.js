const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const entryOrigin = 'https://brand.fixture.invalid';
const companyUrl = `${entryOrigin}/company/overview.html`;

function candidate(overrides = {}) {
  return Object.assign({
    url: companyUrl,
    label: '会社概要',
    source: 'nav',
    sources: ['nav', 'footer'],
    operatorRelationSourceOrigin: entryOrigin,
    operatorIdentityNavigationWitnesses: [
      { source: 'nav', label: '会社概要', navigationScope: true, footerScope: false },
      { source: 'footer', label: '会社概要', navigationScope: false, footerScope: true }
    ]
  }, overrides);
}

function identity(overrides = {}) {
  return Object.assign({
    observed: true,
    scope: 'company_profile_page',
    sourceUrl: companyUrl,
    companyName: '架空運営株式会社',
    address: '東京都港区架空町1-2-3',
    hasCompanyName: true,
    hasAddress: true,
    hasTelephone: false,
    conflict: false
  }, overrides);
}

function evidenceFor(c, i, opts = {}) {
  return hooks.buildObservedCompanyProfileRelationEvidenceV1_(c, opts.page || { ok: true }, i, opts.siteMode || 'corporate');
}

// Corporate, same-origin, independently-rendered nav/footer links, a fetched
// company-profile scope, and a formal company name create the existing
// same-origin relation-evidence contract without a telephone requirement.
const positiveCandidate = candidate();
const positiveIdentity = identity();
const positiveEvidence = evidenceFor(positiveCandidate, positiveIdentity);
assert.ok(positiveEvidence);
assert.equal(positiveEvidence.kind, 'explicit_same_origin_company_profile_relation');
assert.equal(positiveEvidence.currentRun, true);
assert.equal(positiveEvidence.candidateSourceUrl, companyUrl);
assert.equal(positiveEvidence.relationSource, 'nav_footer_corroborated_company_profile_relation');
const positiveRelationAudit = hooks.operatorIdentityRelationAuditV1_(positiveCandidate, 'fixture-key', {
  relationEvidence: positiveEvidence
});
assert.equal(positiveRelationAudit.relationEvidenceEligible, true);
assert.equal(positiveRelationAudit.relationEvidenceReason, 'ready');

const normalized = hooks.normalizeOperatorIdentityInfo_(positiveIdentity, 'company_profile', {
  relationEvidence: positiveEvidence
});
assert.ok(normalized);
assert.equal(normalized.hasOperatorInfo, true);
assert.equal(normalized.hasTelephone, false);
const record = hooks.attachOperatorIdentityProbeProvenance_(normalized, positiveCandidate);
assert.equal(record.identityEvidenceV1.candidateSourceUrl, record.provenance.candidateSourceUrl);
assert.equal(record.hasOperatorInfo, true);

// Every relaxed-looking case below remains fail-closed.
const navOnlyCandidate = candidate({
  sources: ['nav'],
  operatorIdentityNavigationWitnesses: [{ source: 'nav', label: '会社概要', navigationScope: true, footerScope: false }]
});
const navOnlyEvidence = evidenceFor(navOnlyCandidate, identity());
assert.ok(navOnlyEvidence, 'an explicit same-origin company-profile nav with fetched name/address is an operating relation');
const navOnlyFormal = hooks.normalizeOperatorIdentityInfo_(identity(), 'company_profile', { relationEvidence: navOnlyEvidence });
assert.equal(navOnlyFormal.hasOperatorInfo, true, 'nav-only evidence reaches the existing formal operator record');
assert.equal(evidenceFor(candidate({
  sources: ['footer'],
  operatorIdentityNavigationWitnesses: [{ source: 'footer', label: '会社概要', navigationScope: false, footerScope: true }]
}), identity()), null, 'footer only is not an operating relation');
assert.equal(evidenceFor(candidate({
  url: `${entryOrigin}/company/news/`,
  operatorIdentityNavigationWitnesses: [{ source: 'nav', label: '会社概要', navigationScope: true, footerScope: false }]
}), identity({ sourceUrl: `${entryOrigin}/company/news/` })), null, 'company-named content routes are not company-profile relations');
assert.equal(evidenceFor(candidate({
  operatorIdentityNavigationWitnesses: [{ source: 'nav', label: '会社概要', navigationScope: true, footerScope: false }]
}), identity({ address: '', hasAddress: false })), null, 'nav-only relation requires an observed address');
assert.equal(evidenceFor(candidate({
  label: 'お知らせ',
  operatorIdentityNavigationWitnesses: [
    { source: 'nav', label: 'お知らせ', navigationScope: true, footerScope: false },
    { source: 'footer', label: 'お知らせ', navigationScope: false, footerScope: true }
  ]
}), identity()), null, 'generic links are not company-profile relations');
assert.equal(evidenceFor(candidate(), identity({ conflict: true })), null, 'company-name conflict remains fail-closed');
assert.equal(evidenceFor(candidate({ operatorIdentityMixedEntity: true }), identity()), null, 'mixed-company evidence remains fail-closed');
assert.equal(evidenceFor(candidate({
  operatorIdentityNavigationWitnesses: [
    { source: 'nav', label: 'FC会社概要', navigationScope: true, footerScope: false },
    { source: 'footer', label: 'FC会社概要', navigationScope: false, footerScope: true }
  ]
}), identity()), null, 'franchise context is not adopted');
assert.equal(hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(candidate(), {
  siteMode: 'corporate', currentRunFetched: true, companyProfileScope: true,
  observedIdentity: identity(), provenanceCandidateUrl: `${entryOrigin}/company/other.html`
}), null, 'provenance URL must be exact');
assert.equal(evidenceFor(candidate({ operatorRelationSourceOrigin: 'https://other.fixture.invalid' }), identity()), null, 'external origin is not this relation');
assert.equal(evidenceFor(candidate(), identity(), { page: { ok: false } }), null, 'unfetched candidates are not evidence');
assert.equal(evidenceFor(candidate({
  operatorIdentityNavigationWitnesses: [
    { source: 'nav', label: '会社概要', navigationScope: true, footerScope: true },
    { source: 'footer', label: '会社概要', navigationScope: true, footerScope: true }
  ]
}), identity()), null, 'one footer-contained navigation anchor is not independent corroboration');
assert.equal(evidenceFor(candidate(), identity(), { siteMode: 'generic' }), null, 'corporate mode is required');

// A bounded landing/hub may disclose exactly one explicit formal detail.  It
// does not inherit nav/footer status: the current-run hub and detail must be
// same-origin, and the detail must itself have a conflict-free company name.
const detailUrl = `${entryOrigin}/company/profile.html`;
const detailLink = { url: detailUrl, label: '会社概要', source: 'explicit_company_profile_link' };
const hubDetailEvidence = hooks.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(
  positiveCandidate,
  { ok: true, finalUrl: companyUrl },
  detailLink,
  { ok: true, finalUrl: detailUrl },
  identity({ sourceUrl: detailUrl }),
  'corporate'
);
assert.ok(hubDetailEvidence, 'explicit current-run hub/detail chain is accepted');
assert.equal(hubDetailEvidence.candidateSourceUrl, detailUrl);
assert.equal(hubDetailEvidence.relationSource, 'nav_footer_corroborated_company_profile_hub_detail_relation');
const hubDetailFormal = hooks.normalizeOperatorIdentityInfo_(identity({ sourceUrl: detailUrl }), 'company_profile', {
  relationEvidence: hubDetailEvidence
});
const hubDetailRecord = hooks.attachOperatorIdentityProbeProvenance_(hubDetailFormal, positiveCandidate, {
  candidateSourceUrl: hubDetailEvidence.candidateSourceUrl,
  candidateSource: hubDetailEvidence.relationSource,
  relationLabel: hubDetailEvidence.relationLabel,
  relationSourceOrigin: hubDetailEvidence.relationSourceOrigin,
  relation: hubDetailEvidence.relationSource
});
assert.equal(hubDetailRecord.provenance.candidateSourceUrl, detailUrl);
assert.equal(hubDetailRecord.identityEvidenceV1.candidateSourceUrl, hubDetailRecord.provenance.candidateSourceUrl);
assert.equal(hooks.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(
  positiveCandidate, { ok: true, finalUrl: companyUrl },
  Object.assign({}, detailLink, { source: 'body_link' }), { ok: true, finalUrl: detailUrl },
  identity({ sourceUrl: detailUrl }), 'corporate'
), null, 'unclassified detail links are not evidence');
assert.equal(hooks.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(
  positiveCandidate, { ok: true, finalUrl: companyUrl }, detailLink,
  { ok: true, finalUrl: 'https://other.fixture.invalid/company/profile.html' },
  identity({ sourceUrl: 'https://other.fixture.invalid/company/profile.html' }), 'corporate'
), null, 'cross-origin detail is not evidence');
assert.equal(hooks.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(
  candidate({ operatorIdentityNavigationWitnesses: [{ source: 'nav', label: '会社概要', navigationScope: true, footerScope: false }] }),
  { ok: true, finalUrl: companyUrl }, detailLink, { ok: true, finalUrl: detailUrl },
  identity({ sourceUrl: detailUrl }), 'corporate'
), null, 'hub/detail route still needs independent nav/footer evidence');
assert.equal(hooks.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(
  positiveCandidate, { ok: true, finalUrl: companyUrl }, detailLink, { ok: true, finalUrl: detailUrl },
  identity({ sourceUrl: detailUrl, conflict: true }), 'corporate'
), null, 'conflicted detail remains fail-closed');

// Existing explicit paths remain unchanged.
const existingSameOrigin = {
  url: `${entryOrigin}/company/`, label: '運営会社',
  officialSameOriginOperatorProfile: true,
  operatorRelationSource: 'explicit_body_company_profile_relation',
  operatorRelationSourceOrigin: entryOrigin
};
assert.ok(hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(existingSameOrigin));
const existingExternal = {
  url: 'https://operator.fixture.invalid/company/', label: '運営会社',
  officialExternalOperatorProfile: true, operatorRelationSource: 'footer',
  operatorRelationSourceOrigin: entryOrigin
};
assert.ok(hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(existingExternal));

// Exercise the bounded producer path with a fetched HTML company profile,
// rather than treating a hand-built identity object as the sole positive.
const response = (status, text) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => '' },
  text: async () => text
});

(async () => {
  const page = await hooks.fetchSubpageHtmlLightOnce_(companyUrl, {
    siteMode: 'corporate',
    operatorIdentitySourceType: 'company_profile',
    operatorIdentitySelectedHub: true,
    highConfidenceCompanyProfile: true,
    fetchImpl: async url => {
      assert.equal(String(url), companyUrl);
      return response(200, '<main><h1>会社概要</h1><dl><dt>会社名</dt><dd>架空運営株式会社</dd><dt>所在地</dt><dd>東京都港区架空町1-2-3</dd></dl></main>');
    }
  });
  assert.equal(page.ok, true);
  assert.equal(page.operatorIdentityInfo.scope, 'company_profile_page');
  assert.equal(page.operatorIdentityInfo.hasCompanyName, true);
  assert.equal(page.operatorIdentityInfo.hasTelephone, false);
  const evidence = hooks.buildObservedCompanyProfileRelationEvidenceV1_(positiveCandidate, page, page.operatorIdentityInfo, 'corporate');
  const formal = hooks.normalizeOperatorIdentityInfo_(page.operatorIdentityInfo, 'company_profile', { relationEvidence: evidence });
  const formalRecord = hooks.attachOperatorIdentityProbeProvenance_(formal, positiveCandidate);
  assert.equal(formalRecord.hasOperatorInfo, true);
  assert.equal(formalRecord.identityEvidenceV1.candidateSourceUrl, formalRecord.provenance.candidateSourceUrl);
  const navOnlyPathEvidence = hooks.buildObservedCompanyProfileRelationEvidenceV1_(navOnlyCandidate, page, page.operatorIdentityInfo, 'corporate');
  const navOnlyPathFormal = hooks.normalizeOperatorIdentityInfo_(page.operatorIdentityInfo, 'company_profile', { relationEvidence: navOnlyPathEvidence });
  const navOnlyPathRecord = hooks.attachOperatorIdentityProbeProvenance_(navOnlyPathFormal, navOnlyCandidate);
  assert.equal(navOnlyPathRecord.hasOperatorInfo, true, 'fetched nav-only company profile reaches the formal operator record');
  assert.equal(navOnlyPathRecord.identityEvidenceV1.candidateSourceUrl, navOnlyPathRecord.provenance.candidateSourceUrl);
  console.log('operator identity corporate same-origin relation fixtures: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
