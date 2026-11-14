#!/usr/bin/env python3
"""Isolated audit only. --check performs filesystem/Git checks without Docker or HTTP."""
import difflib
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent
# The prepared package pins its absolute root and commit in manifest.json.
# Importing this template for pure contract tests does not require that package.
MANIFEST = json.loads((ROOT / 'manifest.json').read_text()) if (ROOT / 'manifest.json').is_file() else {}
EXPECTED = MANIFEST.get('commit')
BASE_IMAGE = 'mcr.microsoft.com/playwright:v1.54.2-jammy'
BUDGET = 170000
SITES = [
    ('ec', 'https://hokuohkurashi.com', 'ec'),
    ('corporate', 'https://megalos.co.jp/corporate', 'corporate'),
    ('facility', 'https://megalos.co.jp', 'shop_facility'),
    ('saas', 'https://kintone.cybozu.co.jp', 'saas'),
    ('media', 'https://sitakke.jp', 'media'),
]
BROWSER_TESTS = [
    'operator-identity-compact-footer-group.test.js',
    'operator-identity-link-collection-integration.test.js',
    'coverage-candidate-dom-ready.test.js',
    'breadcrumb-ui-observation.test.js',
]
GAS_TESTS = [
    'test-operator-info-current-run-tristate-contract.js',
    'test-operator-info-cloudrun-company-profile-fixtures.js',
    'test-shop-facility-operator-relation-transport-fixtures.js',
    'test-operator-identity-summary-local.js',
    'test-phase1-tristate-observation-contract.js',
    'test-phase3-score-canonical-gate.js',
    'test-observation-rows-persistence-contract.js',
    'test-current-run-snapshot-isolation.js',
    'test-observation-run-id-persistence-contract.js',
    'test-pdf-saved-observation-input-contract.js',
    'test-pdf-observation-legacy-compat-contract.js',
]
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def command(args, timeout=30):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, timeout=timeout).decode().strip()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')

def preflight():
    require(bool(MANIFEST), 'Use the prepared audit package with manifest.json')
    require(Path(__file__).resolve() == ROOT / 'run-audit.py', 'Script must stay at its fixed path')
    require(MANIFEST['root'] == str(ROOT) and MANIFEST['commit'] == EXPECTED, 'Unexpected manifest')
    for key, refkey in [('repo', 'commit'), ('gas', 'gasCommit'), ('main', 'mainCommit')]:
        repo = MANIFEST[key]
        require(command(['git', '-C', repo, 'rev-parse', 'HEAD']) == MANIFEST[refkey], key + ': wrong commit')
        require(not command(['git', '-C', repo, 'status', '--porcelain']), key + ': checkout is not clean')
    require(command(['git', '-C', MANIFEST['gas'], 'rev-parse', MANIFEST['gasTag'] + '^{commit}']) == MANIFEST['gasCommit'], 'GAS stable tag changed')
    for relative, digest in MANIFEST['files'].items():
        require(sha(ROOT / relative) == digest, 'Prepared input changed: ' + relative)
    for absolute, digest in MANIFEST['protected'].items():
        require(sha(Path(absolute)) == digest, 'Protected evidence changed: ' + absolute)
    files2 = {str(p.relative_to(ROOT / '2pages')): sha(p) for p in (ROOT / '2pages').rglob('*') if p.is_file()}
    files5 = {str(p.relative_to(ROOT / '5pages')): sha(p) for p in (ROOT / '5pages').rglob('*') if p.is_file()}
    require(files2.keys() == files5.keys(), 'Condition file lists differ')
    require([name for name in files2 if files2[name] != files5[name]] == ['index.js'], 'Unexpected condition differences')
    two = (ROOT / '2pages/index.js').read_text()
    five = (ROOT / '5pages/index.js').read_text()
    start = two.index("logHeavySiteTopPageAudit('attachCoverageSignalsToGeoSignalsLight_call_start'")
    end = two.index('sourceRunId: runId', start)
    require(two[start:end].count('maxObserve: 2') == 2, 'Wrong main-path anchors')
    require(five == two[:start] + two[start:end].replace('maxObserve: 2', 'maxObserve: 5') + two[end:], 'Only two maxObserve substitutions are allowed')
    expected_diff = ''.join(difflib.unified_diff(two.splitlines(True), five.splitlines(True), fromfile='2pages/index.js', tofile='5pages/index.js'))
    require((ROOT / 'condition.diff').read_text() == expected_diff, 'Condition diff changed')
    require((ROOT / '2pages/Dockerfile').read_text().splitlines()[1] == 'FROM ' + BASE_IMAGE, 'Unexpected Docker base')
    for test in BROWSER_TESTS:
        require((ROOT / '2pages/tests' / test).is_file(), 'Missing browser fixture: ' + test)
    for test in GAS_TESTS:
        require((ROOT / 'inputs/gas/scripts' / test).is_file(), 'Missing GAS fixture: ' + test)
    require(SITES[2][2] == 'shop_facility', 'Facility must use production siteMode')
    return {'commit': EXPECTED, 'gasCommit': MANIFEST['gasCommit'], 'conditionChanges': 2,
            'budgetMs': BUDGET, 'sites': SITES, 'maximumDiagnosisRequests': 10,
            'savedHtmlSha256': sha(ROOT / 'inputs/user_terms.html')}

