'use strict';

const assert = require('node:assert/strict');
const { firefox } = require('playwright');
const { installPlaywrightSsrfUrlGuardV1_ } = require('../index.js').__lightBudgetTestHooks;

(async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo'
    });
    try {
      await installPlaywrightSsrfUrlGuardV1_(context);
      assert.equal(typeof context.route, 'function');
      console.log('firefox SSRF guard isolation passed');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
