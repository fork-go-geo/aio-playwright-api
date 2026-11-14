const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

// Any accidental outbound I/O fails even if production code catches an error.
const deny = () => { process.stderr.write('fixture forbids network\n'); process.exit(97); };
global.fetch = deny;
require('node:net').Socket.prototype.connect = deny;
for (const protocol of ['node:http', 'node:https']) {
  require(protocol).request = deny; require(protocol).get = deny;
}
for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  require('node:dns')[key] = deny; require('node:dns').promises[key] = deny;
}
const hooks = require('../index.js').__lightBudgetTestHooks;
const url = 'https://brand.example.test/note/users_guide/about/user_terms';
const parse = html => hooks.parseSubpageJsonLdLightHtml(url, url, 200, html, 'ec', {});
const extract = html => parse(html).operatorIdentityInfo;
const name = '検証組織'; // Legal-entity suffixes are deliberately not required.
const address = '<p>所在地：東京都検証区1-1</p>';
const profile = body => `<main>${body}${address}</main>`;
const positive = {
  table: '<table><tr><th>会社名</th><td>検証組織</td></tr></table>',
  dl: '<dl><dt>名称</dt><dd>検証組織</dd></dl>',
  inline_text: '<p>運営会社：検証組織</p>',
  adjacent_blocks: '<h2>会社名</h2><p>検証組織</p>',
  split_inline: '<p><span>会社名</span><br>検証組織</p>',
  inline_link: '<p>運営会社：<a href="/company">検証組織</a></p>',
  nested_link: '<div><span>運営会社：</span><a href="/company"><strong>検証組織</strong></a></div>',
  adjacent_link: '<p>会社名</p><p><a href="/company">検証組織</a></p>',
  split_inline_link: '<p>会社名<br><a href="/company">検証組織</a></p>',
  table_link: '<table><tr><th>会社名</th><td><a href="/company">検証組織</a><br>Example Organization</td></tr></table>',
  dl_link: '<dl><dt>社名</dt><dd><a href="/company">検証組織</a></dd></dl>',
  list_field_link: '<ul><li>運営会社：<a href="/company">検証組織</a></li></ul>',
  footer_structured: '<footer><dl><dt>会社名</dt><dd><a href="/company">検証組織</a></dd></dl></footer>',
  header_structured: '<header><table><tr><th>会社名</th><td>検証組織</td></tr></table></header>',
  whitespace: '<p>\n  運営会社　： <span>検証組織</span>\n</p>',
  linked_label: '<p><a href="/glossary/operator">運営会社</a>：検証組織</p>',
  linked_label_nested: '<p><a href="/glossary/operator"><span>運営会社</span></a>：<strong>検証組織</strong></p>',
  separate_wrappers: '<div><h2>運営会社</h2></div><div><p>検証組織</p></div>',
  nested_wrappers: '<div><div><h2>運営会社</h2></div></div><div><div><p>検証組織</p></div></div>',
  wrapped_link_value: '<div><h2>運営会社</h2></div><div><p><a href="/company">検証組織</a></p></div>',
};
for (const [kind, html] of Object.entries(positive)) {
  assert.equal(extract(profile(html)).companyName, name, kind);
}
const menu = '<a href="/company">運営会社のご紹介</a><a href="/recruit">募集案内</a>';
const negative = {
  single_anchor: '<a href="/company">運営会社のご紹介</a>',
  nested_anchor: '<a href="/company"><span>運営会社</span><span>のご紹介</span></a>',
  adjacent_anchor: '<p><a href="/company">運営会社</a></p><p><a href="/recruit">募集案内</a></p>',
  list_boundary: '<ul><li>運営会社</li><li><a href="/recruit">募集案内</a></li></ul>',
  nested_list: '<h2>運営会社</h2><ul><li><a href="/recruit">募集案内</a></li></ul>',
  section_boundary: '<section><h2>運営会社</h2></section><section><p>別の本文</p></section>',
  unrelated_prose: '<p>検証組織がこの店舗を運営します。</p>',
  linked_label_next_item: '<p><a href="/company">運営会社</a></p><p>募集案内</p>',
  linked_whole_field: '<p><a href="/company">運営会社：検証組織</a></p>',
  linked_guide_label: '<p><a href="/company">運営会社のご紹介</a>：検証組織</p>',
  linked_label_and_navigation: '<p><a href="/company">運営会社</a>：<a href="/jobs">募集案内</a></p>',
  wrapped_section_boundary: '<section><div><h2>運営会社</h2></div></section><section><div><p>別の本文</p></div></section>',
  wrapped_list_boundary: '<ul><li><div><h2>運営会社</h2></div></li><li><div><p>募集案内</p></div></li></ul>',
  nontransparent_wrapper: '<div><h2>運営会社</h2><img alt="補足図"></div><div><p>別の本文</p></div>',
};
for (const tag of ['nav', 'header', 'footer', 'menu']) negative[tag] = `<${tag}><p>運営会社</p><p><a href="/recruit">募集案内</a></p></${tag}>`;
for (const role of ['navigation', 'banner', 'contentinfo', 'menu', 'menubar']) negative['role_' + role] = `<div role="${role}"><p>運営会社</p><p>募集案内</p></div>`;
for (const cls of ['about-navigation', 'site_menu', 'nav', 'header__navigation-list']) negative['class_' + cls] = `<div class="${cls}">${menu}<p>運営会社：募集案内</p></div>`;
negative.id_menu = '<div id="primary-menu"><p>運営会社：募集案内</p></div>';
for (const [kind, html] of Object.entries(negative)) {
  assert.equal(extract(profile(html)).companyName, '', kind);
  assert.equal(extract(profile(html + positive.inline_link)).companyName, name, kind + ': continue to genuine field');
}
const navigationFixture = '<div class="about-navigation"><ul><li><a href="/company">運営会社クラシコムのご紹介</a></li></ul></div>' +
  '<footer><ul><li><a href="/company">運営会社</a></li><li><a href="/recruit">採用情報</a></li></ul></footer>';
