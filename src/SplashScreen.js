(function(){
'use strict';
try{globalThis.__MINIFEATHER_SPLASH__?.destroy?.()}catch(_){ }
const ROOT_ID='mf-startup-splash';
const STYLE_ID='mf-startup-splash-style';
const TOTAL_MS=3720;
const MIN_VISIBLE_MS=220;
const FRAME_MS=1000/45;
const LOGO_URL=chrome.runtime.getURL('assets/icon.png');
let root=null;
let style=null;
let nodes=null;
let raf=0;
let playToken=0;
let startedAt=0;
let lastFrameAt=0;
let destroyed=false;
let eventController=new AbortController();
let trailSamples=null;
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
const lerp=(a,b,t)=>a+(b-a)*t;
const easeOutCubic=t=>1-Math.pow(1-clamp01(t),3);
const easeInOutCubic=t=>{t=clamp01(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const segment=(time,start,end,easing=clamp01)=>easing((time-start)/Math.max(1,end-start));
function makeStyle(){
const el=document.createElement('style');
el.id=STYLE_ID;
el.textContent=`
#${ROOT_ID}{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;overflow:hidden;background:radial-gradient(ellipse at 50% 48%,rgba(14,43,69,.48) 0%,rgba(3,14,27,.88) 39%,rgba(1,6,14,.99) 76%),#020812;opacity:0;color:#f6fbff;user-select:none;-webkit-user-select:none;pointer-events:none;contain:layout paint style;will-change:opacity;font-family:'Segoe UI',Inter,system-ui,sans-serif}
#${ROOT_ID}:before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 29% 44%,rgba(74,188,255,.09),transparent 25%),radial-gradient(circle at 72% 52%,rgba(116,210,255,.06),transparent 23%)}
#${ROOT_ID} .mf-splash-stage{position:relative;width:min(1120px,94vw);height:min(510px,72vh);display:grid;place-items:center;contain:layout paint}
#${ROOT_ID} .mf-splash-stage:after{content:'';position:absolute;left:17%;right:17%;bottom:16%;height:1px;background:linear-gradient(90deg,transparent,rgba(122,211,255,.11),rgba(222,247,255,.38),rgba(122,211,255,.11),transparent);opacity:.6}
#${ROOT_ID} .mf-splash-svg{width:100%;height:100%;overflow:visible}
#${ROOT_ID} .mf-splash-wordmark{font-family:'Segoe UI',Inter,system-ui,sans-serif;font-weight:700;font-size:72px;letter-spacing:-3.4px;fill:url(#mfSplashWordGradient)}
#${ROOT_ID} .mf-splash-wordmark .mf-splash-mini{font-weight:550}
#${ROOT_ID} .mf-splash-wordmark .mf-splash-feather-word{font-weight:760}
#${ROOT_ID} .mf-splash-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 48%,rgba(0,0,0,.48) 100%);pointer-events:none}
@media(max-width:720px){#${ROOT_ID} .mf-splash-stage{width:100vw;height:58vh}#${ROOT_ID} .mf-splash-wordmark{font-size:58px;letter-spacing:-2.5px}}
`;
return el
}
function featherMarkup(id,opacity=1){
return `<g id="${id}" opacity="${opacity}"><g transform="translate(-44 -18)"><path d="M4 29 C17 14 32 5 57 2 C69 .5 79 3 86 8 C78 24 64 35 43 41 C26 46 13 42 4 36 C11 34 18 31 24 27 C15 30 9 31 4 29 Z" fill="url(#mfSplashFeatherFill)"/><path d="M8 37 C28 30 49 20 81 7" fill="none" stroke="rgba(242,251,255,.98)" stroke-width="2.2" stroke-linecap="round"/><path d="M25 28 L18 18 M34 24 L26 12 M44 20 L38 8 M54 16 L51 5 M61 13 L61 4 M31 31 L23 38 M42 27 L34 39 M53 22 L48 35 M64 16 L61 28" fill="none" stroke="rgba(182,228,255,.72)" stroke-width="1.35" stroke-linecap="round"/><path d="M4 37 C-2 42 -6 47 -9 52" fill="none" stroke="rgba(102,207,255,.92)" stroke-width="2" stroke-linecap="round"/></g></g>`
}
function makeRoot(){
const el=document.createElement('div');
el.id=ROOT_ID;
el.setAttribute('role','presentation');
el.innerHTML=`<div class="mf-splash-stage"><svg class="mf-splash-svg" viewBox="0 0 1120 510" aria-hidden="true"><defs><linearGradient id="mfSplashWordGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".52" stop-color="#e6f6ff"/><stop offset="1" stop-color="#9fdcff"/></linearGradient><linearGradient id="mfSplashStrokeGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9fdff"/><stop offset=".48" stop-color="#9edcff"/><stop offset="1" stop-color="#42b6ff"/></linearGradient><linearGradient id="mfSplashFeatherFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#dff4ff"/><stop offset="1" stop-color="#79cfff"/></linearGradient><radialGradient id="mfSplashFlareGradient"><stop offset="0" stop-color="#fff" stop-opacity=".98"/><stop offset=".18" stop-color="#bfeaff" stop-opacity=".82"/><stop offset=".52" stop-color="#4cc3ff" stop-opacity=".25"/><stop offset="1" stop-color="#4cc3ff" stop-opacity="0"/></radialGradient><clipPath id="mfSplashLogoClip"><rect x="244" y="123" width="144" height="144" rx="31"/></clipPath><clipPath id="mfSplashWordClip"><rect id="mf-splash-word-clip" x="416" y="145" width="0" height="125" rx="8"/></clipPath></defs><g id="mf-splash-stars" opacity="0"><circle cx="188" cy="146" r="1.5" fill="#9fddff"/><circle cx="246" cy="301" r="1.2" fill="#8fd7ff"/><circle cx="392" cy="112" r="1.1" fill="#d5f2ff"/><circle cx="517" cy="317" r="1.1" fill="#74caff"/><circle cx="708" cy="126" r="1.3" fill="#d9f5ff"/><circle cx="816" cy="301" r="1.2" fill="#8ad5ff"/><circle cx="915" cy="171" r="1.4" fill="#d9f5ff"/></g><g id="mf-splash-logo" opacity="0" transform="translate(316 195) scale(.72) translate(-316 -195)"><rect x="238" y="117" width="156" height="156" rx="35" fill="#47bfff" fill-opacity=".055" stroke="#78d1ff" stroke-opacity=".22" stroke-width="2"/><image href="${LOGO_URL}" x="244" y="123" width="144" height="144" preserveAspectRatio="xMidYMid slice" clip-path="url(#mfSplashLogoClip)"/><rect id="mf-splash-logo-ring" x="244" y="123" width="144" height="144" rx="31" fill="none" stroke="url(#mfSplashStrokeGradient)" stroke-width="2.2" stroke-opacity=".42"/></g><g clip-path="url(#mfSplashWordClip)"><text x="416" y="213" class="mf-splash-wordmark"><tspan class="mf-splash-mini">Mini</tspan><tspan class="mf-splash-feather-word">Feather</tspan></text></g><path id="mf-splash-word-trail-glow" d="M408 236 C523 249 656 247 844 229" pathLength="1" fill="none" stroke="#4cc3ff" stroke-width="8" stroke-linecap="round" stroke-opacity=".12" stroke-dasharray="1" stroke-dashoffset="1"/><path id="mf-splash-word-trail" d="M408 236 C523 249 656 247 844 229" pathLength="1" fill="none" stroke="url(#mfSplashStrokeGradient)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="1" opacity="0"/><path id="mf-splash-logo-swoop" d="M181 268 C205 219 239 191 282 177 C317 166 359 170 398 193" pathLength="1" fill="none" stroke="url(#mfSplashStrokeGradient)" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="1" opacity="0"/><g id="mf-splash-signature" opacity="0" transform="translate(860 154) rotate(-19) scale(.52)"><path d="M4 29 C17 14 32 5 57 2 C69 .5 79 3 86 8 C78 24 64 35 43 41 C26 46 13 42 4 36 C11 34 18 31 24 27 C15 30 9 31 4 29 Z" fill="url(#mfSplashFeatherFill)"/><path d="M8 37 C28 30 49 20 81 7" fill="none" stroke="rgba(243,251,255,.95)" stroke-width="2.2" stroke-linecap="round"/></g><circle id="mf-splash-flare" cx="852" cy="236" r="1" fill="url(#mfSplashFlareGradient)" opacity="0"/>${featherMarkup('mf-splash-feather',0)}</svg></div><div class="mf-splash-vignette"></div>`;
return el
}
function cacheNodes(){
nodes={feather:root.querySelector('#mf-splash-feather'),logo:root.querySelector('#mf-splash-logo'),logoRing:root.querySelector('#mf-splash-logo-ring'),logoSwoop:root.querySelector('#mf-splash-logo-swoop'),wordClip:root.querySelector('#mf-splash-word-clip'),wordTrail:root.querySelector('#mf-splash-word-trail'),wordTrailGlow:root.querySelector('#mf-splash-word-trail-glow'),signature:root.querySelector('#mf-splash-signature'),flare:root.querySelector('#mf-splash-flare'),stars:root.querySelector('#mf-splash-stars')}
}
function samplePath(path,count=160){
const len=path.getTotalLength();
const arr=new Array(count+1);
for(let i=0;i<=count;i++){
const d=len*i/count;
const p=path.getPointAtLength(d);
const next=path.getPointAtLength(Math.min(len,d+2.5));
arr[i]={x:p.x,y:p.y,angle:Math.atan2(next.y-p.y,next.x-p.x)*180/Math.PI}
}
return arr
}
function sampleAt(samples,progress){
const p=clamp01(progress)*(samples.length-1);
const i=Math.floor(p);
const n=Math.min(samples.length-1,i+1);
const t=p-i;
const a=samples[i],b=samples[n];
let da=b.angle-a.angle;
if(da>180)da-=360;
if(da<-180)da+=360;
return{x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),angle:a.angle+da*t}
}
function setFeather(x,y,angle,scale=1,opacity=1){
const f=nodes?.feather;
if(!f)return;
f.setAttribute('transform',`translate(${x} ${y}) rotate(${angle}) scale(${scale})`);
f.setAttribute('opacity',String(clamp01(opacity)))
}
function removeRoot(){
if(root)root.remove();
if(style)style.remove();
root=null;style=null;nodes=null;trailSamples=null
}
function skip(){
if(!root)return;
if(performance.now()-startedAt<MIN_VISIBLE_MS)return;
playToken++;
cancelAnimationFrame(raf);
raf=0;
const current=Number(root.style.opacity||1);
const animation=root.animate([{opacity:current},{opacity:0}],{duration:140,easing:'ease-out',fill:'forwards'});
animation.finished.catch(()=>{}).finally(removeRoot)
}
function renderFrame(now,token){
if(!root||token!==playToken||destroyed)return;
if(now-lastFrameAt<FRAME_MS){raf=requestAnimationFrame(next=>renderFrame(next,token));return}
lastFrameAt=now;
const elapsed=now-startedAt;
const rootIn=segment(elapsed,0,240,easeOutCubic);
const rootOut=1-segment(elapsed,3230,TOTAL_MS,easeInOutCubic);
root.style.opacity=String(Math.min(rootIn,rootOut));
nodes.stars.setAttribute('opacity',String(.15+segment(elapsed,100,780,easeOutCubic)*.58));
const enterP=segment(elapsed,100,900,easeInOutCubic);
if(elapsed<930){
setFeather(lerp(88,394,enterP),lerp(310,194,enterP)-Math.sin(enterP*Math.PI)*88,lerp(-19,-7,enterP)-Math.sin(enterP*Math.PI)*19,lerp(.73,.86,enterP),segment(elapsed,80,300,easeOutCubic))
}
const swoopP=segment(elapsed,420,1120,easeInOutCubic);
nodes.logoSwoop.setAttribute('stroke-dashoffset',String(1-swoopP));
nodes.logoSwoop.setAttribute('opacity',String(swoopP*.72*(1-segment(elapsed,1280,1740,easeOutCubic))));
const logoP=segment(elapsed,610,1260,easeOutCubic);
const logoScale=lerp(.72,1,logoP);
nodes.logo.setAttribute('opacity',String(logoP));
nodes.logo.setAttribute('transform',`translate(316 195) scale(${logoScale}) translate(-316 -195)`);
nodes.logoRing.setAttribute('stroke-opacity',String(.2+.34*logoP));
const wordP=segment(elapsed,1040,2290,easeInOutCubic);
nodes.wordClip.setAttribute('width',String(500*wordP));
const wordOffset=1-wordP;
nodes.wordTrail.setAttribute('stroke-dashoffset',String(wordOffset));
nodes.wordTrailGlow.setAttribute('stroke-dashoffset',String(wordOffset));
nodes.wordTrail.setAttribute('opacity',wordP>0?'.82':'0');
nodes.wordTrailGlow.setAttribute('stroke-opacity',String(wordP>0?.12:0));
if(elapsed>=930&&elapsed<2460){
const p=sampleAt(trailSamples,Math.max(.01,wordP));
setFeather(p.x,p.y-Math.sin(wordP*Math.PI)*8,p.angle-10,lerp(.84,.65,wordP),1)
}
const signP=segment(elapsed,2220,2600,easeOutCubic);
nodes.signature.setAttribute('opacity',String(signP));
if(signP>0)nodes.signature.setAttribute('transform',`translate(860 154) rotate(${lerp(-34,-19,signP)}) scale(${lerp(.2,.52,signP)})`);
if(elapsed>=2440){
const exitP=segment(elapsed,2440,2820,easeInOutCubic);
setFeather(lerp(844,956,exitP),lerp(228,116,exitP),-44,lerp(.65,.47,exitP),1-segment(elapsed,2660,2860,easeOutCubic))
}
const flareP=segment(elapsed,2350,2520,easeOutCubic)*(1-segment(elapsed,2520,2780,easeOutCubic));
nodes.flare.setAttribute('opacity',String(flareP));
nodes.flare.setAttribute('r',String(lerp(2,18,flareP)));
if(elapsed>=TOTAL_MS){removeRoot();raf=0;return}
raf=requestAnimationFrame(next=>renderFrame(next,token))
}
function startAnimation(){
if(destroyed)return;
playToken++;
const token=playToken;
cancelAnimationFrame(raf);
removeRoot();
style=makeStyle();
root=makeRoot();
const parent=document.documentElement||document;
parent.appendChild(style);
parent.appendChild(root);
cacheNodes();
trailSamples=samplePath(nodes.wordTrail,140);
startedAt=performance.now();
lastFrameAt=0;
raf=requestAnimationFrame(now=>renderFrame(now,token))
}
function play({force=false}={}){
if(destroyed)return;
if(force){startAnimation();return}
try{chrome.storage.local.get(['settings'],data=>{if(destroyed)return;if(data?.settings?.startupAnimation===false)return;if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;startAnimation()})}catch(_){startAnimation()}
}
function destroy(){
if(destroyed)return;
destroyed=true;
playToken++;
cancelAnimationFrame(raf);
raf=0;
eventController.abort();
removeRoot();
if(globalThis.__MINIFEATHER_SPLASH__?.destroy===destroy)delete globalThis.__MINIFEATHER_SPLASH__
}
document.addEventListener('minifeather:splash-replay',()=>play({force:true}),{signal:eventController.signal});
window.addEventListener('keydown',event=>{if(event.code!=='Escape'||!root)return;event.preventDefault();event.stopImmediatePropagation();skip()},{capture:true,signal:eventController.signal});
try{chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||!changes.settings?.newValue)return;if(changes.settings.newValue.startupAnimation===false&&root)skip()})}catch(_){ }
globalThis.__MINIFEATHER_SPLASH__={play,skip,destroy};
play()
})();