def normalize_url(value):
    parsed = urllib.parse.urlsplit(value or '')
    return (parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip('/'))

def build_request_params(url, mode):
    return {'url': url, 'siteMode': mode, 'signalsMode': 'light', 'nocache': '1', 'runId': str(uuid.uuid4())}

def validate_run_isolation(params, data, previous_ids):
    requested = params.get('runId')
    try:
        valid_uuid = isinstance(requested, str) and str(uuid.UUID(requested)) == requested and uuid.UUID(requested).version == 4
    except (ValueError, TypeError, AttributeError):
        valid_uuid = False
    nav = (data.get('diagnostics') or {}).get('entryNavigationV1') or {}
    mode = ((data.get('geoSignalsV1') or {}).get('operatorIdentityCandidateAuditV1') or {}).get('siteMode')
    checks = {
        'requestUuidValid': valid_uuid,
        'requestResponseRunIdMatch': valid_uuid and data.get('runId') == requested,
        'uniqueRunId': valid_uuid and requested not in previous_ids,
        'navigationRunMatches': valid_uuid and nav.get('runId') == requested,
        'requestedEntryMatches': data.get('url') == params.get('url') and nav.get('requestedUrl') == params.get('url'),
        'siteModeMatches': mode == params.get('siteMode'),
    }
    require(all(checks.values()), 'Run isolation failed: ' + ','.join(k for k, value in checks.items() if not value))
    return checks

def project(data, site, count, status, seconds):
    geo = data.get('geoSignalsV1') or {}
    trust = geo.get('trustSignals') or {}
    record = trust.get('operatorIdentityInfo') or {}
    coverage = geo.get('coverageSignals') or {}
    diagnostic = data.get('diagnostics') or {}
    observations = {}
    for key in ['faqObservationV2', 'serviceContentObservationV2', 'breadcrumbObservationV2']:
        observations[key] = coverage.get(key) or (geo.get('coverage') or {}).get(key)
    pages = (geo.get('subpageSignals') or {}).get('pages') or []
    return {
        'site': site, 'condition': count, 'httpStatus': status, 'seconds': round(seconds, 3),
        'ok': data.get('ok'), 'url': data.get('url'), 'finalUrl': data.get('finalUrl'),
        'mode': data.get('mode'), 'runId': data.get('runId'),
        'siteModeObserved': (geo.get('operatorIdentityCandidateAuditV1') or {}).get('siteMode'),
        'operatorObservation': geo.get('operatorIdentityObservationV1'),
        'operatorRecord': {key: record.get(key) for key in [
            'observed', 'observationComplete', 'sourceType', 'sourceUrl', 'companyName', 'address',
            'hasCompanyName', 'hasAddress', 'hasOperatorInfo', 'conflict', 'identityEvidenceV1',
            'provenance', 'operatorIdentityFieldExtractionAuditV1']},
        'operatorProbe': trust.get('operatorIdentityProbe'),
        'operatorBridge': geo.get('operatorIdentityBridgeProvenanceV1'),
        'aggregateReason': (geo.get('operatorIdentityCandidateAuditV1') or {}).get('observedCompanyProfileReason'),
        'representativeCount': len(coverage.get('representativePages') or []),
        'observedSubpageCount': coverage.get('observedSubpageCount'),
        'representativePages': [{k: p.get(k) for k in ['url', 'path', 'pageType']} for p in coverage.get('representativePages') or []],
        'representativeQuality': coverage.get('representativeObservationQuality'),
        'representativeExtractionDiagnostics': coverage.get('representativeExtractionDiagnostics'),
        'subpageFetchObservations': [{k: p.get(k) for k in ['url', 'finalUrl', 'status', 'ok', 'error', 'observationMethod']} for p in pages],
        'observations': observations,
        'timingAndBudget': {k: diagnostic.get(k) for k in [
            'processingMs', 'totalRequestMs', 'overallBudgetMs', 'remainingMs', 'qualityStatus',
            'coverageTrace', 'skippedDueToBudget', 'resilience', 'gotoTimedOut', 'playwrightTimedOut',
            'playwrightFailed', 'sitemapDiscoveryTimedOut', 'productSpecTimedOut', 'entryNavigationV1']},
        'coverageBudget': {k: coverage.get(k) for k in ['observationLimited', 'budgetLimitedCandidateCount', 'timedOutCandidateCount']},
    }

