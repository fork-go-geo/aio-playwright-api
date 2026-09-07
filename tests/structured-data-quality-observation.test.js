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
    assert.strictEqual(quality(complete, 'organization').observed, false);
    assert.strictEqual(quality(complete, 'website').observed, false);
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

    const org = (extra) => Object.assign({ '@type': 'Organization', '@id': 'https://example.test/#org', name: 'Example', url: '/company' }, extra || {});
    const site = (extra) => Object.assign({ '@type': 'WebSite', '@id': 'https://example.test/#website', name: 'Example', url: '/' }, extra || {});
    const orgComplete = await observe(jsonLd(org()), 'org-complete');
    assert.deepStrictEqual(Object.keys(quality(orgComplete, 'organization')).sort(), [
      'addressObservedCount', 'contactPointObservedCount', 'logoObservedCount', 'missingIdCount',
      'missingNameCount', 'missingUrlCount', 'nodeCount', 'observed', 'parseStatus', 'sameAsObservedCount',
      'organizationNodesWithSameAsCount', 'organizationSameAsValueCount', 'emptySameAsValueCount',
      'sourceFormat', 'telephoneObservedCount'
    ].sort());
    assert.strictEqual(quality(orgComplete, 'organization').nodeCount, 1);
    assert.strictEqual(quality(orgComplete, 'organization').observed, true);
    assert.strictEqual(quality(orgComplete, 'organization').parseStatus, 'parsed');
    assert.strictEqual(quality(orgComplete, 'organization').missingIdCount, 0);
    assert.strictEqual(quality(orgComplete, 'organization').missingNameCount, 0);
    assert.strictEqual(quality(orgComplete, 'organization').missingUrlCount, 0); // relative URL is allowed
    assert(Object.values(quality(orgComplete, 'organization')).every((value) => value == null || ['boolean', 'number', 'string'].includes(typeof value)));
    const orgMissing = await observe(jsonLd(org({ '@id': '', name: '', url: '' })), 'org-missing');
    assert.deepStrictEqual([quality(orgMissing, 'organization').missingIdCount, quality(orgMissing, 'organization').missingNameCount, quality(orgMissing, 'organization').missingUrlCount], [1, 1, 1]);
    const orgOptional = await observe(jsonLd(org({ logo: '', sameAs: [], address: '', telephone: '', contactPoint: '' })), 'org-optional');
    assert.deepStrictEqual([quality(orgOptional, 'organization').missingIdCount, quality(orgOptional, 'organization').missingNameCount, quality(orgOptional, 'organization').missingUrlCount], [0, 0, 0]);
    assert.deepStrictEqual([quality(orgOptional, 'organization').organizationNodesWithSameAsCount, quality(orgOptional, 'organization').organizationSameAsValueCount, quality(orgOptional, 'organization').emptySameAsValueCount], [0, 0, 1]);
    const orgSameAsOne = await observe(jsonLd(org({ sameAs: 'https://social.example.test/example' })), 'org-sameas-one');
    assert.deepStrictEqual([quality(orgSameAsOne, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsOne, 'organization').organizationSameAsValueCount, quality(orgSameAsOne, 'organization').emptySameAsValueCount], [1, 1, 0]);
    const orgSameAsArrayOne = await observe(jsonLd(org({ sameAs: ['https://social.example.test/example'] })), 'org-sameas-array-one');
    assert.deepStrictEqual([quality(orgSameAsArrayOne, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsArrayOne, 'organization').organizationSameAsValueCount], [1, 1]);
    const orgSameAsMultiple = await observe(jsonLd(org({ sameAs: ['https://social.example.test/example', 'https://profiles.example.test/example'] })), 'org-sameas-multiple');
    assert.deepStrictEqual([quality(orgSameAsMultiple, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsMultiple, 'organization').organizationSameAsValueCount], [1, 2]);
    const orgSameAsEmpty = await observe(jsonLd(org({ sameAs: '' })), 'org-sameas-empty');
    assert.deepStrictEqual([quality(orgSameAsEmpty, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsEmpty, 'organization').organizationSameAsValueCount, quality(orgSameAsEmpty, 'organization').emptySameAsValueCount], [0, 0, 1]);
    const orgSameAsNull = await observe(jsonLd(org({ sameAs: null })), 'org-sameas-null');
    assert.deepStrictEqual([quality(orgSameAsNull, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsNull, 'organization').organizationSameAsValueCount, quality(orgSameAsNull, 'organization').emptySameAsValueCount], [0, 0, 0]);
    // Object form is not a sameAs scalar in the existing normalizer; it must
    // not become a quality pass merely because it has object keys.
    const orgSameAsObject = await observe(jsonLd(org({ sameAs: { url: 'https://social.example.test/example' } })), 'org-sameas-object');
    assert.deepStrictEqual([quality(orgSameAsObject, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsObject, 'organization').organizationSameAsValueCount, quality(orgSameAsObject, 'organization').emptySameAsValueCount], [0, 0, 1]);
    // URL semantics are deliberately outside this observation: a non-empty
    // relative value is observable without being treated as a URL verdict.
    const orgSameAsRelative = await observe(jsonLd(org({ sameAs: '/official-profile' })), 'org-sameas-relative');
    assert.deepStrictEqual([quality(orgSameAsRelative, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsRelative, 'organization').organizationSameAsValueCount], [1, 1]);
    const orgFamily = await observe(jsonLd([{ '@type': 'Corporation', '@id': '#c', name: 'C', url: '/' }, { '@type': 'LocalBusiness', '@id': '#l', name: 'L', url: '/' }]), 'org-family');
    assert.strictEqual(quality(orgFamily, 'organization').nodeCount, 2);
    const orgFamilySameAs = await observe(jsonLd([{ '@type': 'Corporation', '@id': '#c', name: 'C', url: '/', sameAs: 'https://profiles.example.test/c' }, { '@type': 'LocalBusiness', '@id': '#l', name: 'L', url: '/', sameAs: ['https://profiles.example.test/l', 'https://profiles.example.test/l2'] }]), 'org-family-sameas');
    assert.deepStrictEqual([quality(orgFamilySameAs, 'organization').nodeCount, quality(orgFamilySameAs, 'organization').organizationNodesWithSameAsCount, quality(orgFamilySameAs, 'organization').organizationSameAsValueCount], [2, 2, 3]);
    const websiteComplete = await observe(jsonLd(site()), 'website-complete');
    assert.deepStrictEqual(Object.keys(quality(websiteComplete, 'website')).sort(), [
      'missingIdCount', 'missingNameCount', 'missingUrlCount', 'nodeCount', 'observed', 'parseStatus',
      'potentialActionObservedCount', 'publisherObservedCount', 'sourceFormat'
    ].sort());
    assert.strictEqual(quality(websiteComplete, 'website').nodeCount, 1);
    assert.strictEqual(quality(websiteComplete, 'website').observed, true);
    assert.strictEqual(quality(websiteComplete, 'website').parseStatus, 'parsed');
    assert.deepStrictEqual([quality(websiteComplete, 'website').missingIdCount, quality(websiteComplete, 'website').missingNameCount, quality(websiteComplete, 'website').missingUrlCount], [0, 0, 0]);
    assert(Object.values(quality(websiteComplete, 'website')).every((value) => value == null || ['boolean', 'number', 'string'].includes(typeof value)));
    const websiteMissing = await observe(jsonLd(site({ '@id': '', name: '', url: '' })), 'website-missing');
    assert.deepStrictEqual([quality(websiteMissing, 'website').missingIdCount, quality(websiteMissing, 'website').missingNameCount, quality(websiteMissing, 'website').missingUrlCount], [1, 1, 1]);
    const websiteOptional = await observe(jsonLd(site({ publisher: '', potentialAction: '' })), 'website-optional');
    assert.deepStrictEqual([quality(websiteOptional, 'website').missingIdCount, quality(websiteOptional, 'website').missingNameCount, quality(websiteOptional, 'website').missingUrlCount], [0, 0, 0]);
    const orgGraphScripts = await observe(jsonLd({ '@graph': [org(), site()] }) + jsonLd(org({ '@id': '#two' })), 'org-graph-scripts');
    assert.strictEqual(quality(orgGraphScripts, 'organization').nodeCount, 2);
    assert.strictEqual(quality(orgGraphScripts, 'website').nodeCount, 1);
    const orgSameAsGraphScripts = await observe(jsonLd({ '@graph': [org({ sameAs: 'https://profiles.example.test/graph' })] }) + jsonLd(org({ '@id': '#two', sameAs: ['https://profiles.example.test/script'] })), 'org-sameas-graph-scripts');
    assert.deepStrictEqual([quality(orgSameAsGraphScripts, 'organization').organizationNodesWithSameAsCount, quality(orgSameAsGraphScripts, 'organization').organizationSameAsValueCount], [2, 2]);

    const orgPartialParse = await observe('<script type="application/ld+json">{bad</script>' + jsonLd(org()), 'org-partial-parse');
    assert.strictEqual(quality(orgPartialParse, 'organization').parseStatus, 'parsed');
    assert.strictEqual(quality(orgPartialParse, 'organization').nodeCount, 1);
    assert.strictEqual(quality(orgPartialParse, 'organization').organizationSameAsValueCount, 0);
    assert.strictEqual(orgPartialParse.structuredData.parseErrorsCount, 1);
    const orgTotalParse = await observe('<script type="application/ld+json">{bad</script>', 'org-total-parse');
    assert.strictEqual(quality(orgTotalParse, 'organization').observed, false);
    assert.strictEqual(quality(orgTotalParse, 'organization').parseStatus, 'parse_error');
    assert.strictEqual(quality(orgTotalParse, 'website').parseStatus, 'parse_error');
    const orgWebsiteAbsent = await observe(jsonLd({ '@type': 'Product', name: 'Example product' }), 'org-website-absent');
    assert.strictEqual(quality(orgWebsiteAbsent, 'organization').observed, false);
    assert.strictEqual(quality(orgWebsiteAbsent, 'website').observed, false);
    assert.strictEqual(quality(orgWebsiteAbsent, 'organization').parseStatus, 'parsed');
    assert.strictEqual(quality(orgWebsiteAbsent, 'website').parseStatus, 'parsed');

    const product = (extra) => Object.assign({ '@type': 'Product', name: 'Example product', description: 'Example description' }, extra || {});
    const productComplete = await observe(jsonLd(product()), 'product-complete');
    assert.strictEqual(quality(productComplete, 'product').observed, true);
    assert.deepStrictEqual([quality(productComplete, 'product').missingNameCount, quality(productComplete, 'product').missingDescriptionCount], [0, 0]);
    const productTypeOnly = await observe(jsonLd({ '@type': 'Product' }), 'product-type-only');
    assert.deepStrictEqual([quality(productTypeOnly, 'product').missingNameCount, quality(productTypeOnly, 'product').missingDescriptionCount], [1, 1]);
    const productMissingName = await observe(jsonLd(product({ name: '' })), 'product-missing-name');
    assert.strictEqual(quality(productMissingName, 'product').missingNameCount, 1);
    const productMissingDescription = await observe(jsonLd(product({ description: '' })), 'product-missing-description');
    assert.strictEqual(quality(productMissingDescription, 'product').missingDescriptionCount, 1);
    const productOptional = await observe(jsonLd(product({ '@id': '', url: '', image: '', brand: '', offers: { '@type': 'Offer' } })), 'product-optional');
    assert.deepStrictEqual([quality(productOptional, 'product').missingNameCount, quality(productOptional, 'product').missingDescriptionCount], [0, 0]);
    assert.strictEqual(quality(productOptional, 'product').offerMissingPriceCount, 1);
    const productMany = await observe(jsonLd([{ '@type': 'Product', name: 'A', description: 'A' }, { '@type': 'Product', name: 'B' }]), 'product-multiple');
    assert.strictEqual(quality(productMany, 'product').nodeCount, 2);
    assert.strictEqual(quality(productMany, 'product').missingDescriptionCount, 1);
    const productGraph = await observe(jsonLd({ '@graph': [product()] }) + jsonLd(product({ name: 'Second' })), 'product-graph-scripts');
    assert.strictEqual(quality(productGraph, 'product').nodeCount, 2);
    const productPartial = await observe('<script type="application/ld+json">{bad</script>' + jsonLd(product()), 'product-partial');
    assert.strictEqual(quality(productPartial, 'product').parseStatus, 'parsed');
    const productTotal = await observe('<script type="application/ld+json">{bad</script>', 'product-total');
    assert.strictEqual(quality(productTotal, 'product').parseStatus, 'parse_error');
    const productAbsent = await observe(jsonLd({ '@type': 'WebSite', name: 'Example' }), 'product-absent');
    assert.strictEqual(quality(productAbsent, 'product').observed, false);
    assert.strictEqual(quality(productAbsent, 'product').parseStatus, 'parsed');

    console.log('structured-data-quality-observation: ok');
  } finally {
    await globalThis.__structuredQualityBrowser.close();
    delete globalThis.__structuredQualityBrowser;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
