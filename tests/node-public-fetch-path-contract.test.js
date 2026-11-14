const assert = require('assert');
const fs = require('fs');
const path = require('path');

// This is a source-contract regression test.  Network behavior (DNS pinning,
// peer comparison, redirects, limits, and aborts) is covered by the shared
// safe-request fixtures.  This test makes each producer keep using that shared
// transport with its pre-existing HTTP contract.
const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
assert.ok(source.includes("const GEO_UNIFIED_OBSERVER_HTML_UA_V1_ = 'geo-unified-observer-html/1.0'"));
assert.ok(source.includes("const GEO_UNIFIED_OBSERVER_SITEMAP_UA_V1_ = 'geo-unified-observer-sitemap/1.0'"));
assert.equal(source.includes('Chrome/122.0.0.0'), false,
  'Node public fetches must not claim an unrelated browser version');

function block(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end >= 0, `missing end marker ${endMarker}`);
  return source.slice(start, end);
}

function includesAll(name, text, fragments) {
  fragments.forEach(fragment => assert.ok(text.includes(fragment), `${name}: missing ${fragment}`));
}

const discovery = block('async function fetchDiscoverSubpageText', '\nfunction parseDiscoverSitemapXml');
includesAll('robots/sitemap discovery', discovery, [
  'fetchPublicSiteTextV1_(url',
  "'Accept': 'application/xml,text/xml,text/html,*/*;q=0.8'",
  "'User-Agent': GEO_UNIFIED_OBSERVER_SITEMAP_UA_V1_",
  'maxBytes: 2 * 1024 * 1024',
  'finalUrl: response && response.url || url',
  'status: null, text: \'\''
]);

const sitemap = block('async function collectDiscoverSitemapCandidates', '\nasync function collectDiscoverLinksFromPage');
includesAll('sitemap discovery', sitemap, [
  "['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']",
  'fetchDiscoverSubpageText(sitemapUrl, 8000',
  'fetchDiscoverSubpageText(childUrl, 8000',
  'childParsed.origin !== origin'
]);

const aiPolicy = block('async function collectAiPolicyTrustSignalV1_', '\nfunction attachAiPolicyTrustSignalToGeoSignalsV1_');
includesAll('AI policy', aiPolicy, [
  'fetchPublicSiteTextV1_(url',
  "'Accept': 'text/plain,*/*;q=0.8'",
  "'User-Agent': 'geo-unified-observer-aio-check/1.0'",
  '${origin}/robots.txt',
  '${origin}/llms.txt',
  '${origin}/llms-full.txt',
  'buildAiPolicyTrustSignalV1_(origin, { robots, llmsTxt, llmsFullTxt })'
]);

const htmlSitemap = block('async function collectHtmlSitemapCoverageSignalV1_', '\nfunction attachHtmlSitemapCoverageSignalToGeoSignalsV1_');
includesAll('HTML sitemap', htmlSitemap, [
  'fetchPublicSiteTextV1_(url',
  'maxBytes:500000',
  "'User-Agent':'geo-unified-observer-html-sitemap/1.0'",
  'buildHtmlSitemapCoverageSignalV1_(origin, observations',
  'pageLinkCandidateCount:linkedUrls.length'
]);

const news = block('async function fetchNewsIndexFreshnessSignalsLight_', '\nasync function attachNewsIndexFreshnessSignalsLight_');
includesAll('news index', news, [
  'fetchPublicSiteTextV1_(url',
  'maxBytes: 2 * 1024 * 1024',
  "'User-Agent': GEO_UNIFIED_OBSERVER_HTML_UA_V1_",
  'finalParsed.origin !== initialUrl.origin',
  'buildNewsIndexFreshnessSignalsFromText_(text, finalUrl || url)'
]);

const topPage = block('async function fetchTopPageStaticSignals_', '\nfunction buildLightStaticFetchTrace_');
includesAll('top-page static fetch', topPage, [
  'fetchPublicSiteTextV1_(url',
  'maxBytes: 2 * 1024 * 1024',
  "'User-Agent': GEO_UNIFIED_OBSERVER_HTML_UA_V1_",
  'unsupported_content_type:',
  'extractTopPageStaticSignalsFromHtml_',
  'controller.abort()'
]);

const safeTransport = block('async function fetchValidatedTextResponseV1_', '\nasync function validateOutboundHttpUrlV1_');
includesAll('shared safe transport', safeTransport, [
  'requestValidatedSubpageHtmlV1_',
  'maxRedirects',
  'SSRF_REDIRECT_REJECTED',
  'rejectHttpsDowngrade',
  'headersForUrl'
]);

const authenticatedHtml = block('async function requestValidatedSubpageHtmlV1_', '\nasync function fetchValidatedTextResponseV1_');
includesAll('validated HTML and Basic-auth transport', authenticatedHtml, [
  "'User-Agent': GEO_UNIFIED_OBSERVER_HTML_UA_V1_",
  'opts.headers || {}'
]);

console.log(JSON.stringify({
  pass: true,
  fixture: 'node_public_fetch_path_contract_v1',
  paths: ['robots', 'sitemap', 'ai_policy', 'html_sitemap', 'news_index', 'top_page_static_fetch']
}));
