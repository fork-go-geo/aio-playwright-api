const assert = require('assert');
const {
  isHighConfidenceCompanyProfileCandidate_, selectOperatorIdentityProbeCandidate_,
  extractOperatorIdentityInfoFromHtml_, normalizeOperatorIdentityInfo_, buildOperatorIdentityObservationV1_,
} = require('../index.js').__lightBudgetTestHooks;

const company = { url: 'https://example.test/corporate/company/', label: '会社概要', sources: ['nav', 'footer'], score: 100 };
const message = { url: 'https://example.test/corporate/message/', label: '代表者挨拶', sources: ['nav', 'footer'], score: 100 };
const access = { url: 'https://example.test/corporate/access/', label: '本社・事業所アクセス', sources: ['nav', 'footer'], score: 100 };

assert.strictEqual(isHighConfidenceCompanyProfileCandidate_(company), true);
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_(message), false);
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_(access), false);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([message, access, company], 'corporate').url, company.url);
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_({ url: 'https://example.test/company/', label: '', sources: ['nav', 'footer'], score: 100 }), false);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([message], 'corporate'), null);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([access], 'corporate'), null);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([company], 'generic'), null);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([company], 'shop_facility'), null);

const raw = extractOperatorIdentityInfoFromHtml_(
  '<table><tr><th>商号</th><td>野村不動産ライフ＆スポーツ株式会社</td></tr><tr><th>本社所在地</th><td>東京都中野区本町1-32-2 ハーモニータワー15階</td></tr><tr><th>代表取締役社長</th><td>石井康裕</td></tr></table>', company.url,
  { highConfidenceCompanyProfile: true, allowMissingTelephone: true, title: '会社概要', h1Texts: ['会社概要'] }
);
const info = normalizeOperatorIdentityInfo_(raw, 'company_profile');
assert.deepStrictEqual([info.companyName, info.address, info.telephone, info.hasOperatorInfo], ['野村不動産ライフ＆スポーツ株式会社', '東京都中野区本町1-32-2 ハーモニータワー15階', '', true]);
const probe = { attempted: true, observationComplete: true, sourceUrl: company.url, sourceType: 'company_profile' };
const observation = buildOperatorIdentityObservationV1_(info, probe, { totalCandidates: 3 }, 'corporate');
assert.deepStrictEqual([observation.authority, observation.version, observation.signalState, observation.inputObserved, observation.scopeComplete, observation.discovery.candidateCount, observation.discovery.selectedCount], ['geoSignalsV1_operator_identity_v1', 1, 'true', true, true, 3, 1]);
assert.strictEqual(observation.evidence.every(row => !/野村|中野区|石井/.test(JSON.stringify(row))), true);
assert.strictEqual(buildOperatorIdentityObservationV1_(null, probe, { totalCandidates: 3 }, 'corporate'), null);
assert.strictEqual(buildOperatorIdentityObservationV1_(info, Object.assign({}, probe, { observationComplete: false }), { totalCandidates: 3 }, 'corporate'), null);
assert.strictEqual(buildOperatorIdentityObservationV1_(info, probe, { totalCandidates: 3 }, 'shop_facility'), null);

console.log('corporate company profile priority fixtures: PASS');
