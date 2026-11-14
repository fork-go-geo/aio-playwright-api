'use strict';

const assert = require('node:assert/strict');
const hooks = require('../index.js').__lightBudgetTestHooks;

const base = {
  checked: true,
  frameComplete: true,
  failureKind: null,
  sitemapLinkDiscoveryComplete: true
};

assert.equal(hooks.isCoverageObservationV2StableDocumentState_('interactive'), true);
assert.equal(hooks.isCoverageObservationV2StableDocumentState_('complete'), true);
assert.equal(hooks.isCoverageObservationV2StableDocumentState_('loading'), false);
assert.equal(hooks.isCoverageObservationV2StableDocumentState_(''), false);

const interactive = hooks.buildHtmlSitemapCandidateDiscoveryV1_(Object.assign({}, base, {
  renderComplete: hooks.isCoverageObservationV2StableDocumentState_('interactive')
}), ['https://fixture.invalid/sitemap/']);
assert.equal(interactive.completeness, 'complete');
assert.equal(interactive.failureKind, null);

const loading = hooks.buildHtmlSitemapCandidateDiscoveryV1_(Object.assign({}, base, {
  renderComplete: hooks.isCoverageObservationV2StableDocumentState_('loading')
}), ['https://fixture.invalid/sitemap/']);
assert.equal(loading.completeness, 'partial');
assert.equal(loading.failureKind, 'render_incomplete');

const fetchFailed = hooks.buildHtmlSitemapCandidateDiscoveryV1_(Object.assign({}, base, {
  renderComplete: true,
  failureKind: 'timeout'
}), ['https://fixture.invalid/sitemap/']);
assert.equal(fetchFailed.completeness, 'partial');
assert.equal(fetchFailed.failureKind, 'timeout');

const sparseFrameShell = hooks.buildHtmlSitemapCandidateDiscoveryV1_(Object.assign({}, base, {
  renderComplete: true, frameComplete: false, hasFrame: true, hasFrameset: false,
  mainContentObserved: false, mainTextLength: 299
}), []);
assert.equal(sparseFrameShell.completeness, 'partial');
assert.equal(sparseFrameShell.failureKind, 'frame_incomplete');

console.log('html sitemap rendered-document completeness fixtures: PASS');
