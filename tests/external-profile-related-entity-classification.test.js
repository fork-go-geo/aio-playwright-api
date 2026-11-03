const assert = require('assert');
const { chromium } = require('playwright');
const hooks = require('../index.js').__lightBudgetTestHooks;

const profiles = [
  'https://x.com/facility_pa',
  'https://www.facebook.com/facility.official/',
  'https://www.instagram.com/facility.official/'
].map(href => ({ href, text: '', imageAlt: 'social', placement: 'footer' }));

const links = {
  externalProfileLinkEvidence: profiles,
  externalEntityLinkEvidence: [{ href: 'https://facility.example.test/', imageAlt: 'Facility', placement: 'footer' }]
};

const fetchImpl = async url => {
  assert.equal(url, 'https://facility.example.test/');
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    text: async () => profiles.map(profile => `<a href="${profile.href}">profile</a>`).join('')
  };
};

(async () => {
  // An explicit official relationship remains an evaluated entity profile.
  const entity = hooks.buildExternalProfileObservationV1_({ externalProfileLinkEvidence: [
    { href: 'https://x.com/company', text: '会社公式SNS' }
  ]}, { linksObserved: true, linksLimited: false });
  assert.equal(entity.candidateCount, 1);
  assert.equal(entity.officialProfileCount, 1);
  assert.equal(entity.profiles[0].subjectClassification, 'entity_official');

  // Before the linked entity root is confirmed, the facility profiles remain
  // unresolved and must not be converted to a negative result.
  const before = hooks.buildExternalProfileObservationV1_(links, { linksObserved: true, linksLimited: false });
  assert.equal(before.candidateCount, 3);
  assert.equal(before.relatedProfileCount, 0);
  assert.equal(before.relationConfirmed, false);

  const geo = { externalProfileObservationV1: before, observed: { links } };
  const attached = await hooks.attachRelatedEntityProfileClassificationV1_(geo, {
    sourceRunId: 'run-a', entryKey: 'https://company.example.test/', fetchImpl
  });
  assert.equal(attached.reason, 'linked_entity_applied');
  assert.equal(geo.externalProfileObservationV1.checked, true);
  assert.equal(geo.externalProfileObservationV1.completeness, 'complete');
  assert.equal(geo.externalProfileObservationV1.candidateCount, 0);
  assert.equal(geo.externalProfileObservationV1.relatedProfileCount, 3);
  assert.ok(geo.externalProfileObservationV1.profiles.every(profile => profile.subjectClassification === 'related_brand_or_facility'));
  assert.ok(geo.externalProfileObservationV1.profiles.every(profile => profile.subjectEvidence && profile.subjectEvidence.sourceRunId === 'run-a'));
  const stale = hooks.buildExternalProfileObservationV1_(links, {
    linksObserved: true, linksLimited: false, sourceRunId: 'run-b', entryKey: 'https://company.example.test/',
    relatedEntityProfileEvidence: [{ href: profiles[0].href, observationComplete: true, sourceRunId: 'run-a', entryKey: 'https://company.example.test/' }]
  });
  assert.equal(stale.candidateCount, 3);
  assert.equal(stale.relatedProfileCount, 0);

  // Mixed subjects retain the directly confirmed corporate account while
  // keeping facility-owned accounts out of its unresolved-candidate set.
  const mixed = hooks.buildExternalProfileObservationV1_({
    externalProfileLinkEvidence: [{ href: 'https://x.com/company', text: '会社公式SNS' }].concat(profiles)
  }, {
    linksObserved: true, linksLimited: false, sourceRunId: 'run-a', entryKey: 'https://company.example.test/',
    relatedEntityProfileEvidence: profiles.map(profile => Object.assign({}, profile, {
      observationComplete: true, sourceRunId: 'run-a', entryKey: 'https://company.example.test/'
    }))
  });
  assert.equal(mixed.officialProfileCount, 1);
  assert.equal(mixed.candidateCount, 1);
  assert.equal(mixed.relatedProfileCount, 3);

  // A linked entity whose hostname cannot be tied to a social handle leaves
  // the profile unresolved. It must not be silently classified as related.
  const unrelated = { externalProfileObservationV1: hooks.buildExternalProfileObservationV1_({
    externalProfileLinkEvidence: [{ href: 'https://x.com/unknown_profile', text: '' }],
    externalEntityLinkEvidence: [{ href: 'https://partner.example.test/', text: 'Partner' }]
  }, { linksObserved: true, linksLimited: false }), observed: { links: {
    externalProfileLinkEvidence: [{ href: 'https://x.com/unknown_profile', text: '' }],
    externalEntityLinkEvidence: [{ href: 'https://partner.example.test/', text: 'Partner' }]
  } } };
  const unresolved = await hooks.attachRelatedEntityProfileClassificationV1_(unrelated, {
    sourceRunId: 'run-a', entryKey: 'https://company.example.test/', fetchImpl
  });
  assert.equal(unresolved.reason, 'linked_entity_not_complete');
  assert.equal(unrelated.externalProfileObservationV1.candidateCount, 1);
  assert.equal(unrelated.externalProfileObservationV1.profiles[0].subjectClassification, 'unresolved');

  // Share endpoints are neither promoted nor classified as a linked entity.
  const share = hooks.buildExternalProfileObservationV1_({ externalProfileLinkEvidence: [
    { href: 'https://x.com/intent/tweet', text: '共有' }
  ]}, { linksObserved: true, linksLimited: false });
  assert.equal(share.candidateCount, 1);
  assert.equal(share.profiles[0].subjectClassification, 'unresolved');
  const zero = hooks.buildExternalProfileObservationV1_({ externalProfileLinkEvidence: [] }, { linksObserved: true, linksLimited: false });
  assert.equal(zero.candidateCount, 0);
  assert.equal(zero.relatedProfileCount, 0);

  // Partial scans and missing run identity cannot yield related classification.
  const partial = hooks.buildExternalProfileObservationV1_(links, { linksObserved: true, linksLimited: true });
  const partialGeo = { externalProfileObservationV1: partial, observed: { links } };
  assert.equal((await hooks.attachRelatedEntityProfileClassificationV1_(partialGeo, {
    sourceRunId: 'run-a', entryKey: 'https://company.example.test/', fetchImpl
  })).reason, 'no_complete_unresolved_profile');
  assert.equal((await hooks.fetchRelatedEntityProfileEvidenceV1_(links, {
    sourceRunId: '', entryKey: 'https://company.example.test/', fetchImpl
  })), null);

  // The fixture mirrors the relevant Aqua-Line structure: facility-site
  // banner plus footer icons. No real site request is made.
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<base href="https://company.example.test/">
      <a href="https://facility.example.test/"><img alt="Facility" src="/facility.png"></a>
      <footer><div class="sns">${profiles.map(profile => `<a href="${profile.href}"><img alt="social" src="/social.png"></a>`).join('')}</div></footer>`);
    const rendered = await hooks.buildGeoSignalsV1(page, 'https://company.example.test/', { balancedMode: false, shortFastMode: false });
    assert.equal(rendered.observed.links.externalProfileLinkEvidence.length, 3);
    assert.equal(rendered.observed.links.externalEntityLinkEvidence.length, 1);
    assert.equal(rendered.observed.links.externalEntityLinkEvidence[0].href, 'https://facility.example.test/');
    await page.close();
  } finally { await browser.close(); }
  console.log('external profile related entity classification: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
