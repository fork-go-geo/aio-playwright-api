const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const parseProfile = html => hooks.extractOperatorIdentityInfoFromHtml_(html,
  'https://brand.fixture.invalid/company/', {
    highConfidenceCompanyProfile: true,
    selectedOperatorIdentityHub: true
  });

const companyRow = '<table><tr><th>会社名</th><td>架空運営株式会社</td></tr></table>';
const inlineAddress = '〒000-0000 架空県架空市1-2-3';

const complete = parseProfile(`<main>${companyRow}<h3>本社 ${inlineAddress}</h3></main>`);
assert.strictEqual(complete.hasCompanyName, true);
assert.strictEqual(complete.hasAddress, true);
assert.strictEqual(complete.hasOperatorInfo, true);
assert.ok(complete.evidenceLabels.includes('本社'));

const absent = parseProfile(`<main>${companyRow}<h3>本社</h3></main>`);
assert.strictEqual(absent.hasAddress, false);
assert.strictEqual(absent.hasOperatorInfo, false);

const unlabeled = parseProfile(`<main>${companyRow}<p>${inlineAddress}</p></main>`);
assert.strictEqual(unlabeled.hasAddress, false, 'an unlabeled address-like string must not become a formal field');
assert.strictEqual(unlabeled.hasOperatorInfo, false);

const normalized = hooks.normalizeOperatorIdentityInfo_(complete, 'company_profile', {
  relationEvidence: hooks.buildExplicitOperatorIdentityRelationEvidenceV1_({
    url: 'https://brand.fixture.invalid/company/', officialSameOriginOperatorProfile: true,
    operatorRelationLabel: '運営会社', operatorRelationSource: 'explicit_body_company_profile_relation',
    operatorRelationSourceOrigin: 'https://brand.fixture.invalid'
  })
});
assert.strictEqual(hooks.isFormalOperatorIdentityRecord_(normalized), true);

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_company_profile_inline_address_heading_v1',
  cases: { inlineHeading: true, addressAbsent: true, unlabeledAddressRejected: true, formalRecord: true }
}));
