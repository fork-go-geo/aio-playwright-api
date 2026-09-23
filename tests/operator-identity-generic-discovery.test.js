const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const {
  evaluateBoundedOperatorIdentityProbeCandidate_,
  selectOperatorIdentityProbeCandidate_,
  extractOperatorIdentityInfoFromHtml_,
  extractLegalOperatorInfoFromHtml_,
  normalizeOperatorIdentityInfo_,
  attachOperatorIdentityProbeProvenance_,
  buildOperatorIdentityInfoFromObservedCompanyProfiles_,
  buildOperatorIdentityObservationV1_,
} = hooks;

const profileHtml = `
  <table>
    <tr><th>会社名</th><td>ダミー運営株式会社</td></tr>
    <tr><th>所在地</th><td>〒100-0001 東京都千代田区丸の内1-1</td></tr>
    <tr><th>電話番号</th><td>03-1234-5678</td></tr>
  </table>`;

function candidate(url, label, sources) {
  return { url, label, sources, score: 40 };
}

// A rendered global-navigation/footer label may authorize one bounded probe
// without sitemap corroboration. The structured profile fields still create
// the formal record; the link alone cannot do so.
const footerCompany = candidate('https://fixture.example.test/about-us/', '運営会社', ['footer']);
assert.strictEqual(evaluateBoundedOperatorIdentityProbeCandidate_(footerCompany).probeTier, 'human_labeled_company_profile');
assert.strictEqual(selectOperatorIdentityProbeCandidate_([footerCompany], 'saas').url, footerCompany.url);
const profile = extractOperatorIdentityInfoFromHtml_(profileHtml, footerCompany.url, { highConfidenceCompanyProfile: true });
assert.strictEqual(profile.hasOperatorInfo, true);
const formalProfile = attachOperatorIdentityProbeProvenance_(normalizeOperatorIdentityInfo_(profile, 'company_profile'), Object.assign({}, footerCompany, {
  operatorIdentityProbeSourceType: 'company_profile'
}));
assert.strictEqual(formalProfile.hasCompanyName, true);
assert.strictEqual(formalProfile.hasAddress, true);
assert.strictEqual(formalProfile.authority, 'cloud_run_geoSignalsV1_trustSignals_operator_identity_v1');
assert.strictEqual(formalProfile.provenance.scope, 'company_profile_page');

// Nav, English Company/About/Operator, and legal-notice links use the same
// bounded discovery lane. They do not become positive until extraction meets
// their existing respective formal-record contract.
for (const item of [
  candidate('https://fixture.example.test/company/', '会社情報', ['nav']),
  candidate('https://fixture.example.test/about/', 'Company', ['nav']),
  candidate('https://fixture.example.test/operator/', 'Operator', ['footer']),
]) {
  assert.strictEqual(selectOperatorIdentityProbeCandidate_([item], 'corporate').url, item.url);
}
const legalCandidate = candidate('https://fixture.example.test/legal-notice/', '特定商取引法に基づく表記', ['footer']);
const legalSelection = selectOperatorIdentityProbeCandidate_([legalCandidate], 'saas');
assert.strictEqual(legalSelection.operatorIdentityProbeSourceType, 'legal');
const legal = extractLegalOperatorInfoFromHtml_(
  '<dl><dt>所在地</dt><dd>東京都千代田区丸の内1-1</dd><dt>電話番号</dt><dd>03-1234-5678</dd></dl>',
  legalCandidate.url
);
assert.strictEqual(legal.hasOperatorInfo, true);
const formalLegal = attachOperatorIdentityProbeProvenance_(normalizeOperatorIdentityInfo_(legal, 'legal'), legalSelection);
assert.strictEqual(formalLegal.provenance.scope, 'legal_operator_page');

// Partial and conflicting information remain non-positive/unknown; discovery
// never promotes a brand name, incomplete fetch, or conflicting profile data.
const namePhoneOnly = extractOperatorIdentityInfoFromHtml_(
  '<table><tr><th>会社名</th><td>ダミー運営株式会社</td></tr><tr><th>電話番号</th><td>03-1234-5678</td></tr></table>',
  footerCompany.url,
  { highConfidenceCompanyProfile: true }
);
assert.strictEqual(namePhoneOnly.hasOperatorInfo, false);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([], 'saas'), null);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([footerCompany], 'shop_facility'), null);
const incomplete = buildOperatorIdentityObservationV1_(null, {
  attempted: true, observationComplete: false, sourceUrl: footerCompany.url, reason: 'timeout'
}, { siteMode: 'saas', candidates: [footerCompany], discoveryComplete: true });
assert.strictEqual(incomplete.signalState, 'false');
assert.strictEqual(incomplete.scopeComplete, false);
const conflict = buildOperatorIdentityInfoFromObservedCompanyProfiles_([
  { operatorIdentityInfo: Object.assign({}, profile, { scope: 'company_profile_page', scopeKey: 'company' }) },
  { operatorIdentityInfo: Object.assign({}, profile, { companyName: '別のダミー株式会社', scope: 'company_profile_page', scopeKey: 'company' }) },
]);
assert.strictEqual(conflict.record, null);
assert.strictEqual(conflict.reason, 'company_profile_field_conflict');

console.log('operator identity generic discovery fixtures: PASS');
