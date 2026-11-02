const assert = require('assert');
const { chromium } = require('playwright');
const { buildGeoSignalsV1, buildExternalProfileObservationV1_ } = require('../index.js').__lightBudgetTestHooks;

async function observe(html, name) {
  const page = await globalThis.__iconListBrowser.newPage();
  try {
    const url = `https://${name}.fixture.test/`;
    await page.setContent(`<base href="${url}">${html}`, { waitUntil: 'domcontentloaded' });
    return await buildGeoSignalsV1(page, url, { balancedMode: false, shortFastMode: false });
  } finally {
    await page.close();
  }
}
function profileRows(signals) { return signals.externalProfileObservationV1.profiles; }

(async () => {
  globalThis.__iconListBrowser = await chromium.launch({ headless: true });
  try {
    // A: an explicit official title and multiple profile links make this a
    // first-party account list; image alt supplies each otherwise-empty label.
    const official = await observe(`
      <section><div><p>架空社公式SNS</p><ul>
        <li><a href="https://x.com/fixture"><img alt="X" src="x.svg"></a></li>
        <li><a href="https://instagram.com/fixture"><img alt="Instagram" src="i.svg"></a></li>
      </ul></div></section>`, 'official-icon-list');
    assert.equal(official.externalProfileObservationV1.officialProfileCount, 2);
    assert.equal(official.externalProfileObservationV1.relationConfirmed, true);
    assert.ok(profileRows(official).every((row) => row.label));
    assert.ok(profileRows(official).every((row) => row.relationConfirmed));

    // B: an existing explicit anchor label remains sufficient.
    const textLabel = await observe('<a href="https://x.com/text">公式 X</a>', 'text-label');
    assert.equal(textLabel.externalProfileObservationV1.officialProfileCount, 1);

    // C/D/E: a bare social link, article body mention, or unlabeled list must
    // not become an official profile relation.
    const bare = await observe('<a href="https://x.com/bare"><img alt="X" src="x.svg"></a>', 'bare');
    assert.equal(bare.externalProfileObservationV1.officialProfileCount, 0);
    const article = await observe('<article><p>公式SNS</p><ul><li><a href="https://x.com/article">公式 X<img alt="X" src="x.svg"></a></li><li><a href="https://instagram.com/article">公式 Instagram<img alt="Instagram" src="i.svg"></a></li></ul></article>', 'article');
    assert.equal(article.externalProfileObservationV1.officialProfileCount, 0);
    const noAlt = await observe('<section><ul><li><a href="https://x.com/no-alt"><img alt="" src="x.svg"></a></li><li><a href="https://instagram.com/no-alt"><img alt="" src="i.svg"></a></li></ul></section>', 'no-alt');
    assert.equal(noAlt.externalProfileObservationV1.officialProfileCount, 0);

    // F: complete authority remains mandatory.
    const limited = buildExternalProfileObservationV1_({ externalProfileLinkEvidence: [{ href: 'https://x.com/limited', text: '公式 X' }] }, { linksObserved: true, linksLimited: true });
    assert.equal(limited.completeness, 'partial');
    assert.equal(limited.limited, true);
  } finally {
    await globalThis.__iconListBrowser.close();
    delete globalThis.__iconListBrowser;
  }
  console.log('external profile icon-list context: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
