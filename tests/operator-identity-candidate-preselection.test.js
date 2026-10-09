const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

function candidate(index, patch = {}) {
  return Object.assign({
    url: `https://fixture.invalid/noise/${index}/`, label: 'お知らせ', sources: ['nav'], score: 1
  }, patch);
}

const discovered = Array.from({ length: 120 }, (_, index) => candidate(index));
const strongAt81 = candidate(81, {
  url: 'https://fixture.invalid/company/overview/', label: '会社概要', sources: ['nav', 'sitemap'], score: 900
});
discovered[81] = strongAt81;
const plan = hooks.buildOperatorIdentityProbeSelectionPlan_(discovered, 'shop_facility', 2);
assert.strictEqual(plan.strategy, 'bounded_metadata_priority_before_eligibility_v1');
assert.strictEqual(plan.selected[0].url, strongAt81.url);
assert.ok(plan.eligibilityEvaluationCount <= hooks.OPERATOR_IDENTITY_PRESELECTION_EVALUATION_MAX_V1_);

[240, 999, 1999].forEach(index => {
  const large = Array.from({ length: 2100 }, (_, position) => candidate(position));
  const priorityCandidate = candidate(index, {
    url: `https://fixture.invalid/company/priority-${index}/`, label: '法人概要',
    sources: ['footer', 'htmlSitemap'], score: 500
  });
  large[index] = priorityCandidate;
  const largePlan = hooks.buildOperatorIdentityProbeSelectionPlan_(large, 'shop_facility', 2);
  assert.strictEqual(largePlan.selected[0].url, priorityCandidate.url);
  assert.ok(largePlan.priorityLaneScanCount <= hooks.OPERATOR_IDENTITY_PRIORITY_LANE_SCAN_MAX_V1_);
  assert.ok(largePlan.priorityLaneRetainedCount <= hooks.OPERATOR_IDENTITY_PRIORITY_LANE_RETAIN_MAX_V1_);
  assert.ok(largePlan.selected.length <= 2);
});

// A direct same-origin operator relation is carried in the bounded priority
// lane even when it originates after the ordinary 240-candidate metadata
// window. This is selection-only; the landing probe cap remains two.
[240, 999, 1999].forEach(index => {
  const large = Array.from({ length: 2100 }, (_, position) => candidate(position));
  const directOperatorRelation = candidate(index, {
    url: `https://fixture.invalid/company/direct-relation-${index}/`, label: '運営会社',
    source: 'explicit_body_company_profile_relation',
    sources: ['explicit_body_company_profile_relation'], score: 95,
    officialSameOriginOperatorProfile: true,
    operatorRelationSourceOrigin: 'https://fixture.invalid'
  });
  large[index] = directOperatorRelation;
  const directPlan = hooks.buildOperatorIdentityProbeSelectionPlan_(large, 'shop_facility', 2);
  assert.strictEqual(directPlan.selected[0].url, directOperatorRelation.url);
  assert.strictEqual(directPlan.selected.length <= 2, true);
  assert.ok(directPlan.priorityLaneScanCount <= hooks.OPERATOR_IDENTITY_PRIORITY_LANE_SCAN_MAX_V1_);
});

const bounded = Array.from({ length: hooks.OPERATOR_IDENTITY_PRIORITY_LANE_SCAN_MAX_V1_ + 20 }, (_, index) => candidate(index));
const withinPriorityCap = candidate(hooks.OPERATOR_IDENTITY_PRIORITY_LANE_SCAN_MAX_V1_ - 1, {
  url: 'https://fixture.invalid/company/within-priority-cap/', label: '法人概要', sources: ['footer', 'htmlSitemap'], score: 500
});
const outsidePriorityCap = candidate(hooks.OPERATOR_IDENTITY_PRIORITY_LANE_SCAN_MAX_V1_, {
  url: 'https://fixture.invalid/company/outside-priority-cap/', label: '法人概要', sources: ['footer', 'htmlSitemap'], score: 99999
});
bounded[hooks.OPERATOR_IDENTITY_PRIORITY_LANE_SCAN_MAX_V1_ - 1] = withinPriorityCap;
bounded[hooks.OPERATOR_IDENTITY_PRIORITY_LANE_SCAN_MAX_V1_] = outsidePriorityCap;
const boundedPlan = hooks.buildOperatorIdentityProbeSelectionPlan_(bounded, 'shop_facility', 2);
assert.strictEqual(boundedPlan.selected[0].url, withinPriorityCap.url);
assert.ok(!boundedPlan.selected.some(item => item.url === outsidePriorityCap.url));

const duplicate = Object.assign({}, strongAt81, { url: 'https://fixture.invalid/company/overview/?ref=footer#company', score: 950 });
const external = candidate('external', {
  url: 'https://operator.fixture.invalid/', label: '運営会社', sources: ['footer'], score: 800,
  officialExternalOperatorProfile: true, operatorRelationSourceOrigin: 'https://fixture.invalid'
});
const deduped = hooks.buildOperatorIdentityProbeSelectionPlan_([strongAt81, duplicate, external], 'shop_facility', 2);
assert.strictEqual(deduped.selected.length, 2);
assert.strictEqual(deduped.selected.filter(item => /fixture\.invalid\/company\/overview/.test(item.url)).length, 1);
assert.ok(deduped.selected.some(item => item.url === external.url));

['corporate', 'generic', 'saas'].forEach(mode => assert.strictEqual(
  hooks.buildOperatorIdentityProbeSelectionPlan_(discovered, mode, 2).selected[0].url, strongAt81.url
));
['ec', 'media'].forEach(mode => assert.deepStrictEqual(
  hooks.buildOperatorIdentityProbeSelectionPlan_(discovered, mode, 2).selected, []
));

console.log(JSON.stringify({ pass: true, fixture: 'operator_identity_candidate_preselection_v1' }));
