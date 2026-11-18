const assert = require('node:assert/strict');
const h = require('../index.js').__lightBudgetTestHooks;
const run = 'fc890a04-96d8-42ed-95ef-72cd7acda87d', origin='https://fixture.invalid', entry=origin+'/brand/';
const html='<html><title>会社のご案内</title><body><h1>会社情報</h1><p>'+('事業をご紹介します。'.repeat(40))+'</p></body></html>';
const scan=h.extractContactSignalsFromHtml_(html,entry);
assert.equal(scan.observationComplete,true);assert.equal(scan.hasPhone,false);
for(const body of ['<body>読み込み中</body>','<title>Just a moment</title><body>Checking your browser Cloudflare</body>',html.replace('</body>','<iframe src="/content"></iframe></body>'),html.replace('</body>','<p>TEL 03-1234-5678</p></body>'),html.replace('</body>','<p>電話 ０３－１２３４－５６７８</p></body>'),html.replace('</body>','<p>Phone +441234567890</p></body>')]) {
 const r=h.extractContactSignalsFromHtml_(body,entry);assert(r.hasPhone===true||r.observationComplete===false,'抽出漏れや不完全本文から陰性を作らない');
}
assert.equal(h.extractContactSignalsFromHtml_(html.replace('</body>','<noscript><iframe src="https://tracker.invalid/"></iframe></noscript></body>'),entry).observationComplete,true);
const urls=['/contact/','/contact_us/','/contact-us/','/inquiry/','/otoiawase/'].map(p=>origin+p);
const pages=urls.map(url=>({url,finalUrl:url,status:404,ok:false,error:'HTTP 404',errorStage:'fetch'}));
const dest=h.evaluateContactDestinationPages_(origin,pages,'standard_path_probe',urls,{sourceRunId:run,entryKey:entry});
assert.equal(dest.hasContactDestination,false);assert.equal(dest.evidence.successfulChecks,0);assert.equal(dest.evidence.completedChecks,5);
const profile={observationComplete:true,conflict:false,hasTelephone:false,sourceUrl:origin+'/company/',identityEvidenceV1:{explicit:true,currentRun:true},telephoneObservationV1:{complete:true,hasPhone:false,sourceUrl:origin+'/company/'}};
const scope={sourceRunId:run,entryKey:entry,entry:{sourceRunId:run,url:entry,complete:true,hasPhone:false},profile:{sourceRunId:run,entryKey:entry,record:profile},navigation:{inputObserved:true,observationLimited:false,kinds:{contact:{classificationComplete:true,matchedCount:0}}},destination:dest,positivePhone:false,structuredPhoneAbsent:true};
assert.equal(h.pickBestContactSignals_([],scope).hasPhone,false);
const mutate=[s=>s.entry.complete=false,s=>s.entry.sourceRunId='old-run',s=>s.entry.url=origin+'/other/',s=>s.profile.sourceRunId='old-run',s=>s.profile.entryKey=origin+'/other/',s=>s.profile.record.telephoneObservationV1.complete=false,s=>s.profile.record.hasTelephone=true,s=>s.profile.record.conflict=true,s=>s.profile.record.provenance={sourceRunId:'old-run'},s=>s.profile.record.identityEvidenceV1.sourceRunId='old-run',s=>s.profile.record.runId='old-run',s=>s.profile.record.provenance={entryKey:origin+'/other/'},s=>{s.profile.record.sourceUrl='http://fixture.invalid/company/';s.profile.record.telephoneObservationV1.sourceUrl=s.profile.record.sourceUrl;},s=>{s.profile.record.sourceUrl='https://fixture.invalid:444/company/';s.profile.record.telephoneObservationV1.sourceUrl=s.profile.record.sourceUrl;},s=>s.profile.record.identityEvidenceV1.currentRun=false,s=>s.positivePhone=true,s=>s.structuredPhoneAbsent=false,s=>s.navigation.observationLimited=true,s=>s.navigation.kinds.contact.matchedCount=1,s=>s.destination.evidence.probeAuditV1.sourceRunId='old-run',s=>s.destination.evidence.probeAuditV1.attempts.pop(),s=>s.destination.evidence.probeAuditV1.attempts[0].finalUrl.host='other.invalid'];
for(const change of mutate){const s=JSON.parse(JSON.stringify(scope));change(s);assert.equal(h.pickBestContactSignals_([],s),null);}
for(const [status,error,errorStage] of [[403,'HTTP 403','fetch'],[500,'HTTP 500','fetch'],[null,'AbortError','timeout']]){const ps=JSON.parse(JSON.stringify(pages));Object.assign(ps[0],{status,error,errorStage});const d=h.evaluateContactDestinationPages_(origin,ps,'standard_path_probe',urls,{sourceRunId:run,entryKey:entry});assert.equal(d.hasContactDestination,null);}
const challenge=pages.map((p,i)=>i? p:{...p,ok:true,status:200,error:null,title:'Just a moment',sampledText:'Checking your browser Cloudflare'});assert.equal(h.evaluateContactDestinationPages_(origin,challenge,'standard_path_probe',urls).hasContactDestination,null);
const duplicate=pages.slice();duplicate.push({...pages[0],ok:true,status:200,title:'会社の案内',sampledText:'企業概要'});assert.equal(h.evaluateContactDestinationPages_(origin,duplicate,'standard_path_probe',urls).hasContactDestination,null);
const gone=pages.map(p=>({...p,status:410,error:'HTTP 410'}));assert.equal(h.evaluateContactDestinationPages_(origin,gone,'standard_path_probe',urls).hasContactDestination,false);
assert.equal(h.pickBestContactSignals_([{contactSignals:{hasPhone:true,telephone:'03-1234-5678'}}],scope).hasPhone,true,'既存正電話を優先');
if(process.env.PHONE_EVIDENCE_ROOT){const fs=require('node:fs'),r=process.env.PHONE_EVIDENCE_ROOT;for(const file of ['entry.html','company-overview.html']){const x=h.extractContactSignalsFromHtml_(fs.readFileSync(r+'/'+file,'utf8'),entry);assert.equal(x.hasPhone,false);assert.equal(x.observationComplete,true);}}
if(process.env.PHONE_EVIDENCE_ROOT){
 const fs=require('node:fs');const source='https://www.nttexc.co.jp/careers/newgrad/company/overview.html';
 const page=h.parseSubpageJsonLdLightHtml(source,source,200,fs.readFileSync(process.env.PHONE_EVIDENCE_ROOT+'/company-overview.html','utf8'),'corporate',{operatorIdentitySourceType:'company_profile'});
 const compact=h.compactSubpageJsonLdObservation_(page);
 assert.equal(compact.operatorIdentityInfo.telephoneObservationV1.complete,true);
 const formal=h.normalizeOperatorIdentityInfo_(compact.operatorIdentityInfo,'company_profile',{relationEvidence:{explicit:true,currentRun:true}});
 assert.equal(formal.telephoneObservationV1.complete,true);assert.equal(formal.telephoneObservationV1.hasPhone,false);
}
console.log('company phone bounded observation: PASS');
