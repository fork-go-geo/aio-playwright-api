const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const classify = (error, errorStage) => hooks.normalizeOperatorIdentityProbeErrorCodeV1_({
  ok: false, error, errorStage
});

[
  ['stage=fetch | url=https://private.example/a | reason=HTTP 404', 'fetch', 'http_4xx'],
  ['stage=fetch | url=https://private.example/a | reason=HTTP 503', 'fetch', 'http_5xx'],
  ['stage=timeout | url=https://private.example/a', 'timeout', 'timeout'],
  ['overall_budget_exhausted', 'budget', 'budget_exhausted'],
  ['causeCode=ENOTFOUND | host=private.example', 'fetch', 'dns_failure'],
  ['dns_no_public_address', 'fetch', 'dns_no_public_address'],
  ['causeCode=ERR_TLS_CERT_ALTNAME_INVALID', 'fetch', 'tls_error'],
  ['redirect_https_downgrade', 'fetch', 'redirect_https_downgrade'],
  ['redirect_origin_mismatch', 'fetch', 'redirect_origin_mismatch'],
  ['redirect_limit', 'fetch', 'redirect_limit_exceeded'],
  ['unsupported_content_type:application/pdf', 'fetch', 'content_type_rejected'],
  ['html_body_too_large', 'fetch', 'body_limit_exceeded'],
  ['causeCode=ECONNRESET', 'fetch', 'connection_error'],
  ['unexpected implementation detail https://private.example/a', 'fetch', 'unknown_fetch_error'],
  ['url=https://dns.example/private | reason=unclassified', 'fetch', 'unknown_fetch_error']
].forEach(([error, errorStage, expected]) => {
  const actual = classify(error, errorStage);
  assert.strictEqual(actual, expected, error);
  assert.ok(!actual.includes('://') && !actual.includes('private.example'), actual);
});
assert.strictEqual(hooks.normalizeOperatorIdentityProbeErrorCodeV1_({ ok: true, error: 'should_not_escape' }), null);

const candidate = { url: 'https://fixture.invalid/company', label: '運営会社', sources: ['footer'], score: 50 };
const audit = hooks.buildOperatorIdentityCandidateAuditV1_([candidate], 'shop_facility', candidate, {
  producerReached: true,
  landingProbeResult: 'fetch_failed', landingProbeErrorCode: 'redirect_https_downgrade',
  hubProbeAttempted: true, hubProbeResult: 'fetch_failed', hubProbeErrorCode: 'dns_no_public_address',
  detailProbeAttempted: true, detailProbeResult: 'fetch_failed', detailProbeErrorCode: 'timeout',
  totalOperatorProbeCount: 3
});
assert.deepStrictEqual({
  landing: audit.selection.landingProbeErrorCode,
  hub: audit.selection.hubProbeErrorCode,
  detail: audit.selection.detailProbeErrorCode
}, {
  landing: 'redirect_https_downgrade', hub: 'dns_no_public_address', detail: 'timeout'
});
const unattempted = hooks.buildOperatorIdentityCandidateAuditV1_([candidate], 'shop_facility', null, {
  producerReached: true, noCandidateReason: 'no_high_confidence_candidate'
});
assert.strictEqual(unattempted.selection.landingProbeErrorCode, null);
assert.strictEqual(unattempted.selection.hubProbeErrorCode, null);
assert.strictEqual(unattempted.selection.detailProbeErrorCode, null);

const short = hooks.buildBalancedShortResponsePayload({
  ok: true, mode: 'signalsFirstLight', url: 'https://fixture.invalid/', finalUrl: 'https://fixture.invalid/', status: 200,
  geoSignalsV1: {
    trustSignals: {}, operatorIdentityCandidateAuditV1: audit,
    observed: { links: {}, trustSignals: {}, headings: {} }, structuredData: {}, headings: {}, landmarks: {}, multimodalSignals: {}, aioCheck: {}
  },
  lightweightSummary: {}, diagnostics: {}, memoryHints: {}
});
assert.deepStrictEqual(short.geoSignalsV1.operatorIdentityCandidateAuditV1.selection, audit.selection);

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_probe_error_audit_v1',
  cases: { landing: true, hub: true, detail: true, shortPayload: true, valueFree: true }
}));
