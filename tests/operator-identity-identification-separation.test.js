const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const baseInfo = overrides => Object.assign({
  observed: true,
  sourceUrl: 'https://brand.fixture.invalid/company/',
  companyName: 'Fixture Operator Co.',
  address: '',
  telephone: '',
  hasCompanyName: true,
  hasAddress: false,
  hasTelephone: false,
  hasOperatorInfo: false,
  conflict: false,
  extractionMethod: 'html_text',
  authority: 'cloud_run_geoSignalsV1_trustSignals_operator_identity_v1'
}, overrides || {});

const sameOriginCandidate = {
  url: 'https://brand.fixture.invalid/company/',
  label: 'Operating company',
  officialSameOriginOperatorProfile: true,
  operatorRelationLabel: 'Operating company',
  operatorRelationSource: 'explicit_body_company_profile_relation',
  operatorRelationSourceOrigin: 'https://brand.fixture.invalid'
};
const externalCandidate = {
  url: 'https://operator.fixture.invalid/profile/',
  label: 'Operating company',
  officialExternalOperatorProfile: true,
  operatorRelationLabel: 'Operating company',
  operatorRelationSource: 'explicit_body_operator_relation',
  operatorRelationSourceOrigin: 'https://brand.fixture.invalid'
};

const sameEvidence = hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(sameOriginCandidate);
const externalEvidence = hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(externalCandidate);
assert.ok(sameEvidence);
assert.ok(externalEvidence);
assert.strictEqual(hooks.buildExplicitOperatorIdentityRelationEvidenceV1_({
  ...sameOriginCandidate, operatorRelationSource: 'sitemap'
}), null, 'ordinary company links never become relation evidence');
assert.strictEqual(hooks.buildExplicitOperatorIdentityRelationEvidenceV1_({
  ...externalCandidate, url: 'http://operator.fixture.invalid/profile/'
}), null, 'identity evidence never accepts HTTP');

function formal(info, evidence) {
  const normalized = hooks.normalizeOperatorIdentityInfo_(info, 'company_profile', { relationEvidence: evidence });
  return normalized && hooks.attachOperatorIdentityProbeProvenance_(normalized, evidence === externalEvidence ? externalCandidate : sameOriginCandidate);
}

// Official company name + explicit current-run operating relation is sufficient
// to identify the operator. Address remains deliberately absent here.
const relationOnly = formal(baseInfo(), sameEvidence);
assert.ok(relationOnly);
assert.strictEqual(relationOnly.hasOperatorInfo, true);
assert.strictEqual(relationOnly.hasAddress, false);
assert.strictEqual(relationOnly.identityEvidenceV1.kind, 'explicit_same_origin_company_profile_relation');

const externalRelationOnly = formal(baseInfo({ sourceUrl: externalCandidate.url }), externalEvidence);
assert.ok(externalRelationOnly);
assert.strictEqual(externalRelationOnly.identityEvidenceV1.kind, 'explicit_external_operator_relation');

// An old company-profile tuple alone no longer proves that it operates the
// analysed brand. Formal legal disclosures keep their separate contract.
const legacyCompanyProfile = hooks.normalizeOperatorIdentityInfo_(baseInfo({
  address: 'Fixture Ward 1-2-3', hasAddress: true, hasOperatorInfo: true
}), 'company_profile');
assert.strictEqual(legacyCompanyProfile, null);
const legalFormal = hooks.normalizeOperatorIdentityInfo_({
  observed: true, sourceUrl: 'https://brand.fixture.invalid/legal/', operatorName: 'Fixture Operator Co.',
  address: 'Fixture Ward 1-2-3', telephone: '000-0000-0000', hasOperatorInfo: true
}, 'legal');
assert.ok(legalFormal);
assert.strictEqual(legalFormal.hasOperatorInfo, true);

// Name, NAP, link, brand string, conflict, or incomplete relation alone must
// never become an identity record.
assert.strictEqual(hooks.normalizeOperatorIdentityInfo_(baseInfo(), 'company_profile'), null);
assert.strictEqual(hooks.normalizeOperatorIdentityInfo_(baseInfo({
  companyName: '', hasCompanyName: false, address: 'Fixture Ward 1-2-3', hasAddress: true, hasOperatorInfo: true
}), 'company_profile', { relationEvidence: sameEvidence }), null);
assert.strictEqual(hooks.normalizeOperatorIdentityInfo_(baseInfo({ conflict: true }), 'company_profile', { relationEvidence: sameEvidence }), null);
assert.strictEqual(hooks.normalizeOperatorIdentityInfo_(baseInfo({ observed: false }), 'company_profile', { relationEvidence: sameEvidence }), null);

const observation = hooks.buildOperatorIdentityObservationV1_(relationOnly, { attempted: true, observationComplete: true }, {
  siteMode: 'shop_facility', candidates: [sameOriginCandidate], discoveryComplete: true
});
assert.strictEqual(observation.signalState, 'true');
assert.strictEqual(observation.strongEvidenceCount, 1);

// Exercise the same static parser used by the bounded probe, rather than
// treating a hand-built identity object as evidence.
const response = (status, text) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: () => '' }, text: async () => text
});
(async () => {
  const page = await hooks.fetchSubpageHtmlLightOnce_(sameOriginCandidate.url, {
    siteMode: 'shop_facility', operatorIdentitySourceType: 'company_profile',
    operatorIdentitySelectedHub: true, highConfidenceCompanyProfile: true,
    fetchImpl: async url => {
      assert.strictEqual(String(url), sameOriginCandidate.url);
      return response(200, '<main><p>運営会社の会社情報</p><dl><dt>会社名</dt><dd>架空運営株式会社</dd></dl></main>');
    }
  });
  assert.strictEqual(page.ok, true);
  assert.strictEqual(page.operatorIdentityInfo.hasCompanyName, true);
  assert.strictEqual(page.operatorIdentityInfo.hasAddress, false);
  const integrated = formal(page.operatorIdentityInfo, sameEvidence);
  assert.ok(integrated);
  assert.strictEqual(integrated.hasOperatorInfo, true);
  assert.strictEqual(integrated.hasAddress, false);
  console.log('operator identity identification separation fixtures: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
