'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
require('./helpers/operator-deny-network.cjs');
const sourcePath = process.env.OPERATOR_FIXTURE_SOURCE || path.join(__dirname, '../index.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const runtime = new Module(path.join(__dirname, '../facility-policy-runtime.js'), module);
runtime.filename = runtime.id;
runtime.paths = Module._nodeModulePaths(path.dirname(runtime.filename));
// Reuse the existing integration-fixture seam: substitute only I/O boundaries.
runtime._compile(source + `
module.exports.runFixture = async function(discovered, fetchPages, signals, entry, opts) {
  discoverSubpageCandidatesLightData_ = async () => discovered;
  fetchSubpageHtmlLightUrls_ = fetchPages;
  attachMediaFreshnessArticleDomSignalsLight_ = async () => {};
  attachNewsIndexFreshnessSignalsLight_ = async () => {};
  resolveContactDestinationLight_ = async () => null;
  attachOfficialListingExternalProfileObservationV1_ = async () => {};
  observeSubpageJsonLdLightUrls_ = async () => { throw new Error('unexpected_browser_fallback'); };
  fetchSubpagePlaywrightScopedLight = async () => { throw new Error('unexpected_browser_fetch'); };
  return attachCoverageSignalsToGeoSignalsLight_(signals, entry, opts);
};`, runtime.filename);
const h = runtime.exports.__lightBudgetTestHooks;
const fixtureDir = path.join(__dirname, 'fixtures/facility-policy');
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'))).pages;
const inputDir = process.env.FACILITY_POLICY_FULL_HTML_DIR || fixtureDir;
const pages = Object.fromEntries(manifest.map(row => {
  const bytes = fs.readFileSync(path.join(inputDir, row.name + '.html'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    process.env.FACILITY_POLICY_FULL_HTML_DIR ? row.sha256 : row.fixtureSha256);
  return [row.name, { ...row, html: bytes.toString('utf8') }];
}));
const origin = 'https://megalos.co.jp';
const companyName = '野村不動産ライフ＆スポーツ株式会社';
const runId = '435586c4-a668-4898-9ba1-88512aa62f73';
const oldRunId = 'dc12cac2-6edf-447e-a29a-da3b1154159d';
const policy = { url: pages.sitepolicy.url, label: 'サイトポリシー', source: 'footer', sources: ['footer'],
  operatorRelationSourceOrigin: origin, score: 1 };
const corporate = { url: pages.corporate.url, label: '企業情報', source: 'nav', sources: ['nav', 'footer'],
  operatorRelationSourceOrigin: origin, score: 100 };
const rows = [];
let positive;

async function run(kind, expected, options = {}) {
  const entry = options.entry || origin + '/';
  const currentRun = options.runId === undefined ? runId : options.runId;
  const mode = options.siteMode || 'shop_facility';
  const budget = h.createLightRequestBudget_(Date.now());
  const calls = [], captured = {};
  const candidates = [{ url: origin + '/faq', label: 'よくある質問', source: 'nav', sources: ['nav'], score: 100 }];
  const operatorCandidates = options.candidates || [corporate, policy];
  const discovered = { candidates, totalCandidates: 1, sourceSummary: {}, errors: [],
    operatorIdentityCandidates: operatorCandidates, operatorIdentityAuditCandidates: operatorCandidates,
    // Normal discovery has an existing plan without policy request context.
    operatorIdentitySelectionPlan: h.buildOperatorIdentityProbeSelectionPlan_(operatorCandidates, mode, 2) };
  const signals = {};
  const fetchPages = async (urls, opts) => ({ pages: urls.map(url => {
    const formal = opts.operatorIdentitySourceType === 'company_profile';
    calls.push({ url, formal });
    assert.equal(opts.lightBudget, budget);
    const file = url === policy.url ? pages.sitepolicy :
      (url.replace(/\/$/, '') === pages.corporate.url.replace(/\/$/, '') ? pages.corporate :
        (url.replace(/\/$/, '') === pages.company.finalUrl ? pages.company : null));
    assert.ok(file || url === origin + '/faq', 'Unexpected URL: ' + url);
    if (formal) {
      assert.ok(calls.filter(c => c.formal).length <= 3, 'operator request cap');
      assert.equal(opts.htmlFetchTimeoutMs, 10000, 'baseline light request cap');
      assert.equal(opts.reserveMs, 5000, 'baseline cleanup reserve');
      assert.equal(opts.minimumMs, 2000, 'baseline minimum budget');
    }
    if (file && file.name === options.failPage) return { url, finalUrl: url, ok: false, error: 'fixture_timeout', errorStage: 'timeout' };
    let html = file ? file.html : '<title>よくある質問</title><main><h1>よくある質問</h1><p>' + '検証本文。'.repeat(300) + '</p></main>';
    if (file?.name === 'company' && kind === 'different_company') html = html.replaceAll(companyName, '別会社株式会社');
    if (file?.name === 'company' && kind === 'address_only') html = html.replaceAll('東京都中野区本町1－32－2', '東京都中野区本町一丁目32番2号');
    if (file?.name === 'sitepolicy' && kind === 'no_statement') html = html.replaceAll('が運営しています。', 'についての案内です。');
    if (file?.name === 'sitepolicy' && kind === 'multiple_operators') html += '<p>このWEBサイトは、別会社株式会社が運営しています。</p>';
    if (file?.name === 'sitepolicy' && kind === 'footer_only') html = '<main></main><footer>' + html + '</footer>';
    const finalUrl = file?.name === 'company' ? file.finalUrl : url;
    const parsed = h.parseSubpageJsonLdLightHtml(url, finalUrl, 200, html, mode, opts);
    if (file && kind === 'old_' + file.name && parsed.operatorPolicyObservationV1)
      parsed.operatorPolicyObservationV1.sourceRunId = oldRunId;
    if (file?.name === 'company' && kind === 'missing_context') delete parsed.operatorPolicyObservationV1;
    if (file?.name === 'company' && kind === 'wrong_entry' && parsed.operatorPolicyObservationV1)
      parsed.operatorPolicyObservationV1.entryKey = origin + '/store/fixture/';
    if (file?.name === 'company' && kind === 'cross_origin') parsed.finalUrl = 'https://other.example.invalid/company';
    if (file?.name === 'company' && kind === 'wrong_detail_path') parsed.finalUrl = origin + '/company-other';
    if (file?.name === 'company' && kind === 'profile_conflict') parsed.operatorIdentityInfo.conflict = true;
    if (file) captured[file.name] = parsed;
    return parsed;
  }) });
  const coverage = await runtime.exports.runFixture(discovered, fetchPages, signals, entry,
    { siteMode: mode, maxObserve: 5, lightBudget: budget, sourceRunId: currentRun, entryKey: entry,
      operatorPolicyEntryUrl: options.requestedEntry });
  assert.ok(coverage, 'orchestrator did not swallow an exception');
  const observation = signals.operatorIdentityObservationV1;
  const record = signals.trustSignals?.operatorIdentityInfo;
  assert.equal(observation?.signalState === 'true', expected, kind + ': formal acceptance');
  const formalCalls = calls.filter(c => c.formal).map(c => c.url);
  assert.ok(formalCalls.length <= 3);
  if (expected) {
    assert.equal(record.companyName, companyName);
    assert.equal(record.identityEvidenceV1.sourceRunId, currentRun);
    assert.equal(record.identityEvidenceV1.entryKey, origin + '/');
    assert.equal(record.identityEvidenceV1.currentRun, true);
    assert.equal(record.identityEvidenceV1.explicit, true);
    assert.equal(record.identityEvidenceV1.candidateSourceUrl, pages.company.finalUrl);
    assert.equal(record.provenance.candidateSourceUrl, pages.company.finalUrl);
    assert.deepEqual(formalCalls, [policy.url, pages.corporate.url, pages.company.url]);
    assert.equal(observation.conflict, false);
    assert.equal(signals.operatorIdentityCandidateAuditV1.formalRecordPresent, true);
    assert.equal(JSON.parse(JSON.stringify(record)).identityEvidenceV1.sourceRunId, currentRun);
  }
  rows.push({ kind, state: observation.signalState, calls: formalCalls, currentRun: currentRun || null });
  return { record, signals, captured };
}

(async () => {
  positive = await run('normal', true);
  for (const kind of ['different_company', 'no_statement', 'multiple_operators', 'footer_only',
    'old_sitepolicy', 'old_corporate', 'old_company', 'missing_context', 'wrong_entry', 'cross_origin',
    'wrong_detail_path', 'profile_conflict']) await run(kind, false);
  await run('address_only', true);
  await run('individual_store', false, { entry: origin + '/store/fixture/' });
  await run('query_entry', false, { entry: origin + '/?store=fixture' });
  await run('missing_run', false, { runId: '' });
  await run('invalid_run', false, { runId: 'not-a-uuid' });
  await run('store_redirected_to_root', false, { requestedEntry: origin + '/store/fixture/' });
  await run('different_entry_redirected_to_root', false, { requestedEntry: 'https://other.example.invalid/' });
  for (const failPage of ['sitepolicy', 'corporate', 'company']) await run('timeout_' + failPage, false, { failPage });
  for (const siteMode of ['corporate', 'saas', 'ec', 'media']) {
    const plan = h.buildOperatorIdentityProbeSelectionPlan_([corporate, policy], siteMode, 2,
      { entryKey: origin + '/', sourceRunId: runId });
    assert.ok(plan.selected.every(c => !c.operatorPolicyContextV1), siteMode + ' unchanged');
  }
  const explicit = { ...corporate, officialSameOriginOperatorProfile: true,
    label: '運営会社', operatorRelationSource: 'explicit_body_company_profile_relation', sources: ['explicit_body_company_profile_relation'] };
  assert.equal(h.buildOperatorIdentityProbeSelectionPlan_([explicit, policy], 'shop_facility', 2,
    { entryKey: origin + '/', sourceRunId: runId }).selected[0].url, explicit.url, 'existing explicit route stays first');
  // A policy statement for a root cannot be reused at a store, in another run,
  // or for a different hub/detail even if all pages were once successful.
  const p = positive.captured;
  const selected = h.buildOperatorIdentityProbeSelectionPlan_([corporate, policy], 'shop_facility', 2,
    { entryKey: origin + '/', sourceRunId: runId }).selected[0];
  const detailLink = p.corporate.companyProfileDetailLinks[0];
  for (const context of [
    { entryKey: origin + '/store/fixture/', sourceRunId: runId },
    { entryKey: origin + '/', sourceRunId: oldRunId },
    { entryKey: 'https://other.example.invalid/', sourceRunId: runId }
  ]) assert.equal(h.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(selected, p.corporate,
    detailLink, p.company, p.company.operatorIdentityInfo, 'shop_facility',
    { ...context, operatorPolicyPage: p.sitepolicy }), null);
  for (const [landing, hub] of [
    [{ ...p.sitepolicy, companyProfileHubLinks: [] }, p.corporate],
    [p.sitepolicy, { ...p.corporate, companyProfileDetailLinks: [] }]
  ]) assert.equal(h.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(selected, hub, detailLink,
    p.company, p.company.operatorIdentityInfo, 'shop_facility',
    { entryKey: origin + '/', sourceRunId: runId, operatorPolicyPage: landing }), null, 'no invented hop');
  assert.equal(h.normalizeOperatorIdentityInfo_(p.company.operatorIdentityInfo, 'company_profile', {
    relationEvidence: { ...positive.record.identityEvidenceV1, currentRun: false }
  }), null, 'formal acceptance gate unchanged');
  const short = h.buildBalancedShortResponsePayload({ ok: true, mode: 'signalsFirstLight',
    url: origin + '/', finalUrl: origin + '/', status: 200,
    geoSignalsV1: { ...positive.signals, observed: { links: {}, headings: {}, trustSignals: positive.signals.trustSignals },
      structuredData: {}, headings: {}, landmarks: {}, multimodalSignals: {}, aioCheck: {} },
    lightweightSummary: {}, diagnostics: {}, memoryHints: {} });
  assert.equal(short.geoSignalsV1.trustSignals.operatorIdentityInfo.identityEvidenceV1.sourceRunId, runId);
  assert.equal(short.geoSignalsV1.trustSignals.operatorIdentityInfo.identityEvidenceV1.entryKey, origin + '/');
  // The real safe-fetch/parse wrapper must carry request context. An exhausted
  // shared budget must prevent HTTP entirely (not just mark the result false).
  let httpCalls = 0;
  const fetchOptions = { siteMode: 'shop_facility', operatorIdentitySourceType: 'company_profile',
    operatorIdentitySelectedHub: true, collectOperatorSecondPageCompanyProfileLink: true,
    operatorPolicyContextV1: selected.operatorPolicyContextV1,
    lightBudget: h.createLightRequestBudget_(Date.now()), htmlFetchTimeoutMs: 10000, reserveMs: 5000, minimumMs: 2000,
    fetchImpl: async () => { httpCalls++; return { status: 200, ok: true,
      headers: { get: () => '' }, text: async () => pages.sitepolicy.html }; } };
  const fetched = await h.fetchSubpageHtmlLightUrls_([policy.url], fetchOptions);
  assert.equal(fetched.pages[0].operatorPolicyObservationV1.sourceRunId, runId);
  assert.equal(fetched.pages[0].operatorPolicyObservationV1.statements.length, 1);
  assert.equal(httpCalls, 1);
  fetchOptions.lightBudget.deadlineAt = Date.now() - 1;
  const exhausted = await h.fetchSubpageHtmlLightUrls_([policy.url], fetchOptions);
  assert.equal(exhausted.pages[0].errorStage, 'budget');
  assert.equal(httpCalls, 1, 'no extra request after shared budget exhaustion');
  const output = { pass: true, node: process.version, fullCapturedHtml: !!process.env.FACILITY_POLICY_FULL_HTML_DIR,
    rows, formalRecord: positive.record, observation: positive.signals.operatorIdentityObservationV1,
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex') };
  if (process.env.FACILITY_POLICY_REPORT) fs.writeFileSync(process.env.FACILITY_POLICY_REPORT, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ pass: true, fixture: 'operator-identity-facility-policy', scenarios: rows.length,
    fullCapturedHtml: output.fullCapturedHtml }));
})().catch(error => { console.error(error); process.exitCode = 1; });
