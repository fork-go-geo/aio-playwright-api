const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const response = (status, headers = {}, text = '<main></main>') => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: key => headers[String(key).toLowerCase()] || headers[key] || '' },
  text: async () => text
});

const externalCandidate = {
  url: 'https://operator.fixture.invalid/corporate/legacy.html',
  label: '運営会社について',
  source: 'footer',
  sources: ['footer'],
  officialExternalOperatorProfile: true,
  operatorRelationSource: 'footer',
  operatorRelationLabel: '運営会社について',
  operatorRelationSourceOrigin: 'https://brand.fixture.invalid',
  operatorIdentityProbeSourceType: 'company_profile'
};

const fetchWithRoutes = (routes, calls) => async url => {
  calls.push(url);
  const item = routes[url];
  if (!item) throw new Error(`unexpected_url:${url}`);
  return item;
};

(async () => {
  const calls = [];
  const landing = await hooks.fetchSubpageHtmlLightOnce_(externalCandidate.url, {
    siteMode: 'shop_facility',
    operatorIdentitySourceType: 'company_profile',
    operatorIdentitySelectedHub: true,
    highConfidenceCompanyProfile: true,
    allowExplicitOperatorHttpsDowngradeRecovery: true,
    collectOperatorSecondPageCompanyProfileLink: true,
    fetchImpl: fetchWithRoutes({
      'https://operator.fixture.invalid/corporate/legacy.html': response(301, {
        location: 'http://operator.fixture.invalid/corporate.html'
      }),
      'https://operator.fixture.invalid/corporate.html': response(200, {},
        '<main><h1>企業情報</h1><a href="/corporate/outline.html">詳細</a></main>')
    }, calls)
  });
  assert.strictEqual(landing.ok, true);
  assert.strictEqual(landing.finalUrl, 'https://operator.fixture.invalid/corporate.html');
  assert.deepStrictEqual(calls, [
    'https://operator.fixture.invalid/corporate/legacy.html',
    'https://operator.fixture.invalid/corporate.html'
  ]);
  assert.ok(calls.every(url => new URL(url).protocol === 'https:'), 'the HTTP Location is never requested');
  assert.deepStrictEqual(landing.redirectAuditV1, {
    downgrade: true,
    hop: 1,
    fromScheme: 'https',
    toScheme: 'http',
    httpsRecovery: {
    attempted: true,
    accepted: true,
    redirectStatus: 301,
    reason: 'explicit_relation_same_host_https_recovery'
    }
  });
  assert.strictEqual(landing.companyProfileDetailLinks.length, 1);
  assert.strictEqual(landing.companyProfileDetailLinks[0].source, 'bounded_company_hub_detail_path');

  const detailLink = hooks.selectOperatorSecondPageCompanyProfileDetailLink_(landing, externalCandidate, {
    observed: true, hasOperatorInfo: false, conflict: false
  });
  assert.strictEqual(detailLink.url, 'https://operator.fixture.invalid/corporate/outline.html');
  const detail = await hooks.fetchSubpageHtmlLightOnce_(detailLink.url, {
    siteMode: 'shop_facility', operatorIdentitySourceType: 'company_profile', highConfidenceCompanyProfile: true,
    fetchImpl: fetchWithRoutes({
      'https://operator.fixture.invalid/corporate/outline.html': response(200, {},
        '<main><p>架空ブランドを運営</p><dl><dt>会社名</dt><dd>架空運営株式会社</dd><dt>所在地</dt><dd>架空都架空区1-2-3</dd></dl></main>')
    }, calls)
  });
  const relationEvidence = hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(externalCandidate);
  const formal = hooks.attachOperatorIdentityProbeProvenance_(
    hooks.normalizeOperatorIdentityInfo_(detail.operatorIdentityInfo, 'company_profile', { relationEvidence }),
    externalCandidate
  );
  assert.strictEqual(formal.hasOperatorInfo, true);
  assert.strictEqual(formal.identityEvidenceV1.kind, 'explicit_external_operator_relation');
  assert.strictEqual(formal.provenance.candidateSourceUrl, externalCandidate.url);
  assert.strictEqual(calls.length, 3, 'recovery transport plus one bounded detail stays inside the existing three-request ceiling');

  const rejectedLocations = [
    'http://different.fixture.invalid/corporate.html',
    'http://user@operator.fixture.invalid/corporate.html',
    'http://operator.fixture.invalid:8080/corporate.html'
  ];
  for (const location of rejectedLocations) {
    const rejectedCalls = [];
    const rejected = await hooks.fetchSubpageHtmlLightOnce_(externalCandidate.url, {
      allowExplicitOperatorHttpsDowngradeRecovery: true,
      fetchImpl: fetchWithRoutes({
        'https://operator.fixture.invalid/corporate/legacy.html': response(301, { location })
      }, rejectedCalls)
    });
    assert.strictEqual(rejected.ok, false);
    assert.ok(['redirect_https_downgrade', 'url_userinfo_forbidden'].includes(rejected.error));
    assert.deepStrictEqual(rejectedCalls, [externalCandidate.url]);
  }

  const secondDowngradeCalls = [];
  const secondDowngrade = await hooks.fetchSubpageHtmlLightOnce_(externalCandidate.url, {
    allowExplicitOperatorHttpsDowngradeRecovery: true,
    fetchImpl: fetchWithRoutes({
      'https://operator.fixture.invalid/corporate/legacy.html': response(301, { location: 'http://operator.fixture.invalid/corporate.html' }),
      'https://operator.fixture.invalid/corporate.html': response(302, { location: 'http://operator.fixture.invalid/other.html' })
    }, secondDowngradeCalls)
  });
  assert.strictEqual(secondDowngrade.ok, false);
  assert.strictEqual(secondDowngrade.error, 'redirect_https_downgrade');
  assert.ok(secondDowngradeCalls.every(url => new URL(url).protocol === 'https:'));

  const noRelationCalls = [];
  const noRelation = await hooks.fetchSubpageHtmlLightOnce_(externalCandidate.url, {
    fetchImpl: fetchWithRoutes({
      'https://operator.fixture.invalid/corporate/legacy.html': response(301, { location: 'http://operator.fixture.invalid/corporate.html' })
    }, noRelationCalls)
  });
  assert.strictEqual(noRelation.ok, false);
  assert.strictEqual(noRelation.error, 'redirect_https_downgrade');
  assert.deepStrictEqual(noRelationCalls, [externalCandidate.url]);

  const safeDetailPaths = hooks.collectExplicitCompanyProfileDetailLinksFromHtml_(
    '<a href="/corporate/outline.html">詳細</a><a href="http://operator.fixture.invalid/corporate/profile.html">詳細</a><a href="/corporate/news.html">詳細</a><a href="https://other.fixture.invalid/corporate/outline.html">詳細</a>',
    'https://operator.fixture.invalid/corporate.html'
  );
  assert.deepStrictEqual(safeDetailPaths.map(item => item.url), ['https://operator.fixture.invalid/corporate/outline.html']);
  assert.strictEqual(hooks.selectOperatorSecondPageCompanyProfileDetailLink_(
    Object.assign({}, landing, { redirectAuditV1: null }), externalCandidate, { observed: true, hasOperatorInfo: false, conflict: false }
  ), null, 'external relation cannot use bounded follow-up without an accepted recovery');

  console.log(JSON.stringify({
    pass: true,
    fixture: 'operator_identity_explicit_https_recovery_v1',
    cases: {
      sameHostHttpsRecoveryWithoutHttpRequest: true,
      boundedHubDetailFollowup: true,
      relationProvenanceRetained: true,
      formalRecordGenerated: true,
      crossHostUserinfoAndPortRejected: true,
      multipleDowngradeRejected: true,
      relationRequired: true,
      unrelatedDetailPathsRejected: true,
      existingProbeCeilingMaintained: true
    }
  }));
})().catch(error => { console.error(error); process.exitCode = 1; });
