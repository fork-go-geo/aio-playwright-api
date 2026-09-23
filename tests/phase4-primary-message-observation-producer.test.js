/* eslint-disable no-console */
'use strict';

// Network-free contract tests. Inputs mimic only bounded browser-side seeds;
// no page text, URLs, HTML, or legacy summaries participate in the producer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hooks = require('../index.js').__lightBudgetTestHooks;

const SOURCES = [
  { source:'rendered_main_content', checked:true },
  { source:'rendered_main_heading', checked:true },
  { source:'rendered_document_meta', checked:true }
];

function seed(lengths = [48], masks = [3], overrides = {}) {
  return Object.assign({
    candidateExtractionComplete:true,
    mainContentScopeObserved:true,
    candidateSources:SOURCES,
    candidateCount:lengths.length,
    bodyCandidateCount:lengths.length,
    candidateLengths:lengths,
    categoryMatchMask:masks
  }, overrides);
}

function geo(seedValue, overrides = {}) {
  return Object.assign({
    primaryMessageObservationSeedV2:seedValue,
    observed:{},
    renderedDomObservationV1:{ navigationCompleted:true, observationLimited:false, fallbackKind:null },
    frameContentObservationV1:null
  }, overrides);
}

function pop(n) { let count = 0; while (n) { count += n & 1; n >>= 1; } return count; }
function gasPrimaryState(raw) {
  const o = Object.assign({}, raw, { authority:'geoSignalsV1_light_bridge_v1', sourceAuthority:raw.authority });
  const sourceOk = Array.isArray(o.candidateSources) && o.candidateSources.length > 0 &&
    o.candidateSources.every(item => item && item.checked === true && SOURCES.some(expected => expected.source === item.source));
  const featuresOk = Number.isInteger(o.candidateCount) && Number.isInteger(o.bodyCandidateCount) &&
    o.candidateCount >= 0 && o.bodyCandidateCount >= 0 && o.bodyCandidateCount <= o.candidateCount &&
    Array.isArray(o.candidateLengths) && Array.isArray(o.categoryMatchMask) &&
    o.candidateLengths.length === o.candidateCount && o.categoryMatchMask.length === o.candidateCount &&
    o.candidateLengths.every(value => Number.isInteger(value) && value >= 0) &&
    o.categoryMatchMask.every(value => Number.isInteger(value) && value >= 0 && value <= 7) &&
    o.maxCandidateLength === Math.max(0, ...o.candidateLengths);
  const specific = featuresOk && o.candidateLengths.some((length, index) => length >= 40 && pop(o.categoryMatchMask[index]) >= 2);
  const valid = o.checked === true && o.completeness === 'complete' && o.renderedMainContentComplete === true &&
    o.limited === false && o.fallbackApplied === false && o.requiredScopeComplete === true && !!o.scope &&
    sourceOk && featuresOk && typeof o.hasObservablePrimaryText === 'boolean' &&
    typeof o.hasSpecificPrimaryLike === 'boolean' && o.hasSpecificPrimaryLike === specific;
  if (!valid) return 'unknown';
  if (!o.hasObservablePrimaryText || o.bodyCandidateCount < 1) return 'not_fired';
  return specific ? 'not_fired' : 'fired';
}

let cases = 0;
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); cases += 1; }

const specific = hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [3])));
check('complete specific candidate', { completeness:specific.completeness, limited:specific.limited, requiredScopeComplete:specific.requiredScopeComplete, hasSpecificPrimaryLike:specific.hasSpecificPrimaryLike },
  { completeness:'complete', limited:false, requiredScopeComplete:true, hasSpecificPrimaryLike:true });
check('complete specific is GAS not_fired', gasPrimaryState(specific), 'not_fired');

const weak = hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [1])));
check('complete nonspecific candidate', { completeness:weak.completeness, hasSpecificPrimaryLike:weak.hasSpecificPrimaryLike }, { completeness:'complete', hasSpecificPrimaryLike:false });
check('complete nonspecific is GAS fired', gasPrimaryState(weak), 'fired');

const zero = hooks.buildPrimaryMessageObservationV2_(geo(seed([], [], { bodyCandidateCount:0 })));
check('complete candidate zero remains an observation', { completeness:zero.completeness, candidateCount:zero.candidateCount, hasObservablePrimaryText:zero.hasObservablePrimaryText },
  { completeness:'complete', candidateCount:0, hasObservablePrimaryText:false });
