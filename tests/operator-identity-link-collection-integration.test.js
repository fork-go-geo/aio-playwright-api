const assert = require('assert');
const { chromium } = require('playwright');
const hooks = require('../index.js').__lightBudgetTestHooks;

const origin = 'https://brand.fixture.invalid';
const response = (status, headers = {}, text = '<main>fixture</main>') => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: key => headers[String(key).toLowerCase()] || headers[key] || '' },
  text: async () => text
});

function makeHtml(linkCount, relationAt, relationHtml) {
  const links = Array.from({ length: linkCount }, (_, index) =>
    index === relationAt ? relationHtml : `<a href="${origin}/noise/${index}/">一般リンク${index}</a>`
  ).join('');
  return `<main>${links}</main>`;
}

async function collect(page, html) {
  await page.setContent(html);
  return hooks.collectDiscoverLinksFromPage(page);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();

    const short = await collect(page, makeHtml(100, 99,
      `<a href="${origin}/company/">運営会社</a>`));
    assert.strictEqual(short.allLinks.length, 100);
    assert.strictEqual(short.operatorRelationLinks.length, 1);

    const after500 = await collect(page, makeHtml(800, 600,
      `<a href="${origin}/company/">運営会社</a>`));
    assert.strictEqual(after500.allLinks.length, 500);
    assert.strictEqual(after500.operatorRelationLinks.length, 1);
    assert.strictEqual(after500.operatorRelationLinks[0].href, `${origin}/company/`);

    const after1200 = await collect(page, makeHtml(1500, 1200,
      `<a href="${origin}/company/">運営会社</a>`));
    assert.strictEqual(after1200.allLinks.length, 500);
    assert.strictEqual(after1200.operatorRelationLinks.length, 1);

    const sameOrigin = hooks.collectOfficialSameOriginOperatorProfileCandidates_(after1200, origin);
    assert.strictEqual(sameOrigin.length, 1);
    // Exercise the producer discovery entry point itself. Sitemap attempts are
    // locally stubbed as misses; the rendered fixture page is never navigated
    // to an external URL.
    const originalFetch = global.fetch;
    const originalUrl = page.url;
    global.fetch = async () => response(404, {}, '');
    page.url = () => `${origin}/`;
    const discovered = await hooks.discoverSubpageCandidatesLightData_(`${origin}/`, origin, 20, {
      siteMode: 'shop_facility', page
    });
    page.url = originalUrl;
    global.fetch = originalFetch;
    assert.strictEqual(discovered.operatorIdentityCandidates[0].url, `${origin}/company/`);
    assert.strictEqual(discovered.operatorIdentityCandidates[0].operatorIdentityProbeTier, 'explicit_same_origin_company_profile_relation');
    const strictNoise = [
      { url: `${origin}/about/unreachable-a/`, label: '会社概要', sources: ['nav', 'sitemap'], score: 100 },
      { url: `${origin}/corporate/unreachable-b/`, label: '企業情報', sources: ['footer', 'sitemap'], score: 99 }
    ];
    const selected = hooks.selectOperatorIdentityProbeCandidates_(strictNoise.concat(sameOrigin), 'shop_facility', 2);
    assert.strictEqual(selected.length, 2);
    assert.strictEqual(selected[0].url, `${origin}/company/`);
    assert.strictEqual(selected[0].operatorIdentityProbeTier, 'explicit_same_origin_company_profile_relation');

    const fetched = await hooks.fetchSubpageHtmlLightOnce_(selected[0].url, {
      siteMode: 'shop_facility', operatorIdentitySourceType: 'company_profile',
      operatorIdentitySelectedHub: true, highConfidenceCompanyProfile: true,
      allowExplicitExternalCompanyRedirect: true,
      fetchImpl: async url => {
        assert.strictEqual(String(url), `${origin}/company/`);
        return response(200, {}, '<main><p>ブランドを運営しています</p><dl><dt>会社名</dt><dd>架空運営株式会社</dd><dt>所在地</dt><dd>東京都架空区1-2-3</dd></dl></main>');
      }
    });
    assert.strictEqual(fetched.ok, true);
    assert.strictEqual(fetched.operatorIdentityInfo.hasOperatorInfo, true);
    const formal = hooks.attachOperatorIdentityProbeProvenance_(
      hooks.normalizeOperatorIdentityInfo_(fetched.operatorIdentityInfo, 'company_profile', {
        relationEvidence: hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(selected[0])
      }), selected[0]
    );
    assert.strictEqual(hooks.isFormalOperatorIdentityRecord_(formal), true);

    const navFooter = await collect(page, '<nav><a href="https://brand.fixture.invalid/company/">運営会社</a></nav><footer><a href="https://brand.fixture.invalid/company/?from=footer#x">運営会社</a></footer>');
    assert.ok(navFooter.navLinks.length >= 1);
    assert.ok(navFooter.footerLinks.length >= 1);
    assert.strictEqual(navFooter.operatorRelationLinks.length, 1);

    const external = await collect(page, makeHtml(1500, 1200,
      '<a href="https://operator.fixture.invalid/about/outline">運営会社</a>'));
    const externalCandidates = hooks.collectOfficialExternalOperatorProfileCandidates_(external, origin);
    assert.strictEqual(externalCandidates.length, 1);
    assert.strictEqual(externalCandidates[0].officialExternalOperatorProfile, true);

    const unlabeled = await collect(page, makeHtml(800, 600,
      `<a href="${origin}/company/">詳細はこちら</a>`));
    assert.strictEqual(unlabeled.operatorRelationLinks.length, 0);

    console.log(JSON.stringify({
      pass: true,
      fixture: 'operator_identity_link_collection_integration_v1',
      cases: { before500: true, after500: true, after1200: true, navFooter: true, externalRelation: true, unlabeledExcluded: true, formalRecord: true }
    }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
