const assert = require('assert');
const { chromium } = require('playwright');
const { buildGeoSignalsV1 } = require('../index.js').__lightBudgetTestHooks;

const PROFILE_URLS = [
  'https://x.com/example_official',
  'https://facebook.com/example.official',
  'https://instagram.com/example_official',
  'https://youtube.com/channel/exampleofficial',
  'https://tiktok.com/@example_official'
];

async function observe(html, name) {
  const page = await globalThis.__scopedHeadingBrowser.newPage();
  try {
    const url = `https://${name}.example.test/`;
    await page.setContent(`<base href="${url}">${html}`, { waitUntil: 'domcontentloaded' });
    return await buildGeoSignalsV1(page, url, { balancedMode: false, shortFastMode: false });
  } finally {
    await page.close();
  }
}

function evidence(signals) {
  return signals.observed.links.externalProfileLinkEvidence;
}

function rowByHref(signals, href) {
  return evidence(signals).find(row => row.href === href);
}

function iconLinks(urls = PROFILE_URLS) {
  return urls.map(href => `<a href="${href}"><svg aria-hidden="true"></svg></a>`).join('');
}

(async () => {
  globalThis.__scopedHeadingBrowser = await chromium.launch({ headless: true });
  try {
    // A. The observed Shimamura-shaped DOM propagates its one section heading
    // to five unlabeled profile icons. "オフィシャルSNS" is an explicit,
    // bounded Japanese official-social expression.
    const official = await observe(`
      <section id="snsBlc"><h2>しまむらオフィシャルSNS</h2>
        <div class="wrapper2022"><div class="flxB"><ul class="iconBlc">${iconLinks()}</ul></div></div>
      </section>
    `, 'official');
    assert.equal(evidence(official).length, 5);
    assert.ok(evidence(official).every(row => row.nearbyLabel === 'しまむらオフィシャルSNS'));
    assert.equal(official.externalProfileObservationV1.officialProfileCount, 5);
    assert.equal(official.externalProfileObservationV1.relationConfirmed, true);

    // A responsive duplicate without context cannot prevent the later,
    // same-profile official section from supplying existing evidence.
    const duplicate = await observe(`
      <div hidden><a href="https://x.com/duplicate"><svg></svg></a></div>
      <section><h2>Official SNS</h2><a href="https://x.com/duplicate"><svg></svg></a></section>
    `, 'duplicate');
    assert.equal(rowByHref(duplicate, 'https://x.com/duplicate').nearbyLabel, 'Official SNS');
    assert.equal(duplicate.externalProfileObservationV1.officialProfileCount, 1);

    // Deduplication precedes the bounded response sample, preserving an
    // otherwise valid profile link that appears after unrelated video links.
    const beforeCap = Array.from({ length: 10 }, (_, index) => `<a href="https://youtube.com/watch?v=${index}">video</a>`).join('');
    const afterCap = await observe(`${beforeCap}<section><h2>Official SNS</h2><a href="https://x.com/after_cap"><svg></svg></a></section>`, 'after-cap');
    assert.equal(rowByHref(afterCap, 'https://x.com/after_cap').nearbyLabel, 'Official SNS');

    // A product label is weaker than an explicit official relation, while
    // equal official contexts remain stable in DOM order.
    const productDuplicate = await observe(`
      <section><h2>公式SNS</h2><a href="https://x.com/product_duplicate"><svg></svg></a></section>
      <section><h2>商品紹介動画</h2><a href="https://x.com/product_duplicate">動画を見る</a></section>
      <section><h2>公式SNS</h2><a href="https://x.com/equal_official"><svg></svg></a></section>
      <section><h2>協力ブランドの公式SNS</h2><a href="https://x.com/equal_official"><svg></svg></a></section>
    `, 'priority');
    assert.equal(rowByHref(productDuplicate, 'https://x.com/product_duplicate').nearbyLabel, '公式SNS');
    assert.equal(rowByHref(productDuplicate, 'https://x.com/equal_official').nearbyLabel, '公式SNS');

    // The observed duplicate shape can establish only the three profiles
    // that have scoped official context; channel and TikTok remain unknown.
    const threeOfficial = await observe(`
      <div hidden>${iconLinks()}</div>
      <section><h2>オフィシャルSNS</h2>
        <a href="${PROFILE_URLS[0]}"><svg></svg></a>
        <a href="${PROFILE_URLS[1]}"><svg></svg></a>
        <a href="${PROFILE_URLS[2]}"><svg></svg></a>
      </section>
    `, 'three-official');
    assert.equal(threeOfficial.externalProfileObservationV1.officialProfileCount, 3);
    assert.equal(threeOfficial.externalProfileObservationV1.relationConfirmed, true);
    assert.equal(rowByHref(threeOfficial, PROFILE_URLS[0]).nearbyLabel, 'オフィシャルSNS');
    assert.equal(rowByHref(threeOfficial, PROFILE_URLS[1]).nearbyLabel, 'オフィシャルSNS');
    assert.equal(rowByHref(threeOfficial, PROFILE_URLS[2]).nearbyLabel, 'オフィシャルSNS');
    assert.equal(rowByHref(threeOfficial, PROFILE_URLS[3]).nearbyLabel, '');
    assert.equal(rowByHref(threeOfficial, PROFILE_URLS[4]).nearbyLabel, '');

    // An empty nested semantic wrapper may defer to its enclosing section,
    // but a wrapper with its own heading remains decisive (covered below).
    const nestedGroup = await observe('<section><h2>公式SNS</h2><div role="group"><ul>' + iconLinks() + '</ul></div></section>', 'nested-group');
    assert.ok(evidence(nestedGroup).every(row => row.nearbyLabel === '公式SNS'));
    assert.equal(nestedGroup.externalProfileObservationV1.officialProfileCount, 5);

    // Existing English wording remains accepted.
    const english = await observe('<section><h2>Official SNS</h2>' + iconLinks() + '</section>', 'english');
    assert.equal(english.externalProfileObservationV1.officialProfileCount, 5);

    // B and I. A product-video section is separate evidence, never part of
    // the official profile group.
    const productVideo = await observe(`
      <section><h2>公式SNS</h2>${iconLinks()}</section>
      <section><h2>商品紹介動画</h2><a href="https://youtube.com/watch?v=example"><svg></svg></a></section>
    `, 'product-video');
    const video = rowByHref(productVideo, 'https://youtube.com/watch?v=example');
    assert.equal(video.nearbyLabel, '商品紹介動画');
    assert.equal(productVideo.externalProfileObservationV1.officialProfileCount, 5);
    assert.equal(productVideo.externalProfileObservationV1.profiles.find(row => row.href === video.href).relationConfirmed, false);

    // A sibling section cannot inherit another section's official heading.
    const separateSection = await observe('<section><h2>オフィシャルSNS</h2></section><section><a href="https://x.com/separate"><svg></svg></a></section>', 'separate-section');
    assert.equal(rowByHref(separateSection, 'https://x.com/separate').nearbyLabel, '');
    assert.equal(separateSection.externalProfileObservationV1.officialProfileCount, 0);

    // C. Page/main headings are not inherited into child sections.
    const rootOnly = await observe('<main><h2>公式SNS</h2><div><a href="https://x.com/root_only"><svg></svg></a></div></main>', 'root-only');
    assert.equal(rowByHref(rootOnly, 'https://x.com/root_only').nearbyLabel, '');

    // D. Multiple headings in the same semantic container are ambiguous.
    const ambiguous = await observe('<section><h2>公式SNS</h2><h3>商品情報</h3><a href="https://x.com/ambiguous"><svg></svg></a></section>', 'ambiguous');
    assert.equal(rowByHref(ambiguous, 'https://x.com/ambiguous').nearbyLabel, '');

    // E. Existing explicit metadata always wins.
    const explicit = await observe('<section><h2>公式SNS</h2><a data-label="既存の明示ラベル" href="https://x.com/explicit"><svg></svg></a></section>', 'explicit');
    assert.equal(rowByHref(explicit, 'https://x.com/explicit').nearbyLabel, '既存の明示ラベル');

    // F. Existing aria metadata is retained and does not gain a conflicting
    // structural label.
    const aria = await observe('<section><h2>公式SNS</h2><a aria-label="動画を見る" href="https://youtube.com/channel/aria"><svg></svg></a></section>', 'aria');
    assert.equal(rowByHref(aria, 'https://youtube.com/channel/aria').ariaLabel, '動画を見る');
    assert.equal(rowByHref(aria, 'https://youtube.com/channel/aria').nearbyLabel, '');

    // G. No explicit heading preserves existing unlabeled behavior.
    const noHeading = await observe('<section><a href="https://x.com/no_heading"><svg></svg></a></section>', 'no-heading');
    assert.equal(rowByHref(noHeading, 'https://x.com/no_heading').nearbyLabel, '');

    // H. A nested, separately labelled brand group cannot inherit the outer
    // official-SNS heading; only its own nearest section is considered.
    const otherBrand = await observe(`
      <section><h2>公式SNS</h2><section><h3>協力ブランドのオフィシャルSNS</h3><a aria-label="協力ブランド SNS" href="https://x.com/other_brand"><svg></svg></a></section></section>
    `, 'other-brand');
    const other = rowByHref(otherBrand, 'https://x.com/other_brand');
    assert.equal(other.nearbyLabel, '');
    assert.equal(otherBrand.externalProfileObservationV1.officialProfileCount, 0);
    assert.equal(otherBrand.externalProfileObservationV1.relationConfirmed, false);
  } finally {
    await globalThis.__scopedHeadingBrowser.close();
    delete globalThis.__scopedHeadingBrowser;
  }
  console.log('external profile scoped heading context: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
