#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildAiPolicyTrustSignalV1_ } = require('../index.js').__lightBudgetTestHooks;

function response(status, text, extra = {}) {
  return Object.assign({ ok: status >= 200 && status < 300, status, text: text || '', contentType: 'text/plain' }, extra);
}

function complete(overrides = {}) {
  return Object.assign({
    robots: response(200, 'User-agent: *\nDisallow:'),
    llmsTxt: response(404, ''),
    llmsFullTxt: response(404, '')
  }, overrides);
}

const thinksystem = buildAiPolicyTrustSignalV1_('https://thinksystem-jp.com', complete());
assert.strictEqual(thinksystem.authority, 'cloud_run_geoSignalsV1_trustSignals_aiPolicy_v1');
assert.strictEqual(thinksystem.observationComplete, true);
assert.strictEqual(thinksystem.robots.httpStatus, 200);
assert.strictEqual(thinksystem.llmsTxt.httpStatus, 404);
assert.strictEqual(thinksystem.llmsTxt.status, 'not_found');
assert.strictEqual(thinksystem.llmsTxt.hasValidContent, false);
assert.strictEqual(thinksystem.llmsFullTxt.httpStatus, 404);
assert.strictEqual(thinksystem.fetchFailed, false);
assert.strictEqual(thinksystem.timeout, false);
assert.strictEqual(thinksystem.serverError, false);

const valid = buildAiPolicyTrustSignalV1_('https://valid.example', complete({
  llmsTxt: response(200, '# llms.txt\n\nThis site provides services and company information for AI systems. '.repeat(2)),
  llmsFullTxt: response(200, '# llms-full.txt\n\nThis is a detailed company and service guide for AI systems. '.repeat(2))
}));
assert.strictEqual(valid.llmsTxt.hasValidContent, true);
assert.strictEqual(valid.llmsFullTxt.hasValidContent, true);
assert.strictEqual(valid.hasAiPolicyDeclaration, true);

const denied = buildAiPolicyTrustSignalV1_('https://denied.example', complete({ llmsTxt: response(403, '') }));
assert.strictEqual(denied.llmsTxt.status, 'access_denied');
assert.strictEqual(denied.llmsTxt.hasValidContent, false);

const serverError = buildAiPolicyTrustSignalV1_('https://server-error.example', complete({ llmsTxt: response(503, '') }));
assert.strictEqual(serverError.llmsTxt.status, 'http_503');
assert.strictEqual(serverError.serverError, true);
assert.strictEqual(serverError.observationComplete, true);

const timeout = buildAiPolicyTrustSignalV1_('https://timeout.example', complete({
  llmsTxt: { ok: false, status: null, text: '', errorMessage: 'AbortError: timeout' }
}));
assert.strictEqual(timeout.llmsTxt.status, 'timeout');
assert.strictEqual(timeout.timeout, true);
assert.strictEqual(timeout.observationComplete, false);

const invalid = buildAiPolicyTrustSignalV1_('https://invalid.example', complete({
  llmsTxt: response(200, '<!doctype html><html><body>not an llms file</body></html>', { contentType: 'text/html' })
}));
assert.strictEqual(invalid.llmsTxt.status, 'invalid_content');
assert.strictEqual(invalid.llmsTxt.hasValidContent, false);

console.log('ai-policy-authority-observation: PASS');
