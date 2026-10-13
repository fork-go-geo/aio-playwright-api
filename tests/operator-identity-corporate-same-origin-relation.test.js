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
assert.equal(evidenceFor(candidate({
  sources: ['nav'],
  operatorIdentityNavigationWitnesses: [{ source: 'nav', label: '会社概要', navigationScope: true, footerScope: false }]
}), identity()), null, 'nav only is not an operating relation');
assert.equal(evidenceFor(candidate({
  sources: ['footer'],
  operatorIdentityNavigationWitnesses: [{ source: 'footer', label: '会社概要', navigationScope: false, footerScope: true }]
}), identity()), null, 'footer only is not an operating relation');
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
      return response(200, '<main><h1>会社概要</h1><dl><dt>会社名</dt><dd>架空運営株式会社</dd></dl></main>');
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
  console.log('operator identity corporate same-origin relation fixtures: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
