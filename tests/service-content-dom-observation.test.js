'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { collectCoverageObservationsV2_ } = require('../index.js').__lightBudgetTestHooks;

// All requests are fulfilled locally; no public site or diagnostic API is used.
const origin = 'https://service-content.example.test';
const entryUrl = origin + '/landing/';
const text = '利用者向けのサービス内容と利用方法を説明します。'.repeat(35);
const body = `<section id="feature01"><h1>サービスのご案内</h1> <p>${text}</p></section>`;
const cases = [];
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function check(name, html, verify, routes = {}, hints = {}) {
      const context = await browser.newContext();
      const visits = [];
      let observed;
      try {
        await context.route('**/*', async route => {
          const url = route.request().url();
          visits.push(url);
          const response = routes[url];
          await route.fulfill(response || { contentType: 'text/html; charset=utf-8', body: html });
        });
        const page = await context.newPage();
        await page.goto(entryUrl);
        const result = await collectCoverageObservationsV2_({ coverage: hints }, page, entryUrl, context);
        observed = result.serviceContentObservationV2;
        verify(observed, visits, result);
        cases.push({ name, pass: true });
      } catch (error) { cases.push({ name, pass: false, error: error.message, observed, visits }); }
      finally { await context.close(); }
    }
    const complete = o => { assert.equal(o.completeness, 'complete'); assert.equal(o.limited, false); assert.equal(o.fallbackApplied, false); };
    await check('semantic main stays complete', `<main>${body}</main>`, complete);
    await check('unique named main stays complete', `<div id="main-content">${body}</div>`, complete);
    await check('section body without main', body, (o, visits, all) => {
      complete(o); assert.equal(o.serviceTextLength, text.length + 'サービスのご案内'.length + 1);
      assert.equal(visits.length, 1); assert.equal(o.observedPageCount, 1);
      assert.equal(all.breadcrumbObservationV2.completeness, 'partial');
      assert.equal(all.faqObservationV2.value, false);
    });
    await check('article body without service markers', `<article><p>${text}</p></article>`, o => {
      complete(o); assert.equal(o.serviceTextLength, 0); assert.equal(o.mainTextLength, text.length);
    });
    await check('plain body paragraph', `<div><p>${text}</p></div>`, o => { complete(o); assert.equal(o.mainTextLength, text.length); });
    await check('short body remains a measured short body', '<article><p>短い説明</p></article>', o => {
      complete(o); assert.equal(o.mainTextLength, 4); assert.equal(o.serviceTextLength, 0);
    });
    await check('nested content counted once and chrome excluded', `<div class="content"><nav>${text}</nav><article><p>${text}</p></article><footer>${text}</footer></div>`, o => {
      complete(o); assert.equal(o.mainTextLength, text.length); assert.equal(o.serviceTextLength, 0);
    });
    await check('navigation only stays partial', `<header><section>${text}</section></header><div><nav><p>${text}</p></nav></div><footer>${text}</footer>`, o => {
      assert.equal(o.completeness, 'partial'); assert.equal(o.serviceTextLength, null);
    });
    await check('hidden body cannot establish content', `<style>.concealed { display:none }</style><div><section class="concealed">${text}</section><section hidden>${text}</section></div>`, o => {
      assert.equal(o.completeness, 'partial'); assert.equal(o.serviceTextLength, null);
    });
    await check('unlabelled link-only navigation stays partial', `<div class="content"><a href="#">${text}</a><button>Menu</button></div>`, o => {
      assert.equal(o.completeness, 'partial'); assert.equal(o.serviceTextLength, null);
    });
    await check('sparse iframe shell is not promoted by body fallback', '<article>短い説明</article><iframe src="about:blank"></iframe>', (o, visits, all) => {
      assert.equal(o.completeness, 'partial');
      assert.equal(all.htmlSitemapCandidateDiscoveryV1.completeness, 'partial');
      assert.equal(all.faqObservationV2.completeness, 'partial');
    });
    await check('same-entry fragments and query do not fetch or double count', `${body}<a href="#feature01">詳細</a><a href="?campaign=1#feature01">機能</a>`, (o, visits) => {
      assert.equal(visits.length, 1); assert.equal(o.observedPageCount, 1); assert.equal(o.explicitCandidateCount, 0); complete(o);
    }, {}, { hasServiceNav: true });
    await check('self links do not consume the three candidate slots', `${body}<a href="#feature01">機能</a>${[1,2,3,4].map(n=>`<a href="/services/${n}">サービス${n}</a>`).join('')}`, (o, visits) => {
      complete(o); assert.equal(o.explicitCandidateCount, 3); assert.equal(o.observedPageCount, 4);
      assert.equal(visits.filter(url => /\/services\//.test(url)).length, 3);
      assert.equal(visits.filter(url => url === entryUrl).length, 1);
    });
    await check('distinct service URL remains independently observed', `${body}<a href="#feature01">機能</a><a href="/services/detail">サービス</a>`, (o, visits) => {
      complete(o); assert.equal(o.observedPageCount, 2); assert.equal(o.explicitCandidateCount, 1);
      assert.equal(visits.filter(url => url === entryUrl).length, 1);
      assert.equal(visits.filter(url => url === origin + '/services/detail').length, 1);
    }, { [origin + '/services/detail']: { contentType: 'text/html; charset=utf-8', body: `<main><p>${text}</p></main>` } });
    await check('failed distinct candidate preserves partial', `${body}<a href="/services/blocked">サービス</a>`, o => {
      assert.equal(o.completeness, 'partial'); assert.equal(o.failureKind, null);
      assert.equal(o.pageObservations.some(row => row.failureKind === 'access_denied'), true);
    }, { [origin + '/services/blocked']: { status: 403, body: 'Forbidden' } });
    await check('unresolved service hint remains partial', body, o => {
      assert.equal(o.completeness, 'partial'); assert.equal(o.failureKind, 'service_link_candidate_unresolved');
    }, {}, { hasServiceNav: true });
    console.log(JSON.stringify({ pass: cases.every(c => c.pass), cases }, null, 2));
    assert.equal(cases.filter(c => !c.pass).length, 0, 'service DOM regressions');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
