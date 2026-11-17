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
 // 代表下層の同一実行で確認済みのパンくずを、追加取得の前に再利用する。
 const breadLinks=[1,2,3].map(n=>({href:origin+'/news/item'+n,text:'News '+n}));
 const breadEntry={async evaluate(){return {...facts,url:origin+'/',links:breadLinks,faqLinks:[],serviceLinks:[],breadcrumbUi:false};}};
 const representative={subpageSignals:{pages:[{url:origin+'/about/',hasBreadcrumbUi:true}]}};
 let breadVisits=0;
 const denied={async newPage(){return {async goto(){breadVisits++;return {status:()=>403};},async close(){}};}};
 const prior=await collectCoverageObservationsV2_(representative,breadEntry,origin+'/',denied);
 assert.equal(prior.breadcrumbObservationV2.completeness,'complete','completed positive representative observation must reach formal producer');
 assert.equal(prior.breadcrumbObservationV2.hasAnyUi,true);
 assert.equal(prior.breadcrumbObservationV2.observedScope,'independent_hierarchical_subpage');
 assert.equal(breadVisits,0,'positive reuse must precede redundant browser navigation');
 const {collectReusableBreadcrumbObservationV2Rows_,buildSubpageSignalsV1FromSubpageObservation_}=require('../index.js').__lightBudgetTestHooks;
 const scopedPages=[
  {url:origin+'/brand/about/',hasBreadcrumbUi:true},
  {url:origin+'/brand/about?via=nav#top',hasBreadcrumbUi:true},
  {url:origin+'/other/news/',hasBreadcrumbUi:true},
  {url:origin+'/brand2/news/',hasBreadcrumbUi:true},
  {url:origin+'/brand/',hasBreadcrumbUi:true},
  {url:'https://other.test/brand/news/',hasBreadcrumbUi:true},
  {url:origin+'/brand/news/unknown'},
  {url:origin+'/brand/news/string',hasBreadcrumbUi:'true'}
 ];
 const scoped=collectReusableBreadcrumbObservationV2Rows_({subpageSignals:{pages:scopedPages}},origin+'/brand/');
 assert.equal(scoped.length,1,'reject sibling paths, self, foreign origin, missing/nonboolean evidence and duplicates');
 const falseOnly={subpageSignals:{pages:[{url:origin+'/about/',hasBreadcrumbUi:false}]}};
 const falseResult=await collectCoverageObservationsV2_(falseOnly,breadEntry,origin+'/',denied);
 assert.equal(falseResult.breadcrumbObservationV2.completeness,'partial','static negative does not replace DOM acquisition');
 assert.equal(breadVisits,3,'negative or absent evidence retains original acquisition budget');
 const nextRun=await collectCoverageObservationsV2_({},breadEntry,origin+'/',denied);
 assert.equal(nextRun.breadcrumbObservationV2.hasAnyUi,null,'previous-run positive evidence is never cached');
 assert.equal(breadVisits,6);
 const many={subpageSignals:{pages:[1,2,3,4,5].map(n=>({url:origin+'/about/'+n,hasBreadcrumbUi:true}))}};
 const capped=await collectCoverageObservationsV2_(many,breadEntry,origin+'/',denied);
 assert.equal(capped.breadcrumbObservationV2.observedSubpageCount,3,'new priority scope retains three-page cap');
 assert.equal(breadVisits,6);
 const overlapEntry={async evaluate(){return {...facts,url:origin+'/',links:[{href:origin+'/service/detail',text:'Service'}],faqLinks:[],serviceLinks:[{href:origin+'/service/detail',text:'Service'}]};}};
 const overlap=await collectCoverageObservationsV2_({subpageSignals:{pages:[{url:origin+'/service/detail',hasBreadcrumbUi:true}]}},overlapEntry,origin+'/',denied);
 assert.equal(overlap.breadcrumbObservationV2.hasAnyUi,true);
 assert.equal(overlap.serviceContentObservationV2.completeness,'partial','service failure is not masked by breadcrumb reuse');
 assert.equal(breadVisits,7,'required service fetch is preserved');
 const failureFiltered=buildSubpageSignalsV1FromSubpageObservation_({topUrl:origin+'/',origin,observations:[{url:origin+'/about/',finalUrl:origin+'/about/',ok:false,hasBreadcrumbUi:true}]});
 assert.ok(!failureFiltered || failureFiltered.pages.length===0,'failed representative observations cannot enter the reused producer');
 console.log('coverage candidates: same-run reuse, bounded concurrency, failure preservation and run isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
