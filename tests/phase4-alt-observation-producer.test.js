/* eslint-disable no-console */
'use strict';

// Network-free producer contract. Inputs are bounded dummy observations only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const hooks = require('../index.js').__lightBudgetTestHooks;

function geo({ total, missing, navigationCompleted = true, observationLimited = false, frame = null } = {}) {
  const multimodalSignals = { checked: true, source: 'rendered_dom_open_shadow' };
  if (total !== undefined) { multimodalSignals.totalImages = total; multimodalSignals.informativeImages = total; }
  if (missing !== undefined) multimodalSignals.informativeAltMissingCount = missing;
  return {
    multimodalSignals,
    observed: {},
    renderedDomObservationV1: { navigationCompleted, observationLimited, fallbackKind: null },
    frameContentObservationV1: frame
  };
}

function shellFrame(complete) {
  return {
    frameContentObserved: complete === true,
    contentScopeComplete: complete === true,
    parentFrameShell: { frameCount: 1, hasFrameset: true, hasMain: false, bodyTextLength: 0 }
  };
}

function gasAltState(raw) {
  // The GAS bridge preserves the producer fields but replaces authority with
  // its own bridge authority. This is the evaluator's validity contract.
  const o = Object.assign({}, raw, { authority: 'geoSignalsV1_light_bridge_v1', sourceAuthority: raw.authority });
  const countOK = Number.isFinite(o.informativeImages) && Number.isFinite(o.informativeAltMissingCount) && o.informativeAltMissingCount <= o.informativeImages;
  const zero = countOK && o.informativeImages === 0 && o.informativeAltMissingCount === 0;
  const ratioOK = o.informativeImages > 0 && Number.isFinite(o.informativeAltMissingRatio) && o.informativeAltMissingRatio === o.informativeAltMissingCount / o.informativeImages;
  const semanticOK = zero ? o.hasInformativeAltMissingIssue === false : (ratioOK && o.hasInformativeAltMissingIssue === (o.informativeAltMissingRatio > 0.30));
  const valid = o.checked === true && o.completeness === 'complete' && o.limited === false &&
    o.fallbackApplied !== true && o.requiredScopeComplete === true && countOK && semanticOK &&
    (zero || ratioOK);
  return !valid ? 'unknown' : (o.hasInformativeAltMissingIssue ? 'fired' : 'not_fired');
}

let cases = 0;
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); cases++; }

const weak = hooks.buildAltObservationV2_(geo({ total: 10, missing: 4 }));
check('complete 10 images / 4 missing', {
  completeness: weak.completeness, limited: weak.limited, requiredScopeComplete: weak.requiredScopeComplete,
  informativeImages: weak.informativeImages, informativeAltMissingCount: weak.informativeAltMissingCount,
  informativeAltMissingRatio: weak.informativeAltMissingRatio, hasInformativeAltMissingIssue: weak.hasInformativeAltMissingIssue
}, { completeness:'complete', limited:false, requiredScopeComplete:true, informativeImages:10, informativeAltMissingCount:4, informativeAltMissingRatio:0.4, hasInformativeAltMissingIssue:true });
check('complete weak reaches GAS fired contract', gasAltState(weak), 'fired');

const boundary = hooks.buildAltObservationV2_(geo({ total: 10, missing: 3 }));
check('0.30 boundary remains non-weak', { completeness: boundary.completeness, informativeAltMissingRatio: boundary.informativeAltMissingRatio, hasInformativeAltMissingIssue: boundary.hasInformativeAltMissingIssue },
  { completeness:'complete', informativeAltMissingRatio:0.3, hasInformativeAltMissingIssue:false });
check('complete good reaches GAS not_fired contract', gasAltState(boundary), 'not_fired');

