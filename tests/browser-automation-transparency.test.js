const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
assert.equal(source.includes("Object.defineProperty(navigator, 'webdriver'"), false,
  'production contexts must not mask Playwright automation state');
assert.equal(source.includes('Chrome/122.0.0.0'), false,
  'production browser contexts must not advertise a Chromium version different from the bundled browser');
assert.match(source, /GEO_UNIFIED_OBSERVER_HTML_UA_V1_/,
  'Node-side HTML fetches must retain an explicit diagnostic client identifier');

let browser;
let server;
(async () => {
  let observedHeaders = null;
  server = http.createServer((request, response) => {
    observedHeaders = request.headers;
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>fixture</title><h1>OK</h1>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo'
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  const observed = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    webdriver: navigator.webdriver,
    platform: navigator.platform,
    userAgentData: navigator.userAgentData ? navigator.userAgentData.toJSON() : null
  }));
  assert.equal(observed.webdriver, true);
  assert.equal(observedHeaders['user-agent'], observed.userAgent);
  assert.match(observedHeaders['sec-ch-ua'] || '', /Chromium|HeadlessChrome/);
  await context.close();
  console.log(JSON.stringify({
    pass: true,
    fixture: 'browser_automation_transparency_v1',
    chromiumVersion: browser.version(),
    webdriver: observed.webdriver,
    userAgentMatchesHttp: observedHeaders['user-agent'] === observed.userAgent
  }));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
