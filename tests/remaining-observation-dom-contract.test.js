'use strict';
const assert=require('node:assert/strict');const {chromium}=require('playwright');const h=require('../index.js').__lightBudgetTestHooks;
(async()=>{const b=await chromium.launch({headless:true});try{
 const p=await b.newPage();
 await p.setContent(`<footer><div><div><p>運営会社</p><ul><li><a href="https://operator.invalid/"><img alt="架空株式会社"></a></li></ul></div><div><p>提供サービス</p><a href="https://other.invalid/">サービス</a></div></div><div><a href="https://operator.invalid/privacy/">プライバシー</a></div></footer>`);
 const links=await h.collectDiscoverLinksFromPage(p);const candidates=h.collectOfficialExternalOperatorProfileCandidates_(links,'https://brand.invalid');assert.equal(candidates.length,1);assert.equal(candidates[0].url,'https://operator.invalid');
 await p.setContent('<main><div><a href="https://x.com/example"><img alt="公式アカウント"></a><a href="https://youtube.com/user/other"><img alt="動画のサムネイル"></a></div></main>');
 const sig=await h.buildGeoSignalsV1(p,'https://brand.invalid',{balancedMode:false,shortFastMode:false});assert.equal(sig.externalProfileObservationV1.officialProfileCount,1);assert.equal(sig.externalProfileObservationV1.profiles.find(x=>x.href.includes('other')).relationConfirmed,false);
 await p.setContent('<div class="store-main-container"><h1>商品</h1><div class="product"><p class="product-description">説明</p></div></div>');
 const cov=await h.collectCoverageObservationsV2_({},p,'https://brand.invalid',null);assert.equal(cov.serviceContentObservationV2.pageObservations[0].mainContentSource,'unique_named_main_container');assert.equal(cov.serviceContentObservationV2.serviceTextLength,2,'nested product nodes count once');
 await p.setContent('<div class="main-content">A</div><div class="main-content">B</div>');const amb=await h.collectCoverageObservationsV2_({},p,'https://brand.invalid',null);assert.equal(amb.serviceContentObservationV2.pageObservations[0].mainContentObserved,false);
 const candidate={...candidates[0],operatorIdentityProbeSourceType:'company_profile'};const landing={ok:true,finalUrl:candidate.url,companyProfileDetailLinks:[{url:'https://operator.invalid/company/profile',label:'会社概要',source:'explicit_company_profile_link'}]};
 const identity={observed:true,hasOperatorInfo:false};const detail=h.selectOperatorSecondPageCompanyProfileDetailLink_(landing,candidate,identity);assert(detail);
 const info={observed:true,conflict:false,scope:'company_profile_page',sourceUrl:detail.url,companyName:'架空株式会社'};
 assert(h.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(candidate,landing,detail,{ok:true,finalUrl:detail.url},info,'ec'));
 assert.equal(h.buildObservedCompanyProfileHubDetailRelationEvidenceV1_(candidate,landing,detail,{ok:true,finalUrl:'https://unrelated.invalid/company'},info,'ec'),null);
 assert.equal(h.selectOperatorSecondPageCompanyProfileDetailLink_({...landing,companyProfileDetailLinks:[{...detail,url:'https://other.invalid/profile'}]},candidate,identity),null);
 // Rendered landing may contribute only observed same-origin detail links.
 const context=await b.newContext();await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<meta charset="UTF-8"><main><h1>会社</h1><script>setTimeout(()=>{document.querySelector("main").insertAdjacentHTML("beforeend",\'<a href="/company/profile">会社概要</a>\')},20)</script></main>'}));
 const rendered=await h.fetchSubpagePlaywrightScopedLight('https://operator.invalid/',{context,siteMode:'saas',operatorIdentitySourceType:'company_profile',highConfidenceCompanyProfile:true,collectOperatorSecondPageCompanyProfileLink:true});assert.equal(rendered.ok,true);assert.equal(rendered.companyProfileDetailLinks[0].url,'https://operator.invalid/company/profile');await context.close();
 console.log('remaining observation contracts: bounded relation, image label, named content, de-duplication, explicit followup and rendered landing passed');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