const zero = hooks.buildAltObservationV2_(geo({ total: 0, missing: 0 }));
check('zero image complete observation', { completeness: zero.completeness, requiredScopeComplete: zero.requiredScopeComplete, informativeImages: zero.informativeImages, informativeAltMissingRatio: zero.informativeAltMissingRatio, hasInformativeAltMissingIssue: zero.hasInformativeAltMissingIssue },
  { completeness:'complete', requiredScopeComplete:true, informativeImages:0, informativeAltMissingRatio:null, hasInformativeAltMissingIssue:false });
check('zero image reaches GAS not_fired contract', gasAltState(zero), 'not_fired');

const renderIncomplete = hooks.buildAltObservationV2_(geo({ total: 10, missing: 4, observationLimited: true }));
check('render incomplete is partial', { completeness: renderIncomplete.completeness, limited: renderIncomplete.limited, requiredScopeComplete: renderIncomplete.requiredScopeComplete, failureKind: renderIncomplete.failureKind },
  { completeness:'partial', limited:true, requiredScopeComplete:false, failureKind:'render_incomplete' });
check('render incomplete reaches GAS unknown contract', gasAltState(renderIncomplete), 'unknown');

const frameIncomplete = hooks.buildAltObservationV2_(geo({ total: 10, missing: 4, frame: shellFrame(false) }));
check('entry content frame incomplete is partial', { completeness: frameIncomplete.completeness, requiredScopeComplete: frameIncomplete.requiredScopeComplete, failureKind: frameIncomplete.failureKind },
  { completeness:'partial', requiredScopeComplete:false, failureKind:'frame_incomplete' });
check('frame incomplete reaches GAS unknown contract', gasAltState(frameIncomplete), 'unknown');

const unavailable = hooks.buildAltObservationV2_(geo({ total: undefined, missing: undefined, navigationCompleted: false }));
check('fetch/navigation unavailable', { checked: unavailable.checked, completeness: unavailable.completeness, limited: unavailable.limited },
  { checked:false, completeness:'unavailable', limited:true });
check('unavailable reaches GAS unknown contract', gasAltState(unavailable), 'unknown');

const fallbackOnly = hooks.buildAltObservationV2_(geo({ total: 10, missing: 4 }), { staticFallback:true });
check('fallback-only counts cannot become complete', { completeness: fallbackOnly.completeness, fallbackApplied: fallbackOnly.fallbackApplied, requiredScopeComplete: fallbackOnly.requiredScopeComplete },
  { completeness:'partial', fallbackApplied:true, requiredScopeComplete:false });

check('ALT authority', weak.authority, 'cloud_run_geoSignalsV1_multimodal_altObservationV2');

const attachedGeo = geo({ total: 10, missing: 4 });
const attached = hooks.attachAltObservationV2ToGeoSignalsV1_(attachedGeo);
check('canonical placement in multimodal image', attachedGeo.multimodalSignals.image.altObservationV2, attached);
check('observed aliases canonical multimodal object', attachedGeo.observed.multimodalSignals, attachedGeo.multimodalSignals);

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
assert.ok(source.includes('lightweightSummary.altObservationV2 = multimodalObserved'));
assert.equal(JSON.stringify(weak).includes('http'), false, 'no URL in ALT observation');
assert.equal(JSON.stringify(weak).includes('alt text'), false, 'no alt text in ALT observation');
cases += 3;

const classify = hooks.classifyAltPurposeV2_;
check('presentation empty alt is decorative', classify({alt:'',role:'presentation'}), {decorative:true,contextCovered:false,informative:false,altPresent:false});
check('aria-hidden empty alt is decorative', classify({alt:'',ariaHidden:'true'}), {decorative:true,contextCovered:false,informative:false,altPresent:false});
check('unmarked empty alt remains informative', classify({alt:''}), {decorative:false,contextCovered:false,informative:true,altPresent:false});
check('present alt remains informative and present', classify({alt:'商品の外観'}), {decorative:false,contextCovered:false,informative:true,altPresent:true});
check('empty image in named control is context covered', classify({alt:'',controlAccessibleName:true}), {decorative:false,contextCovered:true,informative:false,altPresent:false});

console.log(JSON.stringify({ pass:true, caseCount:cases }));
