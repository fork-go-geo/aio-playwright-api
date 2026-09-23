'use strict';
const assert=require('node:assert/strict');
const h=require('../index.js').__lightBudgetTestHooks;

const origin='https://example.test';
const ordinary=Array.from({length:121},(_,i)=>({href:`${origin}/page-${i}`,text:'通常ページ'}));
ordinary.push({href:`${origin}/sitemap/`,text:'サイトマップ',region:'FOOTER'});
assert.deepEqual(h.selectCoverageObservationV2Candidates_(origin,ordinary,'sitemap',5),[`${origin}/sitemap/`]);

// The collector supplies one pre-filtered subset for all rendered document
// links, including links traversed from reachable open shadow roots.  This
// fixture represents that subset and proves it is not truncated at 120.
const shadowSubset=[{href:`${origin}/shadow-sitemap`,aria:'サイトマップ'}];
assert.deepEqual(h.selectCoverageObservationV2Candidates_(origin,shadowSubset,'sitemap',5),[`${origin}/shadow-sitemap`]);

const complete={checked:true,renderComplete:true,frameComplete:true,failureKind:null,sitemapLinkDiscoveryComplete:true};
const absent=h.buildHtmlSitemapCandidateDiscoveryV1_(complete,[]);
assert.equal(absent.discoveryComplete,true);
assert.equal(absent.completeness,'complete');
assert.equal(absent.discoveredCount,0);
const partial=h.buildHtmlSitemapCandidateDiscoveryV1_(Object.assign({},complete,{frameComplete:false}),[]);
assert.equal(partial.discoveryComplete,false);
assert.equal(partial.completeness,'partial');
console.log(JSON.stringify({pass:true,cases:6,after120Candidate:true,openShadowCandidate:true}));