def ec_gate(row):
    info = row['operatorRecord']; obs = row['operatorObservation'] or {}
    evidence = info.get('identityEvidenceV1') or {}; provenance = info.get('provenance') or {}
    probe = row.get('operatorProbe') or {}; diag = row['representativeExtractionDiagnostics'] or {}
    timing = row['timingAndBudget']; budget = row['coverageBudget']
    checks = {
        'response_ok': row['httpStatus'] == 200 and row['ok'] is True and row['mode'] == 'signalsFirstLight',
        'mode_ec': row['siteModeObserved'] == 'ec',
        'representative_count': row['representativeCount'] == row['condition'] == row['observedSubpageCount'],
        'representative_success': diag.get('observed') == row['condition'] and all(diag.get(k) == 0 for k in ['failed', 'timeout', 'errors']),
        'formal_identity': obs.get('signalState') == 'true' and obs.get('conflict') is False and obs.get('scopeComplete') is True
            and info.get('hasOperatorInfo') is True and info.get('conflict') is False and info.get('observationComplete') is True,
        'company_and_address': info.get('companyName') == '株式会社クラシコム' and bool(str(info.get('address') or '').strip()) and info.get('hasAddress') is True,
        'formal_source': normalize_url(info.get('sourceUrl')) == normalize_url('https://kurashi.com/company/profile/') and info.get('sourceType') == 'company_profile',
        'explicit_current_relation': evidence.get('explicit') is True and evidence.get('currentRun') is True
            and evidence.get('kind') == 'explicit_external_operator_relation'
            and normalize_url(evidence.get('relationSourceOrigin')) == normalize_url('https://hokuohkurashi.com')
            and normalize_url(evidence.get('candidateSourceUrl')) == normalize_url(info.get('sourceUrl')),
        'bounded_probe_provenance': provenance.get('source') == 'bounded_company_profile_probe'
            and provenance.get('scope') == 'company_profile_page' and probe.get('attempted') is True
            and probe.get('observationComplete') is True,
        'other_observations_complete': all((v or {}).get('completeness') == 'complete' for v in row['observations'].values()),
        'same_budget': timing.get('overallBudgetMs') == BUDGET,
        'no_budget_loss': not timing.get('skippedDueToBudget') and budget.get('observationLimited') is False
            and budget.get('budgetLimitedCandidateCount') == 0 and budget.get('timedOutCandidateCount') == 0,
        'no_browser_timeout': not any(timing.get(k) for k in ['gotoTimedOut', 'playwrightTimedOut', 'playwrightFailed']),
    }
    return {'passed': all(checks.values()), 'checks': checks, 'failed': [k for k, v in checks.items() if not v]}