assert.equal(extract(navigationFixture).companyName, '');
assert.equal(extract(navigationFixture.replace(/<div class="about-navigation">[\s\S]*?<\/div>/, '')).companyName, '');

// Loading a control source is read-only. Compare every non-identity parser
// output on the exact same real HTML, not reconstructed saved observations.
const loadControl = filename => {
  const mod = new Module(filename, module); mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.join(__dirname, '..'));
  mod._compile(fs.readFileSync(filename, 'utf8'), filename);
  return mod.exports.__lightBudgetTestHooks;
};
let realHtml = 'not_requested';
if (process.env.OPERATOR_TERMS_HTML_PATH) {
  const html = fs.readFileSync(process.env.OPERATOR_TERMS_HTML_PATH, 'utf8');
  assert.equal(crypto.createHash('sha256').update(html).digest('hex'), '707ff431373c4b3e26cb328883989014755f4282e5980f122544bdf4562f7851');
  const actualUrl = 'https://hokuohkurashi.com/note/users_guide/about/user_terms';
  const current = hooks.parseSubpageJsonLdLightHtml(actualUrl, actualUrl, 200, html, 'ec', {});
  assert.equal(current.operatorIdentityInfo.companyName, '', 'no prose-derived or guessed replacement name');
  assert.equal(current.operatorIdentityInfo.hasCompanyName, false);
  assert.equal(current.operatorIdentityInfo.hasOperatorInfo, false);
  assert.equal(hooks.operatorIdentityFieldsConflict_(current.operatorIdentityInfo, { companyName: '株式会社クラシコム' }), false);
  assert.ok(process.env.OPERATOR_CONTROL_SOURCE, 'real HTML comparison needs an unchanged control');
  const control = loadControl(process.env.OPERATOR_CONTROL_SOURCE);
  for (const [kind, body] of Object.entries(positive)) {
    assert.equal(control.parseSubpageJsonLdLightHtml(url, url, 200, profile(body), 'ec', {}).operatorIdentityInfo.companyName, name, kind + ': pre-existing supported shape');
  }
  const before = control.parseSubpageJsonLdLightHtml(actualUrl, actualUrl, 200, html, 'ec', {});
  assert.equal(before.operatorIdentityInfo.companyName, 'クラシコムのご紹介');
  const withoutLocalLink = html.replace(/<a class="about-navigation__link" href="\/note\/users_guide\/about\/company">[^<]*<\/a>/, '');
  assert.notEqual(withoutLocalLink, html);
  assert.equal(control.parseSubpageJsonLdLightHtml(actualUrl, actualUrl, 200, withoutLocalLink, 'ec', {}).operatorIdentityInfo.companyName, '採用情報');
  assert.equal(hooks.parseSubpageJsonLdLightHtml(actualUrl, actualUrl, 200, withoutLocalLink, 'ec', {}).operatorIdentityInfo.companyName, '');
  for (const key of ['address', 'telephone', 'scope', 'scopeKey']) assert.equal(current.operatorIdentityInfo[key], before.operatorIdentityInfo[key], key);
  const omitIdentity = page => { const copy = { ...page }; delete copy.operatorIdentityInfo; return copy; };
  assert.deepEqual(omitIdentity(current), omitIdentity(before), 'all other parser observations remain unchanged');
  realHtml = { before: before.operatorIdentityInfo.companyName, after: current.operatorIdentityInfo.companyName, withoutLinkBefore: '採用情報', withoutLinkAfter: '', nonIdentityParity: true };
}
console.log(JSON.stringify({ fixture: 'operator_navigation_fallback', positive: Object.keys(positive).length,
  negative: Object.keys(negative).length, continueToValidField: Object.keys(negative).length, realHtml }));
