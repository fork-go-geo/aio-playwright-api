const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const candidate = {
  url: 'https://fixture.invalid/operator/company/',
  label: '運営会社',
  sources: ['footer'],
  score: 50,
  officialSameOriginOperatorProfile: true,
  operatorRelationLabel: '運営会社',
  operatorRelationSource: 'explicit_body_company_profile_relation',
  operatorRelationSourceOrigin: 'https://fixture.invalid'
};
const profileHtml = [
  '<table>',
  '<tr><th>会社名</th><td>架空運営株式会社</td></tr>',
  '<tr><th>所在地</th><td>〒100-0001 東京都千代田区架空町1-1</td></tr>',
  '<tr><th>電話番号</th><td>03-0000-0000</td></tr>',
  '</table>'
].join('');

// The bounded candidate contract is shared by corporate/service/facility
// modes. EC and media remain deliberately outside it.
for (const mode of ['corporate', 'generic', 'saas', 'shop_facility']) {
  const selected = hooks.selectOperatorIdentityProbeCandidate_([candidate], mode);
  assert.ok(selected, `${mode} must select an explicit operator candidate`);
  assert.strictEqual(selected.url, candidate.url);
}
for (const mode of ['ec', 'media']) {
  assert.strictEqual(hooks.selectOperatorIdentityProbeCandidate_([candidate], mode), null);
}

const selected = hooks.selectOperatorIdentityProbeCandidate_([candidate], 'shop_facility');
const extracted = hooks.extractOperatorIdentityInfoFromHtml_(profileHtml, selected.url, {
  highConfidenceCompanyProfile: true
});
const formal = hooks.attachOperatorIdentityProbeProvenance_(
  hooks.normalizeOperatorIdentityInfo_(extracted, 'company_profile', {
    relationEvidence: hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(selected)
  }),
  selected
);
assert.strictEqual(formal.hasOperatorInfo, true);
assert.strictEqual(formal.provenance.scope, 'company_profile_page');

const observation = hooks.buildOperatorIdentityObservationV1_(formal, {
  attempted: true,
  observationComplete: true,
  sourceUrl: selected.url,
  reason: 'company_profile_fetched'
}, { siteMode: 'shop_facility', candidates: [candidate], discoveryComplete: true });
assert.strictEqual(observation.applicability, 'applicable');
assert.strictEqual(observation.signalState, 'true');

const legal = hooks.extractLegalOperatorInfoFromHtml_(
  '<dl><dt>所在地</dt><dd>東京都千代田区架空町1-1</dd><dt>電話番号</dt><dd>03-0000-0000</dd></dl>',
  'https://fixture.invalid/legal/'
);
assert.strictEqual(legal.hasOperatorInfo, true);
assert.strictEqual(hooks.normalizeOperatorIdentityInfo_(legal, 'legal').hasOperatorInfo, true);

const incomplete = hooks.extractOperatorIdentityInfoFromHtml_(
  '<table><tr><th>会社名</th><td>架空運営株式会社</td></tr></table>',
  selected.url,
  { highConfidenceCompanyProfile: true }
);
assert.strictEqual(incomplete.hasOperatorInfo, false);
const failedObservation = hooks.buildOperatorIdentityObservationV1_(null, {
  attempted: true,
  observationComplete: false,
  sourceUrl: selected.url,
  reason: 'fetch_failed'
}, { siteMode: 'shop_facility', candidates: [candidate], discoveryComplete: true });
assert.strictEqual(failedObservation.signalState, 'false');
assert.strictEqual(failedObservation.scopeComplete, false);
const conflict = hooks.buildOperatorIdentityInfoFromObservedCompanyProfiles_([
  { operatorIdentityInfo: Object.assign({}, extracted, { scope: 'company_profile_page', scopeKey: 'company' }) },
  { operatorIdentityInfo: Object.assign({}, extracted, { companyName: '別の架空運営株式会社', scope: 'company_profile_page', scopeKey: 'company' }) }
]);
assert.strictEqual(conflict.record, null);
assert.strictEqual(conflict.reason, 'company_profile_field_conflict');

// Short responses retain the formal record and candidate audit required by
// the GAS bridge. Privacy-safe cover-only/provenance remains intentionally
// outside this assertion because it is not an authority input.
const short = hooks.buildBalancedShortResponsePayload({
  ok: true,
  mode: 'signalsFirstLight',
  url: 'https://fixture.invalid/',
  finalUrl: 'https://fixture.invalid/',
  status: 200,
  geoSignalsV1: {
    trustSignals: { operatorIdentityInfo: formal },
    operatorIdentityCandidateAuditV1: { version: 'operator_identity_candidate_audit_v1', siteMode: 'shop_facility' },
    observed: { links: {}, trustSignals: { operatorIdentityInfo: formal }, headings: {} },
    structuredData: {}, headings: {}, landmarks: {}, multimodalSignals: {}, aioCheck: {}
  },
  lightweightSummary: {},
  diagnostics: {},
  memoryHints: {}
});
assert.strictEqual(short.geoSignalsV1.trustSignals.operatorIdentityInfo.hasOperatorInfo, true);
assert.strictEqual(short.geoSignalsV1.operatorIdentityCandidateAuditV1.siteMode, 'shop_facility');

console.log(JSON.stringify({
  pass: true,
  fixture: 'shop_facility_operator_identity_contract_v1',
  cases: {
    boundedFacilityProbe: true,
    formalCompanyProfile: true,
    legalFallback: true,
    incompleteRemainsUnknown: true,
    fetchFailureRemainsUnknown: true,
    conflictRemainsUnknown: true,
    shortTransportRetainsFormalRecord: true,
    ecAndMediaUnchanged: true
  }
}));
