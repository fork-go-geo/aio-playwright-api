const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const lookup = records => (_host, _options, callback) => callback(null, records);

(async () => {
  const rejected = [
    'file:///etc/passwd',
    'https://user:pass@example.invalid/',
    'http://localhost/',
    'http://metadata.google.internal/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[fe80::1]/'
  ];
  rejected.forEach(url => assert.strictEqual(hooks.shouldBlockBrowserRequestUrlV1_(url).block, true, url));
  assert.strictEqual(hooks.shouldBlockBrowserRequestUrlV1_('https://cdn.fixture.invalid/app.js').block, false);
  assert.strictEqual(hooks.shouldBlockBrowserRequestUrlV1_('wss://socket.fixture.invalid/events').block, false);
  assert.strictEqual(hooks.shouldBlockBrowserRequestUrlV1_('ws://127.0.0.1/socket').block, true);

  await assert.rejects(
    hooks.resolveValidatedSubpageAddressV1_('mixed.fixture.invalid', {
      dnsLookup: lookup([{ address:'93.184.216.34', family:4 }, { address:'10.0.0.7', family:4 }])
    }),
    /dns_private_or_invalid_address/
  );

  const calls = [];
  const context = {
    route: async (_pattern, handler) => {
      await handler({ request: () => ({ url: () => 'http://169.254.169.254/latest/meta-data/' }), abort: code => calls.push(['abort', code]), fallback: () => calls.push(['fallback']) });
      await handler({ request: () => ({ url: () => 'https://cdn.fixture.invalid/app.js' }), abort: code => calls.push(['abort', code]), fallback: () => calls.push(['fallback']) });
    },
    routeWebSocket: async (_pattern, handler) => {
      await handler({ url: () => 'ws://127.0.0.1/socket', close: () => calls.push(['ws-close']), connectToServer: () => calls.push(['ws-connect']) });
    }
  };
  await hooks.installPlaywrightSsrfUrlGuardV1_(context);
  assert.deepStrictEqual(calls, [['abort', 'blockedbyclient'], ['fallback'], ['ws-close']]);

  const requested = [];
  const response = (status, headers = {}) => ({ status: () => status, headers: () => headers, ok: () => status >= 200 && status < 300, text: async () => 'fixture' });
  const page = { request: { get: async (url, options) => {
    requested.push({ url, options });
    return requested.length === 1 ? response(302, { location:'/next' }) : response(200);
  } } };
  const result = await hooks.safePageRequestGetV1_(page, 'https://page-request.fixture.invalid/start', {
    timeout: 1000,
    dnsLookup: lookup([{ address:'93.184.216.34', family:4 }])
  });
  assert.strictEqual(result.status(), 200);
  assert.deepStrictEqual(requested.map(item => item.url), [
    'https://page-request.fixture.invalid/start',
    'https://page-request.fixture.invalid/next'
  ]);
  assert.strictEqual(requested.every(item => item.options.maxRedirects === 0), true);
  const redirectToPrivate = {
    request: { get: async () => response(302, { location:'http://127.0.0.1/private' }) }
  };
  await assert.rejects(
    hooks.safePageRequestGetV1_(redirectToPrivate, 'http://page-request.fixture.invalid/redirect', {
      dnsLookup: lookup([{ address:'93.184.216.34', family:4 }])
    }),
    error => error && error.code === 'SSRF_OUTBOUND_REJECTED'
  );
  await assert.rejects(
    hooks.safePageRequestGetV1_(page, 'http://127.0.0.1/private', {
      dnsLookup: lookup([{ address:'93.184.216.34', family:4 }])
    }),
    error => error && error.code === 'SSRF_OUTBOUND_REJECTED'
  );

  console.log('SSRF Playwright request guard fixture: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
