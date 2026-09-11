const assert = require('assert');
const {
  extractOperatorIdentityInfoFromHtml_,
  extractLegalOperatorInfoFromHtml_,
  isHighConfidenceCompanyProfileCandidate_,
  selectOperatorIdentityProbeCandidate_,
  buildLightCoverageObservationPlan_,
} = require('../index.js').__lightBudgetTestHooks;

const asuzacUrl = 'https://asuzac-space.jp/aboutus/summary.htm';
const asuzacCandidate = {
  url: asuzacUrl,
  label: 'アルミ事業部紹介',
  sources: ['sitemap', 'footer'],
  score: 33,
};
const asuzacHtml = `
  <table>
    <tr><th>会社名</th><td>アスザック株式会社</td></tr>
    <tr><th>所在地</th><td>〒382-8508 長野県上高井郡高山村大字中山981</td></tr>
    <tr><th>電話</th><td>026-245-1001</td></tr>
    <tr><th>FAX</th><td>026-248-4525</td></tr>
  </table>`;
const koiwaiUrl = 'https://www.koiwaimilk.com/company/profile/';
const koiwaiCandidate = {
  url: koiwaiUrl,
  label: '会社概要・アクセス',
  sources: ['htmlSitemap', 'nav', 'footer'],
  score: 100,
};
const koiwaiHtml = `
  <table>
    <tr><th>商号</th><td>小岩井乳業株式会社<br>KOIWAI DAIRY PRODUCTS CO., LTD.</td></tr>
    <tr><th>本社事務所</th><td>〒164-0001 東京都中野区中野4-10-2<br>中野セントラルパークサウス<br>（登記上住所は、〒100-0005 東京都千代田区丸の内2-5-2）<br>TEL：03-5913-2830</td></tr>
  </table>`;

// Case 1: the company-profile probe is independent of the normal two-page plan.
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_(asuzacCandidate), true);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([asuzacCandidate], 'generic').url, asuzacUrl);
const asuzacInfo = extractOperatorIdentityInfoFromHtml_(asuzacHtml, asuzacUrl, { highConfidenceCompanyProfile: true });
assert.deepStrictEqual(
  [asuzacInfo.companyName, asuzacInfo.address, asuzacInfo.telephone, asuzacInfo.hasOperatorInfo],
  ['アスザック株式会社', '〒382-8508 長野県上高井郡高山村大字中山981', '026-245-1001', true]
);
assert.deepStrictEqual(asuzacInfo.evidenceLabels, ['会社名', '所在地', '電話']);

// HTML sitemap corroboration is valid only alongside independent human-facing
// navigation.  It lets a conventional company/profile page qualify without
// turning sitemap-only URLs into probes.
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_(koiwaiCandidate), true);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([koiwaiCandidate], 'generic').url, koiwaiUrl);
assert.strictEqual(selectOperatorIdentityProbeCandidate_([
  { url: 'https://www.koiwaimilk.com/company/', label: '企業情報', sources: ['htmlSitemap', 'nav', 'footer'], score: 100 },
  koiwaiCandidate,
], 'generic').url, koiwaiUrl);
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_({
  url: koiwaiUrl, label: '会社概要・アクセス', sources: ['htmlSitemap'], score: 100,
}), false);
const koiwaiInfo = extractOperatorIdentityInfoFromHtml_(koiwaiHtml, koiwaiUrl, { highConfidenceCompanyProfile: true });
assert.deepStrictEqual(
  [koiwaiInfo.companyName, koiwaiInfo.address, koiwaiInfo.telephone, koiwaiInfo.hasOperatorInfo],
  ['小岩井乳業株式会社', '〒164-0001 東京都中野区中野4-10-2 中野セントラルパークサウス', '03-5913-2830', true]
);
assert.deepStrictEqual(koiwaiInfo.evidenceLabels, ['商号', '本社事務所', 'TEL']);

