const assert = require('assert');
const {
  buildShopFacilityOperatorRelationEvidence_,
  findShopFacilityCompanyProfileFromHub_,
  isShopFacilityOperatorRelationConfirmed_,
  selectOperatorIdentityProbeCandidate_,
  extractOperatorIdentityInfoFromHtml_,
  normalizeOperatorIdentityInfo_,
} = require('../index.js').__lightBudgetTestHooks;

const company = {
  url: 'https://example.test/corporate/company', label: '会社概要',
  sources: ['nav', 'footer'], score: 100,
};
const message = {
  url: 'https://example.test/corporate/message', label: '代表者挨拶',
  sources: ['nav', 'footer'], score: 100,
};
const access = {
  url: 'https://example.test/corporate/access', label: '本社アクセス',
  sources: ['nav', 'footer'], score: 100,
};
const rootEvidence = {
  observed: {
    title: { observed: true, value: '野村不動産が運営するスポーツジム' },
    metaDescription: { observed: true, value: '野村不動産ライフ＆スポーツが運営するメガロスです。' },
  },
};
const corporateRoute = {
  url: 'https://example.test/corporate/', label: '企業情報', sources: ['nav', 'footer'], score: 100,
};
const relation = buildShopFacilityOperatorRelationEvidence_(rootEvidence, { about: [corporateRoute] });
assert.strictEqual(relation.relationConfirmed, true);
assert.strictEqual(relation.sourceUrl, corporateRoute.url);
// This is the compact-sensitive runtime shape returned directly by the
// lightweight corporate-landing fetch, before generic observation compaction.
const landingPage = {
  ok: true,
  finalUrl: corporateRoute.url,
  internalLinks: [
    { href: message.url, text: '代表者挨拶', sources: ['nav'] },
    { href: access.url, text: '本社アクセス', sources: ['footer'] },
    { href: company.url, text: '会社概要', sources: ['nav'] },
    { href: company.url, text: '会社概要', sources: ['footer'] },
  ],
};
assert.strictEqual(findShopFacilityCompanyProfileFromHub_(landingPage, relation).url, company.url);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([message, access, company], 'shop_facility', { shopFacilityOperatorRelation: relation }).url, company.url);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([message, access], 'shop_facility', { shopFacilityOperatorRelation: relation }), null);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([company], 'shop_facility', { shopFacilityOperatorRelation: null }), null);

const raw = extractOperatorIdentityInfoFromHtml_(
  '<table><tr><th>商号</th><td>野村不動産ライフ＆スポーツ株式会社</td></tr><tr><th>本社</th><td>東京都中野区本町1-32-2 ハーモニータワー15階</td></tr></table>',
  company.url,
  { highConfidenceCompanyProfile: true, allowMissingTelephone: true, title: '会社概要', h1Texts: ['会社概要'] }
);
const operator = normalizeOperatorIdentityInfo_(raw, 'company_profile');
assert.strictEqual(operator.hasOperatorInfo, true);
assert.strictEqual(operator.telephone, '');
assert.strictEqual(isShopFacilityOperatorRelationConfirmed_(relation, operator), true);
assert.strictEqual(isShopFacilityOperatorRelationConfirmed_(Object.assign({}, relation, { declaredOperator: '第三者株式会社' }), operator), false);

const linkOnly = buildShopFacilityOperatorRelationEvidence_(
  { observed: { title: { observed: true, value: 'スポーツジム メガロス' }, metaDescription: { observed: true, value: '店舗情報です。' } } },
  { about: [corporateRoute] }
);
assert.strictEqual(linkOnly.relationConfirmed, false);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([company], 'shop_facility', { shopFacilityOperatorRelation: linkOnly }), null);

const incomplete = buildShopFacilityOperatorRelationEvidence_(
  { observed: { title: { observed: true, value: '野村不動産が運営するスポーツジム' }, metaDescription: { observed: false, value: '' } } },
  { about: [corporateRoute] }
);
assert.strictEqual(incomplete.observed, false);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([company], 'shop_facility', { shopFacilityOperatorRelation: incomplete }), null);

assert.strictEqual(selectOperatorIdentityProbeCandidate_([company], 'corporate').url, company.url);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([company], 'generic'), null);

console.log('shop facility operator relation fixtures: PASS');
