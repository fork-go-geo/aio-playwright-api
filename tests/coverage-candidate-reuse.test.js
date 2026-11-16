const assert = require('node:assert/strict');
const {collectCoverageObservationsV2_} = require('../index.js').__lightBudgetTestHooks;
const origin='https://candidate.example.test';
const links=[{href:origin+'/faq',text:'FAQ'}, ...[1,2,3].map(n=>({href:origin+'/service/'+n,text:'Service '+n}))];
const facts={readyState:'complete',mainContentObserved:true,mainTextLength:1000,serviceTextLength:100,serviceRegionCertain:true,links,faqLinks:[links[0]],serviceLinks:links.slice(1),sitemapLinks:[],sitemapLinkDiscoveryComplete:true,breadcrumbUi:true,faqDetector:{mainObserved:true,faqStructuredData:true}};
(async()=>{
 let active=0,maxActive=0,closed=0; const visits=[];
 const context={async newPage(){active++;maxActive=Math.max(active,maxActive);let current='';return {
  async goto(url){current=url;visits.push(url);await new Promise(r=>setTimeout(r,10));return {status:()=>url.endsWith('/3')?403:200};},
  async evaluate(){return {...facts,links:[],faqLinks:[],serviceLinks:[]};},
  async close(){active--;closed++;}
 };}};
 const entry={async evaluate(){return facts;}};
 const first=await collectCoverageObservationsV2_({},entry,origin,context);
 assert.equal(visits.length,4,'service/breadcrumb overlap must not navigate twice');
 assert.equal(new Set(visits).size,4);
 assert.equal(maxActive,2,'two workers must overlap and remain bounded');
 assert.equal(closed,4);assert.equal(active,0);
 assert.equal(first.serviceContentObservationV2.limited,true,'403 must remain incomplete');
 assert.equal(first.serviceContentObservationV2.completedPageCount,3);
 await collectCoverageObservationsV2_({},entry,origin,context);
 assert.equal(visits.length,8,'facts must never be reused across diagnosis executions');
 assert.equal(closed,8);
 // Redirect destinations are supplied as rendered facts; no external HTTP
 // redirect is needed to check final-entry identity and failure preservation.
 const entryUrl=origin+'/landing/';
 const aliases=[{href:origin+'/services/a',text:'Service A'},{href:origin+'/services/b',text:'Service B'}];
 const aliasEntry={async evaluate(){return {...facts,url:entryUrl,faqLinks:[],links:aliases,serviceLinks:aliases};}};
 async function redirected(finalUrl, limited=false){
  const ctx={async newPage(){return {
   async goto(){return {status:()=>200};},
   async evaluate(){return {...facts,url:finalUrl,links:[],faqLinks:[],serviceLinks:[],mainContentObserved:!limited,serviceRegionCertain:!limited,serviceTextLength:limited?null:100};},
   async close(){}
  };}};
  return (await collectCoverageObservationsV2_({},aliasEntry,entryUrl,ctx)).serviceContentObservationV2;
 }
 const back=await redirected(entryUrl);
 assert.equal(back.completeness,'complete');assert.equal(back.observedPageCount,1);
 const sameDetail=await redirected(origin+'/services/detail');
 assert.equal(sameDetail.completeness,'complete');assert.equal(sameDetail.observedPageCount,2);
 assert.equal(sameDetail.mainTextLength,2000,'one entry plus one final detail');
 const limitedBack=await redirected(entryUrl,true);
 assert.equal(limitedBack.completeness,'partial','identity deduplication must not hide an incomplete observation');
 const missingIdentity=await redirected('');
 assert.equal(missingIdentity.observedPageCount,3,'missing identity must not be assumed equal');
 console.log('coverage candidates: same-run reuse, bounded concurrency, failure preservation and run isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
