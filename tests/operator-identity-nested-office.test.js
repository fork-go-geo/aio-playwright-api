const assert=require('node:assert/strict');const h=require('../index.js').__lightBudgetTestHooks;
const url='https://operator.fixture.invalid/company/profile';
const html='<h1>会社概要</h1><table><tr><th>会社商号</th><td>架空株式会社</td></tr><tr><th>事業所</th><td><dl><dt>東京オフィス</dt><dd>〒100-0001 東京都千代田区1-2-3<br><a href="/map">アクセスマップ</a></dd><dt>大阪オフィス</dt><dd>大阪府大阪市1-2-3</dd></dl></td></tr></table>';
const get=text=>h.extractOperatorIdentityInfoFromHtml_(text,url,{highConfidenceCompanyProfile:true});const a=get(html);
assert.equal(a.hasOperatorInfo,true);assert.equal(a.companyName,'架空株式会社');assert.equal(a.address,'〒100-0001 東京都千代田区1-2-3');assert(a.evidenceLabels.includes('事業所（東京オフィス）'));assert.equal(a.operatorIdentityFieldExtractionAuditV1.fields.address.acceptedSourceType,'structured_office');
for(const text of [html.replace('事業所','取引先'),html.replace('会社商号','商品名'),html.replaceAll('オフィス','展示会'),html.replace(/<dd>.*?<\/dd>/g,'<dd>お問い合わせください</dd>')])assert.equal(get(text).hasOperatorInfo,false);
console.log('company legal-name alias and bounded named-office addresses passed; unrelated locations rejected');
