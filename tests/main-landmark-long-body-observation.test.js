const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildGeoSignalsV1 } = require('../index.js').__lightBudgetTestHooks;
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<title>Long body</title><h1>Company</h1><div>' + 'Company service information. '.repeat(80) + '</div>');
    const missing = await buildGeoSignalsV1(page, 'https://fixture.example.test/', {balancedMode:false,shortFastMode:false});
    assert.equal(missing.landmarks.a11yObserved, true, 'long body must not skip the main-role scan');
    assert.equal(missing.landmarks.a11yMainCount, 0);
    assert.equal(missing.landmarks.hasMainLandmark_final, false);
    assert.equal(missing.landmarks.mainLandmarkObservationLimited, false);
    await page.setContent('<h1>Company</h1><main><p>' + 'Company service information. '.repeat(80) + '</p></main>');
    const present = await buildGeoSignalsV1(page, 'https://fixture.example.test/', {balancedMode:false,shortFastMode:false});
    assert.equal(present.landmarks.hasMainLandmark_final, true);
    assert.equal(present.landmarks.mainLandmarkObservationLimited, false);
    console.log('long-body main-landmark observations: complete absence and presence passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
