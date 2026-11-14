const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const hooks=require('../index.js').__lightBudgetTestHooks;
const source=fs.readFileSync(require.resolve('../index.js'),'utf8');
const start=source.indexOf('async function collectHtmlSitemapCoverageSignalV1_('),end=source.indexOf('function attachHtmlSitemapCoverageSignalToGeoSignalsV1_',start);
const ctx={URL,AbortController,setTimeout,clearTimeout,fetch(){},HTML_SITEMAP_STANDARD_PATHS_V1_:hooks.HTML_SITEMAP_STANDARD_PATHS_V1_,buildHtmlSitemapCoverageSignalV1_:hooks.buildHtmlSitemapCoverageSignalV1_,fetchPublicSiteTextV1_:(url,opts)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>resolve({status:404,ok:false,headers:{get:()=>''},requestedUrl:url,url,redirected:false}),2100);
 opts.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('request_aborted'));},{once:true});
})};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
(async()=>{
 const page={evaluate:async()=>[]};
 const complete=await ctx.collectHtmlSitemapCoverageSignalV1_('https://fixture.example',page);
 assert.equal(complete.result,'missing');assert.equal(complete.observationComplete,true);assert.equal(complete.checkedCount,8);assert(complete.candidates.every(c=>c.httpStatus===404));
 const limited=await ctx.collectHtmlSitemapCoverageSignalV1_('https://fixture.example',page,20);
 assert.equal(limited.result,'limited');assert.equal(limited.hasHtmlSitemap,null);assert.equal(limited.observationComplete,false);
 console.log('HTML sitemap: slow complete responses accepted; true timeouts stay unknown');
})().catch(e=>{console.error(e);process.exitCode=1;});
