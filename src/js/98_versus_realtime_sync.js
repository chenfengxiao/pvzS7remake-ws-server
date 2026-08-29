// 98_versus_realtime_sync.js - 双端本地模拟 + 操作同步（lockstep 风格，不再传输画面图像）
// 两端各自运行完整战斗模拟（与人机模式同一套），只互相转发"影响战局的操作"：
//   play（放置单位）/ shovel（铲除）。选卡、变种开关等纯本地 UI 状态不参与同步。
(function(){
"use strict";
const R={mode:null,side:null,inputSeq:0,lastRemoteSeq:0,probeTimer:0,probeMap:new Map(),probeMiss:0,applying:false};
const $=id=>document.getElementById(String(id).replace(/^#/,'')),send=o=>window.s7WSSend?.(o),gameCanvas=()=>document.getElementById('canvas');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function meter(cs){
 const m=$('versusLatencyBadge'),t=$('versusLatencyBadgeText');
 if(!m||!t)return;
 t.textContent=Number.isFinite(cs)?`${Math.round(cs)} cs`:'-- cs';
 const bad=cs>=30,warn=cs>=15&&cs<30;
 m.classList.toggle('warn',!!warn);m.classList.toggle('bad',bad);
}
function showLatency(on){$('versusLatencyBadge')?.classList.toggle('hidden',!on)}
function warnNoSync(on){$('versusSyncWarning')?.classList.toggle('hidden',!on)}
function roleText(side,host){$('#versusRealtimeRole').textContent=`${side==='plant'?'🌱 植物方':'🧟 僵尸方'} · ${host?'房主':'房客'}`;$('#versusRealtimeAuthority').textContent='双方各自本地计算战斗 · 只同步操作'}

// 只有这些操作会改变战局，需要同步给对手
function isSyncable(action){return !!action&&(action.type==='play'||action.type==='shovel')}
// 本地执行 + 同步给对手；remote=true 时只本地执行，不再回发（避免回环）
function rawPerform(action){
 const api=window.S7VersusBattle;
 const fn=api?.__s7OrigPerformAction||api?.performAction;
 if(typeof fn!=='function')return null;
 try{return fn.call(api,action)}catch(_){return null}
}
function doAction(action,remote){
 if(!action||!window.S7VersusBattle?.state?.active)return null;
 let r=rawPerform(action);
 if(!remote&&isSyncable(action))send({type:'versusInput',seq:++R.inputSeq,action});
 return r;
}
// 包装 performAction：拦截"外部直接调用"的同步类操作，自动发给对手；
// doAction 内部走 __s7OrigPerformAction，避免回调造成递归。
function installActionHook(){
 const api=window.S7VersusBattle;
 if(!api||typeof api.performAction!=='function'||api.__s7SyncHooked)return;
 api.__s7SyncHooked=true;
 const orig=api.performAction;
 api.__s7OrigPerformAction=orig;
 api.performAction=function(action){
   if(R.applying||!isSyncable(action))return orig.apply(this,arguments);
   return doAction(action,false);
 };
}
function startHost(side){stop();R.mode='host';R.side=side;roleText(side,true);installActionHook();showLatency(true);warnNoSync(false);R.probeTimer=setInterval(probe,1000);probe()}
function startGuest(side){stop();R.mode='guest';R.side=side;R.inputSeq=0;R.lastRemoteSeq=0;roleText(side,false);installActionHook();showLatency(true);warnNoSync(false);R.probeTimer=setInterval(probe,1000);probe()}
function probe(){
 if(!R.mode)return;
 const id=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
 R.probeMap.set(id,performance.now());
 send({type:'versusProbe',probeId:id,sentAt:Date.now()});
 // 超时未回：累计失败，提示服务器可能未更新（不支持双向转发/探测）
 setTimeout(()=>{
   if(!R.probeMap.has(id))return;         // 已收到回包
   R.probeMap.delete(id);
   R.probeMiss=(R.probeMiss||0)+1;
   if(R.probeMiss>=3){meter(NaN);warnNoSync(true)}
 },2500);
}
function stop(){if(R.probeTimer)clearInterval(R.probeTimer);R.probeTimer=0;R.mode=null;R.side=null;R.probeMap.clear();R.probeMiss=0;showLatency(false);warnNoSync(false)}

// 本地指针操作：先交 HUD（选卡/铲子/变种按钮），否则按棋盘落子
function localPointer(ev){
 if(!R.mode||!R.side)return;
 if(!window.S7VersusBattle?.state?.active)return;
 const side=R.side,px=ev.clientX,py=ev.clientY;
 if(window.S7VersusBattle.handleHudPointer?.(side,px,py,innerWidth,innerHeight))return;
 const c=gameCanvas();if(!c)return;const rect=c.getBoundingClientRect();
 const nx=(px-rect.left)/rect.width,ny=(py-rect.top)/rect.height;
 if(side==='plant'&&window.S7VersusBattle.state.shovelMode){
   const gy=ny,gx=nx;
   const row=clamp(Math.floor((gy-(layout.y/innerHeight))/(layout.cell/innerHeight)),0,4);
   const col=clamp(Math.floor((gx-(layout.x/innerWidth))/(layout.cell/innerWidth)),0,8);
   doAction({type:'shovel',side:'plant',row,col},false);
   window.S7VersusBattle.state.shovelMode=false;return;
 }
 const act=window.S7VersusBattle.actionFromPointer(side,px,py,rect);
 // 同步坐标：僵尸落点 x 用格子精度，避免两端浮点差异
 if(act&&act.type==='play'&&act.side==='zombie'&&Number.isFinite(act.x))act.x=Math.round(act.x*1000)/1000;
 doAction(act,false);
}
function handle(m){
 if(!m)return;
 if(m.type==='versusRemoteInput'){
   const seq=Number(m.seq)||0;
   if(seq<=R.lastRemoteSeq)return;          // 去重/乱序保护
   R.lastRemoteSeq=seq;
   const a=m.action;
   if(a&&isSyncable(a))doAction(a,true);    // 只接受战局操作，本地执行、不回发
   return;
 }
 // 任何一方收到对方的探测都要回应，这样两端都能测出往返延迟
 if(m.type==='versusProbeToHost'){send({type:'versusProbeAck',to:m.from,probeId:m.probeId,sentAt:m.sentAt});return}
 if(m.type==='versusProbeAck'){const t=R.probeMap.get(m.probeId);if(t!=null){R.probeMap.delete(m.probeId);R.probeMiss=0;warnNoSync(false);meter((performance.now()-t)/10)}return}
 if(m.type==='versusEnded'){stop();return}
 if(m.type==='disconnected'||m.type==='reconnecting')$('versusConnectionNotice')?.classList.remove('hidden');
}
document.addEventListener('DOMContentLoaded',()=>{
 gameCanvas()?.addEventListener('pointerdown',ev=>{if(!R.mode)return;localPointer(ev)});
 window.s7WSOn?.('message',handle);
 window.s7WSOn?.('disconnected',()=>{$('versusConnectionNotice')?.classList.remove('hidden')});
 window.s7WSOn?.('connected',()=>{$('versusConnectionNotice')?.classList.add('hidden')});
});
window.S7VersusRealtime={startHost,startGuest,stop,handle,doAction,getMode:()=>R.mode};
})();
