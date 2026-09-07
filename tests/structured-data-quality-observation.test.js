const assert = require('assert');
const { chromium } = require('playwright');
const { buildGeoSignalsV1 } = require('../index.js').__lightBudgetTestHooks;

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

function breadcrumb(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}

function listItem(position, name, item) {
  const out = { '@type': 'ListItem' };
  if (position !== undefined) out.position = position;
  if (name !== undefined) out.name = name;
  if (item !== undefined) out.item = item;
  return out;
}

function faq(questions) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: questions };
}

function question(name, answer) {
  const out = { '@type': 'Question' };
  if (name !== undefined) out.name = name;
  if (answer !== undefined) out.acceptedAnswer = answer;
  return out;
}

function answer(text) {
  const out = { '@type': 'Answer' };
  if (text !== undefined) out.text = text;
  return out;
}

async function observe(html, name) {
  const page = await globalThis.__structuredQualityBrowser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await buildGeoSignalsV1(page, `https://${name}.example.test/`, { balancedMode: false, shortFastMode: false });
  } finally {
    await page.close();
  }
}

function quality(signals, family) {
  return signals.structuredDataQualityV1 && signals.structuredDataQualityV1[family];
}

(async () => {
  globalThis.__structuredQualityBrowser = await chromium.launch({ headless: true });
  try {
    const goodItems = [listItem(1, 'Home', '/'), listItem(2, 'News', '/news')];
    const goodQuestions = [question('Q1', answer('A1')), question('Q2', answer('A2'))];

    const complete = await observe(jsonLd([breadcrumb(goodItems), faq(goodQuestions)]), 'complete');
    assert.strictEqual(quality(complete, 'breadcrumb').observed, true);
    assert.strictEqual(quality(complete, 'breadcrumb').parseStatus, 'parsed');
    assert.strictEqual(quality(complete, 'breadcrumb').missingPositionCount, 0);
    assert.strictEqual(quality(complete, 'breadcrumb').missingItemCount, 0);
    assert.strictEqual(quality(complete, 'faq').observed, true);
    assert.strictEqual(quality(complete, 'faq').questionCount, 2);
    assert.strictEqual(quality(complete, 'faq').missingAnswerTextCount, 0);
    assert.strictEqual(complete.structuredData.hasBreadcrumbList, true);
    assert.strictEqual(complete.structuredData.hasFAQPage, true);
    assert.deepStrictEqual(complete.structuredDataQualityV1, complete.structuredData.structuredDataQualityV1);
    assert.deepStrictEqual(Object.keys(quality(complete, 'breadcrumb')).sort(), [
      'duplicatePositionCount', 'invalidPositionCount', 'itemCount', 'itemListElementCount',
      'listItemCount', 'missingItemCount', 'missingItemListElementCount', 'missingListItemCount',
      'missingNameCount', 'missingPositionCount', 'nodeCount', 'observed', 'parseStatus', 'sourceFormat'
    ].sort());
    assert.deepStrictEqual(Object.keys(quality(complete, 'faq')).sort(), [
      'mainEntityCount', 'missingAcceptedAnswerCount', 'missingAnswerTextCount', 'missingMainEntityCount',
      'missingQuestionCount', 'missingQuestionNameCount', 'nodeCount', 'observed', 'parseStatus',
      'questionCount', 'sourceFormat'
    ].sort());

    const breadcrumbTypeOnly = await observe(jsonLd({ '@type': 'BreadcrumbList' }), 'breadcrumb-type-only');
    assert.strictEqual(quality(breadcrumbTypeOnly, 'breadcrumb').missingItemListElementCount, 1);
    const breadcrumbEmpty = await observe(jsonLd(breadcrumb([])), 'breadcrumb-empty');
    assert.strictEqual(quality(breadcrumbEmpty, 'breadcrumb').missingItemListElementCount, 1);
    const breadcrumbMissingPosition = await observe(jsonLd(breadcrumb([listItem(undefined, 'Home', '/')])),'breadcrumb-position');
    assert.strictEqual(quality(breadcrumbMissingPosition, 'breadcrumb').missingPositionCount, 1);
    const breadcrumbInvalidPosition = await observe(jsonLd(breadcrumb([listItem('one', 'Home', '/')])),'breadcrumb-invalid-position');
    assert.strictEqual(quality(breadcrumbInvalidPosition, 'breadcrumb').invalidPositionCount, 1);
    const breadcrumbDuplicatePosition = await observe(jsonLd(breadcrumb([listItem(1, 'Home', '/'), listItem(1, 'News', '/news')])), 'breadcrumb-duplicate');
    assert.strictEqual(quality(breadcrumbDuplicatePosition, 'breadcrumb').duplicatePositionCount, 1);
    const breadcrumbMissingName = await observe(jsonLd(breadcrumb([listItem(1, '', '/')])), 'breadcrumb-name');
    assert.strictEqual(quality(breadcrumbMissingName, 'breadcrumb').missingNameCount, 1);
    const breadcrumbMissingItem = await observe(jsonLd(breadcrumb([listItem(1, 'Home', '')])), 'breadcrumb-item');
    assert.strictEqual(quality(breadcrumbMissingItem, 'breadcrumb').missingItemCount, 1);
    const relative = await observe(jsonLd(breadcrumb([listItem(1, 'Home', '/relative')])), 'breadcrumb-relative');
    assert.strictEqual(quality(relative, 'breadcrumb').invalidPositionCount, 0);
    assert.strictEqual(quality(relative, 'breadcrumb').missingItemCount, 0);
    const multipleBreadcrumbs = await observe(jsonLd([breadcrumb(goodItems), breadcrumb(goodItems)]), 'multiple-breadcrumbs');
    assert.strictEqual(quality(multipleBreadcrumbs, 'breadcrumb').nodeCount, 2);

    const faqTypeOnly = await observe(jsonLd({ '@type': 'FAQPage' }), 'faq-type-only');
    assert.strictEqual(quality(faqTypeOnly, 'faq').missingMainEntityCount, 1);
    const faqEmpty = await observe(jsonLd(faq([])), 'faq-empty');
    assert.strictEqual(quality(faqEmpty, 'faq').missingMainEntityCount, 1);
    const faqMissingName = await observe(jsonLd(faq([question('', answer('A'))])), 'faq-name');
    assert.strictEqual(quality(faqMissingName, 'faq').missingQuestionNameCount, 1);
    const faqMissingAnswer = await observe(jsonLd(faq([question('Q')])), 'faq-answer');
    assert.strictEqual(quality(faqMissingAnswer, 'faq').missingAcceptedAnswerCount, 1);
    const faqInvalidAnswer = await observe(jsonLd(faq([question('Q', { '@type': 'Thing', text: 'A' })])), 'faq-invalid-answer');
    assert.strictEqual(quality(faqInvalidAnswer, 'faq').missingAcceptedAnswerCount, 1);
    const faqMissingText = await observe(jsonLd(faq([question('Q', answer(''))])), 'faq-text');
    assert.strictEqual(quality(faqMissingText, 'faq').missingAnswerTextCount, 1);
    const multipleFaq = await observe(jsonLd([faq(goodQuestions), faq(goodQuestions)]), 'multiple-faq');
    assert.strictEqual(quality(multipleFaq, 'faq').nodeCount, 2);
    assert.strictEqual(quality(multipleFaq, 'faq').questionCount, 4);

    const graph = await observe(jsonLd({ '@context': 'https://schema.org', '@graph': [breadcrumb(goodItems), faq(goodQuestions)] }), 'graph');
    assert.strictEqual(quality(graph, 'breadcrumb').nodeCount, 1);
    assert.strictEqual(quality(graph, 'faq').nodeCount, 1);
    const scripts = await observe(jsonLd(breadcrumb(goodItems)) + jsonLd(faq(goodQuestions)), 'multiple-scripts');
    assert.strictEqual(quality(scripts, 'breadcrumb').nodeCount, 1);
    assert.strictEqual(quality(scripts, 'faq').nodeCount, 1);

    const partialParseFailure = await observe('<script type="application/ld+json">{bad</script>' + jsonLd(faq(goodQuestions)), 'partial-parse');
    assert.strictEqual(quality(partialParseFailure, 'faq').parseStatus, 'parsed');
    assert.strictEqual(partialParseFailure.structuredData.parseErrorsCount, 1);
    const parseFailure = await observe('<script type="application/ld+json">{bad</script>', 'parse-failure');
    assert.strictEqual(quality(parseFailure, 'breadcrumb').parseStatus, 'parse_error');
    assert.strictEqual(quality(parseFailure, 'faq').parseStatus, 'parse_error');
    const absent = await observe(jsonLd({ '@type': 'WebSite', name: 'Example' }), 'type-absent');
    assert.strictEqual(quality(absent, 'breadcrumb').observed, false);
    assert.strictEqual(quality(absent, 'faq').observed, false);
    assert.strictEqual(absent.structuredData.hasBreadcrumbList, false);
    assert.strictEqual(absent.structuredData.hasFAQPage, false);

    console.log('structured-data-quality-observation: ok');
  } finally {
    await globalThis.__structuredQualityBrowser.close();
    delete globalThis.__structuredQualityBrowser;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
