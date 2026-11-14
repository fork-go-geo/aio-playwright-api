#!/usr/bin/env bash
# Reproducible Node-only verification. No Chromium fixture is started.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_TAG="geo-ssrf-integration:local"

docker build --tag "$IMAGE_TAG" "$PROJECT_DIR"
docker run --rm --network none --shm-size=1gb \
  --add-host fixture.test:127.0.0.1 \
  "$IMAGE_TAG" bash -lc '
  set -euo pipefail
  node --version
  node tests/subpage-html-ssrf-safe-fetch.test.js
  node tests/ssrf-node-validator.test.js
  node tests/node-public-fetch-path-contract.test.js
  node tests/basic-auth-execution.test.js
  node tests/basic-auth-light-auth-error-preserve.test.js
  node tests/basic-auth-light-budget-regression.test.js
  node tests/node-custom-lookup-loopback-contract.test.js
  node tests/ai-policy-authority-observation.test.js
  node tests/html-sitemap-authority-observation.test.js
  node tests/light-request-deadline.test.js
  node tests/operator-identity-nomura-contract.test.js
  node tests/operator-identity-official-company-relation.test.js
  node tests/operator-identity-explicit-https-recovery.test.js
  node tests/coverage-formal-preservation.test.js
'
