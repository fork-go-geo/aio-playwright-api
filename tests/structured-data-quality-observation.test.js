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

function valueQuality(signals, family) {
  return quality(signals, family) && quality(signals, family).valueQualityV1;
}

function hasReason(signals, family, field, reason) {
  const detail = valueQuality(signals, family);
  return Boolean(detail && detail.fieldReasonCodes && Array.isArray(detail.fieldReasonCodes[field]) && detail.fieldReasonCodes[field].includes(reason));
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
    assert.strictEqual(quality(complete, 'breadcrumb').observationComplete, true);
    assert.strictEqual(quality(complete, 'organization').observationComplete, true);
    assert.strictEqual(quality(complete, 'website').observationComplete, true);
    assert.strictEqual(complete.structuredData.hasBreadcrumbList, true);
    assert.strictEqual(complete.structuredData.hasFAQPage, true);
    assert.deepStrictEqual(complete.structuredDataQualityV1, complete.structuredData.structuredDataQualityV1);
    assert.deepStrictEqual(Object.keys(quality(complete, 'breadcrumb')).sort(), [
      'duplicatePositionCount', 'invalidPositionCount', 'itemCount', 'itemListElementCount',
      'listItemCount', 'missingItemCount', 'missingItemListElementCount', 'missingListItemCount',
      'missingNameCount', 'missingPositionCount', 'nodeCount', 'observationComplete', 'observationScope',
      'observed', 'parseStatus', 'sourceFormat'
    ].sort());
    assert.deepStrictEqual(Object.keys(quality(complete, 'faq')).sort(), [
      'mainEntityCount', 'missingAcceptedAnswerCount', 'missingAnswerTextCount', 'missingMainEntityCount',
      'missingQuestionCount', 'missingQuestionNameCount', 'nodeCount', 'observationComplete', 'observationScope', 'observed', 'parseStatus',
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

    // Standard JSON.parse semantics must win: the final duplicate key is the
    // only @type visible to the observer. Do not rescue earlier keys.
    const duplicateTypeKeys = await observe(
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Ignored","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"/"}]}</script>',
      'duplicate-type-keys'
    );
    assert.strictEqual(duplicateTypeKeys.structuredData.hasBreadcrumbList, true);
    assert.strictEqual(duplicateTypeKeys.structuredData.hasOrganization, false);
    assert.strictEqual(duplicateTypeKeys.structuredData.hasWebsite, false);
    assert.strictEqual(quality(duplicateTypeKeys, 'breadcrumb').observed, true);
    assert.strictEqual(quality(duplicateTypeKeys, 'organization').observed, false);
    assert.strictEqual(quality(duplicateTypeKeys, 'organization').nodeCount, 0);
    assert.strictEqual(quality(duplicateTypeKeys, 'organization').observationComplete, true);

    const org = (extra) => Object.assign({ '@type': 'Organization', '@id': 'https://example.test/#org', name: 'Example', url: '/company' }, extra || {});
    const site = (extra) => Object.assign({ '@type': 'WebSite', '@id': 'https://example.test/#website', name: 'Example', url: '/' }, extra || {});
    const orgComplete = await observe(jsonLd(org()), 'org-complete');
    assert.deepStrictEqual(Object.keys(quality(orgComplete, 'organization')).sort(), [
      'addressObservedCount', 'contactPointObservedCount', 'logoObservedCount', 'missingIdCount',
      'missingNameCount', 'missingUrlCount', 'nodeCount', 'observationComplete', 'observationScope', 'observed', 'parseStatus', 'sameAsObservedCount',
      'organizationNodesWithSameAsCount', 'organizationSameAsValueCount', 'emptySameAsValueCount',
      'sourceFormat', 'telephoneObservedCount', 'valueQualityV1'
    ].sort());
    assert.strictEqual(quality(orgComplete, 'organization').nodeCount, 1);
    assert.strictEqual(quality(orgComplete, 'organization').observed, true);
    assert.strictEqual(quality(orgComplete, 'organization').parseStatus, 'parsed');
    assert.strictEqual(quality(orgComplete, 'organization').missingIdCount, 0);
    assert.strictEqual(quality(orgComplete, 'organization').missingNameCount, 0);
    assert.strictEqual(quality(orgComplete, 'organization').missingUrlCount, 0); // relative URL is allowed
    assert.strictEqual(valueQuality(orgComplete, 'organization').checked, true);
    assert.strictEqual(valueQuality(orgComplete, 'organization').completeness, 'complete');
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
      'missingIdCount', 'missingNameCount', 'missingUrlCount', 'nodeCount', 'observationComplete', 'observationScope', 'observed', 'parseStatus',
      'potentialActionObservedCount', 'publisherObservedCount', 'sourceFormat', 'valueQualityV1'
    ].sort());
    assert.strictEqual(quality(websiteComplete, 'website').nodeCount, 1);
    assert.strictEqual(quality(websiteComplete, 'website').observed, true);
    assert.strictEqual(quality(websiteComplete, 'website').parseStatus, 'parsed');
    assert.deepStrictEqual([quality(websiteComplete, 'website').missingIdCount, quality(websiteComplete, 'website').missingNameCount, quality(websiteComplete, 'website').missingUrlCount], [0, 0, 0]);
    assert.strictEqual(valueQuality(websiteComplete, 'website').checked, true);
    assert.strictEqual(valueQuality(websiteComplete, 'website').completeness, 'complete');
    const websiteMissing = await observe(jsonLd(site({ '@id': '', name: '', url: '' })), 'website-missing');
    assert.deepStrictEqual([quality(websiteMissing, 'website').missingIdCount, quality(websiteMissing, 'website').missingNameCount, quality(websiteMissing, 'website').missingUrlCount], [1, 1, 1]);
    const websiteOptional = await observe(jsonLd(site({ publisher: '', potentialAction: '' })), 'website-optional');
    assert.deepStrictEqual([quality(websiteOptional, 'website').missingIdCount, quality(websiteOptional, 'website').missingNameCount, quality(websiteOptional, 'website').missingUrlCount], [0, 0, 0]);

    // PR #6 value-quality contract: values are classified without returning
    // their contents, and relative / fragment IRIs are deliberately accepted.
    const orgAbsolute = await observe(jsonLd(org({ url: 'https://example.test/company' })), 'org-url-absolute');
    assert.strictEqual(valueQuality(orgAbsolute, 'organization').invalidValueCount, 0);
    const orgFragment = await observe(jsonLd(org({ url: '#organization' })), 'org-url-fragment');
    assert.strictEqual(valueQuality(orgFragment, 'organization').invalidValueCount, 0);
    const orgMalformedUrl = await observe(jsonLd(org({ url: 'http://[bad' })), 'org-url-malformed');
    assert(valueQuality(orgMalformedUrl, 'organization').invalidFields.includes('url'));
    assert(hasReason(orgMalformedUrl, 'organization', 'url', 'iri_unparseable'));
    const orgWrongUrlType = await observe(jsonLd(org({ url: { unsupported: true } })), 'org-url-wrong-type');
    assert(hasReason(orgWrongUrlType, 'organization', 'url', 'iri_value_shape_invalid'));

    const logoUrl = await observe(jsonLd(org({ logo: '/logo.png' })), 'org-logo-url');
    assert.strictEqual(valueQuality(logoUrl, 'organization').invalidFields.includes('logo'), false);
    const logoImageObject = await observe(jsonLd(org({ logo: { '@type': 'ImageObject', url: '/logo.png' } })), 'org-logo-imageobject-url');
    assert.strictEqual(valueQuality(logoImageObject, 'organization').invalidFields.includes('logo'), false);
    const logoContentUrl = await observe(jsonLd(org({ logo: { '@type': 'ImageObject', contentUrl: '/logo.png' } })), 'org-logo-imageobject-contenturl');
    assert.strictEqual(valueQuality(logoContentUrl, 'organization').invalidFields.includes('logo'), false);
    const logoMalformed = await observe(jsonLd(org({ logo: 42 })), 'org-logo-malformed');
    assert(hasReason(logoMalformed, 'organization', 'logo', 'logo_value_shape_invalid'));
    assert.strictEqual(valueQuality(orgOptional, 'organization').invalidFields.includes('logo'), false);

    const sameAsValid = await observe(jsonLd(org({ sameAs: ['https://profiles.example.test/org', '#official'] })), 'org-sameas-valid');
    assert.strictEqual(valueQuality(sameAsValid, 'organization').invalidFields.includes('sameAs'), false);
    const sameAsMalformed = await observe(jsonLd(org({ sameAs: 'http://[bad' })), 'org-sameas-malformed');
    assert(hasReason(sameAsMalformed, 'organization', 'sameAs', 'iri_unparseable'));
    const sameAsMixed = await observe(jsonLd(org({ sameAs: ['https://profiles.example.test/org', 'http://[bad'] })), 'org-sameas-mixed');
    assert.strictEqual(valueQuality(sameAsMixed, 'organization').validValueCount >= 2, true);
    assert.strictEqual(valueQuality(sameAsMixed, 'organization').invalidFields.includes('sameAs'), true);
    assert.strictEqual(valueQuality(sameAsMixed, 'organization').weakFields.length, 0);

    const addressText = await observe(jsonLd(org({ address: 'Tokyo, Japan' })), 'org-address-text');
    assert.strictEqual(valueQuality(addressText, 'organization').invalidFields.includes('address'), false);
    const addressPostal = await observe(jsonLd(org({ address: { '@type': 'PostalAddress', addressLocality: 'Tokyo' } })), 'org-address-postal');
    assert.strictEqual(valueQuality(addressPostal, 'organization').invalidFields.includes('address'), false);
    const addressArray = await observe(jsonLd(org({ address: ['Tokyo, Japan', { '@type': 'PostalAddress', postalCode: '100-0001' }] })), 'org-address-array');
    assert.strictEqual(valueQuality(addressArray, 'organization').invalidFields.includes('address'), false);
    const addressMalformed = await observe(jsonLd(org({ address: 42 })), 'org-address-malformed');
    assert(hasReason(addressMalformed, 'organization', 'address', 'address_value_shape_invalid'));
    assert.strictEqual(valueQuality(orgOptional, 'organization').invalidFields.includes('address'), false);

    for (const telephone of ['+81 3 1234 5678', '03-1234-5678', '(03) 1234 5678', '03 1234 5678', '+81-3-1234-5678 ext. 9']) {
      const phone = await observe(jsonLd(org({ telephone })), `org-phone-${telephone.length}`);
      assert.strictEqual(valueQuality(phone, 'organization').invalidFields.includes('telephone'), false);
    }
    const telephoneEmpty = await observe(jsonLd(org({ telephone: '' })), 'org-phone-empty');
    assert(hasReason(telephoneEmpty, 'organization', 'telephone', 'telephone_empty'));
    const telephoneMalformed = await observe(jsonLd(org({ telephone: 42 })), 'org-phone-malformed');
    assert(hasReason(telephoneMalformed, 'organization', 'telephone', 'telephone_value_shape_invalid'));
    assert(hasReason(orgOptional, 'organization', 'telephone', 'telephone_empty'));

    const contactPointValid = await observe(jsonLd(org({ contactPoint: { '@type': 'ContactPoint', telephone: '+81 3 1234 5678' } })), 'contactpoint-valid');
    assert.strictEqual(quality(contactPointValid, 'contactPoint').observed, true);
    assert.strictEqual(valueQuality(contactPointValid, 'contactPoint').invalidFields.includes('telephone'), false);
    const contactPointMalformed = await observe(jsonLd(org({ contactPoint: { '@type': 'ContactPoint', telephone: 42 } })), 'contactpoint-malformed');
    assert(hasReason(contactPointMalformed, 'contactPoint', 'telephone', 'telephone_value_shape_invalid'));
    const contactPointAbsent = await observe(jsonLd(org()), 'contactpoint-absent');
    assert.strictEqual(quality(contactPointAbsent, 'contactPoint').observed, false);
    const contactPointWithoutTelephone = await observe(jsonLd(org({ contactPoint: { '@type': 'ContactPoint' } })), 'contactpoint-without-telephone');
    assert.strictEqual(quality(contactPointWithoutTelephone, 'contactPoint').observed, true);
    assert.strictEqual(valueQuality(contactPointWithoutTelephone, 'contactPoint').invalidValueCount, 0);
    const contactPointUnsupported = await observe(jsonLd(org({ contactPoint: 'unsupported-shape' })), 'contactpoint-unsupported');
    assert.strictEqual(valueQuality(contactPointUnsupported, 'contactPoint').completeness, 'limited');

    const websiteAbsolute = await observe(jsonLd(site({ url: 'https://example.test/' })), 'website-url-absolute');
    assert.strictEqual(valueQuality(websiteAbsolute, 'website').invalidFields.includes('url'), false);
    const websiteFragment = await observe(jsonLd(site({ url: '#website' })), 'website-url-fragment');
    assert.strictEqual(valueQuality(websiteFragment, 'website').invalidFields.includes('url'), false);
    const websiteMalformed = await observe(jsonLd(site({ url: 'http://[bad' })), 'website-url-malformed');
    assert(hasReason(websiteMalformed, 'website', 'url', 'iri_unparseable'));
    const websiteWrongType = await observe(jsonLd(site({ url: { unsupported: true } })), 'website-url-wrong-type');
    assert(hasReason(websiteWrongType, 'website', 'url', 'iri_value_shape_invalid'));
    assert.strictEqual(quality(websiteMissing, 'website').missingUrlCount, 1);

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
