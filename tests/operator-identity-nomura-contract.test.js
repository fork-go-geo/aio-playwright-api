const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

function observedProfile(url, html, title = '会社概要') {
  const parsed = hooks.parseSubpageJsonLdLightHtml(url, url, 200, html, 'corporate');
  return hooks.compactSubpageJsonLdObservation_(parsed);
}

// A: A formal company-profile table can use an address section's explicit
// tel: link for its representative number.
const nomuraLike = observedProfile('https://example.test/introduc/company/', `
  <title>会社概要｜会社情報</title><h1>会社概要</h1>
  <table>
    <tr><th>会社名</th><td>野村證券株式会社</td></tr>
    <tr><th>本店所在地</th><td>東京都中央区日本橋1-13-1</td></tr>
  </table>
  <section><h2>本社所在地</h2><dl><dt>大手町本社</dt>
    <dd>〒100-8130 東京都千代田区大手町2-2-2<a href="tel:0332111811">03-3211-1811</a></dd>
  </dl></section>`);
assert.deepStrictEqual(
  [nomuraLike.operatorIdentityInfo.companyName, nomuraLike.operatorIdentityInfo.address, nomuraLike.operatorIdentityInfo.telephone],
  ['野村證券株式会社', '東京都中央区日本橋1-13-1', '0332111811']
);
assert.strictEqual(nomuraLike.operatorIdentityInfo.hasOperatorInfo, true);
const nomuraRecord = hooks.buildOperatorIdentityInfoFromObservedCompanyProfiles_([nomuraLike]);
assert.ok(nomuraRecord.record);
assert.strictEqual(nomuraRecord.record.hasOperatorInfo, true);
assert.strictEqual(nomuraRecord.record.authority, 'cloud_run_geoSignalsV1_trustSignals_operator_identity_v1');

// B: A selected company profile identifies its operator from name + address;
// telephone remains optional supporting evidence.
const noTelephone = observedProfile('https://example.test/company/', `
  <title>会社概要</title><h1>会社概要</h1>
  <table><tr><th>会社名</th><td>Example株式会社</td></tr>
  <tr><th>所在地</th><td>東京都千代田区1-1</td></tr></table>`);
assert.strictEqual(noTelephone.operatorIdentityInfo.hasOperatorInfo, true);
assert.ok(hooks.buildOperatorIdentityInfoFromObservedCompanyProfiles_([noTelephone]).record);

// C: A support/footer tel: link without an address section never qualifies.
const footerTelephone = observedProfile('https://example.test/company/', `
  <title>会社概要</title><h1>会社概要</h1>
  <table><tr><th>会社名</th><td>Example株式会社</td></tr>
  <tr><th>所在地</th><td>東京都千代田区1-1</td></tr></table>
  <footer><a href="tel:0312345678">サポート窓口</a></footer>`);
assert.strictEqual(footerTelephone.operatorIdentityInfo.telephone, '');
assert.strictEqual(footerTelephone.operatorIdentityInfo.hasOperatorInfo, true);

// D: Conflicting complete records, including competing telephone values,
// cannot become a positive identity.
const conflictingTelephone = observedProfile('https://example.test/company/other/', `
  <title>会社概要</title><h1>会社概要</h1>
  <table><tr><th>会社名</th><td>野村證券株式会社</td></tr>
  <tr><th>所在地</th><td>東京都中央区日本橋1-13-1</td></tr>
  <tr><th>電話番号</th><td>03-9876-5432</td></tr></table>`);
assert.strictEqual(hooks.buildOperatorIdentityInfoFromObservedCompanyProfiles_([nomuraLike, conflictingTelephone]).record, null);

// E: Cover-only is a canonical, privacy-safe observation and is not a
// formal identity record.
const partialCover = hooks.buildOperatorIdentityObservationV1_(noTelephone.operatorIdentityInfo, {
  attempted: true, observationComplete: true, sourceUrl: 'https://example.test/company/', reason: 'company_profile_fetched'
}, { siteMode: 'corporate', candidates: [{ url: 'https://example.test/company/' }], discoveryComplete: true });
assert.strictEqual(partialCover.authority, 'geoSignalsV1_operator_identity_v1');
assert.strictEqual(partialCover.signalState, 'true');
assert.strictEqual(partialCover.strongEvidenceCount, 2);
assert.strictEqual(Object.prototype.hasOwnProperty.call(partialCover, 'companyName'), false);

// F: The existing non-applicable mode contract remains fail-closed.
const shopCover = hooks.buildOperatorIdentityObservationV1_(null, {}, { siteMode: 'shop_facility', candidates: [], discoveryComplete: true });
assert.strictEqual(shopCover.applicability, 'not_applicable');
assert.strictEqual(shopCover.signalState, 'unknown');

// Discovery: a sitemap-only company detail inherits a label only from an
// explicit same-origin company-information navigation hub.
const nomuraDiscovery = [
  { url: 'https://example.test/introduc/company/', label: '', source: 'sitemap', sources: ['sitemap'] },
  { url: 'https://example.test/introduc/', label: '会社情報', source: 'nav', sources: ['nav'] }
];
hooks.applyCompanyProfileHubCorroboration_(nomuraDiscovery);
assert.strictEqual(nomuraDiscovery[0].companyProfileHubCorroborated, true);
assert.strictEqual(hooks.isHighConfidenceCompanyProfileCandidate_(nomuraDiscovery[0]), true);

const genericDiscovery = [
  { url: 'https://example.test/about/company-profile/', label: '', source: 'sitemap', sources: ['sitemap'] },
  { url: 'https://example.test/about/', label: 'About Us', source: 'footer', sources: ['footer'] }
];
hooks.applyCompanyProfileHubCorroboration_(genericDiscovery);
assert.strictEqual(hooks.isHighConfidenceCompanyProfileCandidate_(genericDiscovery[0]), true);

for (const candidates of [
  [
    { url: 'https://example.test/recruit/company/', label: '', source: 'sitemap', sources: ['sitemap'] },
    { url: 'https://example.test/recruit/', label: '採用情報', source: 'nav', sources: ['nav'] }
  ],
  [
    { url: 'https://example.test/ir/company/news/', label: '', source: 'sitemap', sources: ['sitemap'] },
    { url: 'https://example.test/ir/', label: 'IR情報', source: 'footer', sources: ['footer'] }
  ]
]) {
  hooks.applyCompanyProfileHubCorroboration_(candidates);
  assert.strictEqual(candidates[0].companyProfileHubCorroborated, false);
  assert.strictEqual(hooks.isHighConfidenceCompanyProfileCandidate_(candidates[0]), false);
}

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_nomura_contract_v1',
  cases: {
    addressSectionTelAccepted: true,
    phoneOptionalProfileAccepted: true,
    unrelatedTelRejected: true,
    conflictRejected: true,
    coverOnlyCanonical: true,
    shopFacilityUnchanged: true,
    nomuraCompanyHubDiscovery: true,
    genericCompanyHubDiscovery: true,
    recruitmentAndIrRejected: true
  }
}, null, 2));
