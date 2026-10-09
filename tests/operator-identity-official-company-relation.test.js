const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const response = (status, headers = {}, text = '<main>fixture</main>') => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: key => headers[String(key).toLowerCase()] || headers[key] || '' },
  text: async () => text
});
const transport = routes => async url => {
  const item = routes[String(url)];
  if (!item) throw new Error(`unexpected_url:${url}`);
  return item;
};

(async () => {
  const sourceOrigin = 'https://brand.fixture.invalid';
  const officialExternal = hooks.collectOfficialExternalOperatorProfileCandidates_({
    navLinks: [],
    footerLinks: [],
    allLinks: [
      { href: 'https://operator.fixture.invalid/about/outline', text: '運営会社', groupHeading: 'ブランド運営会社' },
      { href: 'https://unrelated.fixture.invalid/', text: '公式SNS', groupHeading: '' }
    ]
  }, sourceOrigin);
  // A rendered, explicitly-labelled body relation is admitted; an unrelated
  // external link remains outside the bounded operator candidate set.
  assert.strictEqual(officialExternal.length, 1);
  assert.strictEqual(officialExternal[0].officialExternalOperatorProfile, true);
  assert.strictEqual(officialExternal[0].source, 'explicit_body_operator_relation');
  assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(officialExternal[0]).probeEligible, true);

  // A direct, same-origin rendered relation must not disappear merely because
  // the ordinary discovery map already contains sitemap candidates. It remains
  // bounded to two metadata-only candidates and requires formal page fields.
  const officialSameOrigin = hooks.collectOfficialSameOriginOperatorProfileCandidates_({
    navLinks: [],
    footerLinks: [],
    allLinks: [
      { href: `${sourceOrigin}/company/`, text: '運営会社', groupHeading: '' },
      { href: `${sourceOrigin}/campaign/`, text: 'キャンペーン', groupHeading: '' }
    ]
  }, sourceOrigin);
  assert.strictEqual(officialSameOrigin.length, 1);
  assert.strictEqual(officialSameOrigin[0].officialSameOriginOperatorProfile, true);
  assert.strictEqual(officialSameOrigin[0].source, 'explicit_body_company_profile_relation');
  assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(officialSameOrigin[0]).probeEligible, true);

  const sameOriginCompany = {
    url: 'https://brand.fixture.invalid/company/',
    label: '運営会社',
    source: 'footer',
    sources: ['footer']
  };
  const selected = hooks.selectOperatorIdentityProbeCandidate_([sameOriginCompany], 'shop_facility');
  assert.ok(selected);
  assert.strictEqual(selected.operatorIdentityProbeSourceType, 'company_profile');
  assert.strictEqual(selected.operatorIdentityAllowExplicitExternalCompanyRedirect, true);

  // A generic-route candidate cannot opt into the handoff exception.
  const generic = hooks.evaluateBoundedOperatorIdentityProbeCandidate_({
    url: 'https://brand.fixture.invalid/company/', label: '', source: 'genericRoute', sources: ['genericRoute']
  });
  assert.strictEqual(generic.allowExplicitExternalCompanyRedirect, undefined);

  // A large discovery set cannot bury an explicit same-origin company page:
  // the existing priority lane evaluates it before the bounded candidate
  // window and still selects at most two landing probes.
  const noisyCandidates = Array.from({ length: 1200 }, (_, index) => ({
    url: `https://brand.fixture.invalid/articles/${index}/`, label: '記事',
    source: 'sitemap', sources: ['sitemap'], score: 9999 - index
  }));
  const morijukuShapeSelection = hooks.selectOperatorIdentityProbeCandidates_(
    noisyCandidates.concat([sameOriginCompany]), 'shop_facility', 2
  );
  assert.strictEqual(morijukuShapeSelection.length, 1);
  assert.strictEqual(morijukuShapeSelection[0].url, sameOriginCompany.url);
  const explicitRelationSelection = hooks.selectOperatorIdentityProbeCandidates_([
    { url: `${sourceOrigin}/about/blocked-a/`, label: '会社概要', source: 'nav', sources: ['nav', 'sitemap'], score: 100 },
    { url: `${sourceOrigin}/corporate/blocked-b/`, label: '企業情報', source: 'footer', sources: ['footer', 'sitemap'], score: 99 },
    officialSameOrigin[0]
  ], 'shop_facility', 2);
  assert.strictEqual(explicitRelationSelection.length, 2);
  assert.strictEqual(explicitRelationSelection[0].url, officialSameOrigin[0].url);
  assert.strictEqual(explicitRelationSelection[0].operatorIdentityProbeTier, 'explicit_same_origin_company_profile_relation');
  assert.strictEqual(explicitRelationSelection[0].operatorIdentityAllowExplicitExternalCompanyRedirect, true);
  const sameOriginFormalPage = await hooks.fetchSubpageHtmlLightOnce_(sameOriginCompany.url, {
    siteMode: 'shop_facility', operatorIdentitySourceType: 'company_profile',
    operatorIdentitySelectedHub: true, highConfidenceCompanyProfile: true,
    fetchImpl: transport({
      'https://brand.fixture.invalid/company/': response(200, {}, '<main><p>ブランドを運営しています</p><dl><dt>会社名</dt><dd>フィクスチャ運営株式会社</dd><dt>所在地</dt><dd>東京都テスト区1-2-3</dd></dl></main>')
    })
  });
  assert.strictEqual(sameOriginFormalPage.operatorIdentityInfo.hasOperatorInfo, true);

  const page = await hooks.fetchSubpageHtmlLightOnce_(selected.url, {
    siteMode: 'shop_facility',
    operatorIdentitySourceType: 'company_profile',
    operatorIdentitySelectedHub: true,
    highConfidenceCompanyProfile: true,
    allowExplicitExternalCompanyRedirect: selected.operatorIdentityAllowExplicitExternalCompanyRedirect === true,
    fetchImpl: transport({
      'https://brand.fixture.invalid/company/': response(301, { location: 'https://operator.fixture.invalid/about/outline' }),
      'https://operator.fixture.invalid/about/outline': response(200, {}, `
        <main><h1>会社概要</h1><dl>
          <dt>会社名</dt><dd>フィクスチャ運営株式会社</dd>
          <dt>所在地</dt><dd>東京都テスト区1-2-3</dd>
        </dl></main>`)
    })
  });
  assert.strictEqual(page.ok, true);
  assert.strictEqual(page.finalUrl, 'https://operator.fixture.invalid/about/outline');
  assert.strictEqual(page.operatorIdentityInfo.hasOperatorInfo, true);
  const record = hooks.attachOperatorIdentityProbeProvenance_(
    hooks.normalizeOperatorIdentityInfo_(page.operatorIdentityInfo, 'company_profile', {
      relationEvidence: hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(officialSameOrigin[0])
    }),
    Object.assign({}, officialSameOrigin[0], { operatorIdentityAllowExplicitExternalCompanyRedirect: true })
  );
  assert.strictEqual(record.hasOperatorInfo, true);
  assert.strictEqual(record.provenance.relation, 'explicit_same_origin_company_profile_https_redirect');

  // The handoff landing may nominate one existing bounded detail candidate on
  // the reached corporate origin; it starts there directly and receives no
  // additional cross-origin redirect permission.
  const handoffHub = await hooks.fetchSubpageHtmlLightOnce_(selected.url, {
    siteMode: 'shop_facility',
    operatorIdentitySourceType: 'company_profile',
    operatorIdentitySelectedHub: true,
    highConfidenceCompanyProfile: true,
    allowExplicitExternalCompanyRedirect: true,
    collectOperatorSecondPageCompanyProfileLink: true,
    fetchImpl: transport({
      'https://brand.fixture.invalid/company/': response(301, { location: 'https://operator.fixture.invalid/corporate' }),
      'https://operator.fixture.invalid/corporate': response(200, {}, '<main><a href="/corporate/outline">会社概要</a></main>')
    })
  });
  const detailLink = hooks.selectOperatorSecondPageCompanyProfileDetailLink_(
    handoffHub, selected, { observed: true, hasOperatorInfo: false, conflict: false }
  );
  assert.strictEqual(detailLink.url, 'https://operator.fixture.invalid/corporate/outline');
  const detailPage = await hooks.fetchSubpageHtmlLightOnce_(detailLink.url, {
    siteMode: 'shop_facility', operatorIdentitySourceType: 'company_profile',
    highConfidenceCompanyProfile: true,
    fetchImpl: transport({
      'https://operator.fixture.invalid/corporate/outline': response(200, {}, '<dl><dt>会社名</dt><dd>フィクスチャ運営株式会社</dd><dt>所在地</dt><dd>東京都テスト区1-2-3</dd></dl>')
    })
  });
  assert.strictEqual(detailPage.operatorIdentityInfo.hasOperatorInfo, true);

  console.log('operator identity official company relation fixtures: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
