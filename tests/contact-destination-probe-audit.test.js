const assert = require('node:assert/strict');
const { evaluateContactDestinationPages_ } = require('../index.js').__lightBudgetTestHooks;
const origin = 'https://fixture.invalid';
const run = 'fc890a04-96d8-42ed-95ef-72cd7acda87d';
const opts = { sourceRunId: run, entryKey: origin + '/brand/?secret=ENTRY#PRIVATE' };
const pages = [
  { url: origin + '/contact/?secret=QUERY#PRIVATE', status: 404, ok: false, error: 'HTTP 404', errorStage: 'fetch' },
  { url: origin + '/inquiry/', status: null, ok: false, error: 'stage=timeout | url=https://fixture.invalid/?token=SECRET | message=AbortError', errorStage: 'timeout' },
  { url: origin + '/contact-us/', status: 302, ok: false, error: 'redirect_https_downgrade', errorStage: 'fetch' },
  { url: 'https://user:PASSWORD@fixture.invalid/secret/', status: null, ok: false, error: 'secret arbitrary message', errorStage: 'ARBITRARY_SECRET' }
];
const result = evaluateContactDestinationPages_(origin, pages, 'standard_path_probe', pages.map(p => p.url), opts);
assert.equal(result.hasContactDestination, null);
assert.equal(result.evidence.successfulChecks, 0);
assert.equal(result.evidence.observationLimited, true);
const audit = result.evidence.probeAuditV1;
assert.equal(audit.sourceRunId, run);
assert.equal(audit.entryUrl.path, '/brand/');
assert.deepEqual(audit.attempts.map(x => x.reason), ['http_4xx', 'timeout', 'redirect_https_downgrade', 'unknown_fetch_error']);
assert.equal(audit.attempts[0].status, 404);
assert.equal(audit.attempts[1].errorStage, 'timeout');
assert.equal(audit.attempts[3].url, null);
assert.equal(audit.attempts[3].errorStage, null);
assert(!/QUERY|ENTRY|PRIVATE|PASSWORD|SECRET|arbitrary message/.test(JSON.stringify(audit)), '追加監査値へquery/fragment/認証情報/生errorを保存しない');
const good = { url: origin + '/contact/', finalUrl: origin + '/contact/', status: 200, ok: true, pageType: 'contact', title: 'お問い合わせ' };
const positive = evaluateContactDestinationPages_(origin, [good], 'candidate_probe', [good.url], opts);
assert.equal(positive.hasContactDestination, true);
assert.equal(positive.source, 'observed_contact_page');
assert.equal(positive.evidence.probeAuditV1.attempts[0].reason, null);
const absent = evaluateContactDestinationPages_(origin, [{...good,pageType:'about',url:origin+'/about/',finalUrl:origin+'/about/',title:'会社'}], 'candidate_probe', [origin+'/about/'], opts);
assert.equal(absent.hasContactDestination, false, '既存の観測完了陰性を維持');
const capped = evaluateContactDestinationPages_(origin, Array(12).fill(pages[0]), 'candidate_probe', [], {sourceRunId:'invalid',entryKey:'not-url'}).evidence.probeAuditV1;
assert.equal(capped.attempts.length, 8);
assert.equal(capped.sourceRunId, null);
assert.equal(capped.entryUrl, null);
console.log('contact destination probe audit: PASS');
// Optional saved live evidence: never fetch while replaying this fixture.
if (process.env.CONTACT_PROBE_EVIDENCE) {
  const saved = JSON.parse(require('node:fs').readFileSync(process.env.CONTACT_PROBE_EVIDENCE, 'utf8'));
  const savedOrigin = new URL(saved.pages[0].url).origin;
  const replay = evaluateContactDestinationPages_(savedOrigin, saved.pages, 'standard_path_probe', saved.pages.map(p => p.url), { sourceRunId: run, entryKey: savedOrigin + '/careers/newgrad' });
  assert.equal(replay.evidence.probeAuditV1.attempts.length, 5);
  assert(replay.evidence.probeAuditV1.attempts.every(x => x.status === 404 && x.errorStage === 'fetch' && x.reason === 'http_4xx'));
  assert.equal(replay.evidence.successfulChecks, 0);
  assert.equal(replay.hasContactDestination, false, '全候補404の完了陰性を接続');
  console.log('saved contact probe evidence replay: PASS');
}
