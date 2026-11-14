const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const landingUrl = 'https://fixture.example.test/company/landing/';
const candidate = {
  url: landingUrl,
  operatorIdentityProbeSourceType: 'company_profile',
  officialExternalOperatorProfile: false
};
const missing = { observed: false, hasOperatorInfo: false, conflict: false };
const landingHtml = `
  <a href="/company/profile/">会社概要</a>
  <a href="/company/overview-en/">会社概要 Company Overview(English)</a>
  <a href="/company/index.html">企業情報</a>
  <a href="/company/ir/">IR情報</a>
  <a href="/company/safety/">Safety</a>`;

// A/F: a native formal-profile label outranks a bilingual overview and
// unrelated routes never enter the detail candidate set.
const links = hooks.collectExplicitCompanyProfileDetailLinksFromHtml_(landingHtml, landingUrl);
assert.deepStrictEqual(links, [{
  url: 'https://fixture.example.test/company/profile/',
  label: '会社概要', source: 'explicit_company_profile_link'
}]);
const selected = hooks.selectOperatorSecondPageCompanyProfileDetailLink_(
  { ok: true, finalUrl: landingUrl, companyProfileDetailLinks: links }, candidate, missing
);
assert.strictEqual(selected.url, links[0].url);

// A/G: a landing's company-information hub is a distinct role and is chosen
// ahead of a direct detail. The hub can then nominate exactly one relative
// formal-detail link.
const hubLinks = hooks.collectExplicitCompanyProfileHubLinksFromHtml_(landingHtml, landingUrl);
assert.deepStrictEqual(hubLinks, [{
  url: 'https://fixture.example.test/company/index.html',
  label: '企業情報', source: 'explicit_company_profile_hub_link'
}]);
const hub = hooks.selectOperatorCompanyProfileHubLink_(
  { ok: true, finalUrl: landingUrl, companyProfileHubLinks: hubLinks }, candidate, missing
);
assert.strictEqual(hub.url, hubLinks[0].url);
// The traversal plan makes hub and detail distinct roles: a hub wins over a
// direct detail, including when that direct detail would later return 404.
assert.deepStrictEqual(hooks.selectOperatorCompanyProfileFollowupV1_(
  { ok: true, finalUrl: landingUrl, companyProfileHubLinks: hubLinks, companyProfileDetailLinks: links }, candidate, missing
), { role: 'hub', link: hubLinks[0] });
const hubHtml = '<a href="acme/company.html">会社概要</a><a href="/company/ir/">IR</a>';
const hubDetails = hooks.collectExplicitCompanyProfileDetailLinksFromHtml_(hubHtml, hub.url);
assert.deepStrictEqual(hubDetails, [{
  url: 'https://fixture.example.test/company/acme/company.html',
  label: '会社概要', source: 'explicit_company_profile_link'
}]);
const hubDetail = hooks.selectOperatorSecondPageCompanyProfileDetailLink_(
  { ok: true, finalUrl: hub.url, companyProfileDetailLinks: hubDetails }, candidate, missing
);
assert.strictEqual(hubDetail.url, hubDetails[0].url);
assert.deepStrictEqual(hooks.selectOperatorCompanyProfileFollowupV1_(
  { ok: true, finalUrl: hub.url, companyProfileHubLinks: [], companyProfileDetailLinks: hubDetails }, candidate, missing
), { role: 'detail', link: hubDetails[0] });

// B: formal fields on the second page use the unchanged extractor contract.
const complete = hooks.extractOperatorIdentityInfoFromHtml_(`
  <dl><dt>社名</dt><dd>フィクスチャ株式会社</dd>
  <dt>所在地</dt><dd>〒100-0001 東京都千代田区1-1</dd>
  <dt>電話</dt><dd>03-1234-5678</dd></dl>`, selected.url, { highConfidenceCompanyProfile: true });
assert.strictEqual(complete.hasOperatorInfo, true);

// C/D: incomplete or conflicting detail evidence never becomes a selector
// success; the existing formal record/conflict checks retain authority.
const partial = hooks.extractOperatorIdentityInfoFromHtml_(
  '<dl><dt>社名</dt><dd>フィクスチャ株式会社</dd><dt>電話</dt><dd>03-1234-5678</dd></dl>',
  selected.url, { highConfidenceCompanyProfile: true }
);
assert.strictEqual(partial.hasOperatorInfo, false);
assert.strictEqual(hooks.operatorIdentityFieldsConflict_(
  { companyName: '第一株式会社', address: '' }, complete
), true);

// E/H: no explicit profile label and asset URLs never admit a second page.
assert.deepStrictEqual(hooks.collectExplicitCompanyProfileDetailLinksFromHtml_(
  '<a href="/company/ir/">IR</a><a href="/company/safety/">Safety</a><a href="/company/csr/">CSR</a>', landingUrl
), []);
assert.deepStrictEqual(hooks.collectExplicitCompanyProfileDetailLinksFromHtml_(
  '<a href="/company/profile.pdf">会社概要</a>', landingUrl
), []);
assert.deepStrictEqual(hooks.collectExplicitCompanyProfileHubLinksFromHtml_(
  '<a href="/company/ir/">IR</a><a href="/company/safety/">Safety</a><a href="/company/csr/">CSR</a>', landingUrl
), []);
assert.strictEqual(hooks.selectOperatorCompanyProfileFollowupV1_(
  { ok: true, finalUrl: hub.url, companyProfileHubLinks: [], companyProfileDetailLinks: [] }, candidate, missing
), null);
assert.deepStrictEqual(hooks.collectExplicitCompanyProfileDetailLinksFromHtml_(
  '<a href="mailto:x@example.test">会社概要</a><a href="javascript:void(0)">会社概要</a><a href="https://outside.example.test/company">会社概要</a>', landingUrl
), []);

// G/I/J: external, complete, and recursive contexts do not schedule a page.
assert.strictEqual(hooks.selectOperatorSecondPageCompanyProfileDetailLink_(
  { ok: true, finalUrl: landingUrl, companyProfileDetailLinks: links },
  Object.assign({}, candidate, { officialExternalOperatorProfile: true }), missing
), null);
assert.strictEqual(hooks.selectOperatorSecondPageCompanyProfileDetailLink_(
  { ok: true, finalUrl: landingUrl, companyProfileDetailLinks: links }, candidate,
  { observed: true, hasOperatorInfo: true, conflict: false }
), null);
assert.strictEqual(hooks.selectOperatorSecondPageCompanyProfileDetailLink_(
  { ok: true, finalUrl: links[0].url, companyProfileDetailLinks: links }, candidate, missing
), null);
assert.strictEqual(hooks.selectOperatorCompanyProfileHubLink_(
  { ok: true, finalUrl: landingUrl, companyProfileHubLinks: hubLinks }, candidate,
  { observed: true, hasOperatorInfo: true, conflict: false }
), null);

console.log('operator identity second-page probe fixtures: PASS');