// Telephone recognition is restricted to a structured field label, not prose
// that happens to contain the word "電話".
for (const [label, value] of [
  ['電話番号', '03-1234-5678'],
  ['TEL', '03-1234-5678'],
]) {
  const info = extractOperatorIdentityInfoFromHtml_(
    `<table><tr><th>会社名</th><td>Example Co.</td></tr><tr><th>所在地</th><td>東京都千代田区1-1</td></tr><tr><th>${label}</th><td>${value}</td></tr></table>`,
    'https://example.test/company/',
    { highConfidenceCompanyProfile: true }
  );
  assert.strictEqual(info.telephone, value, label);
  assert.strictEqual(info.hasOperatorInfo, true, label);
}
for (const label of ['電話受付時間', '電話対応時間', '電話番号変更のお知らせ']) {
  const info = extractOperatorIdentityInfoFromHtml_(
    `<table><tr><th>会社名</th><td>Example Co.</td></tr><tr><th>所在地</th><td>東京都千代田区1-1</td></tr><tr><th>${label}</th><td>03-1234-5678</td></tr></table>`,
    'https://example.test/company/',
    { highConfidenceCompanyProfile: true }
  );
  assert.strictEqual(info.telephone, '', label);
  assert.strictEqual(info.hasOperatorInfo, false, label);
}
const proseOnly = extractOperatorIdentityInfoFromHtml_('<p>お問い合わせはお電話ください（03-1234-5678）。</p>', 'https://example.test/company/', { highConfidenceCompanyProfile: true });
assert.strictEqual(proseOnly.telephone, '');
const telProseOnly = extractOperatorIdentityInfoFromHtml_('<p>TELはこちら：03-1234-5678</p>', 'https://example.test/company/', { highConfidenceCompanyProfile: true });
assert.strictEqual(telProseOnly.telephone, '');
for (const [label, value] of [
  ['商号変更のお知らせ', 'Example Co.'],
  ['本社事務所へのアクセス', '東京都千代田区1-1'],
]) {
  const info = extractOperatorIdentityInfoFromHtml_(
    `<table><tr><th>${label}</th><td>${value}</td></tr><tr><th>TEL受付時間</th><td>03-1234-5678</td></tr></table>`,
    'https://example.test/company/',
    { highConfidenceCompanyProfile: true }
  );
  assert.strictEqual(info.companyName, '', label);
  assert.strictEqual(info.address, '', label);
  assert.strictEqual(info.hasOperatorInfo, false, label);
}
const bareNumberInAddress = extractOperatorIdentityInfoFromHtml_(
  '<table><tr><th>商号</th><td>Example Co.</td></tr><tr><th>本社事務所</th><td>東京都千代田区1-1 03-1234-5678</td></tr></table>',
  'https://example.test/company/',
  { highConfidenceCompanyProfile: true }
);
assert.strictEqual(bareNumberInAddress.telephone, '');
const normalPlan = buildLightCoverageObservationPlan_([
  { url: 'https://asuzac-space.jp/business/index.htm', category: 'business', score: 100 },
  { url: 'https://asuzac-space.jp/contact/form.htm', category: 'contact', score: 100 },
  asuzacCandidate,
], { siteMode: 'generic', maxObserve: 2 });
assert.deepStrictEqual(normalPlan.candidates.map((candidate) => candidate.url), [
  'https://asuzac-space.jp/business/index.htm',
  'https://asuzac-space.jp/contact/form.htm',
]);

// Case 2: a fetched about page without the complete identity remains non-positive.
const conceptInfo = extractOperatorIdentityInfoFromHtml_('<h1>私たちについて</h1><p>ブランドのコンセプトです。</p>', 'https://example.test/about/', { highConfidenceCompanyProfile: true });
assert.strictEqual(conceptInfo.hasOperatorInfo, false);

// Case 3: a path alone cannot qualify a company-profile probe.
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_({
  url: 'https://example.test/aboutus/summary.htm', label: 'About', sources: ['sitemap'], score: 99,
}), false);
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_({
  url: 'https://example.test/company/news/', label: '会社ニュース', sources: ['htmlSitemap', 'nav', 'footer'], score: 100,
}), false);
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_({
  url: 'https://example.test/profile/', label: '著者プロフィール', sources: ['htmlSitemap', 'nav'], score: 100,
}), false);
assert.strictEqual(isHighConfidenceCompanyProfileCandidate_({
  url: 'https://example.test/about/', label: '私たちについて', sources: ['htmlSitemap', 'footer'], score: 100,
}), false);

// Case 4: the legacy legal contract remains address + telephone based.
const legalInfo = extractLegalOperatorInfoFromHtml_('<table><tr><th>所在地</th><td>東京都千代田区1-1</td></tr><tr><th>電話番号</th><td>03-1234-5678</td></tr></table>', 'https://example.test/legal/notice.htm');
assert.strictEqual(legalInfo.hasOperatorInfo, true);
assert.strictEqual(legalInfo.sourceType, 'legal');

// Case 5: the independent probe is limited to corporate/generic site modes.
for (const siteMode of ['shop', 'shop_facility', 'media', 'saas', 'ec']) {
  assert.strictEqual(selectOperatorIdentityProbeCandidate_([asuzacCandidate], siteMode), null, siteMode);
}

// Case 6: company-profile evidence requires a legal entity name in addition to address and phone.
const nameless = extractOperatorIdentityInfoFromHtml_('<table><tr><th>所在地</th><td>東京都千代田区1-1</td></tr><tr><th>TEL</th><td>03-1234-5678</td></tr></table>', 'https://example.test/company/', { highConfidenceCompanyProfile: true });
assert.strictEqual(nameless.hasOperatorInfo, false);

console.log('operator identity observation fixtures: PASS');
