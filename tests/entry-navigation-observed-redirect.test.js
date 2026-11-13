const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const hooks=require('../index.js').__lightBudgetTestHooks;
const lookup=(_host,_opts,cb)=>cb(null,[{address:'93.184.216.34',family:4}]);
const initial='https://example.test/';
async function resolve(stat, response, extra={}){
 const calls=[];const result=await hooks.resolveLightEntryNavigationV1_(initial,stat,{dnsLookup:lookup,requestImpl:async(url,opts)=>{calls.push({url:String(url),method:opts.method});return response;},...extra});return {result,calls};
}
(async()=>{
 let r=await resolve({success:true,status:200,finalUrl:initial+'index.html'});
 assert.equal(r.result.navigationUrl,initial+'index.html');assert.equal(r.result.source,'same_run_static_redirect');assert.equal(r.calls.length,0);
 r=await resolve({success:false,status:403},{status:301,headers:{location:'/index.html'}});
 assert.equal(r.result.requestedUrl,initial);assert.equal(r.result.navigationUrl,initial+'index.html');assert.equal(r.result.source,'same_run_head_redirect');assert.deepEqual(r.calls,[{url:initial,method:'HEAD'}]);
 for(const status of [200,403,404,429,500]){
  r=await resolve({success:false,status:403},{status,headers:{location:'/index.html'}});
  assert.equal(r.result.navigationUrl,initial);assert.equal(r.result.source,'requested_url');
 }
 for(const location of ['', '/', 'https://other.test/page','http://example.test/page','http://127.0.0.1/','http://169.254.169.254/','https://user:secret@example.test/']){
  r=await resolve({success:false,status:403},{status:301,headers:{location}});assert.equal(r.result.navigationUrl,initial,location);
 }
 r=await resolve({success:true,status:200,finalUrl:'https://other.test/'},null);assert.equal(r.result.navigationUrl,initial);
 r=await resolve({success:false,status:403},{status:301,headers:{location:'/index.html'}},{dnsLookup:(_h,_o,cb)=>cb(null,[{address:'127.0.0.1',family:4}])});assert.equal(r.result.navigationUrl,initial);
 r=await resolve({success:false,status:403},{status:301,headers:{location:'/index.html'}},{authenticatedRun:true});assert.equal(r.calls.length,0);assert.equal(r.result.navigationUrl,initial);
 r=await resolve({success:false,status:403},null,{requestImpl:async()=>{throw Error('timeout')}});assert.equal(r.result.navigationUrl,initial);
 // No state is cached from the previous successful resolution.
 r=await resolve({success:false,status:403},{status:403,headers:{}});assert.equal(r.result.navigationUrl,initial);
 // Execute the real request construction to confirm HEAD reaches the pinned
 // HTTP transport, rather than being silently converted into GET.
 const source=fs.readFileSync(require.resolve('../index.js'),'utf8');
 const start=source.indexOf('async function requestValidatedSubpageHtmlV1_(');
 const end=source.indexOf('// Shared safe text transport',start);
 let sent;
 const http={request(options,callback){sent=options;const response={statusCode:301,headers:{location:'/index.html'},socket:{remoteAddress:'93.184.216.34'},on(){},once(event,fn){if(event==='end')queueMicrotask(fn);}};return {once(){},end(){callback(response)},destroy(){}};}};
 const ctx={URL,Buffer,queueMicrotask,http,https:http,SUBPAGE_HTML_MAX_BYTES_V1_:4096,resolveValidatedSubpageAddressV1_:async()=>({address:'93.184.216.34',family:4}),normalizeComparableIpAddressV1_:s=>s,GEO_UNIFIED_OBSERVER_HTML_UA_V1_:'fixture'};
 vm.runInNewContext(source.slice(start,end),ctx);
 await ctx.requestValidatedSubpageHtmlV1_(new URL(initial),{method:'HEAD'});assert.equal(sent.method,'HEAD');assert.equal(typeof sent.lookup,'function');assert.equal(sent.agent,false);
 await ctx.requestValidatedSubpageHtmlV1_(new URL(initial),{});assert.equal(sent.method,'GET');
 console.log('observed entry redirect navigation: passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
