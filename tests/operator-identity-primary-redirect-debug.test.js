const assert = require('assert');

const hooks = require('../index.js').__lightBudgetTestHooks;

assert.strictEqual(hooks.isOperatorIdentityNoSaveRedirectDebugRequestV1_({ get: name => name === 'X-From' ? 'GAS-debug-no-save' : '' }, true, true), true);
assert.strictEqual(hooks.isOperatorIdentityNoSaveRedirectDebugRequestV1_({ get: () => 'GAS-debug-no-save' }, true, false), false);
assert.strictEqual(hooks.isOperatorIdentityNoSaveRedirectDebugRequestV1_({ get: () => 'GAS-debug-no-save' }, false, true), false);
assert.strictEqual(hooks.isOperatorIdentityNoSaveRedirectDebugRequestV1_({ get: () => 'other' }, true, true), false);

const primary = {
  url: 'https://operator.fixture.invalid/corporate/outline.html?debug_token=do-not-return',
  label: '運営会社',
  sources: ['explicit_body_operator_relation'],
  score: 95,
  officialExternalOperatorProfile: true,
  operatorRelationLabel: '運営会社',
  operatorRelationSource: 'explicit_body_operator_relation',
  operatorRelationSourceOrigin: 'https://brand.fixture.invalid'
};

const rawCompany = {
  observed: true,
  conflict: false,
  companyName: 'Fixture Operator Co.',
  hasCompanyName: true,
  hasAddress: false,
  hasTelephone: false
};

(async () => {
  const page = await hooks.fetchSubpageHtmlLightOnce_(primary.url, {
    operatorIdentityNoSaveRedirectDebug: true,
    fetchImpl: async () => ({
      status: 302,
      ok: false,
      headers: { get: key => key === 'location' ? 'http://operator.fixture.invalid/corporate/outline.html?token=secret#fragment' : '' }
    })
  });

  assert.strictEqual(page.ok, false);
  assert.strictEqual(page.error, 'redirect_https_downgrade');
  assert.deepStrictEqual(page.redirectAuditV1, {
    downgrade: true,
    hop: 1,
    fromScheme: 'https',
    toScheme: 'http',
    firstRedirectHttpStatus: 302,
    location: {
      scheme: 'http', host: 'operator.fixture.invalid', port: null,
      path: '/corporate/outline.html', trailingSlash: false,
      queryPresent: true, hashPresent: true
    }
  });

  const debugContext = hooks.buildOperatorIdentityProbeAuditContextV1_(
    primary, 'company_profile', page, rawCompany, null,
    { operatorIdentityNoSaveRedirectDebug: true }
  );
  const debugAudit = hooks.buildOperatorIdentityCandidateAuditV1_([primary], 'corporate', primary, {
    candidateAuditSecret: Buffer.from('fixture-only-audit-secret'),
    primaryProbeContext: debugContext,
    operatorIdentityNoSaveRedirectDebug: true
  });
  const primaryAudit = debugAudit.probeLinkage.primary;
  assert.match(primaryAudit.candidateKey, /^opidc_[A-Za-z0-9_-]{22}$/);
  assert.deepStrictEqual(primaryAudit.noSaveRedirectDebugV1, {
    safeFetchStart: {
      scheme: 'https', host: 'operator.fixture.invalid', port: null,
      path: '/corporate/outline.html', trailingSlash: false,
      queryPresent: true, hashPresent: false
    }
  });
  assert.deepStrictEqual(primaryAudit.redirect.location, page.redirectAuditV1.location);
  const serialized = JSON.stringify(debugAudit);
  assert.strictEqual(serialized.includes('debug_token'), false);
  assert.strictEqual(serialized.includes('do-not-return'), false);
  assert.strictEqual(serialized.includes('token=secret'), false);
  assert.strictEqual(serialized.includes('fragment'), false);
  assert.strictEqual(serialized.includes('?'), false);

  const normalPage = await hooks.fetchSubpageHtmlLightOnce_(primary.url, {
    fetchImpl: async () => ({
      status: 302,
      ok: false,
      headers: { get: key => key === 'location' ? 'http://operator.fixture.invalid/corporate/outline.html?token=secret' : '' }
    })
  });
  const normalContext = hooks.buildOperatorIdentityProbeAuditContextV1_(primary, 'company_profile', normalPage, rawCompany, null);
  const normalAudit = hooks.buildOperatorIdentityCandidateAuditV1_([primary], 'corporate', primary, {
    candidateAuditSecret: Buffer.from('fixture-only-audit-secret'),
    primaryProbeContext: normalContext
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalAudit.probeLinkage.primary, 'noSaveRedirectDebugV1'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalAudit.probeLinkage.primary.redirect, 'location'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalAudit.probeLinkage.primary.redirect, 'firstRedirectHttpStatus'), false);

  console.log(JSON.stringify({
    pass: true,
    fixture: 'operator_identity_primary_redirect_debug_v1',
    candidateKeyLinked: true,
    queryValuesRedacted: true,
    normalAuditUnchanged: true,
    downgradeHandlingUnchanged: true
  }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
