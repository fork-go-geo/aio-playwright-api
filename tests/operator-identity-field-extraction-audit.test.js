const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

function extract(html) {
  return hooks.extractOperatorIdentityInfoFromHtml_(html, 'https://fixture.invalid/company/', {
    highConfidenceCompanyProfile: true,
    title: '匿名組織｜会社概要',
    h1Texts: ['会社概要']
  });
}
function field(info, name) { return info.operatorIdentityFieldExtractionAuditV1.fields[name]; }

const complete = extract('<table><tr><th>会社名</th><td>匿名株式会社</td></tr><tr><th>所在地</th><td>東京都匿名区1-1</td></tr><tr><th>TEL</th><td>03-0000-0000</td></tr></table>');
assert.strictEqual(complete.hasCompanyName, true);
assert.strictEqual(complete.hasTelephone, true);
assert.strictEqual(field(complete, 'companyName').accepted, true);
assert.strictEqual(field(complete, 'companyName').acceptedSourceType, 'table');
assert.strictEqual(field(complete, 'telephone').accepted, true);
assert.strictEqual(field(complete, 'telephone').acceptedLabel, 'TEL');

const houjin = extract('<table><tr><th>法人名</th><td>匿名一般社団法人</td></tr><tr><th>所在地</th><td>東京都匿名区1-1</td></tr><tr><th>電話番号</th><td>03-0000-0000</td></tr></table>');
assert.strictEqual(houjin.hasCompanyName, false);
assert.strictEqual(field(houjin, 'companyName').summary.evidenceSeen, true);
assert.strictEqual(field(houjin, 'companyName').summary.matchedCandidateSeen, false);
assert.strictEqual(field(houjin, 'companyName').summary.finalFailureReason, 'label_not_matched');
assert.strictEqual(field(houjin, 'companyName').candidates[0].rawLabel, '法人名');

const name = extract('<dl><dt>名称</dt><dd>匿名株式会社</dd><dt>所在地</dt><dd>東京都匿名区1-1</dd><dt>電話番号</dt><dd>03-0000-0000</dd></dl>');
assert.strictEqual(name.hasCompanyName, true);
assert.strictEqual(field(name, 'companyName').summary.matchedCandidateSeen, true);
assert.strictEqual(field(name, 'companyName').accepted, true);
assert.strictEqual(field(name, 'companyName').summary.finalFailureReason, null);
assert.strictEqual(field(name, 'companyName').candidates[0].rawLabel, '名称');

const emptyName = extract('<dl><dt>名称</dt><dd></dd><dt>所在地</dt><dd>東京都匿名区1-1</dd><dt>電話番号</dt><dd>03-0000-0000</dd></dl>');
assert.strictEqual(emptyName.hasCompanyName, false);

const invalidStructuredName = extract('<dl><dt>名前</dt><dd>匿名組織名</dd><dt>本社所在地</dt><dd>東京都匿名区1-1</dd><dt>電話番号</dt><dd>03-0000-0000</dd></dl>');
assert.strictEqual(invalidStructuredName.hasCompanyName, false);

const unrelated = extract('<table><tr><th>担当部署</th><td>匿名部</td></tr><tr><th>所在地</th><td>東京都匿名区1-1</td></tr><th>電話番号</th><td>03-0000-0000</td></table>');
assert.strictEqual(field(unrelated, 'companyName').summary.finalFailureReason, 'label_not_matched');

const telLabel = extract('<table><tr><th>会社名</th><td>匿名株式会社</td></tr><tr><th>所在地</th><td>東京都匿名区1-1</td></tr><tr><th>電話番号</th><td>03-0000-0000</td></tr></table>');
assert.strictEqual(field(telLabel, 'telephone').accepted, true);
assert.strictEqual(field(telLabel, 'telephone').acceptedLabel, '電話番号');

const telUnmatched = extract('<table><tr><th>会社名</th><td>匿名株式会社</td></tr><tr><th>所在地</th><td>東京都匿名区1-1</td></tr><tr><th>代表回線</th><td>03-0000-0000</td></tr></table>');
assert.strictEqual(telUnmatched.hasTelephone, false);
assert.strictEqual(field(telUnmatched, 'telephone').summary.finalFailureReason, 'label_not_matched');

const telLink = extract('<section><h2>所在地</h2><p>東京都匿名区1-1</p><a href="tel:03-0000-0000">連絡</a></section><table><tr><th>会社名</th><td>匿名株式会社</td></tr><tr><th>所在地</th><td>東京都匿名区1-1</td></tr></table>');
assert.strictEqual(telLink.hasTelephone, true);
assert.strictEqual(field(telLink, 'telephone').accepted, true);
assert.strictEqual(field(telLink, 'telephone').acceptedSourceType, 'tel_link');

const invalidTel = extract('<table><tr><th>会社名</th><td>匿名株式会社</td></tr><tr><th>所在地</th><td>東京都匿名区1-1</td></tr><tr><th>TEL</th><td>000</td></tr></table>');
assert.strictEqual(invalidTel.hasTelephone, false);
assert.strictEqual(field(invalidTel, 'telephone').summary.matchedCandidateSeen, true);
assert.strictEqual(field(invalidTel, 'telephone').summary.finalFailureReason, 'format_invalid');

// Audit construction is observational: this is the pre-instrumentation
// identity contract for the representative complete case.
const completeParity = Object.assign({}, complete); delete completeParity.operatorIdentityFieldExtractionAuditV1;
assert.deepStrictEqual(completeParity, {
  observed:true, pageType:'company_profile', sourceType:'company_profile', sourceUrl:'https://fixture.invalid/company/',
  companyName:'匿名株式会社', operatorName:'匿名株式会社', address:'東京都匿名区1-1', telephone:'03-0000-0000',
  hasCompanyName:true, hasOperatorName:true, hasAddress:true, hasTelephone:true, hasOperatorInfo:true,
  extractionMethod:'html_text', evidenceLabels:['会社名','所在地','TEL']
});
const missingParity = Object.assign({}, houjin); delete missingParity.operatorIdentityFieldExtractionAuditV1;
assert.strictEqual(missingParity.hasCompanyName, false);
assert.strictEqual(missingParity.hasAddress, true);
assert.strictEqual(missingParity.hasTelephone, true);
assert.strictEqual(missingParity.hasOperatorInfo, false);

console.log(JSON.stringify({ pass: true, cases: 11, bounded: Object.values(complete.operatorIdentityFieldExtractionAuditV1.fields).every(item => item.candidates.length <= 5) }));
