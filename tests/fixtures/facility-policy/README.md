# Facility root policy relation fixture

The HTML files are curated excerpts of the public pages captured on
2026-11-14. `manifest.json` records both original full-page hashes and excerpt
hashes. The excerpt keeps the operating-site sentence, company/hub links,
and the company-name/address table rows. It is not a full DOM capture.

Run on Node 18–22 with the repository dependencies installed:

```sh
node tests/operator-identity-facility-policy.test.js
```

For the preserved full HTML, set `FACILITY_POLICY_FULL_HTML_DIR` to a directory
containing `sitepolicy.html`, `corporate.html`, and `company.html` with the
original manifest hashes. `FACILITY_POLICY_REPORT` optionally writes the
results and formal record. The test never fetches these URLs. Network access
is denied, and discovery/HTTP responses are controlled fixture inputs.

The integration fixture exercises existing selection, parsing, bounded
hub/detail traversal, formalization, audit, and short-response transport.
It checks request identity on all three hops, root-only scope, company-name
agreement, failures, and the existing shared-budget fetch gate. It also
checks that explicit operator candidates retain priority and other modes
do not gain the new route. The UUIDs are fixture request identities.

This route intentionally recognizes a narrow, explicit site-policy statement.
It does not infer operating companies from generic company links, site titles,
copyright text, group-company relationships, or store paths. Unsupported
wording remains unconfirmed. It preserves the existing formal identity
normalizer, name-conflict check, three-probe traversal, and fetch timeouts.

Offline fixture success does not verify live discovery, timing, GAS diagnosis,
Sheets persistence, or PDF output.
