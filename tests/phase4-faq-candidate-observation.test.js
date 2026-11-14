'use strict';
const assert=require('node:assert/strict');
const h=require('../index.js').__lightBudgetTestHooks;
const origin='https://example.test';
const links=Array.from({length:121},(_,i)=>({href:`https://example.test/x/${i}`,text:'other'}));
links.push({href:'https://example.test/Pitariko/contents/qa',text:'よくある質問'});
const urls=h.selectCoverageObservationV2Candidates_(origin,links,'faq',3);
assert.deepEqual(urls,['https://example.test/Pitariko/contents/qa']);
const complete={checked:true,renderComplete:true,frameComplete:true,failureKind:null,faqContent:false};
const faqPage=Object.assign({},complete,{faqContent:true});
const present=h.buildFaqObservationV2_(Object.assign({},complete,{faqLinkObserved:true}),[faqPage],true);
assert.equal(present.value,true);
assert.equal(present.completeness,'complete');
const unresolved=h.buildFaqObservationV2_(Object.assign({},complete,{faqLinkObserved:true}),[],true);
assert.equal(unresolved.value,null);assert.equal(unresolved.completeness,'partial');
const absent=h.buildFaqObservationV2_(Object.assign({},complete,{faqLinkObserved:false}),[],true);
assert.equal(absent.value,false);assert.equal(absent.completeness,'complete');
[
  {mainObserved:true,faqHeading:true,questionCount:2},
  {mainObserved:true,faqContainer:true,pairCount:2},
  {mainObserved:true,faqHeading:true,pairCount:2},
  {mainObserved:true,faqContainer:true,pairCount:1},
  {mainObserved:true,faqContainer:true,questionCount:2},
  {mainObserved:true,faqStructuredData:true},
  {mainObserved:true,faqHeading:true,questionCount:2}
].forEach((fixture)=>assert.equal(h.detectFaqContentV2_(fixture),true));
assert.equal(h.detectFaqContentV2_({mainObserved:true,faqHeading:false,questionCount:1}),false);
assert.equal(h.detectFaqContentV2_({mainObserved:true,faqHeading:true,questionCount:1}),false);
console.log(JSON.stringify({pass:true,cases:13}));
