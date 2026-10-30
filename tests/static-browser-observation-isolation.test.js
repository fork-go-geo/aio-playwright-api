const assert = require('node:assert/strict');
const hooks = require('../index.js').__lightBudgetTestHooks;

function browserSignals() {
  return {
    headings: { h1Count: 0, headingObservationLimited: false },
    landmarks: { hasMainLandmark: false },
    coverage: { semanticElements: { hasHeaderElement: false, hasNavElement: false, hasFooterElement: false, hasMainElement: false, hasSemanticStructure: false } },
    structuredData: { rawCount: 0, types: [], renderedDomObserved: true },
    observed: {
      title: { observed: true, value: 'Browser title' },
      metaDescription: { observed: true, value: 'Browser description' },
      h1: { observed: true, values: [], count: 0 },
      headingCollectionObserved: true,
      body: { observed: true, textLength: 1600 }
    },
    diagnostics: {}
  };
}

function browserSummary() {
  return {
    title: 'Browser title', metaDescription: 'Browser description', metaDescriptionLen: 19,
    h1Count: 0, jsonldCount: 0, jsonldTypes: [], hasMainLandmark: false
  };
}

function staticResult(status, success, overrideSignals) {
  const baseSignals = {
    title: 'Node title', metaDescription: 'Node description', h1Count: 1, h1Texts: ['Node H1'],
    hasMainElement: true, hasHeaderElement: true, hasNavElement: true, hasFooterElement: true,
    hasSemanticStructure: true, jsonLdCount: 1, jsonLdTypes: ['Organization'],
    navTextsSample: ['About'], internalLinksSample: ['/about'], footerTextsSample: [],
    footerExternalLinksSample: [], bodyTextLength: 300, parseSucceeded: true, success: true
  };
  return {
    status,
    success,
    url: 'https://fixture.invalid/', finalUrl: 'https://fixture.invalid/',
    signals: success ? Object.assign(baseSignals, overrideSignals || {}) : null
  };
}

function merge(staticStatus, staticSuccess, browserStatus) {
  const geo = browserSignals();
  const summary = browserSummary();
  hooks.mergeTopPageStaticSignalsIntoPayload_(geo, summary, staticResult(staticStatus, staticSuccess), { browserStatus });
  return { geo, summary, staticStatus, browserStatus };
}

// A static 403 must not alter a completed browser 200 observation.
const node403Browser200 = merge(403, false, 200);
assert.equal(node403Browser200.summary.title, 'Browser title');
assert.equal(node403Browser200.summary.h1Count, 0);
assert.equal(node403Browser200.geo.diagnostics.observationProvenanceV1.sources.node_static.state, 'unavailable');

// When both transports fail, no static value is available to merge.
const node403Browser403 = merge(403, false, 403);
assert.equal(node403Browser403.summary.title, 'Browser title');
assert.equal(node403Browser403.summary.h1Count, 0);

// Completed Browser negatives remain authoritative even when Node saw positive
// static values. Differences are audit-only provenance, never score inputs.
const node200Browser200Different = merge(200, true, 200);
assert.equal(node200Browser200Different.summary.title, 'Browser title');
assert.equal(node200Browser200Different.geo.headings.h1Count, 0);
assert.equal(node200Browser200Different.summary.h1Count, 0);
assert.equal(node200Browser200Different.summary.jsonldCount, 0);
assert.deepEqual(node200Browser200Different.summary.jsonldTypes, []);
assert.deepEqual(node200Browser200Different.geo.diagnostics.observationProvenanceV1.merge.appliedFields, ['article_signals']);
assert.deepEqual(node200Browser200Different.geo.diagnostics.observationProvenanceV1.merge.disagreements.sort(), ['h1', 'jsonld', 'title']);
assert.equal(node200Browser200Different.geo.structuredData.hasOrganization, undefined);
assert.equal(node200Browser200Different.geo.structuredData.hasBreadcrumbList, undefined);
assert.deepEqual(Object.keys(node200Browser200Different.geo.diagnostics.observationProvenanceV1.sources).sort(), [
  'browser_rendered', 'node_static', 'observation_limited', 'static_only_fallback'
]);
assert.equal(JSON.stringify(node200Browser200Different.geo.diagnostics.observationProvenanceV1).includes('Node H1'), false);

