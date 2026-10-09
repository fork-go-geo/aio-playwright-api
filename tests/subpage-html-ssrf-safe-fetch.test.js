const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const html = '<!doctype html><html><head><title>Fixture</title></head><body><main>fixture</main></body></html>';
const response = (status, headers = {}, body = html) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: key => headers[String(key).toLowerCase()] || headers[key] || '' },
  text: async () => body
});
const transport = routes => async url => {
  const item = routes[String(url)];
  if (!item) throw new Error(`unexpected_url:${url}`);
  return typeof item === 'function' ? item(url) : item;
};
const fetchFixture = (url, routes, extra = {}) => hooks.fetchSubpageHtmlLightOnce_(url, Object.assign({
  siteMode: 'shop_facility', fetchImpl: transport(routes)
}, extra));
const assertRejected = async (url, routes, needle, extra) => {
  const result = await fetchFixture(url, routes, extra);
  assert.strictEqual(result.ok, false, `${url} must be rejected`);
  assert.ok(String(result.error || '').includes(needle), `${url}: ${result.error}`);
};

(async () => {
  // Normal public HTTP/HTTPS fetches, same-origin redirects, and relative
  // Locations preserve the former useful HTML-observation behavior.
  assert.strictEqual((await fetchFixture('https://fixture.invalid/start', {
    'https://fixture.invalid/start': response(200)
  })).ok, true);
  assert.strictEqual((await fetchFixture('http://fixture.invalid/start', {
    'http://fixture.invalid/start': response(200)
  })).ok, true);
  assert.strictEqual((await fetchFixture('https://fixture.invalid/start', {
    'https://fixture.invalid/start': response(302, { location: '/next' }),
    'https://fixture.invalid/next': response(200)
  })).ok, true);
  assert.strictEqual((await fetchFixture('https://fixture.invalid/a/start', {
    'https://fixture.invalid/a/start': response(302, { location: '../next' }),
    'https://fixture.invalid/next': response(200)
  })).ok, true);

  await assertRejected('https://fixture.invalid/start', {
    'https://fixture.invalid/start': response(302, { location: 'https://other.invalid/' })
  }, 'redirect_origin_mismatch');
  // The only cross-origin exception is caller-gated: one HTTPS handoff from
  // an already-qualified same-origin company page. It is not a general
  // redirect permission and the next cross-origin hop remains blocked.
  const permittedCorporateHandoff = await fetchFixture('https://fixture.invalid/company', {
    'https://fixture.invalid/company': response(301, { location: 'https://operator.invalid/profile' }),
    'https://operator.invalid/profile': response(200)
  }, { allowExplicitExternalCompanyRedirect: true });
  assert.strictEqual(permittedCorporateHandoff.ok, true);
  assert.strictEqual(permittedCorporateHandoff.finalUrl, 'https://operator.invalid/profile');
  await assertRejected('https://fixture.invalid/company', {
    'https://fixture.invalid/company': response(301, { location: 'https://operator.invalid/profile' })
  }, 'redirect_origin_mismatch');
  await assertRejected('https://fixture.invalid/company', {
    'https://fixture.invalid/company': response(301, { location: 'https://operator.invalid/profile' }),
    'https://operator.invalid/profile': response(302, { location: 'https://another.invalid/profile' })
  }, 'redirect_origin_mismatch', { allowExplicitExternalCompanyRedirect: true });
  await assertRejected('https://fixture.invalid/company', {
    'https://fixture.invalid/company': response(301, { location: 'http://operator.invalid/profile' })
  }, 'redirect_https_downgrade', { allowExplicitExternalCompanyRedirect: true });
  await assertRejected('https://fixture.invalid/start', {
    'https://fixture.invalid/start': response(302, { location: 'http://fixture.invalid/next' })
  }, 'redirect_https_downgrade');
  await assertRejected('https://fixture.invalid/start', {
    'https://fixture.invalid/start': response(302, { location: 'http://127.0.0.1/' })
  }, 'blocked_private_or_metadata_host');
  await assertRejected('https://fixture.invalid/start', {
    'https://fixture.invalid/start': response(302, { location: 'http://localhost/' })
  }, 'blocked_private_or_metadata_host');
  await assertRejected('https://fixture.invalid/start', {
    'https://fixture.invalid/start': response(302, { location: 'http://metadata.google.internal/' })
  }, 'blocked_private_or_metadata_host');
  await assertRejected('http://2130706433/', {}, 'blocked_private_or_metadata_host');
  await assertRejected('http://[::ffff:127.0.0.1]/', {}, 'blocked_private_or_metadata_host');
  await assertRejected('http://[fe80::1]/', {}, 'blocked_private_or_metadata_host');

  const redirectLoop = {};
  for (let index = 0; index <= hooks.SUBPAGE_HTML_MAX_REDIRECTS_V1_; index += 1) {
    redirectLoop[`https://fixture.invalid/r${index}`] = response(302, { location: `/r${index + 1}` });
  }
  await assertRejected('https://fixture.invalid/r0', redirectLoop, 'redirect_limit');
  await assertRejected('https://fixture.invalid/location-missing', {
    'https://fixture.invalid/location-missing': response(302)
  }, 'redirect_location_missing');

  const privateDns = host => (hostname, _opts, callback) => {
    assert.strictEqual(hostname, host); callback(null, [{ address: '10.0.0.7', family: 4 }]);
  };
  await assert.rejects(
    hooks.resolveValidatedSubpageAddressV1_('dns-private.fixture.invalid', { dnsLookup: privateDns('dns-private.fixture.invalid') }),
    /dns_no_public_address/
  );
  // A rebinding-style second resolution cannot reuse a formerly approved IP:
  // every new socket resolves through the validating lookup, and the second
  // private answer fails before a request can be opened.
  let rebindingCalls = 0;
  const rebindLookup = (_hostname, _opts, callback) => {
    rebindingCalls += 1;
    callback(null, [rebindingCalls === 1
      ? { address: '93.184.216.34', family: 4 }
      : { address: '127.0.0.1', family: 4 }]);
  };
  assert.deepStrictEqual(await hooks.resolveValidatedSubpageAddressV1_('rebind.fixture.invalid', { dnsLookup: rebindLookup }), { address: '93.184.216.34', family: 4 });
  await assert.rejects(hooks.resolveValidatedSubpageAddressV1_('rebind.fixture.invalid', { dnsLookup: rebindLookup }), /dns_no_public_address/);

  const tooLarge = '<html>' + 'x'.repeat(hooks.SUBPAGE_HTML_MAX_BYTES_V1_) + '</html>';
  await assertRejected('https://fixture.invalid/large', {
    'https://fixture.invalid/large': response(200, { 'content-type': 'text/html' }, tooLarge)
  }, 'html_body_too_large');
  await assertRejected('https://fixture.invalid/pdf', {
    'https://fixture.invalid/pdf': response(200, { 'content-type': 'application/pdf' })
  }, 'unsupported_content_type');

  const timeoutResult = await fetchFixture('https://fixture.invalid/slow', {
    'https://fixture.invalid/slow': () => new Promise(() => {})
  }, { timeoutMs: 5 });
  assert.strictEqual(timeoutResult.errorStage, 'timeout');
  const aborter = new AbortController();
  const aborting = fetchFixture('https://fixture.invalid/abort', {
    'https://fixture.invalid/abort': () => new Promise((resolve, reject) => {
      aborter.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })
  }, { signal: aborter.signal });
  aborter.abort();
  assert.strictEqual((await aborting).ok, false);

  const exhausted = await hooks.fetchSubpageHtmlLightUrls_(['https://fixture.invalid/no-fetch'], {
    siteMode: 'ec', lightBudget: { deadlineAt: Date.now(), skipped: [] }, fetchImpl: () => { throw new Error('must_not_fetch'); }
  });
  assert.strictEqual(exhausted.pages[0].errorStage, 'budget');

  // An explicitly allowed external operator origin is an initial origin only;
  // its redirect may not expand traversal to another external origin.
  await assertRejected('https://operator.fixture.invalid/company', {
    'https://operator.fixture.invalid/company': response(302, { location: 'https://third-party.fixture.invalid/profile' })
  }, 'redirect_origin_mismatch');

  console.log(JSON.stringify({
    pass: true,
    fixture: 'subpage_html_ssrf_safe_fetch_v1',
    cases: 20,
    note: 'mock transport verifies policy; production socket pinning is verified by source-level custom lookup and peer comparison.'
  }));
})().catch(error => { console.error(error); process.exitCode = 1; });
