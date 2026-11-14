const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const response = (status, headers = {}, text = '<main>fixture</main>') => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: key => headers[String(key).toLowerCase()] || headers[key] || '' },
  text: async () => text
});

(async () => {
  const origin = 'https://brand.fixture.invalid';
  const official = hooks.normalizeDiscoverSubpageUrl(`${origin}/company/`, origin);
  assert.strictEqual(official, `${origin}/company/`);

  const slashless = hooks.normalizeDiscoverSubpageUrl(`${origin}/company`, origin);
  assert.strictEqual(slashless, `${origin}/company`, 'normalization must not invent a trailing slash');

  const normalizedMetadata = hooks.normalizeDiscoverSubpageUrl(
    'https://brand.fixture.invalid:8443/company/?source=fixture#section',
    'https://brand.fixture.invalid:8443'
  );
  assert.strictEqual(
    normalizedMetadata,
    'https://brand.fixture.invalid:8443/company/',
    'normalization must preserve scheme/host/port/path while retaining the existing query/hash removal contract'
  );
  const deduped = hooks.selectOperatorIdentityProbeCandidates_([
    { url: `${origin}/company`, label: '会社概要', sources: ['nav', 'sitemap'], score: 90 },
    { url: official, label: '会社概要', sources: ['nav', 'sitemap'], score: 100 }
  ], 'shop_facility', 2);
  assert.strictEqual(deduped.length, 1,
    'deduplication remains slash-insensitive while fetch URLs remain exact');
  const page = await hooks.fetchSubpageHtmlLightOnce_(official, {
    siteMode: 'shop_facility',
    operatorIdentitySourceType: 'company_profile',
    highConfidenceCompanyProfile: true,
    fetchImpl: async url => {
      if (url === `${origin}/company/`) {
        return response(200, {}, '<dl><dt>会社名</dt><dd>架空運営株式会社</dd><dt>所在地</dt><dd>架空都架空区1-1</dd></dl>');
      }
      if (url === `${origin}/company`) {
        return response(301, { location: `http://brand.fixture.invalid/company/` });
      }
      throw new Error('unexpected_fixture_url');
    }
  });
  assert.strictEqual(page.ok, true);
  assert.strictEqual(page.operatorIdentityInfo.hasOperatorInfo, true);
  console.log(JSON.stringify({ pass: true, fixture: 'operator_identity_trailing_slash_fetch_v1' }));
})().catch(error => { console.error(error); process.exitCode = 1; });
