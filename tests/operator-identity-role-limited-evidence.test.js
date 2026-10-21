const assert = require('assert');
const { extractRoleLimitedEntityEvidenceV1_, assessRoleLimitedEntityEvidenceV2_ } = require('../index.js').__lightBudgetTestHooks;

const origin = 'https://brand.fixture.invalid';
const privacy = extractRoleLimitedEntityEvidenceV1_(
  '<main>個人情報の取扱事業者 株式会社架空責任 〒100-0001 東京都千代田区1-1 03-1234-5678</main>',
  `${origin}/privacy/`, 'legal');
assert.equal(privacy.role, 'privacy_controller');
assert.equal(privacy.sourcePageType, 'privacy_notice');
assert.equal(privacy.napSameEvidenceScope, true);
assert.equal(privacy.hasAddress, true);
assert.equal(privacy.hasTelephone, true);
assert.equal(privacy.identitySameEvidenceScope, true);
assert.equal(assessRoleLimitedEntityEvidenceV2_(privacy).accepted, true);

const contact = extractRoleLimitedEntityEvidenceV1_(
  '<main>お問い合わせ先 株式会社架空窓口 〒100-0001 東京都千代田区1-1 03-1234-5678</main>',
  `${origin}/contact/`, 'contact');
assert.equal(contact.role, 'contact_responsible_entity');
assert.equal(contact.napSameEvidenceScope, true);
assert.equal(contact.contactSameEvidenceScope, true);
assert.equal(assessRoleLimitedEntityEvidenceV2_(contact).accepted, true);

// A page-wide footer NAP must not be combined with a role cue that is outside
// the bounded evidence scope.
const mixed = extractRoleLimitedEntityEvidenceV1_(
  `<main>個人情報の取扱事業者 株式会社架空責任 ${'x'.repeat(1500)} 東京都千代田区1-1 03-1234-5678</main>`,
  `${origin}/privacy/`, 'legal');
assert.equal(mixed.napSameEvidenceScope, false);
assert.equal(mixed.rejectionCode, 'privacy_controller_address_scope_incomplete');
// A telephone belonging to a later legal entity in the same page scope must
// not be combined with the role-responsible entity's name/address.
const differentEntityTelephone = extractRoleLimitedEntityEvidenceV1_(
  '<main>個人情報の取扱事業者 株式会社架空責任 〒100-0001 東京都千代田区1-1 株式会社別法人 03-1234-5678</main>',
  `${origin}/privacy/`, 'legal');
assert.equal(differentEntityTelephone.companyName, '株式会社架空責任');
assert.equal(differentEntityTelephone.hasAddress, true);
assert.equal(differentEntityTelephone.hasTelephone, false);
assert.equal(differentEntityTelephone.napSameEvidenceScope, false);
assert.equal(differentEntityTelephone.identitySameEvidenceScope, true);
assert.equal(assessRoleLimitedEntityEvidenceV2_(differentEntityTelephone).accepted, true);
const noTelephone = extractRoleLimitedEntityEvidenceV1_(
  '<main>個人情報の取扱事業者 株式会社架空責任 〒100-0001 東京都千代田区1-1</main>',
  `${origin}/privacy/`, 'legal');
assert.equal(noTelephone.napSameEvidenceScope, false);
assert.equal(noTelephone.identitySameEvidenceScope, true);
assert.equal(assessRoleLimitedEntityEvidenceV2_(noTelephone).accepted, true);
const contactNoAddress = extractRoleLimitedEntityEvidenceV1_(
  '<main>お問い合わせ先 株式会社架空窓口 03-1234-5678</main>',
  `${origin}/contact/`, 'contact');
assert.equal(contactNoAddress.hasAddress, false);
assert.equal(contactNoAddress.contactSameEvidenceScope, true);
assert.equal(assessRoleLimitedEntityEvidenceV2_(contactNoAddress).accepted, true);
const contactNoTelephone = extractRoleLimitedEntityEvidenceV1_(
  '<main>お問い合わせ先 株式会社架空窓口 〒100-0001 東京都千代田区1-1</main>',
  `${origin}/contact/`, 'contact');
assert.equal(contactNoTelephone.hasTelephone, false);
assert.equal(contactNoTelephone.identitySameEvidenceScope, true);
assert.equal(assessRoleLimitedEntityEvidenceV2_(contactNoTelephone).accepted, true);
const privacyNameOnly = extractRoleLimitedEntityEvidenceV1_(
  '<main>個人情報の取扱事業者 株式会社架空責任</main>',
  `${origin}/privacy/`, 'legal');
assert.equal(assessRoleLimitedEntityEvidenceV2_(privacyNameOnly).accepted, false);
assert.equal(assessRoleLimitedEntityEvidenceV2_(privacyNameOnly).reasonCode, 'privacy_controller_address_scope_incomplete');
assert.equal(assessRoleLimitedEntityEvidenceV2_({role:'unknown',companyName:'株式会社架空',hasAddress:true,identitySameEvidenceScope:true}).accepted, false);
assert.equal(extractRoleLimitedEntityEvidenceV1_('<main>株式会社架空責任 03-1234-5678</main>', `${origin}/about/`, 'generic'), null);

console.log(JSON.stringify({ pass: true, fixture: 'operator_identity_role_limited_evidence_v2', cases: 25 }));
