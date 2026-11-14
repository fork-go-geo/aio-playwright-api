const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Fail before any accidental network access, including code paths caught internally.
const denyNetwork = () => { console.error('fixture forbids network'); process.exit(97); };
global.fetch = denyNetwork;
require('node:net').Socket.prototype.connect = denyNetwork;
for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  require('node:dns')[key] = denyNetwork;
  require('node:dns').promises[key] = denyNetwork;
}

// Run the real coverage orchestrator, selection, HTML parser and formal probe.
// Replace only I/O boundaries; no browser, DNS or remote HTTP is permitted.
const sourcePath = process.env.OPERATOR_FIXTURE_SOURCE || path.join(__dirname, '..', 'index.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const filename = path.join(__dirname, '..', 'operator-fixture-runtime.js');
const runtime = new Module(filename, module);
runtime.filename = filename;
runtime.paths = Module._nodeModulePaths(path.dirname(filename));
runtime._compile(source + `
module.exports.runCoverageFixture = async function(discovered, fetchPages, signals, opts) {
  discoverSubpageCandidatesLightData_ = async () => discovered;
  fetchSubpageHtmlLightUrls_ = fetchPages;
  attachMediaFreshnessArticleDomSignalsLight_ = async () => {};
  attachNewsIndexFreshnessSignalsLight_ = async () => {};
  resolveContactDestinationLight_ = async () => null;
  attachOfficialListingExternalProfileObservationV1_ = async () => {};
  observeSubpageJsonLdLightUrls_ = async () => { throw new Error('unexpected_browser_fallback'); };
  fetchSubpagePlaywrightScopedLight = async () => { throw new Error('unexpected_browser_fetch'); };
  return attachCoverageSignalsToGeoSignalsLight_(signals, 'https://brand.example.test/', opts);
};`, filename);
const hooks = runtime.exports.__lightBudgetTestHooks;
const route = source.slice(source.indexOf("logHeavySiteTopPageAudit('attachCoverageSignalsToGeoSignalsLight_call_start'"));
const limits = [...route.slice(0, route.indexOf('sourceRunId: runId')).matchAll(/maxObserve: (\d)/g)].map(m => +m[1]);
assert.equal(limits.length, 2, 'main path log and call remain the only limit changes');
assert.equal(limits[0], limits[1]);
// Exercise both observation counts through the existing orchestrator option;
// never rewrite the production route or the historical comparison sources.
const maxObserve = Number(process.env.OPERATOR_FIXTURE_MAX_OBSERVE || limits[1]);
assert.ok([2, 5].includes(maxObserve));
const legacy = process.env.EXPECT_COVERAGE_CONFLICT_BLOCK === '1';
const navigationBug = process.env.EXPECT_NAVIGATION_NAME_BUG === '1';
const origin = 'https://brand.example.test';
const landing = 'https://operator.example.test/company/';
const detail = 'https://operator.example.test/company/profile/';
const realTerms = process.env.OPERATOR_TERMS_HTML_PATH ? fs.readFileSync(process.env.OPERATOR_TERMS_HTML_PATH, 'utf8') : null;
const name = realTerms ? '株式会社クラシコム' : 'Example株式会社';
const profile = (company, address = '東京都千代田区1-1') =>
  `<dl><dt>会社名</dt><dd>${company}</dd><dt>所在地</dt><dd>${address}</dd></dl>`;
const html = (title, body) => `<title>${title}</title><main><h1>${title}</h1>${body}<p>${'検証本文。'.repeat(100)}</p></main>`;
const candidates = [
  ['/product_categories/1', '商品', 100, 'nav'],
  ['/note/users_guide/about/tokushohou', '特定商取引法に基づく表記', 99, 'footer'],
  ['/contents', 'コンテンツ', 98, 'nav'],
  ['/note/users_guide/about/user_terms', 'ご利用規約', 97, 'footer'],
  ['/product_categories/13', '商品カテゴリ', 96, 'nav'],
].map(([p, label, score, source]) => ({ url: origin + p, path: p, label, score, source, sources: [source] }));
const official = hooks.collectOfficialExternalOperatorProfileCandidates_({
  navLinks: [], footerLinks: [], allLinks: [{ href: landing, text: '運営会社', groupHeading: '運営会社' }]
}, origin);
assert.equal(official.length, 1);
const rows = [];

async function run(kind, siteMode = 'ec', signals = {}) {
  const calls = [];
  const documents = new Map(candidates.map(c => [c.url, html(c.label, '')]));
  documents.set(candidates[1].url, html(candidates[1].label, profile(name)));
  documents.set(candidates[3].url, html(candidates[3].label, profile(
    kind === 'other_coverage_company' ? 'Other株式会社' : name, '東京都千代田区一丁目1番地'
  )));
  if (kind === 'real_terms') documents.set(candidates[3].url, realTerms);
  if (kind === 'navigation_company') documents.set(candidates[3].url, html(candidates[3].label,
    '<div class="local-navigation"><a href="/company">運営会社 Other株式会社</a></div><footer><p><a href="/company">運営会社</a></p><p><a href="/jobs">募集案内</a></p></footer>'));
  if (kind === 'linked_other_company') documents.set(candidates[3].url, html(candidates[3].label,
    '<p>運営会社：<a href="/company">Other株式会社</a></p><p>所在地：東京都千代田区1-1</p>'));
  const landingFields = kind === 'formal_company_conflict' ? '<dl><dt>会社名</dt><dd>Other株式会社</dd></dl>' : '';
  documents.set(landing, html('企業情報', landingFields + '<a href="/company/profile/">会社概要</a>'));
  documents.set(detail, html('会社概要', profile(kind === 'missing_name' ? '' : name)));
  const operatorCandidates = kind === 'no_candidate' ? [] : (kind === 'no_relation' ? [{
    url: landing, label: '会社概要', source: 'nav', sources: ['nav', 'sitemap'], score: 100
  }] : official);
  const budget = hooks.createLightRequestBudget_(Date.now());
  const discovered = { candidates, totalCandidates: candidates.length, sourceSummary: {}, errors: [],
    operatorIdentityAuditCandidates: operatorCandidates, operatorIdentityCandidates: operatorCandidates };
  const fetchPages = async (urls, opts) => ({ pages: urls.map(url => {
    calls.push({ url, formal: opts.operatorIdentitySourceType === 'company_profile' });
    assert.equal(opts.lightBudget, budget, 'formal and coverage retain the same budget');
    assert.ok(documents.has(url), `unexpected fixture URL: ${url}`);
    if (url === detail && kind === 'fetch_failure') return {
      url, finalUrl: url, ok: false, status: null, error: 'fixture_timeout', errorStage: 'timeout'
    };
    return hooks.parseSubpageJsonLdLightHtml(url, url, 200, documents.get(url), siteMode, opts);
  }) });
  const coverage = await runtime.exports.runCoverageFixture(discovered, fetchPages, signals, { siteMode, maxObserve, lightBudget: budget });
  assert.ok(coverage, 'coverage must complete, not swallow an orchestration exception');
  assert.equal(coverage.observedSubpageCount, maxObserve);
  const representativeCalls = calls.filter(c => !c.formal).map(c => c.url);
  assert.equal(representativeCalls.length, maxObserve);
  const aggregate = hooks.buildOperatorIdentityInfoFromObservedCompanyProfiles_(representativeCalls.map(url =>
    hooks.compactSubpageJsonLdObservation_(hooks.parseSubpageJsonLdLightHtml(url, url, 200, documents.get(url), siteMode))));
  if (maxObserve === 5 && kind !== 'navigation_company') assert.equal(aggregate.reason, 'company_profile_field_conflict', 'coverage conflict is retained');
  const observation = signals.operatorIdentityObservationV1;
  const record = signals.trustSignals && signals.trustSignals.operatorIdentityInfo;
  const formalCalls = calls.filter(c => c.formal).map(c => c.url);
  const representatives = representativeCalls.map(url => {
    const page = hooks.parseSubpageJsonLdLightHtml(url, url, 200, documents.get(url), siteMode);
    const { operatorIdentityInfo, ...otherObservations } = page;
    return { url, companyName: operatorIdentityInfo && operatorIdentityInfo.companyName || '',
      nonIdentitySha256: require('node:crypto').createHash('sha256').update(JSON.stringify(otherObservations)).digest('hex') };
  });
  rows.push({ kind, siteMode, maxObserve, formalCalls: formalCalls.length, state: observation.signalState,
    reason: signals.trustSignals && signals.trustSignals.operatorIdentityProbe && signals.trustSignals.operatorIdentityProbe.reason ||
      signals.operatorIdentityCandidateAuditV1.selection.noCandidateReason,
    aggregateReason: aggregate.reason, failureReasons: observation.failureReasons,
    companyName: record && record.companyName || null, provenance: record && record.provenance || null,
    currentRun: record && record.identityEvidenceV1 && record.identityEvidenceV1.currentRun || false,
    explicit: record && record.identityEvidenceV1 && record.identityEvidenceV1.explicit || false,
    representatives,
    coverageSha256: require('node:crypto').createHash('sha256').update(JSON.stringify(coverage)).digest('hex') });
  return { signals, observation, record, formalCalls, aggregate };
}

(async () => {
  if (realTerms) {
    const real = await run('real_terms');
    const expected = maxObserve === 2 ? 'true' : legacy ? 'unknown' : navigationBug ? 'false' : 'true';
    assert.equal(real.observation.signalState, expected, 'saved terms through the real coverage and formal-probe flow');
    if (expected === 'true') {
      assert.equal(real.record.companyName, name);
      assert.equal(real.record.identityEvidenceV1.currentRun, true);
      assert.equal(real.record.identityEvidenceV1.explicit, true);
      assert.equal(real.record.provenance.source, 'bounded_company_profile_probe');
    }
  }
  const navigation = await run('navigation_company');
  assert.equal(navigation.observation.signalState,
    maxObserve === 5 && (legacy || navigationBug) ? (legacy ? 'unknown' : 'false') : 'true');
  const linkedOther = await run('linked_other_company');
  if (maxObserve === 5) {
    assert.notEqual(linkedOther.observation.signalState, 'true', 'explicit non-navigation field must retain a real name conflict');
    assert.equal(linkedOther.observation.conflict, true);
  } else assert.equal(linkedOther.observation.signalState, 'true');
  const blocked = legacy && maxObserve === 5;
  const normal = await run('address_variation');
  if (blocked) {
    assert.deepEqual(normal.formalCalls, []);
    assert.equal(normal.observation.signalState, 'unknown');
    assert.equal(normal.signals.operatorIdentityCandidateAuditV1.selection.noCandidateReason, 'observed_company_profile_conflict');
    for (const kind of ['other_coverage_company', 'no_relation', 'missing_name', 'fetch_failure', 'no_candidate', 'formal_company_conflict']) {
      const result = await run(kind);
      assert.deepEqual(result.formalCalls, [], 'legacy control: coverage conflict prevents every formal attempt');
      assert.equal(result.observation.signalState, 'unknown');
    }
    for (const mode of ['corporate', 'shop_facility', 'saas', 'media']) {
      const result = await run('address_variation', mode);
      assert.deepEqual(result.formalCalls, []);
      assert.equal(result.observation.signalState, 'unknown');
    }
  } else {
    assert.deepEqual(normal.formalCalls, [landing, detail], 'coverage conflict must not prevent the formal probe');
    assert.equal(normal.observation.signalState, 'true');
    assert.equal(normal.record.companyName, name);
    assert.equal(normal.record.sourceUrl, detail);
    assert.equal(normal.record.provenance.source, 'bounded_company_profile_probe');
    assert.equal(normal.record.identityEvidenceV1.currentRun, true);
    assert.equal(normal.record.identityEvidenceV1.explicit, true);
    if (!legacy) assert.equal(normal.signals.operatorIdentityCandidateAuditV1.observedCompanyProfileReason, normal.aggregate.reason,
      'coverage aggregate diagnosis must remain visible independently of the formal probe');
  }
  if (!blocked) {
    const other = await run('other_coverage_company');
    assert.deepEqual(other.formalCalls, [landing, detail], 'even a name conflict must not suppress formal fetching');
    if (maxObserve === 5) {
      assert.notEqual(other.observation.signalState, 'true', 'a different observed company must not be silently discarded');
      assert.equal(other.observation.conflict, true);
      assert.equal(other.record.hasOperatorInfo, false);
      assert.equal(other.signals.operatorIdentityBridgeProvenanceV1.formalRecordPresent, false);
    } else assert.equal(other.observation.signalState, 'true');
    for (const kind of ['no_relation', 'missing_name', 'fetch_failure', 'no_candidate', 'formal_company_conflict']) {
      const result = await run(kind);
      assert.notEqual(result.observation.signalState, 'true', kind);
      assert.notEqual(result.record && result.record.hasOperatorInfo, true, kind);
      assert.equal(result.signals.operatorIdentityBridgeProvenanceV1.formalRecordPresent, false, kind);
      if (kind === 'no_candidate') {
        assert.deepEqual(result.formalCalls, []);
        assert.equal(result.observation.signalState, 'unknown');
        assert.equal(result.signals.operatorIdentityCandidateAuditV1.selection.noCandidateReason, 'no_high_confidence_candidate');
      }
      if (kind === 'missing_name' || kind === 'fetch_failure' || kind === 'formal_company_conflict') {
        assert.deepEqual(result.formalCalls, [landing, detail], kind);
      }
      if (kind === 'fetch_failure') {
        assert.equal(result.observation.scopeComplete, false);
        assert.equal(result.signals.trustSignals.operatorIdentityProbe.detailProbeResult, 'fetch_failed');
        assert.equal(result.signals.trustSignals.operatorIdentityProbe.reason, 'fixture_timeout');
      }
      if (kind === 'formal_company_conflict') assert.equal(result.observation.conflict, true);
    }
    const stale = { trustSignals: { operatorIdentityInfo: { companyName: 'Old株式会社',
      hasOperatorInfo: true, identityEvidenceV1: { explicit: true, currentRun: false } } } };
    const refreshed = await run('address_variation', 'ec', stale);
    assert.equal(refreshed.record.companyName, name, 'old input record is never the positive authority');
    if (!legacy) {
      const absent = await run('no_candidate', 'ec', refreshed.signals);
      assert.equal(absent.record, undefined, 'a previous successful record cannot survive a current-run no-candidate result');
      assert.equal(absent.signals.trustSignals.operatorIdentityProbe, undefined);
      assert.equal(absent.observation.signalState, 'unknown');
    }
    assert.equal(hooks.normalizeOperatorIdentityInfo_(normal.record, 'company_profile', {
      relationEvidence: { ...normal.record.identityEvidenceV1, currentRun: false }
    }), null, 'stale relation cannot become a formal record');
    for (const mode of ['corporate', 'shop_facility', 'saas', 'media']) {
      const result = await run('address_variation', mode);
      assert.equal(result.observation.signalState, 'true', mode);
      assert.equal(result.record.companyName, name);
    }
  }
  console.log(JSON.stringify({ fixture: 'coverage_conflict_probe', maxObserve, legacy, rows }));
  if (process.env.OPERATOR_FIXTURE_REPORT) fs.writeFileSync(process.env.OPERATOR_FIXTURE_REPORT,
    JSON.stringify({ fixture: 'coverage_conflict_probe', maxObserve, legacy, rows }, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
