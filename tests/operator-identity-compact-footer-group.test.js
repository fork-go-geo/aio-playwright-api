const assert = require('assert');
const { chromium } = require('playwright');
const hooks = require('../index.js').__lightBudgetTestHooks;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="visual-footer">
        <dl>
          <dt>運営会社</dt>
          <dd><ul><li><a href="https://operator-fixture.invalid/">架空運営株式会社</a></li></ul></dd>
        </dl>
        <dl>
          <dt>Company</dt>
          <dd><ul><li><a href="https://company-fixture.invalid/">Fixture Holdings</a></li></ul></dd>
        </dl>
        <dl>
          <dt>その他</dt>
          <dd><ul>
            <li><a href="https://policy-fixture.invalid/">個人情報保護方針</a></li>
            <li><a href="https://youtube.example.invalid/channel">YouTube</a></li>
            <li><a href="https://social.example.invalid/account">公式SNS</a></li>
            <li><a href="https://external.example.invalid/">一般外部リンク</a></li>
          </ul></dd>
        </dl>
      </div>
    `);
    const links = await hooks.collectDiscoverLinksFromPage(page);
    const operatorLink = links.footerLinks.find(item => item.href === 'https://operator-fixture.invalid/');
    const companyLink = links.footerLinks.find(item => item.href === 'https://company-fixture.invalid/');
    assert.ok(operatorLink, 'operator link in a compact dl group must be forwarded as a footer link');
    assert.strictEqual(operatorLink.groupHeading, '運営会社');
    assert.ok(companyLink, 'English Company group must be forwarded as a footer link');
    assert.strictEqual(companyLink.groupHeading, 'Company');

    const candidates = hooks.collectOfficialExternalOperatorProfileCandidates_(links, 'https://service-fixture.invalid');
    assert.deepStrictEqual(candidates.map(item => item.url).sort(), [
      'https://company-fixture.invalid',
      'https://operator-fixture.invalid'
    ]);
    ['https://policy-fixture.invalid/', 'https://youtube.example.invalid/channel', 'https://social.example.invalid/account', 'https://external.example.invalid/']
      .forEach(url => assert.strictEqual(links.footerLinks.some(item => item.href === url), false, `${url} must not be admitted as a compact operator group link`));

    console.log(JSON.stringify({
      pass: true,
      fixture: 'operator_identity_compact_footer_group',
      cases: 6
    }));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