check('complete candidate zero is not a new penalty', gasPrimaryState(zero), 'not_fired');

check('39-character candidate is not specific', hooks.buildPrimaryMessageObservationV2_(geo(seed([39], [7]))).hasSpecificPrimaryLike, false);
check('40-character two-category candidate is specific', hooks.buildPrimaryMessageObservationV2_(geo(seed([40], [3]))).hasSpecificPrimaryLike, true);
check('40-character one-category candidate is not specific', hooks.buildPrimaryMessageObservationV2_(geo(seed([40], [1]))).hasSpecificPrimaryLike, false);

const partial = hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [3], { candidateExtractionComplete:false })));
check('partial candidate set', { completeness:partial.completeness, requiredScopeComplete:partial.requiredScopeComplete }, { completeness:'partial', requiredScopeComplete:false });
check('partial is GAS unknown', gasPrimaryState(partial), 'unknown');

const renderIncomplete = hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [3]), { renderedDomObservationV1:{ navigationCompleted:true, observationLimited:true, fallbackKind:null } }));
check('rendered main incomplete is partial', { completeness:renderIncomplete.completeness, failureKind:renderIncomplete.failureKind }, { completeness:'partial', failureKind:'render_incomplete' });

const shell = { frameContentObserved:false, contentScopeComplete:false, parentFrameShell:{ frameCount:1, hasFrameset:true, hasMain:false, bodyTextLength:0 } };
const frameIncomplete = hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [3]), { frameContentObservationV1:shell }));
check('content frame incomplete is partial', { completeness:frameIncomplete.completeness, failureKind:frameIncomplete.failureKind }, { completeness:'partial', failureKind:'frame_incomplete' });

const decorativeFrame = { frameContentObserved:false, contentScopeComplete:false, parentFrameShell:{ frameCount:1, hasFrameset:false, hasMain:true, bodyTextLength:800 } };
check('decorative iframe does not make normal page partial', hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [3]), { frameContentObservationV1:decorativeFrame })).completeness, 'complete');

const selectedFrame = { frameContentObserved:true, contentScopeComplete:true, parentFrameShell:{ frameCount:1, hasFrameset:true, hasMain:false, bodyTextLength:0 }, signals:{ primaryMessageObservationSeedV2:seed([48], [3]) } };
check('selected content frame can complete from its bounded seed', hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [1]), { frameContentObservationV1:selectedFrame })).completeness, 'complete');

const fallback = hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [3])), { staticFallback:true });
check('fallback-only candidate is partial', { completeness:fallback.completeness, fallbackApplied:fallback.fallbackApplied }, { completeness:'partial', fallbackApplied:true });

const unavailable = hooks.buildPrimaryMessageObservationV2_(geo(null, { renderedDomObservationV1:{ navigationCompleted:false, observationLimited:true, fallbackKind:null } }));
check('navigation failure is unavailable', { checked:unavailable.checked, completeness:unavailable.completeness }, { checked:false, completeness:'unavailable' });
check('unavailable is GAS unknown', gasPrimaryState(unavailable), 'unknown');

const legacyOnly = hooks.buildPrimaryMessageObservationV2_(geo(seed([48], [3], { mainContentScopeObserved:false }), { primaryObservations:['legacy text'], bodyTextCandidates:['legacy sample'] }));
check('legacy values cannot promote incomplete V2 scope', { completeness:legacyOnly.completeness, requiredScopeComplete:legacyOnly.requiredScopeComplete }, { completeness:'partial', requiredScopeComplete:false });
check('primary authority', specific.authority, 'cloud_run_geoSignalsV1_primaryMessageObservationV2');

const attachedGeo = geo(seed([48], [3]));
const attached = hooks.attachPrimaryMessageObservationV2ToGeoSignalsV1_(attachedGeo);
check('canonical and observed alias placement', { canonical:attachedGeo.primaryMessageObservationV2, observed:attachedGeo.observed.primaryMessageObservationV2 }, { canonical:attached, observed:attached });

const payload = JSON.stringify(attached);
assert.equal(payload.includes('legacy text'), false, 'no legacy text in V2 payload');
assert.equal(payload.includes('bodyTextCandidates'), false, 'no body candidate text in V2 payload');
assert.equal(payload.includes('http'), false, 'no candidate URL in V2 payload');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
assert.ok(source.includes('lightweightSummary.primaryMessageObservationV2 = geoSignalsV1'));
cases += 4;

console.log(JSON.stringify({ pass:true, caseCount:cases }));
