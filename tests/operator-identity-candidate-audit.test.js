const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

function candidate(url, label, sources, score) {
  return { url, label, sources, score };
}

const eligibleCompany = candidate('https://fixture.invalid/company/', '会社概要', ['nav', 'sitemap'], 90);
const houjinGaiyo = candidate('https://fixture.invalid/company/overview/', '法人概要', ['nav', 'sitemap'], 100);
const houjinGaiyoNavOnly = candidate('https://fixture.invalid/company/limited/', '法人概要', ['nav'], 80);
const houjinInfo = candidate('https://fixture.invalid/company/info/', '法人情報', ['nav', 'sitemap'], 70);
const pathMiss = candidate('https://fixture.invalid/news/', '会社概要', ['nav', 'sitemap'], 60);
const labelMiss = candidate('https://fixture.invalid/company/', 'お知らせ', ['nav', 'sitemap'], 50);
const corroborationMiss = candidate('https://fixture.invalid/company/', '会社概要', ['nav'], 40);
const candidates = [houjinGaiyo, eligibleCompany, houjinGaiyoNavOnly, houjinInfo, pathMiss, labelMiss, corroborationMiss];

// Capture the pre-instrumentation selection outputs first. The audit builder
// must only describe this result, never influence it.
const selectedBefore = hooks.selectOperatorIdentityProbeCandidate_(candidates, 'corporate');
const eligibleBefore = candidates.map(hooks.isHighConfidenceCompanyProfileCandidate_);
assert.strictEqual(selectedBefore.url, houjinGaiyo.url);
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidate_(candidates, 'saas').url, houjinGaiyo.url,
  'SaaS may use the same already-high-confidence company profile probe');
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidate_(candidates, 'shop_facility'), null,
  'shop/facility remains outside the operator profile probe contract');
const identityHtml = '<table><tr><th>会社名</th><td>Fixture株式会社</td></tr><tr><th>所在地</th><td>東京都千代田区1-1</td></tr><tr><th>電話番号</th><td>03-0000-0000</td></tr></table>';
const formalBefore = hooks.normalizeOperatorIdentityInfo_(
  hooks.extractOperatorIdentityInfoFromHtml_(identityHtml, eligibleCompany.url, { highConfidenceCompanyProfile: true }),
  'company_profile'
);

const audit = hooks.buildOperatorIdentityCandidateAuditV1_(candidates, 'corporate', selectedBefore);
assert.strictEqual(audit.version, 'operator_identity_candidate_audit_v1');
assert.strictEqual(audit.candidates.length <= 5, true);
assert.strictEqual(audit.selection.selectedCandidateUrl, houjinGaiyo.url);
assert.strictEqual(audit.selection.selectedCandidateLabel, '法人概要');
assert.strictEqual(audit.selection.noCandidateReason, null);

const discoverWithOperatorGroup = hooks.buildOperatorIdentityDiscoverLinkAuditV1_({
  allLinks: [{ href: 'https://operator-fixture.invalid/', text: '架空運営株式会社', groupHeading: '運営会社' }],
  navLinks: [],
  footerLinks: [{ href: 'https://operator-fixture.invalid/', text: '架空運営株式会社', groupHeading: '運営会社' }]
}, 'https://service-fixture.invalid');
assert.strictEqual(discoverWithOperatorGroup.operatorRelationLinkCount, 1);
assert.deepStrictEqual(discoverWithOperatorGroup.operatorRelationSample, [{
  groupHeading: '運営会社', anchorText: '架空運営株式会社', source: 'footer', isExternal: true, pathIsRoot: true
}]);
assert.strictEqual(discoverWithOperatorGroup.operatorRelationSample[0].href, undefined);

const discoverWithoutOperatorGroup = hooks.buildOperatorIdentityDiscoverLinkAuditV1_({
  allLinks: [{ href: 'https://external.example.invalid/company/', text: 'Example Company' }],
  navLinks: [{ href: 'https://external.example.invalid/company/', text: 'Example Company' }],
  footerLinks: []
}, 'https://service-fixture.invalid');
assert.strictEqual(discoverWithoutOperatorGroup.operatorRelationLinkCount, 0);

const discoverSocialAndPolicy = hooks.buildOperatorIdentityDiscoverLinkAuditV1_({
  allLinks: [
    { href: 'https://social.example.invalid/', text: '公式SNS' },
    { href: 'https://policy.example.invalid/', text: '個人情報保護方針', groupHeading: 'ポリシー' }
  ],
  navLinks: [],
  footerLinks: [
    { href: 'https://social.example.invalid/', text: '公式SNS' },
    { href: 'https://policy.example.invalid/', text: '個人情報保護方針', groupHeading: 'ポリシー' }
  ]
}, 'https://service-fixture.invalid');
assert.strictEqual(discoverSocialAndPolicy.operatorRelationLinkCount, 0);

function byLabel(label) {
  return audit.candidates.find(item => item.anchorLabel === label);
}

