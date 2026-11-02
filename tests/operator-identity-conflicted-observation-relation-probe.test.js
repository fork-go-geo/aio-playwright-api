const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const explicitExternalCandidate = {
  url: 'https://operator.fixture.invalid/',
  officialExternalOperatorProfile: true,
  operatorRelationSource: 'explicit_body_operator_relation',
  operatorRelationLabel: '運営会社',
  operatorRelationAnchorLabel: 'フィクスチャ運営株式会社',
  operatorRelationSourceOrigin: 'https://brand.fixture.invalid',
  source: 'explicit_body_operator_relation',
  sources: ['explicit_body_operator_relation']
};
const genericCandidate = {
  url: 'https://brand.fixture.invalid/company/',
  label: '会社情報',
  source: 'footer',
  sources: ['footer']
};

// Before the fix, this was the whole gate and the bounded probe was skipped.
const legacyAllowsProbe = !null &&
  'company_profile_field_conflict'.indexOf('conflict') < 0;
assert.strictEqual(legacyAllowsProbe, false);

// A conflict in unrelated representative-page reuse may not block an
// independently relation-backed candidate.
assert.strictEqual(hooks.canAttemptRelationBackedOperatorIdentityProbeV1_(
  null,
  'company_profile_field_conflict',
  [explicitExternalCandidate]
), true);

// The exception is not a general relaxation of conflict handling.
assert.strictEqual(hooks.canAttemptRelationBackedOperatorIdentityProbeV1_(
  null,
  'company_profile_field_conflict',
  [genericCandidate]
), false);
assert.strictEqual(hooks.canAttemptRelationBackedOperatorIdentityProbeV1_(
  { hasOperatorInfo: true },
  'company_profile_field_conflict',
  [explicitExternalCandidate]
), false);
assert.strictEqual(hooks.canAttemptRelationBackedOperatorIdentityProbeV1_(
  null,
  'no_observed_company_profile',
  [genericCandidate]
), true);

console.log('operator identity conflicted-observation relation-probe fixtures: PASS');
