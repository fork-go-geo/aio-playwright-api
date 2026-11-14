'use strict';
const assert=require('node:assert/strict');
const h=require('../index.js').__lightBudgetTestHooks;

const origin='https://example.test';
const links=Array.from({length:121},(_,i)=>({href:`https://example.test/x/${i}`,text:'other'}));
links.push({href:'https://example.test/services/storage',text:'サービス紹介'});
assert.deepEqual(h.selectCoverageObservationV2Candidates_(origin,links,'service',3),['https://example.test/services/storage']);

const entry=(serviceTextLength,mainTextLength,serviceLinkObserved=false)=>({
  checked:true,attempted:true,renderComplete:true,frameComplete:true,failureKind:null,
  mainContentObserved:true,serviceRegionCertain:true,serviceTextLength,mainTextLength,serviceLinkObserved
});
const candidate=entry(400,500);
const sufficient=h.buildServiceContentObservationV2_(entry(0,4888),[],true);
assert.equal(sufficient.serviceTextLength,0);
assert.equal(sufficient.mainTextLength,4888);
assert.equal(sufficient.completeness,'complete');
const discovered=h.buildServiceContentObservationV2_(entry(0,500,true),[candidate],true);
assert.equal(discovered.explicitCandidateCount,1);
assert.equal(discovered.serviceTextLength,400);
assert.equal(discovered.mainTextLength,1000);
assert.equal(discovered.completeness,'complete');
const unresolved=h.buildServiceContentObservationV2_(entry(0,500,true),[],true);
assert.equal(unresolved.completeness,'partial');
assert.equal(unresolved.failureKind,'service_link_candidate_unresolved');
console.log(JSON.stringify({pass:true,cases:8}));
