/*
 * Runs only against local, process-owned fixture servers.  The private and
 * metadata-shaped URLs are mapped to loopback solely so an accidental browser
 * connection is observable without reaching a real internal or metadata host.
 */
const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const hooks = require('../index.js').__lightBudgetTestHooks;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

function observedServer(createServer, handler) {
  let acceptedConnections = 0;
  let requests = 0;
  let upgrades = 0;
  const server = createServer((req, res) => {
    requests += 1;
    handler(req, res);
  });
  server.on('connection', () => { acceptedConnections += 1; });
  server.on('upgrade', socket => {
    upgrades += 1;
    socket.destroy();
  });
  return {
    server,
    counters: () => ({ acceptedConnections, requests, upgrades })
  };
}

function createEphemeralCertificate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-ssrf-guard-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  childProcess.execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=public-secure.fixture.invalid'
  ], { stdio: 'ignore' });
  return { dir, key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

async function main() {
  const privateFixture = observedServer(http.createServer, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('private fixture');
  });
  const metadataFixture = observedServer(http.createServer, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('metadata fixture');
  });
  const entryFixture = observedServer(http.createServer, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><html><body>
      <script>
        window.__dangerousRequested = [];
        function appendResource(kind, url, marker) {
          window.__dangerousRequested.push(marker);
          const element = document.createElement(kind);
          element.src = url;
          document.body.appendChild(element);
        }
        appendResource('img', 'http://127.0.0.1:${privatePort}/private-subresource', 'private-subresource');
        appendResource('img', 'http://metadata.google.internal:${metadataPort}/metadata-subresource', 'metadata-subresource');
        appendResource('iframe', 'http://127.0.0.1:${privatePort}/private-frame', 'private-iframe');
        appendResource('iframe', 'http://metadata.google.internal:${metadataPort}/metadata-frame', 'metadata-iframe');
        window.__dangerousRequested.push('private-websocket');
        new WebSocket('ws://127.0.0.1:${privatePort}/private-websocket');
        window.__dangerousRequested.push('metadata-websocket');
        new WebSocket('ws://metadata.google.internal:${metadataPort}/metadata-websocket');
      </script>
      <script src="https://public-secure.fixture.invalid:${securePort}/allowed.js"></script>
    </body></html>`);
  });

  const certificate = createEphemeralCertificate();
  const secureFixture = observedServer((handler) => https.createServer({ key: certificate.key, cert: certificate.cert }, handler), (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/javascript' });
    res.end('window.__allowedHttpsLoaded = true;');
  });

  let privatePort;
  let metadataPort;
  let securePort;
  let entryPort;
  let browser;
  let context;
  try {
    privatePort = await listen(privateFixture.server);
    metadataPort = await listen(metadataFixture.server);
    securePort = await listen(secureFixture.server);
    entryPort = await listen(entryFixture.server);

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--host-resolver-rules=MAP public.fixture.invalid 127.0.0.1,MAP public-secure.fixture.invalid 127.0.0.1,MAP metadata.google.internal 127.0.0.1'
      ]
    });
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    await hooks.installPlaywrightSsrfUrlGuardV1_(context);
    const page = await context.newPage();
    await page.goto(`http://public.fixture.invalid:${entryPort}/entry`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForFunction(() => window.__allowedHttpsLoaded === true, null, { timeout: 5000 });
    await page.waitForTimeout(250);

    assert.deepStrictEqual(await page.evaluate(() => window.__dangerousRequested), [
      'private-subresource', 'metadata-subresource',
      'private-iframe', 'metadata-iframe',
      'private-websocket', 'metadata-websocket'
    ]);
    assert.deepStrictEqual(privateFixture.counters(), { acceptedConnections: 0, requests: 0, upgrades: 0 });
    assert.deepStrictEqual(metadataFixture.counters(), { acceptedConnections: 0, requests: 0, upgrades: 0 });
    assert.ok(secureFixture.counters().acceptedConnections >= 1, 'allowed HTTPS resource must reach the fixture');
    assert.ok(secureFixture.counters().requests >= 1, 'allowed HTTPS resource must be requested');

    console.log(JSON.stringify({
      pass: true,
      fixture: 'chromium_ssrf_preconnect_guard',
      private: privateFixture.counters(),
      metadata: metadataFixture.counters(),
      allowedHttps: secureFixture.counters()
    }));
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await Promise.all([close(privateFixture.server), close(metadataFixture.server), close(secureFixture.server), close(entryFixture.server)]);
    fs.rmSync(certificate.dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
