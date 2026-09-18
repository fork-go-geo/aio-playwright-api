const assert = require('assert');
const {
  parseSubpageJsonLdLightHtml,
  compactSubpageJsonLdObservation_,
  buildOperatorIdentityInfoFromObservedCompanyProfiles_,
} = require('../index.js').__lightBudgetTestHooks;

function observedProfile(url, html, title = '会社概要') {
  const parsed = parseSubpageJsonLdLightHtml(url, url, 200, html, 'corporate');
  const compact = compactSubpageJsonLdObservation_(parsed);
  assert.ok(compact.operatorIdentityInfo, 'existing subpage producer must retain the candidate');
  return compact;
}

function resolve(pages) {
  return buildOperatorIdentityInfoFromObservedCompanyProfiles_(pages);
}

const full = observedProfile('https://example.test/company/profile/', `
  <title>会社概要</title><h1>会社概要</h1>
  <table><tr><th>会社名</th><td>Example株式会社</td></tr>
  <tr><th>所在地</th><td>〒100-0001 東京都千代田区1-1</td></tr>
  <tr><th>電話番号</th><td>03-1234-5678</td></tr></table>`);
const fullResult = resolve([full]);
assert.equal(fullResult.record.hasOperatorInfo, true);
assert.equal(fullResult.record.companyName, 'Example株式会社');
assert.equal(fullResult.record.authority, 'cloud_run_geoSignalsV1_trustSignals_operator_identity_v1');

// Existing, same-scope coverage pages may contribute different explicitly
// labelled fields. No extra crawl or raw contact signal is used.
const distributedName = observedProfile('https://example.test/about_site/company/', `
  <title>当サイトについて</title><h1>当サイトについて</h1>
  <table><tr><th>運営会社</th><td>Example株式会社</td></tr></table>`);
const distributedNap = observedProfile('https://example.test/about_site/profile/', `
  <title>当サイトについて</title><h1>当サイトについて</h1>
  <table><tr><th>所在地</th><td>〒100-0001 東京都千代田区1-1</td></tr>
  <tr><th>電話番号</th><td>03-1234-5678</td></tr></table>`);
const distributedResult = resolve([distributedName, distributedNap]);
assert.equal(distributedResult.record.hasOperatorInfo, true);
assert.equal(distributedResult.record.provenance.sourceUrls.length, 2);

const nameOnly = resolve([distributedName]);
assert.equal(nameOnly.record, null);
assert.equal(nameOnly.reason, 'company_profile_required_fields_missing');

const nameAddress = observedProfile('https://example.test/about_site/address/', `
  <title>当サイトについて</title><h1>当サイトについて</h1>
  <table><tr><th>運営会社</th><td>Example株式会社</td></tr>
  <tr><th>所在地</th><td>〒100-0001 東京都千代田区1-1</td></tr></table>`);
const nameAddressResult = resolve([nameAddress]);
assert.equal(nameAddressResult.record.hasOperatorInfo, true);
assert.equal(nameAddressResult.record.hasTelephone, false);
assert.equal(nameAddressResult.record.telephone, '');

const associationNameAddress = observedProfile('https://example.test/about_site/association/', `
  <title>当サイトについて</title><h1>当サイトについて</h1>
  <dl><dt>名称</dt><dd>匿名一般社団法人</dd><dt>所在地</dt><dd>〒100-0001 東京都千代田区1-1</dd></dl>`);
const associationResult = resolve([associationNameAddress]);
assert.equal(associationResult.record.hasOperatorInfo, true);
assert.equal(associationResult.record.hasTelephone, false);

const conflicting = observedProfile('https://example.test/about_site/other/', `
  <title>当サイトについて</title><h1>当サイトについて</h1>
  <table><tr><th>運営会社</th><td>Other株式会社</td></tr>
  <tr><th>所在地</th><td>〒100-0001 東京都千代田区1-1</td></tr>
  <tr><th>電話番号</th><td>03-1234-5678</td></tr></table>`);
const conflictResult = resolve([distributedName, distributedNap, conflicting]);
assert.equal(conflictResult.record, null);
assert.equal(conflictResult.reason, 'company_profile_field_conflict');

// Covez-equivalent: a same-origin "about this site" scope carries the named
// operator on one existing page and NAP fields on another existing page.
assert.equal(distributedResult.record.companyName, 'Example株式会社');
assert.equal(distributedResult.record.address, '〒100-0001 東京都千代田区1-1');
assert.equal(distributedResult.record.telephone, '03-1234-5678');

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_producer_v1',
  cases: {
    completeCompanyProfile: !!fullResult.record,
    distributedSameScope: !!distributedResult.record,
    companyNameOnlyRejected: nameOnly.record === null,
    companyNameAddressWithoutTelephoneAccepted: !!nameAddressResult.record,
    associationNameAddressWithoutTelephoneAccepted: !!associationResult.record,
    sourceConflictRejected: conflictResult.record === null,
    normalExistingProfileRegression: !!fullResult.record,
    covezEquivalent: !!distributedResult.record,
  }
}, null, 2));
