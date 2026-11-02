const assert = require('assert');
const { collectCoverageObservationsV2_ } = require('../index.js').__lightBudgetTestHooks;
function fact(extra = {}) { return Object.assign({ readyState:'complete', hasFrame:false, mainContentObserved:true, mainTextLength:100, serviceTextLength:null, serviceRegionCertain:false, faqDetector:{}, breadcrumbUi:false, links:[], faqLinks:[], faqLinkObserved:false, serviceLinks:[], serviceLinkObserved:false, sitemapLinks:[], sitemapLinkDiscoveryComplete:true }, extra); }
function pageFor(value, gotoError) { return { evaluate:async()=>fact(value), goto:async()=>{ if(gotoError) throw new Error(gotoError); return {status:()=>200}; }, close:async()=>{} }; }
async function observe(directRows, representativePages) {
  const entry=pageFor({links:[{href:'/corporate/product/a',text:'Product A'},{href:'/corporate/product/b',text:'Product B'},{href:'/corporate/product/c',text:'Product C'}]});
  const queue=directRows.slice();
  const geo={subpageSignals:{pages:representativePages || [{url:'https://fixture.invalid/about/',finalUrl:'https://fixture.invalid/about/',hasBreadcrumbUi:false},{url:'https://fixture.invalid/business/',finalUrl:'https://fixture.invalid/business/',hasBreadcrumbUi:false}]}};
  return (await collectCoverageObservationsV2_(geo,entry,'https://fixture.invalid/corporate/',{newPage:async()=>queue.shift()})).breadcrumbObservationV2;
}
(async()=>{
  const absent=await observe([pageFor({breadcrumbUi:false}),pageFor({breadcrumbUi:false}),pageFor({},'timeout')]);
  assert.equal(absent.completeness,'complete'); assert.equal(absent.observedScope,'independent_hierarchical_subpage'); assert.equal(absent.hasAnyUi,false);
  const present=await observe([pageFor({breadcrumbUi:true}),pageFor({breadcrumbUi:false}),pageFor({},'timeout')]);
  assert.equal(present.completeness,'complete'); assert.equal(present.hasAnyUi,true);
  const noAlternative=await observe([pageFor({breadcrumbUi:false}),pageFor({breadcrumbUi:false}),pageFor({},'timeout')],[]);
  assert.equal(noAlternative.completeness,'partial'); assert.equal(noAlternative.hasAnyUi,null);
  const foreignOnly=await observe([pageFor({breadcrumbUi:false}),pageFor({breadcrumbUi:false}),pageFor({},'timeout')],[{url:'https://other.invalid/about/',finalUrl:'https://other.invalid/about/',hasBreadcrumbUi:false}]);
  assert.equal(foreignOnly.completeness,'partial');
  const limited=await observe([pageFor({breadcrumbUi:false}),pageFor({breadcrumbUi:false}),pageFor({},'timeout')],[{url:'https://fixture.invalid/about/',finalUrl:'https://fixture.invalid/about/',hasBreadcrumbUi:false,observationLimited:true}]);
  assert.equal(limited.completeness,'partial');
  console.log('breadcrumb v2 reuse partial candidates: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
