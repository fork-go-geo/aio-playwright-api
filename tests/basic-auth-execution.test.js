const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { app, parseExecutionAuth_, authHeadersForUrl_, fetchWithExecutionAuth_ } = require('../index.js').__lightBudgetTestHooks;

const username = 'fixture-user';
const password = 'fixture-password';
const basic = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
const forbidden = [username, password, `${username}:${password}`, Buffer.from(`${username}:${password}`).toString('base64'), 'executionAuth'];
const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
assert(source.indexOf('if (authenticatedRun && !res.headersSent)') < source.indexOf("logSf('SCRAPE_CATCH'"), 'authenticated errors normalize before generic logging');

function listen(server) { return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port))); }
function close(server) { return new Promise(resolve => server.close(resolve)); }

(async () => {
  // HTTPS is validated before an authenticated request can be made.
  assert.throws(() => parseExecutionAuth_({ url: 'http://example.test/' }, { kind:'basic', username, password, authOrigin:'http://example.test' }), /AUTH_HTTPS_REQUIRED/);
  const auth = parseExecutionAuth_({ url: 'https://example.test/' }, { kind:'basic', username, password, authOrigin:'https://example.test' });
  assert.strictEqual(authHeadersForUrl_('https://example.test/a', auth).Authorization, basic);
  assert.deepStrictEqual(authHeadersForUrl_('https://other.test/a', auth), {});

  const seen = [];
  const target = http.createServer((req, res) => {
    seen.push({ path:req.url, authorization:req.headers.authorization || '' });
    if (req.url === '/redirect-external') { res.writeHead(302, { Location: `http://127.0.0.1:${externalPort}/external` }); return res.end(); }
    res.end('ok');
  });
  let externalPort = 0;
  const external = http.createServer((req, res) => { seen.push({ path:req.url, authorization:req.headers.authorization || '' }); res.end('external'); });
  externalPort = await listen(external);
  const targetPort = await listen(target);
  const localAuth = { kind:'basic', username, password, authOrigin:`http://127.0.0.1:${targetPort}` };
  await fetchWithExecutionAuth_(`http://127.0.0.1:${targetPort}/redirect-external`, { method:'GET' }, localAuth);
  assert.strictEqual(seen[0].authorization, basic);
  assert.strictEqual(seen[1].authorization, '');
  await close(target); await close(external);

  // An HTTP hop must not upgrade into a credentialed HTTPS request.
  const originalFetch = global.fetch;
  const redirectCalls = [];
  global.fetch = async (url, options = {}) => {
    redirectCalls.push({ url: String(url), authorization: String(options.headers && options.headers.Authorization || '') });
    if (redirectCalls.length === 1) return new Response('', { status:302, headers:{ Location:'https://fixture.example.test/secure' } });
    return new Response('ok', { status:200 });
  };
  try {
    await fetchWithExecutionAuth_('http://fixture.example.test/start', { method:'GET' }, auth);
  } finally {
    global.fetch = originalFetch;
  }
  assert.strictEqual(redirectCalls[0].authorization, '');
  assert.strictEqual(redirectCalls[1].authorization, '');

  // Playwright's context credentials are isolated to the supplied origin and
  // satisfy an authenticated entry page after its 401 challenge.
  const protectedSeen = [];
  const protectedServer = http.createServer((req, res) => {
    protectedSeen.push(req.headers.authorization || '');
    if (req.headers.authorization !== basic) { res.writeHead(401, { 'WWW-Authenticate':'Basic realm="fixture"' }); return res.end(); }
    res.end('<main>authenticated fixture</main>');
  });
  const protectedPort = await listen(protectedServer);
  const protectedOrigin = `http://127.0.0.1:${protectedPort}`;
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ httpCredentials:{ username, password, origin:protectedOrigin } });
  const page = await context.newPage();
  const entry = await page.goto(`${protectedOrigin}/entry`);
  assert.strictEqual(entry.status(), 200);
  assert(protectedSeen.includes(basic), 'Playwright supplied credentials after challenge');
  await page.close(); await context.close(); await browser.close(); await close(protectedServer);

  // The endpoint rejects HTTP before scraping and never logs its body.
  const logs = []; const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(' '));
  const appServer = http.createServer(app); const appPort = await listen(appServer);
  const response = await fetch(`http://127.0.0.1:${appPort}/scrape-auth`, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ request:{url:'http://example.test/'}, executionAuth:{kind:'basic', username, password, authOrigin:'http://example.test'} })
  });
  const payload = await response.json();
  console.log = originalLog; await close(appServer);
  assert.strictEqual(payload.code, 'AUTH_HTTPS_REQUIRED');
  const logText = logs.join('\n');
  forbidden.forEach(value => assert.strictEqual(logText.includes(value), false, `secret marker leaked: ${value}`));
  console.log('basic-auth-execution fixtures passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
