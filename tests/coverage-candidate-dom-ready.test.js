const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { observeCoverageObservationV2Candidates_ } = require('../index.js').__lightBudgetTestHooks;
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const context = await browser.newContext();
  await context.route('https://candidate.example.test/**', async route => {
   if (route.request().url().endsWith('/slow.png')) return;
   if (route.request().url().endsWith('/slow-document')) await new Promise(resolve => setTimeout(resolve, 8000));
   await route.fulfill({contentType:'text/html',body:'<main><h1>Company</h1><nav aria-label="breadcrumb">Home / Company</nav><p>Company details</p><img src="/slow.png"></main>'});
  });
  const started=Date.now();
  const rows=await observeCoverageObservationV2Candidates_(context,['https://candidate.example.test/company']);
  assert.equal(rows[0].checked,true);assert.equal(rows[0].renderComplete,true);assert.equal(rows[0].breadcrumbUi,true);assert.equal(rows[0].failureKind,null);
  assert(Date.now()-started<6000,'completed DOM must not wait for an unrelated stalled image');
  const slowRows=await observeCoverageObservationV2Candidates_(context,['https://candidate.example.test/slow-document']);
  assert.equal(slowRows[0].checked,true,'an 8-second document response must still be observed');
  assert.equal(slowRows[0].renderComplete,true);assert.equal(slowRows[0].failureKind,null);
  await context.close();console.log('coverage candidate: complete DOM survives pending image');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
