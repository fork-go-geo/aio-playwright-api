const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const childSignals = {
  htmlLength: 4000,
  bodyTextLength: 1200,
  bodyTextSample: 'child content',
  headings: { h1: ['Child'], h2: ['Services'], h3: [] },
  semantic: { hasHeaderElement: true, hasNavElement: true, hasFooterElement: true, hasMainElement: true },
  links: { total: 8, navTextsSample: ['会社情報'], internalLinksSample: [{ text: '個人情報保護方針', href: 'https://example.test/privacy', inNav: true }], hasCompanyLikeLink: true, hasServiceLikeLink: true, hasContactLikeLink: true, hasPrivacyLikeLink: true, hasSitemapLikeLink: true },
  images: { altTotal: 2, altMissingCount: 0 },
  structuredData: { types: ['WebSite', 'Organization', 'BreadcrumbList'], rawCount: 3, parseableCount: 3, parseErrorsCount: 0, hasJsonLd: true, hasWebsite: true, hasOrganization: true, hasBreadcrumbList: true, sameAsCount: 1, sameAsValuesSample: ['https://social.example/profile'] },
  trust: { hasPrivacyPolicyLink: true, hasContactLink: true, hasCompanyLink: true, hasAddress: true, hasPhone: true },
  candidates: { sitemap: true, breadcrumb: true, faq: true }
};

function makeFrame(url, parent, signals, fail, shell) {
  return {
    url: () => url,
    parentFrame: () => parent,
    evaluate: async () => {
      if (fail) throw new Error(fail);
      return shell || signals;
    }
  };
}

async function run() {
  // Normal HTML: there is no child scope and no frame authority is invented.
  const main = makeFrame('https://entry.example/', null, null, null, { hasFrameset: false, frameCount: 0, hasMain: true, bodyTextLength: 500 });
  const normal = await hooks.collectFrameContentObservationV1_({ mainFrame: () => main, frames: () => [main] }, 'https://entry.example/');
  assert.equal(normal.contentScopeComplete, false);
  assert.equal(normal.authority, 'parent_html_only');

  // One loaded child is the selected content scope; JSON-LD, links, alt and
  // trust signals are carried with explicit child provenance.
  const shellMain = makeFrame('https://entry.example/frameset', null, null, null, { hasFrameset: true, frameCount: 1, hasMain: false, bodyTextLength: 0 });
  const child = makeFrame('https://content.example/top', shellMain, childSignals);
  const complete = await hooks.collectFrameContentObservationV1_({ mainFrame: () => shellMain, frames: () => [shellMain, child] }, 'https://entry.example/');
  assert.equal(complete.contentScopeComplete, true);
  assert.equal(complete.authority, 'cloud_run_frame_content_v1');
  assert.deepEqual(complete.signals.structuredData.types, ['WebSite', 'Organization', 'BreadcrumbList']);
  const geo = { observed: {}, structuredData: {}, headings: {}, coverage: {}, trustSignals: {} };
  hooks.mergeFrameContentObservationIntoGeoSignalsV1_(geo, complete);
  assert.equal(geo.structuredData.hasOrganization, true);
  assert.equal(geo.observed.links.hasPrivacyLikeLink, true);
  assert.equal(geo.trustSignals.hasContactLink, true);
  assert.equal(geo.multimodalSignals.image.altTotal, 2);
  assert.equal(geo.bodyTextLength, 1200);
  assert.equal(geo.coverageFrameObservationV1.contentScopeComplete, true);

  // Failed and timeout-like child evaluations never become a completed
  // authority, so downstream GAS gates remain UNKNOWN rather than false.
  for (const reason of ['fetch_failed', 'Timeout 8000ms exceeded']) {
    const failedChild = makeFrame('https://content.example/unavailable', shellMain, null, reason);
    const failed = await hooks.collectFrameContentObservationV1_({ mainFrame: () => shellMain, frames: () => [shellMain, failedChild] }, 'https://entry.example/');
    assert.equal(failed.contentScopeComplete, false);
    assert.equal(failed.frameContentObserved, false);
    assert.equal(failed.authority, 'parent_html_only');
  }

  // Recursive frames beyond the bounded depth are not selected. Multiple
  // candidates are bounded and the most substantive successfully observed
  // child is selected.
  const first = makeFrame('https://content.example/a', shellMain, Object.assign({}, childSignals, { bodyTextLength: 10, links: Object.assign({}, childSignals.links, { total: 1 }) }));
  const second = makeFrame('https://content.example/b', shellMain, childSignals);
  const nested = makeFrame('https://content.example/deep', makeFrame('https://content.example/mid', second, childSignals), childSignals);
  const multi = await hooks.collectFrameContentObservationV1_({ mainFrame: () => shellMain, frames: () => [shellMain, first, second, nested] }, 'https://entry.example/');
  assert.equal(multi.contentScopeComplete, true);
  assert.equal(multi.selectedFrameUrl, 'https://content.example/b');
  assert(!multi.candidates.some(item => item.url === 'https://content.example/deep'));
  assert.equal(hooks.normalizeFrameContentUrlV1_('javascript:alert(1)', 'https://entry.example/'), null);
  assert.equal(hooks.normalizeFrameContentUrlV1_('/content', 'https://entry.example/'), 'https://entry.example/content');
  assert.equal(hooks.isUsableFrameContentObservationV1_({
    title: 'ERROR: The request could not be satisfied', htmlLength: 800, bodyTextLength: 500,
    bodyTextSample: '403 ERROR Request blocked. Generated by cloudfront', headings: { h1: ['403 ERROR'] }, links: { total: 0 }
  }), false);
  console.log('frame content observation fixtures passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
