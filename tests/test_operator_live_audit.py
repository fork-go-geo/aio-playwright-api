import copy
import importlib.util
from pathlib import Path
import unittest
import urllib.parse
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'scripts/run-operator-live-audit.py'
spec = importlib.util.spec_from_file_location('operator_live_audit', path)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class RunIdentityContract(unittest.TestCase):
    def setUp(self):
        self.params = audit.build_request_params('https://fixture.invalid', 'ec')
        self.data = {
            'url': self.params['url'], 'runId': self.params['runId'],
            'diagnostics': {'entryNavigationV1': {'runId': self.params['runId'], 'requestedUrl': self.params['url']}},
            'geoSignalsV1': {'operatorIdentityCandidateAuditV1': {'siteMode': 'ec'},
                'trustSignals': {'operatorIdentityInfo': {'identityEvidenceV1': {'explicit': True, 'currentRun': True}}}},
        }

    def test_uuid_sent_on_wire_and_matches(self):
        query = urllib.parse.parse_qs(urllib.parse.urlencode(self.params))
        self.assertEqual(query['runId'], [self.params['runId']])
        self.assertEqual(audit.uuid.UUID(self.params['runId']).version, 4)
        self.assertTrue(all(audit.validate_run_isolation(self.params, self.data, set()).values()))
        self.assertNotEqual(self.params['runId'], audit.build_request_params(self.params['url'], 'ec')['runId'])

    def test_missing_or_invalid_request_id(self):
        for value in [None, '', 'not-a-uuid']:
            with self.subTest(value=value):
                params = dict(self.params, runId=value)
                with self.assertRaisesRegex(RuntimeError, 'requestUuidValid'):
                    audit.validate_run_isolation(params, self.data, set())

    def test_missing_response_id_despite_current_run(self):
        for value in [None, '']:
            with self.subTest(value=value):
                data = copy.deepcopy(self.data)
                data['runId'] = value
                with self.assertRaisesRegex(RuntimeError, 'requestResponseRunIdMatch'):
                    audit.validate_run_isolation(self.params, data, set())
        data = copy.deepcopy(self.data)
        del data['runId']
        with self.assertRaises(RuntimeError):
            audit.validate_run_isolation(self.params, data, set())

    def test_mismatch_and_case_change_are_rejected(self):
        for value in [str(audit.uuid.uuid4()), self.params['runId'].upper()]:
            with self.subTest(value=value):
                data = copy.deepcopy(self.data)
                data['runId'] = value
                with self.assertRaisesRegex(RuntimeError, 'requestResponseRunIdMatch'):
                    audit.validate_run_isolation(self.params, data, set())

    def test_navigation_identity_and_entry_must_match(self):
        for field, value in [('runId', ''), ('runId', str(audit.uuid.uuid4())), ('requestedUrl', 'https://other.invalid')]:
            with self.subTest(field=field, value=value):
                data = copy.deepcopy(self.data)
                data['diagnostics']['entryNavigationV1'][field] = value
                with self.assertRaises(RuntimeError):
                    audit.validate_run_isolation(self.params, data, set())

    def test_old_run_other_site_and_mode_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'uniqueRunId'):
            audit.validate_run_isolation(self.params, self.data, {self.params['runId']})
        data = copy.deepcopy(self.data)
        data['url'] = 'https://other.invalid'
        with self.assertRaises(RuntimeError):
            audit.validate_run_isolation(self.params, data, set())
        data = copy.deepcopy(self.data)
        data['geoSignalsV1']['operatorIdentityCandidateAuditV1']['siteMode'] = 'corporate'
        with self.assertRaises(RuntimeError):
            audit.validate_run_isolation(self.params, data, set())

    def test_live_driver_sends_id_and_stops_before_next_request(self):
        # Run the actual driver with local Docker/HTTP stubs. Neither missing
        # runId nor an otherwise valid currentRun record may reach EC-5.
        import json
        import tempfile
        for response_mode in ['match', 'missing', 'mismatch']:
            with self.subTest(response_mode=response_mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / '2pages/tests').mkdir(parents=True)
                (root / 'prior').mkdir()
                for count in [2, 5]:
                    (root / f'{count}pages').mkdir(exist_ok=True)
                    (root / f'{count}pages/index.js').write_text('fixture')
                sent = []

                def cmd(args, timeout=30):
                    if args[1] == 'version': return '{}'
                    if args[1:3] == ['image', 'inspect']:
                        if '--format' not in args: return '[]'
                        return 'test-commit' if any('geo.audit.commit' in arg for arg in args) else 'base-id'
                    if args[1] == 'create': return 'fixture-container'
                    if args[1] == 'inspect':
                        if '.State.ExitCode' in args[3]: return '0'
                        return json.loads((root / 'RUN_STARTED.json').read_text())['run']
                    if args[1] == 'port': return '127.0.0.1:12345'
                    return ''

                def run(args, **kwargs):
                    from types import SimpleNamespace
                    if args[:3] == ['docker', 'image', 'inspect'] or args[:3] == ['docker', 'container', 'inspect']:
                        return SimpleNamespace(returncode=1)
                    if args[:2] == ['docker', 'build']:
                        Path(args[args.index('--iidfile') + 1]).write_text('image-id')
                    return SimpleNamespace(returncode=0)

                class Response:
                    status = code = 200
                    def __init__(self, body=None): self.body = body or {}
                    def __enter__(self): return self
                    def __exit__(self, *args): pass
                    def read(self): return json.dumps(self.body).encode()

                def request(url, timeout):
                    if url.endswith('/health'): return Response()
                    params = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).items()}
                    sent.append(params)
                    data = copy.deepcopy(self.data)
                    data['url'] = params['url']
                    data['diagnostics']['entryNavigationV1'] = {'runId': params['runId'], 'requestedUrl': params['url']}
                    data['runId'] = params['runId'] if response_mode == 'match' else (None if response_mode == 'missing' else str(audit.uuid.uuid4()))
                    # Keep formal checks out of this transport test; the real
                    # gate is independently evaluated on saved EC responses.
                    return Response(data)

                with patch.object(audit, 'ROOT', root), patch.object(audit, 'EXPECTED', 'test-commit'), \
                    patch.object(audit, 'MANIFEST', {'prior': str(root / 'prior')}), \
                    patch.object(audit, 'preflight', return_value={}), patch.object(audit, 'command', side_effect=cmd), \
                    patch.object(audit.subprocess, 'run', side_effect=run), patch.object(audit.HTTP, 'open', side_effect=request), \
                    patch.object(audit, 'ec_gate', return_value={'passed': True}), patch.object(audit, 'BROWSER_TESTS', []), \
                    patch.object(audit, 'GAS_TESTS', []), patch.object(audit, 'SITES', audit.SITES[:1]), patch.object(audit.sys, 'argv', ['audit']), \
                    patch('builtins.print'):
                    if response_mode == 'match': audit.main()
                    else:
                        with self.assertRaises(SystemExit): audit.main()
                self.assertEqual(len(sent), 2 if response_mode == 'match' else 1)
                for params in sent: self.assertEqual(audit.uuid.UUID(params['runId']).version, 4)
                summary = json.loads((root / 'results/summary.json').read_text())
                self.assertEqual(summary['status'], 'completed_for_codex_review' if response_mode == 'match' else 'stopped_for_codex_review')


if __name__ == '__main__':
    unittest.main()
