#!/usr/bin/env node
'use strict';

const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;
const { buildHtmlSitemapCoverageSignalV1_, HTML_SITEMAP_STANDARD_PATHS_V1_ } = hooks;

const origin = 'https://fixture.example';
const urls = HTML_SITEMAP_STANDARD_PATHS_V1_.map(path => `${origin}${path}`);
const response = (url, status, text = '', extra = {}) => Object.assign({ url, status, text, contentType: 'text/html' }, extra);
const validHtml = '<!doctype html><html><title>サイトマップ</title><body><h1>サイトマップ</h1><ul>' +
  Array.from({ length: 5 }, (_, i) => `<li><a href="/p${i}/">page ${i}</a></li>`).join('') + '</ul></body></html>';

// A: complete all-404 missing.
const all404 = buildHtmlSitemapCoverageSignalV1_(origin, urls.map(url => response(url, 404)));
assert.strictEqual(all404.authority, 'cloud_run_geoSignalsV1_coverageSignals_htmlSitemap_v1');
assert.strictEqual(all404.observationComplete, true);
assert.strictEqual(all404.candidateCount, 8);
assert.strictEqual(all404.checkedCount, 8);
assert.strictEqual(all404.hasHtmlSitemap, false);
assert.strictEqual(all404.result, 'missing');
assert.strictEqual(all404.serverError, false);
assert.strictEqual(all404.timeout, false);

// B: one valid 200 is found.
const found = buildHtmlSitemapCoverageSignalV1_(origin, urls.map((url, index) => response(url, index === 2 ? 200 : 404, index === 2 ? validHtml : '')));
assert.strictEqual(found.observationComplete, true);
assert.strictEqual(found.hasHtmlSitemap, true);
assert.strictEqual(found.result, 'found');
assert.strictEqual(found.matchedUrl, urls[2]);

// C: an invalid 200 does not become positive; remaining 404s establish missing.
const invalid200 = buildHtmlSitemapCoverageSignalV1_(origin, urls.map((url, index) => response(url, index === 0 ? 200 : 404, index === 0 ? '<html><title>About</title><a href="/">home</a></html>' : '')));
assert.strictEqual(invalid200.observationComplete, true);
assert.strictEqual(invalid200.hasHtmlSitemap, false);
assert.strictEqual(invalid200.result, 'missing');
assert.strictEqual(invalid200.candidates[0].status, 'invalid_content');

// D/E/F: access denied, server error and timeout remain limited/unknown.
const denied = buildHtmlSitemapCoverageSignalV1_(origin, urls.map((url, index) => response(url, index === 1 ? 403 : 404)));
assert.strictEqual(denied.observationComplete, false);
assert.strictEqual(denied.hasHtmlSitemap, null);
assert.strictEqual(denied.result, 'limited');
assert.strictEqual(denied.candidates[1].status, 'access_denied');
const serverError = buildHtmlSitemapCoverageSignalV1_(origin, urls.map((url, index) => response(url, index === 1 ? 503 : 404)));
assert.strictEqual(serverError.observationComplete, false);
assert.strictEqual(serverError.hasHtmlSitemap, null);
assert.strictEqual(serverError.serverError, true);
assert.strictEqual(serverError.result, 'limited');
const timeout = buildHtmlSitemapCoverageSignalV1_(origin, urls.map((url, index) => index === 1 ? response(url, null, '', { errorMessage: 'AbortError: timeout' }) : response(url, 404)));
assert.strictEqual(timeout.observationComplete, false);
assert.strictEqual(timeout.hasHtmlSitemap, null);
assert.strictEqual(timeout.timeout, true);
assert.strictEqual(timeout.result, 'limited');

// G: a page-link-discovered, valid sitemap remains positive even if all
// conventional paths are absent.
const linkedUrl = `${origin}/company-map/`;
const linkedFound = buildHtmlSitemapCoverageSignalV1_(origin, urls.map(url => response(url, 404)).concat([response(linkedUrl, 200, validHtml)]), { pageLinkCandidateCount: 1 });
assert.strictEqual(linkedFound.hasHtmlSitemap, true);
assert.strictEqual(linkedFound.observationComplete, true);
assert.strictEqual(linkedFound.matchedUrl, linkedUrl);

// H: Cloud Run's complete 404 authority is intentionally distinct from a
// legacy GAS 501 observation; callers can choose the former without coercion.
const legacyGas501 = { result: 'limited', hasHtmlSitemap: null, httpStatus: 501, observationLimited: true };
assert.strictEqual(all404.result, 'missing');
assert.strictEqual(all404.hasHtmlSitemap, false);
assert.strictEqual(legacyGas501.result, 'limited');
assert.strictEqual(legacyGas501.httpStatus, 501);

console.log('html-sitemap-authority-observation: PASS');
