'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
require('./helpers/operator-deny-network.cjs');
const sourcePath=process.env.OPERATOR_FIXTURE_SOURCE||path.join(__dirname,'../index.js');
const runtime=new Module(path.join(__dirname,'../footer-profile-runtime.js'),module);runtime.filename=runtime.id;runtime.paths=Module._nodeModulePaths(path.dirname(runtime.filename));
runtime._compile(fs.readFileSync(sourcePath,'utf8')+`
module.exports.runFixture=async(discovered,fetchPages,signals,entry,opts)=>{
 discoverSubpageCandidatesLightData_=async()=>discovered;fetchSubpageHtmlLightUrls_=fetchPages;
 attachMediaFreshnessArticleDomSignalsLight_=async()=>{};attachNewsIndexFreshnessSignalsLight_=async()=>{};
 resolveContactDestinationLight_=async()=>null;attachOfficialListingExternalProfileObservationV1_=async()=>{};
 return attachCoverageSignalsToGeoSignalsLight_(signals,entry,opts);
};`,runtime.filename);
const h=runtime.exports.__lightBudgetTestHooks;
const entry='https://brand.fixture.invalid/service',origin='https://brand.fixture.invalid',company='https://operator.fixture.invalid/',detail=company+'about/company-profile';
const runId='435586c4-a668-4898-9ba1-88512aa62f73';
const logo={href:company,text:'Fixture Brand',footerBrandLogo:true,sourceEntryUrl:entry};
const candidates=h.collectOfficialExternalOperatorProfileCandidates_({footerLinks:[logo]},origin);
assert.equal(candidates.length,1);assert.equal(candidates[0].officialExternalOperatorProfile,undefined);
assert.equal(h.buildObservedCompanyProfileRelationEvidenceV1_(candidates[0],{ok:true},{hasCompanyName:true,hasAddress:true},'saas'),null);
for(const patch of [{footerBrandLogo:false},{sourceEntryUrl:'https://other.fixture.invalid/'},{href:'https://operator.fixture.invalid/product'},{href:'http://operator.fixture.invalid/'},{text:''}])assert.equal(h.collectOfficialExternalOperatorProfileCandidates_({footerLinks:[{...logo,...patch}]},origin).length,0);
assert.equal(h.collectOfficialExternalOperatorProfileCandidates_({footerLinks:[logo,{...logo,href:'https://second.fixture.invalid/'}]},origin).length,0);
(async()=>{
 for(const kind of ['normal','failed_landing','failed_detail','wrong_entry','missing_run','wrong_detail_origin']){
  const sourceEntry=kind==='wrong_entry'?origin+'/other':entry;
  const cs=candidates.map(c=>({...c,operatorProfileEntryUrl:sourceEntry}));
  const plan=h.buildOperatorIdentityProbeSelectionPlan_(cs,'saas',2);
  const discovered={candidates:[],totalCandidates:0,sourceSummary:{},errors:[],operatorIdentityCandidates:cs,operatorIdentityAuditCandidates:cs,operatorIdentitySelectionPlan:plan};
  const calls=[],signals={};
  const budget=h.createLightRequestBudget_(Date.now());
  await runtime.exports.runFixture(discovered,async(urls,opts)=>({pages:urls.map(url=>{
    calls.push(url);assert.ok(calls.length<=3);assert.equal(opts.lightBudget,budget);
    if((kind==='failed_landing'&&url===company)||(kind==='failed_detail'&&url===detail))return{url,ok:false,error:'fixture_timeout'};
    assert.ok([company,detail].includes(url));
    const html=url===company?'<main><a href="/about/company-profile">会社概要</a></main>':'<main><section><h2>会社概要</h2><div><p>架空合同会社<br>〒100-0001<br>東京都千代田区架空1-2-3</p></div></section></main>';
    return h.parseSubpageJsonLdLightHtml(url,kind==='wrong_detail_origin'&&url===detail?'https://other.fixture.invalid/about/company-profile':url,200,html,'saas',opts);
  })}),signals,entry,{siteMode:'saas',maxObserve:5,lightBudget:budget,sourceRunId:kind==='missing_run'?'':runId,entryKey:entry});
  const info=signals.trustSignals?.operatorIdentityInfo,obs=signals.operatorIdentityObservationV1;
  assert.notEqual(info?.hasOperatorInfo,true,kind+' never asserts an operator');
  if(kind==='normal'){
   assert.deepEqual(calls,[company,detail]);assert.equal(info.companyName,'架空合同会社');assert.equal(info.hasAddress,true);
   assert.equal(info.provenance.source,'bounded_footer_brand_profile_probe');assert.equal(info.provenance.sourceRunId,runId);assert.equal(info.provenance.sourceEntryUrl,entry);
   assert.equal(obs.scopeComplete,true);assert.equal(obs.signalState,'false');
  }else assert.notEqual(info?.provenance?.source,'bounded_footer_brand_profile_probe',kind);
 }
 console.log('footer profile integration PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
