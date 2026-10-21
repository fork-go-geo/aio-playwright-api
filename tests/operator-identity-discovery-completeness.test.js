'use strict';

const assert = require('assert');
const {
  isExpectedAbsentSitemapDiscoveryResultV1_,
  isFormalOperatorCandidateDiscoveryCompleteV2_
} = require('../index.js').__lightBudgetTestHooks;

// Synthetic discovery outcomes only: no browser, network, or real-site data.
assert.equal(isExpectedAbsentSitemapDiscoveryResultV1_({status:404}), true);
assert.equal(isExpectedAbsentSitemapDiscoveryResultV1_({status:500}), false);
assert.equal(isExpectedAbsentSitemapDiscoveryResultV1_({error:'timeout'}), false);

// A completed zero-candidate discovery is valid when all optional sitemap
// roots were observed absent and the rendered link scan was complete.
assert.equal(isFormalOperatorCandidateDiscoveryCompleteV2_({
  observationLimited:false, discoveryCapped:false, errors:[{source:'sitemap',status:404}]
}), true);
assert.equal(isFormalOperatorCandidateDiscoveryCompleteV2_({
  observationLimited:false, discoveryCapped:false, errors:[]
}), true);
assert.equal(isFormalOperatorCandidateDiscoveryCompleteV2_({
  observationLimited:true, discoveryCapped:false, errors:[]
}), false);
assert.equal(isFormalOperatorCandidateDiscoveryCompleteV2_({
  observationLimited:false, discoveryCapped:true, errors:[]
}), false);
assert.equal(isFormalOperatorCandidateDiscoveryCompleteV2_({
  observationLimited:false, discoveryCapped:false, errors:[{source:'sitemap',status:500}]
}), false);
assert.equal(isFormalOperatorCandidateDiscoveryCompleteV2_({
  observationLimited:false, discoveryCapped:false, errors:[{source:'sitemap',error:'timeout'}]
}), false);
assert.equal(isFormalOperatorCandidateDiscoveryCompleteV2_({
  observationLimited:false, discoveryCapped:false, errors:[{source:'htmlSitemap',status:404}]
}), false);

console.log(JSON.stringify({pass:true, fixture:'operator_identity_discovery_completeness_v2', cases:10}));