def main():
    os.umask(0o077)
    initial = preflight()
    if sys.argv[1:] == ['--check']:
        print(json.dumps(initial, ensure_ascii=False, indent=2))
        return
    require(not sys.argv[1:], 'Only --check or no arguments are supported')
    require(not (ROOT / 'RUN_STARTED.json').exists(), 'This audit was already attempted; do not repeat live requests. Ask Codex to inspect its saved output.')
    run = 'geo-op-' + uuid.uuid4().hex[:12]
    save(ROOT / 'RUN_STARTED.json', {'run': run, 'startedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
    out = ROOT / 'results'; out.mkdir(mode=0o700)
    summary = {'run': run, 'preflight': initial, 'fixtures': [], 'sites': [], 'ecGate': {}, 'errors': [],
        'limitations': ['Live pages are sequential, not immutable replay; each API call may use the existing internal fetch/retry behavior.',
            'GAS tests run on mocks/static contracts. No GAS production writes or real score/card/summary/save/PDF/Markdown/position end-to-end execution.',
            'A passing EC gate permits the remaining four site pairs; it does not approve production adoption.']}
    owned = set()

    def cleanup(name):
        if name not in owned:
            return
        try:
            label = command(['docker', 'inspect', '--format', '{{index .Config.Labels "geo.audit.run"}}', name])
            require(label == run, 'Refusing to remove a container not owned by this audit')
            with (out / (name + '.container.log')).open('xb') as log:
                subprocess.run(['docker', 'logs', name], stdout=log, stderr=subprocess.STDOUT, timeout=30)
            command(['docker', 'rm', '-f', name])
            owned.remove(name)
        except Exception as error:
            summary['errors'].append({'cleanup': name, 'error': str(error)[:500]})

    def docker_test(label, image, args, seconds=120, env=None, work='/app'):
        name = run + '-' + label
        require(subprocess.run(['docker', 'container', 'inspect', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0, 'Container name already exists')
        command(['docker', 'create', '--name', name, '--label', 'geo.audit.run=' + run,
            '--network=none', '--shm-size=1g', '--workdir', work,
            '--mount', 'type=bind,src=' + str(ROOT / 'inputs') + ',dst=/audit,readonly',
            *[value for k, v in (env or {}).items() for value in ['--env', k + '=' + v]], image, *args])
        owned.add(name)
        started = time.monotonic()
        try:
            with (out / (label + '.log')).open('xb') as log:
                result = subprocess.run(['docker', 'start', '-a', name], stdout=log, stderr=subprocess.STDOUT, timeout=seconds)
            code = int(command(['docker', 'inspect', '--format', '{{.State.ExitCode}}', name]))
            if result.returncode and code == 0:
                code = result.returncode
            summary['fixtures'].append({'label': label, 'exitCode': code, 'seconds': round(time.monotonic() - started, 3)})
            print(label + ': exit ' + str(code), flush=True)
            return code == 0
        finally:
            cleanup(name)

    def diagnose(site, url, mode, count, image):
        label = site + '-' + str(count); name = run + '-' + label
        command(['docker', 'create', '--name', name, '--label', 'geo.audit.run=' + run,
            '--publish', '127.0.0.1::8080', '--shm-size=1g',
            '--env', 'SCRAPE_CONCURRENCY=1', '--env', 'LIGHT_REQUEST_BUDGET_MS=' + str(BUDGET), image])
        owned.add(name)
        try:
            command(['docker', 'start', name])
            port = command(['docker', 'port', name, '8080/tcp'])
            require(port.startswith('127.0.0.1:') and '\n' not in port, 'Unexpected published address')
            base = 'http://' + port
            ready = False
            for _ in range(40):
                try:
                    with HTTP.open(base + '/health', timeout=1) as response:
                        ready = response.status == 200
                    if ready:
                        break
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(0.25)
            require(ready, 'Local server did not become ready')
            params = build_request_params(url, mode)
            save(out / (label + '-request.json'), {'params': params, 'budgetMs': BUDGET, 'image': image, 'freshContainer': name})
            started = time.monotonic()
            try:
                response = HTTP.open(base + '/scrape?' + urllib.parse.urlencode(params), timeout=200)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                status = response.code; raw = response.read()
            (out / (label + '-response.json')).write_bytes(raw)
            data = json.loads(raw)
            row = project(data, site, count, status, time.monotonic() - started)
            ids = {r['runId'] for r in summary['sites']}
            old_ids = {json.loads(p.read_text()).get('runId') for p in Path(MANIFEST['prior']).glob('*response.json')}
            try:
                row['runIsolation'] = dict(validate_run_isolation(params, data, ids | old_ids), freshContainer=True, nocache=True)
            except RuntimeError as error:
                row['runIsolation'] = {'passed': False, 'reason': str(error), 'requestRunId': params['runId']}
                summary['sites'].append(row)
                save(out / (label + '-analysis.json'), row)
                raise  # Stop before any next condition/site; do not substitute currentRun.
            if site == 'ec':
                row['gate'] = ec_gate(row)
            prefix = '' if site == 'corporate' else site + '-'
            old_path = Path(MANIFEST['prior']) / (prefix + str(count) + 'pages-response.json')
            if old_path.is_file():
                old = project(json.loads(old_path.read_text()), site, count, 200, 0)
                row['previousComparison'] = {
                    'file': str(old_path), 'runId': old['runId'],
                    'oldState': (old['operatorObservation'] or {}).get('signalState'),
                    'newState': (row['operatorObservation'] or {}).get('signalState'),
                    'sameCompanyName': old['operatorRecord']['companyName'] == row['operatorRecord']['companyName'],
                    'sameAddress': old['operatorRecord']['address'] == row['operatorRecord']['address'],
                    'oldCompleteness': {k: (v or {}).get('completeness') for k, v in old['observations'].items()},
                    'newCompleteness': {k: (v or {}).get('completeness') for k, v in row['observations'].items()},
                    'historicalModeNotGuaranteed': site == 'facility',
                }
            summary['sites'].append(row)
            save(out / (label + '-analysis.json'), row)
            print(label + ': response saved; ' + str(status), flush=True)
            return row
        finally:
            cleanup(name)

    try:
        save(out / 'preflight.json', initial)
        with (out / 'run-id-contract.log').open('xb') as log:
            result = subprocess.run([sys.executable, '-B', str(ROOT / '2pages/tests/test_operator_live_audit.py')], stdout=log, stderr=subprocess.STDOUT, timeout=30)
        summary['fixtures'].append({'label': 'run-id-contract', 'exitCode': result.returncode})
        require(result.returncode == 0, 'Run-ID script contract failed; no Docker/live work started')
        save(out / 'docker-version.json', json.loads(command(['docker', 'version', '--format', '{{json .}}'])))
        base_before = command(['docker', 'image', 'inspect', '--format', '{{.Id}}', BASE_IMAGE])
        images = {}
        for count in [2, 5]:
            tag = run + ':' + str(count) + 'pages'
            require(subprocess.run(['docker', 'image', 'inspect', tag], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0, 'Refusing to overwrite an existing image tag')
            print('Building isolated image: ' + str(count) + ' pages', flush=True)
            with (out / ('build-' + str(count) + '.log')).open('xb') as log:
                subprocess.run(['docker', 'build', '--pull=false', '--label', 'geo.audit.commit=' + EXPECTED,
                    '--label', 'geo.audit.run=' + run, '--tag', tag, '--iidfile', str(out / ('image-' + str(count) + '.id')),
                    str(ROOT / (str(count) + 'pages'))], stdout=log, stderr=subprocess.STDOUT, check=True, timeout=900)
            images[count] = (out / ('image-' + str(count) + '.id')).read_text().strip()
            require(command(['docker', 'image', 'inspect', '--format', '{{index .Config.Labels "geo.audit.commit"}}', images[count]]) == EXPECTED, 'Wrong image provenance')
            save(out / ('image-' + str(count) + '-inspect.json'), json.loads(command(['docker', 'image', 'inspect', images[count]])))
        require(command(['docker', 'image', 'inspect', '--format', '{{.Id}}', BASE_IMAGE]) == base_before, 'Existing base tag changed')
        summary['images'] = images
        for count in [2, 5]:
            digest = sha(ROOT / (str(count) + 'pages/index.js'))
            check = "const fs=require('fs'),c=require('crypto'),a=require('assert');a.ok(+process.versions.node.split('.')[0]>=18&&+process.versions.node.split('.')[0]<=22);a.equal(c.createHash('sha256').update(fs.readFileSync('/app/index.js')).digest('hex'),'" + digest + "');const l=require('/app/package-lock.json');for(const n of Object.keys(require('/app/package.json').dependencies)){a.equal(JSON.parse(fs.readFileSync('/app/node_modules/'+n+'/package.json','utf8')).version,l.packages['node_modules/'+n].version)}console.log(JSON.stringify({node:process.version,playwright:require('playwright/package.json').version,sourceSha256:'" + digest + "'}));"
            require(docker_test('runtime-' + str(count), images[count], ['node', '-e', check]), 'Runtime/source/dependency check failed')
        # Fixtures have no external network, and are independent of live-site state.
        browser_ok = True
        for test in BROWSER_TESTS:
            browser_ok = docker_test('browser-' + test.replace('.test.js', ''), images[2], ['node', 'tests/' + test]) and browser_ok
        fixture_ok = True
        for test in sorted((ROOT / '2pages/tests').glob('*.test.js')):
            name = test.name
            relevant = name.startswith(('operator-identity-', 'shop-facility-operator-', 'coverage-', 'phase4-faq-', 'phase4-service-', 'breadcrumb-iframe-'))
            if not relevant or name in BROWSER_TESTS or name == 'operator-identity-coverage-conflict-probe.test.js':
                continue
            env = {'OPERATOR_TERMS_HTML_PATH': '/audit/user_terms.html', 'OPERATOR_CONTROL_SOURCE': '/audit/baseline-index.js'} if name == 'operator-identity-navigation-fallback.test.js' else {}
            fixture_ok = docker_test('offline-' + name.replace('.test.js', ''), images[2], ['node', '--require', '/app/tests/helpers/operator-deny-network.cjs', 'tests/' + name], env=env) and fixture_ok
        for count in [2, 5]:
            fixture_ok = docker_test('coverage-' + str(count), images[count], ['node', '--require', '/app/tests/helpers/operator-deny-network.cjs', 'tests/operator-identity-coverage-conflict-probe.test.js'], env={'OPERATOR_TERMS_HTML_PATH': '/audit/user_terms.html'}) and fixture_ok
        gas_ok = True
        for test in GAS_TESTS:
            gas_ok = docker_test('gas-' + test.replace('.js', ''), images[2], ['node', '--require', '/app/tests/helpers/operator-deny-network.cjs', '/audit/gas/scripts/' + test], work='/audit/gas') and gas_ok
        require(browser_ok and fixture_ok and gas_ok, 'Fixtures failed; live requests were not started')
        ec_rows = [diagnose('ec', SITES[0][1], 'ec', count, images[count]) for count in [2, 5]]
        summary['ecGate'] = {str(row['condition']): row['gate'] for row in ec_rows}
        require(all(row['gate']['passed'] for row in ec_rows), 'EC formal-evidence gate failed; remaining four sites were not fetched')
        summary['ecPairAgreement'] = {
            key: ec_rows[0]['operatorRecord'][key] == ec_rows[1]['operatorRecord'][key]
            for key in ['companyName', 'address', 'sourceUrl']}
        require(all(summary['ecPairAgreement'].values()), 'EC company/address/source differs; remaining four sites were not fetched')
        for site, url, mode in SITES[1:]:
            for count in [2, 5]:
                diagnose(site, url, mode, count, images[count])
        summary['status'] = 'completed_for_codex_review'
    except Exception as error:
        summary['status'] = 'stopped_for_codex_review'
        summary['errors'].append({'type': type(error).__name__, 'message': str(error)[:1200]})
    finally:
        for name in list(owned):
            cleanup(name)
        try:
            preflight()
            summary['protectedFilesUnchanged'] = True
        except Exception as error:
            summary['protectedFilesUnchanged'] = False
            summary['errors'].append({'preflightAfter': str(error)[:500]})
        save(out / 'summary.json', summary)
        print(summary['status'] + ': ' + str(out / 'summary.json'), flush=True)
        if summary['status'] != 'completed_for_codex_review' or summary['errors']:
            sys.exit(1)

if __name__ == '__main__':
    main()