// Equal successful observations do not need a merge and remain explicitly
// Browser-owned, avoiding accidental source conversion for a normal page.
const sameGeo = browserSignals();
const sameSummary = browserSummary();
hooks.mergeTopPageStaticSignalsIntoPayload_(sameGeo, sameSummary, staticResult(200, true, {
  title: 'Browser title', metaDescription: 'Browser description', h1Count: 0, h1Texts: [],
  jsonLdCount: 0, jsonLdTypes: [], hasMainElement: false, hasHeaderElement: false,
  hasNavElement: false, hasFooterElement: false, hasSemanticStructure: false
}), { browserStatus: 200 });
assert.equal(sameSummary.title, 'Browser title');
assert.equal(sameSummary.h1Count, 0);
assert.equal(sameSummary.jsonldCount, 0);
assert.deepEqual(sameGeo.diagnostics.observationProvenanceV1.merge.disagreements, []);

// Browser HTTP failures and thin WAF error documents never accept static
// values as an entry-document substitute.
const node200Browser403 = merge(200, true, 403);
assert.equal(node200Browser403.summary.h1Count, 0);
assert.equal(node200Browser403.geo.diagnostics.observationProvenanceV1.merge.allowed, false);
const nodeTimeoutBrowser200 = merge(null, false, 200);
assert.equal(nodeTimeoutBrowser200.summary.h1Count, 0);
assert.equal(nodeTimeoutBrowser200.geo.diagnostics.observationProvenanceV1.sources.node_static.state, 'unavailable');
const wafGeo = browserSignals();
const wafSummary = Object.assign(browserSummary(), { title: 'Access Denied', bodyTextLength: 209 });
wafGeo.observed.h1 = { observed: true, values: ['Access Denied'], count: 1 };
wafGeo.observed.primaryMessageObservationSeedV2 = {
  text: 'Access Denied. You do not have permission to access this page. Reference: errors.edgesuite.net'
};
hooks.mergeTopPageStaticSignalsIntoPayload_(wafGeo, wafSummary, staticResult(200, true), { browserStatus: 200 });
assert.equal(wafSummary.jsonldCount, 0);
assert.equal(wafGeo.diagnostics.observationProvenanceV1.sources.browser_rendered.state, 'error_document');

// A Browser field that is explicitly incomplete, rather than confirmed false,
// can receive static-only supplemental data with its provenance retained.
const incompleteGeo = browserSignals();
const incompleteSummary = browserSummary();
incompleteGeo.observed.headingCollectionObserved = false;
incompleteGeo.observed.h1 = { observed: false, values: [], count: 0 };
incompleteGeo.headings.headingObservationLimited = true;
incompleteGeo.structuredData = { types: [], observationLimited: true };
hooks.mergeTopPageStaticSignalsIntoPayload_(incompleteGeo, incompleteSummary, staticResult(200, true), { browserStatus: 200 });
assert.equal(incompleteSummary.h1Count, 1);
assert.equal(incompleteSummary.jsonldCount, 1);
assert.ok(incompleteGeo.diagnostics.observationProvenanceV1.merge.appliedFields.includes('h1'));

const staticOnly = hooks.buildStaticFallbackGeoSignalsPayload_(
  'https://fixture.invalid/', staticResult(200, true), { playwrightFailed: true }
);
assert.equal(staticOnly.geoSignalsV1.diagnostics.staticFallbackOnly, true);
assert.equal(staticOnly.geoSignalsV1.diagnostics.playwrightFailed, true);
assert.equal(staticOnly.geoSignalsV1.diagnostics.observationProvenanceV1.sources.static_only_fallback, true);

console.log(JSON.stringify({
  pass: true,
  fixture: 'static_browser_observation_isolation_v1',
  combinations: {
    node200Browser200: 'browser_complete_values_preserved',
    node403Browser200: 'browser_only',
    node200Browser403: 'entry_http_failure_blocks_static_merge',
    node403Browser403: 'no_static_merge',
    node200Browser200DifferentContent: 'browser_values_preserved_with_audit_only_disagreement',
    node200Browser200DifferentJsonLd: 'confirmed_browser_zero_preserved',
    nodeTimeoutBrowser200: 'browser_only',
    browserObservationIncomplete: 'node_static_supplement_allowed'
  },
  designGap: null
}));
