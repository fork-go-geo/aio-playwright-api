'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const start = source.indexOf('// Chromium remains the primary engine.');
const end = source.indexOf('if (lightAttempt) lightAttempt.browser = browser;', start);
assert.ok(start >= 0 && end > start, 'must extract scrapeOnce engine launch block');
const launchBlock = source.slice(start, end);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function actualLaunch(scrapeOptions) {
  const launches = [];
  const launcher = (engine) => ({ launch: async (options) => {
    launches.push({ engine, options });
    return { engine };
  }});
  const run = new AsyncFunction(
    'signalsFirstLight', 'authenticatedRun', 'scrapeOptions', 'playwright', 'chromium',
    'runLightBudgetStage_', 'closeLatePlaywrightResource_', 'logHeavySiteTopPageAudit',
    `let browser = null; let playwrightStarted = false; const lightBudget = {}; const lightAttempt = null;
     const scrapeTiming = {}; const addScrapeSpan = () => {}; ${launchBlock}
     return { browser, scrapeTiming };`
  );
  return { launches, result: await run(true, false, scrapeOptions, { firefox: launcher('firefox') }, launcher('chromium'), async (_b, _s, _t, fn) => fn(), () => {}, () => {}) };
}

(async () => {
  const chromiumFirst = await actualLaunch({ browserEngine: 'chromium' });
  assert.equal(chromiumFirst.launches.length, 1);
  assert.equal(chromiumFirst.launches[0].engine, 'chromium');
  assert.ok(Array.isArray(chromiumFirst.launches[0].options.args));

  const boundedFallback = await actualLaunch({ browserEngine: 'firefox' });
  assert.equal(boundedFallback.launches.length, 1);
  assert.equal(boundedFallback.launches[0].engine, 'firefox');
  assert.equal(Object.hasOwn(boundedFallback.launches[0].options, 'args'), false);
  console.log('firefox entry launch contract passed');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
