const assert = require('assert');
const fs = require('fs');
const path = require('path');

const hooks = require('../index.js').__lightBudgetTestHooks;
const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const getRouteStart = source.indexOf("app.get('/scrape'");
const authRouteStart = source.indexOf("app.post('/scrape-auth'");
const authRouteEnd = source.indexOf('\n});', authRouteStart) + 4;
const getRoute = source.slice(getRouteStart, authRouteStart);
const authRoute = source.slice(authRouteStart, authRouteEnd);

(async () => {
  // GET /scrape remains the SSOT: both routes use the same light-budget
  // constructor, deadline queue, and setup retry helper.
  [getRoute, authRoute].forEach((route, index) => {
    assert(route.includes("requestedSignalsMode === 'light'"), `route ${index} detects light mode`);
    assert(route.includes('createLightRequestBudget_(requestStartedAt)'), `route ${index} creates the shared budget`);
    assert(route.includes('enqueueLightScrapeWithDeadline_(queue,'), `route ${index} uses the deadline queue`);
    assert(route.includes('runLightScrapeWithSetupRetry_('), `route ${index} uses setup retry`);
  });
  assert(authRoute.includes('scrapeOnce(authenticatedRequest, res, lightBudget,'), 'authenticated scrape receives its budget');
  assert(authRoute.includes('executionAuth, authenticatedRun: true'), 'authenticated execution options remain intact');
  assert.strictEqual(authRoute.includes('scrapeOnce({ query }, res, null'), false, 'authenticated light path cannot bypass the budget');

  // Model the successful authenticated entry/static-fetch boundary without a
  // network request. The shared budget accepts the static trace and proceeds
  // through the browser/context setup stages rather than throwing on null.
  const budget = hooks.createLightRequestBudget_(Date.now());
  assert(budget && budget.requestId, 'light budget is initialized');
  const staticTrace = hooks.buildLightStaticFetchTrace_(
    { success: true, status: 200, elapsedMs: 1, bodyBytes: 64, redirectCount: 0, redirectCountKnown: true, finalUrl: 'https://fixture.test/' },
    'https://fixture.test/'
  );
  budget.topPageStaticFetchTraceV1 = Object.assign({ requestId: budget.requestId }, staticTrace);
  assert.strictEqual(budget.topPageStaticFetchTraceV1.status, 200, '200 static fetch trace is recorded');
  let browserStarted = false;
  let contextStarted = false;
  await hooks.runLightBudgetStage_(budget, 'browser_launch', 1000, async () => { browserStarted = true; return {}; });
  await hooks.runLightBudgetStage_(budget, 'browser_context', 1000, async () => { contextStarted = true; return {}; });
  assert.strictEqual(browserStarted, true, 'browser stage proceeds after authenticated static fetch');
  assert.strictEqual(contextStarted, true, 'context stage proceeds after authenticated static fetch');

  console.log('basic-auth light-budget regression fixture passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
