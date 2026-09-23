const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const {
  collectExplicitCompanyProfileDetailLinksFromHtml_,
  selectExternalOperatorRootCompanyProfileDetailLink_,
  operatorIdentityFieldsConflict_,
  extractOperatorIdentityInfoFromHtml_,
  normalizeOperatorIdentityInfo_,
  attachOperatorIdentityProbeProvenance_,
  buildOperatorIdentityObservationV1_,
} = hooks;

const rootUrl = 'https://operator.example.test/';
const externalRootCandidate = {
  url: rootUrl,
  officialExternalOperatorProfile: true,
  operatorRelationLabel: '運営会社',
  operatorRelationSource: 'footer',
  operatorRelationSourceOrigin: 'https://service.example.test'
};
const rootHtml = `
  <nav>
    <a href="/company/profile.html">会社概要</a>
    <a href="/news/">News</a>
    <a href="/contact/">Contact</a>
  </nav>`;
const profileHtml = `
  <dl>
    <dt>社名</dt><dd>ダミー運営株式会社</dd>
    <dt>本社所在地</dt><dd>〒100-0001 東京都千代田区丸の内1-1<br>TEL: 03-1234-5678</dd>
  </dl>`;

// An explicit same-origin profile label produces exactly one bounded detail
// candidate, and its existing extractor/formal-record flow remains unchanged.
const links = collectExplicitCompanyProfileDetailLinksFromHtml_(rootHtml, rootUrl);
assert.strictEqual(links.length, 1);
assert.strictEqual(links[0].label, '会社概要');
assert.strictEqual(links[0].url, 'https://operator.example.test/company/profile.html');
const selected = selectExternalOperatorRootCompanyProfileDetailLink_(
  { ok: true, externalCompanyProfileDetailLinks: links }, externalRootCandidate, false
);
assert.strictEqual(selected.url, links[0].url);
const detail = extractOperatorIdentityInfoFromHtml_(profileHtml, selected.url, { highConfidenceCompanyProfile: true });
assert.strictEqual(detail.hasOperatorInfo, true);
const record = attachOperatorIdentityProbeProvenance_(normalizeOperatorIdentityInfo_(detail, 'company_profile'), externalRootCandidate);
assert.strictEqual(record.hasOperatorInfo, true);
assert.strictEqual(record.authority, 'cloud_run_geoSignalsV1_trustSignals_operator_identity_v1');

// A complete root does not schedule a detail probe.
assert.strictEqual(selectExternalOperatorRootCompanyProfileDetailLink_(
  { ok: true, externalCompanyProfileDetailLinks: links }, externalRootCandidate, true
), null);

// Incomplete roots without an explicit profile link, or with only unrelated
// links, remain unknown and never widen the bounded probe set.
assert.strictEqual(selectExternalOperatorRootCompanyProfileDetailLink_(
  { ok: true, externalCompanyProfileDetailLinks: [] }, externalRootCandidate, false
), null);
assert.deepStrictEqual(collectExplicitCompanyProfileDetailLinksFromHtml_(
  '<a href="/about/">About</a><a href="/news/">News</a><a href="/service/">Service</a><a href="/contact/">Contact</a>', rootUrl
), []);

// Cross-origin profile labels are never eligible, even with a strong label.
assert.deepStrictEqual(collectExplicitCompanyProfileDetailLinksFromHtml_(
  '<a href="https://other.example.test/company/profile.html">会社概要</a>', rootUrl
), []);

// More than one strong profile label remains bounded to the first candidate.
assert.strictEqual(collectExplicitCompanyProfileDetailLinksFromHtml_(
  '<a href="/company/profile.html">会社概要</a><a href="/corporate/profile.html">Company Profile</a>', rootUrl
).length, 1);

// A detail-fetch failure is still incomplete/unknown; it cannot become a
// positive formal record merely because discovery succeeded.
const failedDetail = buildOperatorIdentityObservationV1_(null, {
  attempted: true, observationComplete: false, sourceUrl: links[0].url, reason: 'company_profile_detail_fetch_failed'
}, { siteMode: 'saas', candidates: [externalRootCandidate], discoveryComplete: true });
assert.strictEqual(failedDetail.signalState, 'false');
assert.strictEqual(failedDetail.scopeComplete, false);

// Root/detail disagreement remains conflict rather than detail precedence.
assert.strictEqual(operatorIdentityFieldsConflict_(
  { companyName: 'ダミーA株式会社', address: '' },
  { companyName: 'ダミーB株式会社', address: '' }
), true);
assert.strictEqual(operatorIdentityFieldsConflict_(
  { companyName: '', address: '' }, detail
), false);

console.log('operator identity external root profile probe fixtures: PASS');
