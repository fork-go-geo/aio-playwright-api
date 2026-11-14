const assert = require('assert');
const { buildExternalProfileObservationV1_ } = require('../index.js').__lightBudgetTestHooks;
const company = '架空企業株式会社';
const direct = { externalProfileLinkEvidence: [{ href: 'https://x.com/direct', text: '公式 X' }] };
const listing = [
  { href: 'https://x.com/corporate', text: '架空企業', fromOfficialAccountListing: true, sourceUrl: 'https://fixture.invalid/social/' },
  { href: 'https://x.com/corporate/', text: '架空企業', fromOfficialAccountListing: true, sourceUrl: 'https://fixture.invalid/social/' },
  { href: 'https://x.com/service', text: '架空サービス by 架空企業', fromOfficialAccountListing: true, sourceUrl: 'https://fixture.invalid/social/' }
];
const observed = buildExternalProfileObservationV1_(direct, { linksObserved: true, corporateName: company, officialListingEvidence: listing });
assert.equal(observed.candidateCount, 3);
assert.equal(observed.officialProfileCount, 2);
assert.equal(observed.profiles.find(x => x.href === 'https://x.com/corporate').relationConfirmed, true);
assert.equal(observed.profiles.find(x => x.href === 'https://x.com/service').relationConfirmed, false);
const noName = buildExternalProfileObservationV1_({ externalProfileLinkEvidence: [] }, { linksObserved: true, officialListingEvidence: listing });
assert.equal(noName.officialProfileCount, 0);
console.log('external profile official listing contract: PASS');
