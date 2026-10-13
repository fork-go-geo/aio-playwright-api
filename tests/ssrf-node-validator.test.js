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
  rejected.forEach(url => assert.strictEqual(hooks.validateSafeSubpageFetchUrlV1_(url).ok, false, url));
  assert.strictEqual(hooks.validateSafeSubpageFetchUrlV1_('https://cdn.fixture.invalid/app.js').ok, true);

  await assert.rejects(
    hooks.resolveValidatedSubpageAddressV1_('mixed.fixture.invalid', {
      dnsLookup: lookup([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }])
    }),
    /dns_private_or_invalid_address/
  );
  const publicResult = await hooks.validateOutboundHttpUrlV1_('https://public.fixture.invalid/', {
    dnsLookup: lookup([{ address: '93.184.216.34', family: 4 }])
  });
  assert.strictEqual(publicResult.ok, true);
  const privateResult = await hooks.validateOutboundHttpUrlV1_('https://private.fixture.invalid/', {
    dnsLookup: lookup([{ address: '127.0.0.1', family: 4 }])
  });
  assert.strictEqual(privateResult.ok, false);

  console.log(JSON.stringify({ pass: true, fixture: 'ssrf_node_validator_v1', cases: 12 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
