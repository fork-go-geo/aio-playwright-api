/*
 * Runs only in an isolated Playwright container.  The fixture server is bound
 * inside that container and no external network is needed.  The first host is
 * mapped to loopback solely to make Chromium follow a controlled redirect; the
 * quarantine decision itself validates the redirect target URL, not the test
 * server's transport address.
 */
const assert = require('assert');
const http = require('http');
const { chromium } = require('playwright');
const hooks = require('../index.js').__lightBudgetTestHooks;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function main() {
  let internalReached = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/entry') {
      res.writeHead(302, { Location: `http://127.0.0.1:${server.address().port}/internal` });
      return res.end();
    }
    if (req.url === '/internal') {
      internalReached = true;
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<main>fixture internal document</main>');
    }
    res.writeHead(404);
    res.end();
  });

  const port = await listen(server);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--host-resolver-rules=MAP public.fixture.invalid 127.0.0.1'
      ]
    });
    const page = await browser.newPage();
    const response = await page.goto(`http://public.fixture.invalid:${port}/entry`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    assert.strictEqual(internalReached, true, 'fixture must observe the redirect target connection');
    assert.match(page.url(), /^http:\/\/127\.0\.0\.1:/);
    await assert.rejects(
      () => hooks.assertSafeMainNavigationV1_(page, response),
      (error) => error && error.code === hooks.UNSAFE_NAVIGATION_QUARANTINE_CODE_V1_
    );

    const sent = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return body; } };
    hooks.sendUnsafeNavigationQuarantineV1_(sent);
    assert.strictEqual(sent.statusCode, 422);
    assert.deepStrictEqual(sent.payload, {
      ok: false,
      error: 'unsafe_navigation_quarantined',
      code: hooks.UNSAFE_NAVIGATION_QUARANTINE_CODE_V1_
    });
    assert.strictEqual(JSON.stringify(sent.payload).includes('internal document'), false);
    console.log(JSON.stringify({
      pass: true,
      fixture: 'chromium_unsafe_navigation_quarantine',
      chromiumRedirectTargetReached: internalReached,
      quarantineBeforeDomExtraction: true
    }));
  } finally {
    if (browser) await browser.close();
    await close(server);
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
