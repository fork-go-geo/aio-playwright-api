const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

function candidate(url, label, sources, score) {
  return { url, label, sources, score };
}

const eligibleCompany = candidate('https://fixture.invalid/company/', '会社概要', ['nav', 'sitemap'], 90);
const houjinGaiyoNavOnly = candidate('https://fixture.invalid/company/', '法人概要', ['nav'], 80);
const houjinInfo = candidate('https://fixture.invalid/company/info/', '法人情報', ['nav', 'sitemap'], 70);
const pathMiss = candidate('https://fixture.invalid/news/', '会社概要', ['nav', 'sitemap'], 60);
const labelMiss = candidate('https://fixture.invalid/company/', 'お知らせ', ['nav', 'sitemap'], 50);
const corroborationMiss = candidate('https://fixture.invalid/company/', '会社概要', ['nav'], 40);
const candidates = [eligibleCompany, houjinGaiyoNavOnly, houjinInfo, pathMiss, labelMiss, corroborationMiss];

// Capture the pre-instrumentation selection outputs first. The audit builder
// must only describe this result, never influence it.
const selectedBefore = hooks.selectOperatorIdentityProbeCandidate_(candidates, 'corporate');
const eligibleBefore = candidates.map(hooks.isHighConfidenceCompanyProfileCandidate_);
assert.strictEqual(selectedBefore.url, eligibleCompany.url);
const identityHtml = '<table><tr><th>会社名</th><td>Fixture株式会社</td></tr><tr><th>所在地</th><td>東京都千代田区1-1</td></tr><tr><th>電話番号</th><td>03-0000-0000</td></tr></table>';
const formalBefore = hooks.normalizeOperatorIdentityInfo_(
  hooks.extractOperatorIdentityInfoFromHtml_(identityHtml, eligibleCompany.url, { highConfidenceCompanyProfile: true }),
  'company_profile'
);

const audit = hooks.buildOperatorIdentityCandidateAuditV1_(candidates, 'corporate', selectedBefore);
assert.strictEqual(audit.version, 'operator_identity_candidate_audit_v1');
assert.strictEqual(audit.candidates.length <= 5, true);
assert.strictEqual(audit.selection.selectedCandidateUrl, eligibleCompany.url);
assert.strictEqual(audit.selection.selectedCandidateLabel, '会社概要');
assert.strictEqual(audit.selection.noCandidateReason, null);

function byLabel(label) {
  return audit.candidates.find(item => item.anchorLabel === label);
}

const eligible = byLabel('会社概要');
assert.ok(eligible);
assert.strictEqual(eligible.pathMatched, true);
assert.strictEqual(eligible.labelMatched, true);
assert.strictEqual(eligible.sitemapCorroborated, true);
assert.strictEqual(eligible.navFooterCorroborated, true);
assert.strictEqual(eligible.independentCorroborationSatisfied, true);
assert.strictEqual(eligible.highConfidenceEligible, true);
assert.strictEqual(eligible.selectedForProbe, true);

const houjin = byLabel('法人概要');
assert.ok(houjin);
assert.strictEqual(houjin.pathMatched, true);
assert.strictEqual(houjin.labelMatched, false);
assert.strictEqual(houjin.highConfidenceEligible, false);
assert.deepStrictEqual(houjin.rejectionReasons, ['company_profile_label_missing', 'independent_corroboration_missing']);

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

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_candidate_audit_v1',
  selectedCandidateUnchanged: true,
  formalRecordUnchanged: true,
  cases: {
    companyOverviewSelected: true,
    houjinGaiyoCurrentContract: houjin.highConfidenceEligible === false,
    houjinInfoLabelMatched: info.labelMatched === true,
    pathFailure: true,
    labelFailure: true,
    corroborationFailure: true,
    bounded: audit.candidates.length <= 5
  }
}, null, 2));
