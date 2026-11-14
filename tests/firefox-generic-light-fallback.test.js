const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const {
  createLightRequestBudget_,
  createLightAttempt_,
  probeLightDomReadiness_,
  runLightScrapeWithSetupRetry_
} = hooks;

const FALLBACK_CODE = 'LIGHT_BROWSER_ENTRY_FALLBACK_REQUIRED';
const FALLBACK_STAGE = 'browser_entry_fallback';

function responseSpy() {
  return {
    headersSent: false,
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.headersSent = true; this.body = body; return this; }
  };
}

function budget() {
  const value = createLightRequestBudget_(Date.now());
  value.deadlineAt = Date.now() + 150000;
  return value;
}

function probePage(sequence) {
  const values = sequence.slice();
  let last = values[values.length - 1];
  return {
    isClosed: () => false,
    evaluate: async () => {
      const next = values.length ? values.shift() : last;
      last = next;
      return next;
    }
  };
}

function domCandidate(overrides = {}) {
  return Object.assign({
    url: 'https://public.example.test/',
    readyState: 'interactive',
    hasBody: true,
    bodyTextLength: 240,
    h1Count: 1,
    headingCount: 2,
    linkCount: 4,
    hasHeaderElement: true,
    hasNavElement: true,
    hasFooterElement: true,
    imgCount: 0,
    challengeOrError: false
  }, overrides);
}

function fallbackError(attempt, options = {}) {
  const error = new Error(options.message || 'browser entry document unavailable');
  error.code = options.code || FALLBACK_CODE;
  error.lightBudgetStage = options.stage || FALLBACK_STAGE;
  error.lightAttempt = attempt;
  error.firefoxFallbackEligible = options.eligible !== false;
  return error;
}

(async () => {
  // Existing sentinel, not fixture-local text matching, rejects a challenge
  // document and accepts a stable public document.
  const blocked = await probeLightDomReadiness_(
    probePage([domCandidate({ challengeOrError: true })]),
    'https://public.example.test/', budget(), { pollMs: 1, maxMs: 10 }
  );
  assert.strictEqual(blocked.accepted, false);
  assert.strictEqual(blocked.reason, 'challenge_or_error_page');
  const normalCandidate = domCandidate();
  const normal = await probeLightDomReadiness_(
    probePage([normalCandidate, normalCandidate]),
    'https://public.example.test/', budget(), { pollMs: 1, maxMs: 10 }
  );
  assert.strictEqual(normal.accepted, true);

  // A missing H1 is a legitimate entry document characteristic, not an
  // engine-selection signal.
  const noH1 = await probeLightDomReadiness_(
    probePage([domCandidate({ h1Count: 0 }), domCandidate({ h1Count: 0 })]),
    'https://public.example.test/', budget(), { pollMs: 1, maxMs: 10 }
  );
  assert.strictEqual(noH1.accepted, true);

  // A healthy first Chromium attempt never asks for Firefox.
  {
    const attempts = [];
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, budget(), async (options) => {
      attempts.push(options.browserEngine);
      res.status(200).json({ ok: true, runId: 'run-dummy', source: options.browserEngine });
    });
    assert.deepStrictEqual(attempts, ['chromium']);
    assert.strictEqual(res.headersSent, true);
    assert.strictEqual(res.body.source, 'chromium');
  }

  // A typed entry failure is cleaned up before the wrapper makes exactly one
  // Firefox attempt; only that second attempt sends the response.
  {
    const attempts = [];
    const state = budget();
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, state, async (options) => {
      attempts.push(options.browserEngine);
      if (options.attemptIndex === 1) throw fallbackError(createLightAttempt_(state));
      res.status(200).json({ ok: true, runId: 'run-dummy', provenance: 'browser_rendered', source: options.browserEngine });
    });
    assert.deepStrictEqual(attempts, ['chromium', 'firefox']);
    assert.strictEqual(state.resilience.retryPerformed, true);
    assert.strictEqual(res.body.source, 'firefox');
    assert.strictEqual(res.body.runId, 'run-dummy');
  }

  // HTTP failures and completed 200 restriction documents both arrive at the
  // same typed entry-failure boundary; neither needs a hostname exception.
  for (const reason of ['http_failure', 'challenge_or_error_page']) {
    const attempts = [];
    const state = budget();
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, state, async (options) => {
      attempts.push(options.browserEngine);
      if (options.attemptIndex === 1) throw fallbackError(createLightAttempt_(state), { message: reason });
      res.status(200).json({ ok: true, source: options.browserEngine, entryFailure: reason });
    });
    assert.deepStrictEqual(attempts, ['chromium', 'firefox']);
    assert.strictEqual(res.body.source, 'firefox');
  }

  // A setup failure follows the same bounded Firefox retry only when marked
  // eligible by scrapeOnce; a non-eligible (e.g. authenticated) failure does
  // not switch engines.
  {
    const attempts = [];
    const state = budget();
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, state, async (options) => {
      attempts.push(options.browserEngine);
      if (options.attemptIndex === 1) throw fallbackError(createLightAttempt_(state), { code: 'PLAYWRIGHT_SETUP_FAILURE', stage: 'browser_launch' });
      res.status(200).json({ ok: true });
    });
    assert.deepStrictEqual(attempts, ['chromium', 'firefox']);
  }
  {
    const attempts = [];
    const state = budget();
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, state, async (options) => {
      attempts.push(options.browserEngine);
      if (options.attemptIndex === 1) throw fallbackError(createLightAttempt_(state), { code: 'PLAYWRIGHT_SETUP_FAILURE', stage: 'browser_launch', eligible: false });
      res.status(200).json({ ok: true });
    });
    assert.deepStrictEqual(attempts, ['chromium', 'chromium']);
  }

  // Cleanup failure is an admission failure: it must not launch Firefox.
  {
    const attempts = [];
    const state = budget();
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, state, async (options) => {
      attempts.push(options.browserEngine);
      const attempt = createLightAttempt_(state);
      attempt.cleanupPromise = Promise.resolve({ completed: false, cleanupMs: 0, diagnostics: { browser: 'timeout' } });
      throw fallbackError(attempt);
    });
    assert.deepStrictEqual(attempts, ['chromium']);
    assert.strictEqual(res.headersSent, true);
  }

  // A Firefox failure cannot create a third attempt; the existing wrapper
  // returns its failure response after the bounded second attempt.
  {
    const attempts = [];
    const state = budget();
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, state, async (options) => {
      attempts.push(options.browserEngine);
      throw fallbackError(createLightAttempt_(state));
    });
    assert.deepStrictEqual(attempts, ['chromium', 'firefox']);
    assert.strictEqual(res.headersSent, true);
  }

  // The existing admission floor protects the shared 180s budget: an entry
  // failure with too little time left never starts Firefox.
  {
    const attempts = [];
    const state = budget();
    state.deadlineAt = Date.now() + 1000;
    const res = responseSpy();
    await runLightScrapeWithSetupRetry_(null, res, state, async (options) => {
      attempts.push(options.browserEngine);
      throw fallbackError(createLightAttempt_(state));
    });
    assert.deepStrictEqual(attempts, ['chromium']);
    assert.strictEqual(res.headersSent, true);
  }

  console.log('generic Firefox light fallback fixtures passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
