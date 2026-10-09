const assert = require('node:assert/strict');
const hooks = require('../index.js').__lightBudgetTestHooks;
const candidate = { url: 'https://fixture.invalid/company/', label: '会社概要' };

function profile(overrides = {}) {
  return Object.assign({
    observed: true, observationComplete: true, sourceType: 'company_profile', sourceUrl: candidate.url,
    scope: 'company_profile_page', scopeKey: 'https://fixture.invalid/company',
    companyName: '匿名運営株式会社', address: '架空県検証市1-2-3', telephone: '',
    hasCompanyName: true, hasAddress: true, hasTelephone: false, hasOperatorInfo: true,
    extractionMethod: 'html_text', evidenceLabels: ['会社名', '所在地']
  }, overrides);
}
function staticPage(overrides = {}) {
  return Object.assign({ url: candidate.url, finalUrl: candidate.url, status: 200, ok: true,
    operatorIdentityInfo: profile(), legalOperatorInfo: null }, overrides);
}
function renderedPage(overrides = {}) {
  return Object.assign({ url: candidate.url, finalUrl: candidate.url, status: 200, ok: true,
    observationMethod: 'playwright_light' }, overrides);
}
const aggregate = pages => hooks.buildOperatorIdentityInfoFromObservedCompanyProfiles_(pages);

assert.equal(aggregate([renderedPage()]).record, null);
const retained = hooks.retainSafeStaticFormalCoverageEvidence_(staticPage(), candidate);
assert.ok(retained);
const retainedResult = aggregate([renderedPage(), retained]);
assert.ok(retainedResult.record);
assert.equal(retainedResult.record.companyName, '匿名運営株式会社');
assert.ok(aggregate([staticPage()]).record);
assert.equal(hooks.retainSafeStaticFormalCoverageEvidence_(
  staticPage({ operatorIdentityInfo: profile({ hasOperatorInfo: false }) }), candidate
), null);
assert.equal(hooks.retainSafeStaticFormalCoverageEvidence_(staticPage({ ok: false }), candidate), null);
assert.equal(hooks.retainSafeStaticFormalCoverageEvidence_(
  staticPage({ operatorIdentityInfo: profile({ sourceUrl: 'https://fixture.invalid/other/' }) }), candidate
), null);
assert.equal(hooks.retainSafeStaticFormalCoverageEvidence_(staticPage(), { url: 'https://fixture.invalid/other/' }), null);
const conflicting = renderedPage({ operatorIdentityInfo: profile({ companyName: '別の匿名運営株式会社' }) });
assert.equal(aggregate([conflicting, retained]).record, null);
assert.equal(aggregate([conflicting, retained]).reason, 'company_profile_field_conflict');
const legal = Object.assign(profile(), { sourceType: 'legal', operatorName: '匿名運営株式会社', hasOperatorName: true });
const legalRetained = hooks.retainSafeStaticFormalCoverageEvidence_(
  staticPage({ operatorIdentityInfo: null, legalOperatorInfo: legal }), candidate
);
assert.ok(legalRetained.legalOperatorInfo);
assert.equal(legalRetained.operatorIdentityInfo, null);
for (const mode of ['corporate', 'saas', 'shop_facility', 'ec', 'media', 'generic']) {
  assert.ok(hooks.retainSafeStaticFormalCoverageEvidence_(staticPage(), candidate), mode);
}
console.log(JSON.stringify({ pass: true, fixture: 'coverage_formal_preservation_v1' }));
