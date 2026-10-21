const assert = require('assert');
const { chromium } = require('playwright');
const hooks = require('../index.js').__lightBudgetTestHooks;

const origin = 'https://brand.fixture.invalid';

function addDisclosureCandidates(links) {
  const map = new Map();
  const summary = { formalDisclosure: 0 };
  hooks.addFormalDisclosureRouteCandidatesFromLinks_(links, origin, map, summary, 6);
  return { map, summary };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.route(`${origin}/**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main>fixture</main>' }));
    await page.goto(`${origin}/`);
    const filler = Array.from({ length: 720 }, (_, i) => `<a href="${origin}/products/${i}/">製品${i}</a>`).join('');
    await page.setContent(`<main>
      ${filler}
      <footer>
        <a href="${origin}/company/">会社概要</a>
        <a href="${origin}/privacy.php">個人情報の取り扱いについて</a>
        <a href="${origin}/terms/">利用規約</a>
      </footer>
    </main>`);
    const links = await hooks.collectDiscoverLinksFromPage(page);

    // 1, 2, 3, 5: normal/footer company and privacy links survive the normal
    // link cap through the dedicated formal-disclosure lane.
    assert.strictEqual(links.allLinks.length, 500);
    assert.deepStrictEqual(links.formalDisclosureLinks.map(x => x.href).sort(), [
      `${origin}/company/`, `${origin}/privacy.php`, `${origin}/terms/`
    ].sort());
    const discovered = addDisclosureCandidates(links.formalDisclosureLinks);
    assert.strictEqual(discovered.map.size, 3);
    assert.strictEqual(discovered.summary.formalDisclosure, 3);

    // 4: a sitemap-derived company page remains a normal candidate and can be
    // selected only by the existing bounded company-profile rule.
    const sitemapCompany = { url: `${origin}/company/`, label: '会社概要', source: 'sitemap', sources: ['sitemap', 'nav'] };
    assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(sitemapCompany).probeEligible, true);

    // 6, 7, 8: a name mismatch, brand mismatch, or privacy disclosure alone
    // must never become a formal operator record.
    const privacyOnly = Array.from(discovered.map.values()).find(x => /privacy\.php$/.test(x.url));
    assert.strictEqual(hooks.selectOperatorIdentityProbeCandidate_([privacyOnly], 'corporate'), null);
    assert.strictEqual(hooks.isFormalOperatorIdentityRecord_({ observed: true, hasOperatorInfo: false, companyName: '架空子会社株式会社' }), false);
    assert.strictEqual(hooks.buildExplicitOperatorIdentityRelationEvidenceV1_({ url: `${origin}/company/`, label: '会社概要', operatorRelationSourceOrigin: origin }), null);

    // 9: explicit operating-company wording remains the existing path for a
    // positive relation; 10 and 11: failed/unsafe routes cannot manufacture it.
    const explicit = { url: `${origin}/company/`, label: '運営会社', operatorRelationSource: 'explicit_body_company_profile_relation', operatorRelationSourceOrigin: origin, officialSameOriginOperatorProfile: true };
    assert.ok(hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(explicit));
    assert.strictEqual(hooks.normalizeDiscoverSubpageUrl('http://127.0.0.1/company/', origin), null);
    assert.strictEqual(hooks.normalizeDiscoverSubpageUrl('https://other.fixture.invalid/company/', origin), null);

    // 12: existing relation fixtures continue to own Mitsui/Nifco-style
    // explicit relation semantics; this change only supplies discovery input.
    assert.strictEqual(hooks.isFormalDisclosureRouteCandidate_({ href: `${origin}/company/contribution/`, text: 'CSR' }, origin), true);
    console.log(JSON.stringify({ pass: true, fixture: 'operator_identity_formal_disclosure_discovery_v1', cases: 12 }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
