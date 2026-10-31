const assert = require('assert');
const { parseSubpageJsonLdLightHtml } = require('../index.js').__lightBudgetTestHooks;
const page = parseSubpageJsonLdLightHtml('https://fixture.invalid/about/', 'https://fixture.invalid/about/', 200, `
  <h1>企業情報</h1><a href="/social/">公式アカウント一覧はこちら</a>
  <a href="https://x.com/example">架空企業</a><a href="https://x.com/example/">重複</a>
  <a href="https://x.com/brand">架空ブランド</a><a href="http://x.com/insecure">除外</a>
  <a href="https://other.invalid/social/">公式SNS一覧</a>`, 'generic');
assert.equal(page.officialListingLinks.length, 1);
assert.equal(page.officialListingLinks[0].href, 'https://fixture.invalid/social/');
assert.equal(page.externalProfileLinkEvidence.length, 2);
assert.equal(page.externalProfileLinkEvidence[0].observationComplete, true);
assert.equal(page.externalProfileLinkEvidence[0].provenance, 'subpage_html_light');
assert.equal(page.jsonldTypes.length, 0);
console.log('external profile listing handoff: PASS');
