const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const candidate = {
  url: 'https://operator.fixture.invalid/corporate/legacy.html',
  officialExternalOperatorProfile: true,
  operatorRelationLabel: 'Operating company',
  operatorRelationSource: 'footer',
  operatorRelationSourceOrigin: 'https://brand.fixture.invalid',
  operatorIdentityProbeSourceType: 'company_profile'
};

const relationEvidence = hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(candidate);
const hub = {
  observed: true,
  companyName: 'Fixture Operator Co.',
  operatorName: 'Fixture Operator Co.',
  address: 'Fixture Capital 1-1',
  telephone: '000-1111-2222',
  hasCompanyName: true,
  hasAddress: true,
  hasTelephone: true,
  hasOperatorInfo: true,
  conflict: false
};
const detail = {
  observed: true,
  companyName: 'Fixture Operator Co.',
  operatorName: 'Fixture Operator Co.',
  address: 'Fixture Region 2-2',
  telephone: '000-3333-4444',
  hasCompanyName: true,
  hasAddress: true,
  hasTelephone: true,
  hasOperatorInfo: true,
  conflict: false
};

// This is the exact hub/detail comparison used by adoptCompanyProfileIdentity.
// Different offices and contact desks remain disclosure evidence only.
const disclosure = hooks.classifyOperatorIdentityFieldConflictsV1_(hub, detail);
assert.deepStrictEqual(disclosure, {
  identityConflict: false,
  disclosureConflict: true,
  disclosureFields: ['address', 'telephone']
});
assert.strictEqual(hooks.operatorIdentityFieldsConflict_(hub, detail), false);

const addressOnly = hooks.classifyOperatorIdentityFieldConflictsV1_(hub, Object.assign({}, hub, {
  address: 'Fixture Region 2-2'
}));
assert.deepStrictEqual(addressOnly.disclosureFields, ['address']);
assert.strictEqual(addressOnly.identityConflict, false);

const telephoneOnly = hooks.classifyOperatorIdentityFieldConflictsV1_(hub, Object.assign({}, hub, {
  telephone: '000-3333-4444'
}));
assert.deepStrictEqual(telephoneOnly.disclosureFields, ['telephone']);
assert.strictEqual(telephoneOnly.identityConflict, false);

// A missing legal name is not repaired from a different page merely because
// the office/contact fields are close. The normal company-profile authority
// still rejects the incomplete detail record.
const nameMissing = Object.assign({}, detail, {
  companyName: '',
  operatorName: '',
  hasCompanyName: false,
  hasOperatorInfo: false
});
assert.strictEqual(hooks.operatorIdentityFieldsConflict_(hub, nameMissing), false);
assert.strictEqual(hooks.normalizeOperatorIdentityInfo_(nameMissing, 'company_profile', {
  relationEvidence
}), null);

// A different legal name remains an identity conflict, including when its
// address and phone happen to match. It cannot become a formal identity.
const differentEntity = Object.assign({}, detail, {
  companyName: 'Other Operator Co.',
  operatorName: 'Other Operator Co.'
});
assert.strictEqual(hooks.operatorIdentityFieldsConflict_(hub, differentEntity), true);
assert.strictEqual(hooks.normalizeOperatorIdentityInfo_(Object.assign({}, differentEntity, { conflict: true }), 'company_profile', {
  relationEvidence
}), null);

// The bounded external-relation producer path still requires the relation,
// then makes the detail record formal. Contact differences do not supply that
// relation and are not used as identity evidence.
const formal = hooks.attachOperatorIdentityProbeProvenance_(
  hooks.normalizeOperatorIdentityInfo_(detail, 'company_profile', { relationEvidence }), candidate
);
assert.strictEqual(formal.hasOperatorInfo, true);
assert.strictEqual(formal.hasCompanyName, true);
assert.strictEqual(formal.identityEvidenceV1.kind, 'explicit_external_operator_relation');
assert.strictEqual(formal.provenance.candidateSourceUrl, candidate.url);

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_hub_detail_disclosure_conflict_v1',
  cases: {
    sameOperatorAddressOnlyDoesNotConflict: true,
    sameOperatorTelephoneOnlyDoesNotConflict: true,
    sameOperatorOfficeAndTelephoneDifferencesDoNotConflict: true,
    missingDetailLegalNameRemainsUnknown: true,
    differentLegalNameStillConflicts: true,
    relationEvidenceStillRequired: true,
    formalRecordUsesExistingProducerPath: true
  }
}));