const eligible = byLabel('法人概要');
assert.ok(eligible);
assert.strictEqual(eligible.pathMatched, true);
assert.strictEqual(eligible.labelMatched, true);
assert.strictEqual(eligible.sitemapCorroborated, true);
assert.strictEqual(eligible.navFooterCorroborated, true);
assert.strictEqual(eligible.independentCorroborationSatisfied, true);
assert.strictEqual(eligible.highConfidenceEligible, true);
assert.strictEqual(eligible.selectedForProbe, true);
assert.strictEqual(eligible.score, 100);
assert.deepStrictEqual(eligible.rejectionReasons, []);

const houjinNavOnly = hooks.evaluateHighConfidenceCompanyProfileCandidate_(houjinGaiyoNavOnly);
assert.strictEqual(houjinNavOnly.pathMatched, true);
assert.strictEqual(houjinNavOnly.labelMatched, true);
assert.strictEqual(houjinNavOnly.independentCorroborationSatisfied, false);
assert.strictEqual(houjinNavOnly.highConfidenceEligible, false);
assert.deepStrictEqual(houjinNavOnly.rejectionReasons, ['independent_corroboration_missing']);

const info = byLabel('法人情報');
assert.ok(info);
assert.strictEqual(info.labelMatched, true);
assert.strictEqual(info.highConfidenceEligible, true);

const path = byLabel('会社概要');
assert.ok(path);
// The rejected path candidate can fall outside the bounded five-entry audit;
// evaluate it directly to keep the bound independent of selection behavior.
assert.deepStrictEqual(hooks.evaluateHighConfidenceCompanyProfileCandidate_(pathMiss).rejectionReasons, ['path_not_company_profile']);
assert.deepStrictEqual(hooks.evaluateHighConfidenceCompanyProfileCandidate_(labelMiss).rejectionReasons, ['company_profile_label_missing']);
assert.deepStrictEqual(hooks.evaluateHighConfidenceCompanyProfileCandidate_(corroborationMiss).rejectionReasons, ['independent_corroboration_missing']);

// Re-evaluate the unchanged producer selectors after audit construction.
assert.deepStrictEqual(candidates.map(hooks.isHighConfidenceCompanyProfileCandidate_), eligibleBefore);
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidate_(candidates, 'corporate').url, selectedBefore.url);
const formalAfter = hooks.normalizeOperatorIdentityInfo_(
  hooks.extractOperatorIdentityInfoFromHtml_(identityHtml, eligibleCompany.url, { highConfidenceCompanyProfile: true }),
  'company_profile'
);
assert.deepStrictEqual(formalAfter, formalBefore);

// A footer/nav group heading is an explicit operator relation even when the
// anchor itself is only the official company's name on another origin.
const groupedExternal = hooks.collectOfficialExternalOperatorProfileCandidates_({
  navLinks: [],
  footerLinks: [{ href: 'https://operator-fixture.invalid/company-profile/', text: '架空運営株式会社', groupHeading: '運営会社' }]
}, 'https://service-fixture.invalid');
assert.strictEqual(groupedExternal.length, 1);
assert.strictEqual(groupedExternal[0].officialExternalOperatorProfile, true);
assert.strictEqual(groupedExternal[0].operatorRelationLabel, '運営会社');
assert.strictEqual(groupedExternal[0].operatorRelationAnchorLabel, '架空運営株式会社');
const groupedEnglish = hooks.collectOfficialExternalOperatorProfileCandidates_({
  navLinks: [{ href: 'https://company-fixture.invalid/company/', text: 'Fixture Holdings', groupHeading: 'Company' }],
  footerLinks: []
}, 'https://service-fixture.invalid');
assert.strictEqual(groupedEnglish.length, 1);
assert.strictEqual(groupedEnglish[0].operatorRelationLabel, 'Company');
assert.deepStrictEqual(hooks.collectOfficialExternalOperatorProfileCandidates_({
  navLinks: [],
  footerLinks: [
    { href: 'https://youtube.example.invalid/channel', text: 'YouTube' },
    { href: 'https://social.example.invalid/account', text: '公式SNS' }
  ]
}, 'https://service-fixture.invalid'), []);
assert.deepStrictEqual(hooks.collectOfficialExternalOperatorProfileCandidates_({
  navLinks: [{ href: 'https://external.example.invalid/company/', text: 'Example Company' }],
  footerLinks: []
}, 'https://service-fixture.invalid'), []);

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_candidate_audit_v1',
  selectedCandidateUnchanged: true,
  formalRecordUnchanged: true,
  cases: {
    companyOverviewSelected: true,
    houjinGaiyoSelectedWithCorroboration: eligible.highConfidenceEligible === true && eligible.selectedForProbe === true,
    houjinGaiyoRejectedWithoutCorroboration: houjinNavOnly.highConfidenceEligible === false,
    houjinInfoLabelMatched: info.labelMatched === true,
    pathFailure: true,
    labelFailure: true,
    corroborationFailure: true,
    bounded: audit.candidates.length <= 5,
    groupedFooterOperator: true,
    groupedEnglishCompany: true,
    discoverLinkAuditOperatorGroup: discoverWithOperatorGroup.operatorRelationLinkCount === 1,
    discoverLinkAuditNoGroup: discoverWithoutOperatorGroup.operatorRelationLinkCount === 0,
    discoverLinkAuditSocialPolicy: discoverSocialAndPolicy.operatorRelationLinkCount === 0,
    unrelatedExternalRejected: true,
    ungroupedExternalRejected: true
  }
}, null, 2));
