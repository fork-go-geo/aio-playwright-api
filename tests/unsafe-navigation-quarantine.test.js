const assert = require('node:assert/strict');

const hooks = require('../index.js').__lightBudgetTestHooks;
const {
  UNSAFE_NAVIGATION_QUARANTINE_CODE_V1_,
  assertSafeMainNavigationV1_,
  sendUnsafeNavigationQuarantineV1_
} = hooks;

function lookup(records) {
  return (_hostname, _options, callback) => callback(null, records);
}

function page(url) {
  return { url: () => url };
}

function response(url) {
  return { url: () => url };
}

async function expectQuarantine(url) {
  await assert.rejects(
    () => assertSafeMainNavigationV1_(page(url), response(url), {
      dnsLookup: lookup([{ address: '93.184.216.34', family: 4 }])
    }),
    (error) => error && error.code === UNSAFE_NAVIGATION_QUARANTINE_CODE_V1_
  );
}

(async () => {
  // Public final targets survive the post-navigation quarantine guard.
  await assertSafeMainNavigationV1_(
    page('https://landing.fixture.invalid/final'),
    response('https://landing.fixture.invalid/final'),
    { dnsLookup: lookup([{ address: '93.184.216.34', family: 4 }]) }
  );

  // This models a public entry URL that Chromium redirected to an unsafe main
  // document. No fixture body is created or read by this test.
  for (const url of [
    'http://127.0.0.1/internal',
    'http://10.0.0.7/internal',
    'http://[::1]/internal',
    'http://169.254.169.254/computeMetadata/v1/',
    'http://metadata.google.internal/computeMetadata/v1/'
  ]) {
    await expectQuarantine(url);
  }

  // A public hostname resolving to a private address is quarantined too.
  await assert.rejects(
    () => assertSafeMainNavigationV1_(
      page('https://rebind.fixture.invalid/'),
      response('https://rebind.fixture.invalid/'),
      { dnsLookup: lookup([{ address: '127.0.0.1', family: 4 }]) }
    ),
    (error) => error && error.code === UNSAFE_NAVIGATION_QUARANTINE_CODE_V1_
  );

  let sent = null;
  const res = {
    status(value) { assert.equal(value, 422); return this; },
    json(value) { sent = value; return value; }
  };
  sendUnsafeNavigationQuarantineV1_(res);
  assert.deepEqual(sent, {
    ok: false,
    error: 'unsafe_navigation_quarantined',
    code: 'UNSAFE_NAVIGATION_QUARANTINED'
  });
  assert.equal(JSON.stringify(sent).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(sent).includes('metadata'), false);

  console.log(JSON.stringify({
    pass: true,
    fixture: 'unsafe_navigation_quarantine_v1',
    cases: 8,
    note: 'Validates post-navigation quarantine only; it does not prove Chromium connection prevention.'
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
