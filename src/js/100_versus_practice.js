// 100_versus_practice.js - local human-vs-AI Versus using the same battle action API
(function(){
"use strict";
const P={side:null,slots:6,bp:false,draft:null,lastAiAt:0,roomOpen:false};
const el=id=>document.getElementById(id);
const nav=()=>window.S7ScreenNav;
const show=id=>nav()?.show(id,{hideHome:false}) ?? el(id)?.classList.remove("hidden");
const hide=id=>nav()?.hide(id) ?? el(id)?.classList.add("hidden");
function pools(){const C=window.S7VersusBattle?.CARDS||{};return {plant:Object.keys(C.plant||{}),zombie:Object.keys(C.zombie||{})}}
function humanName(side){return side==="plant"?"你（植物）":"你（僵尸）"}
function aiName(side){return side==="plant"?"AI（植物）":"AI（僵尸）"}
function chooseSide(side){P.side=side;document.querySelectorAll('.versusPracticeSide').forEach(b=>b.classList.toggle('selected',b.dataset.side===side));refreshSummary()}
function refreshSummary(){const s=el('versusPracticeSummary');if(s)s.textContent=(P.side?`你玩${P.side==='plant'?'植物':'僵尸'} · AI玩${P.side==='plant'?'僵尸':'植物'} · `:'请选择阵营 · ')+`${P.slots}槽 · ${P.bp?'有BP':'No-BP'} · 75/75开局 · 40:00平局`;document.querySelectorAll('[data-slots]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.slots)===P.slots));document.querySelectorAll('[data-bp]').forEach(b=>b.classList.toggle('selected',(b.dataset.bp==='1')===P.bp))}
function buildSteps(){const picks=P.slots-1;if(P.bp&&window.S7VersusBP?.buildPhases){return window.S7VersusBP.buildPhases(P.slots===7).map(ph=>({side:ph.actor,kind:ph.action,target:ph.targetSide}))}const steps=[];for(let i=0;i<picks;i++){steps.push({side:'zombie',kind:'pick',target:'zombie'});steps.push({side:'plant',kind:'pick',target:'plant'})}return steps}
function startDraft(){if(!P.side){alert('请先选择植物或僵尸');return}const ps=pools();P.draft={steps:buildSteps(),i:0,picks:{plant:[],zombie:[]},bans:{plant:[],zombie:[]},pool:ps};hide('versusPracticeSetupScreen');show('versusPracticeDraftScreen');renderDraft();advanceAi()}
function current(){return P.draft?.steps[P.draft.i]||null}
function unavailable(id){const d=P.draft;return d.picks.plant.includes(id)||d.picks.zombie.includes(id)||d.bans.plant.includes(id)||d.bans.zombie.includes(id)}
function autoChoice(side,kind){const d=P.draft;const own=d.pool[side].filter(x=>!unavailable(x));if(!own.length)return null;if(window.S7VersusAI?.draftChoice)return window.S7VersusAI.draftChoice(side,kind,d.pool,id=>unavailable(id),{picks:d.picks,bans:d.bans,step:d.i});return own[(d.i*7+(side==='plant'?3:1))%own.length]}
function act(id){const st=current();if(!st||unavailable(id))return;if(st.kind==='pick'&&!P.draft.pool[st.side].includes(id))return;if(st.kind==='ban'){const other=st.side==='zombie'?'plant':'zombie';if(!P.draft.pool[other].includes(id))return;P.draft.bans[other].push(id)}else P.draft.picks[st.side].push(id);P.draft.i++;renderDraft();advanceAi()}
function advanceAi(){const st=current();if(!st){finishDraft();return}if(st.side===P.side)return;setTimeout(()=>{const targetSide=st.target||(st.kind==='ban'?(st.side==='zombie'?'plant':'zombie'):st.side);const id=autoChoice(targetSide,st.kind);if(id)act(id);else{P.draft.i++;renderDraft();advanceAi()}},140)}
function chips(side){return P.draft.picks[side].map(id=>`<span class="versusPickChip">${window.S7VersusBattle.cardName(side,id)}</span>`).join('')||'<span class="versusPickChip">待选择</span>'}
function renderDraft(){const d=P.draft,st=current(),total=d.steps.length;el('versusPracticeDraftProgress').textContent=`${d.i} / ${total}`;el('versusPracticeDraftRuleBadge').textContent=`${P.slots}槽 · ${P.bp?'有BP':'No-BP'}`;el('versusPracticeZombieOwner').textContent=P.side==='zombie'?humanName('zombie'):aiName('zombie');el('versusPracticePlantOwner').textContent=P.side==='plant'?humanName('plant'):aiName('plant');el('versusPracticeZombiePicks').innerHTML=chips('zombie');el('versusPracticePlantPicks').innerHTML=chips('plant');el('versusPracticeZombieBans').textContent='被Ban：'+(d.bans.zombie.map(x=>window.S7VersusBattle.cardName('zombie',x)).join('、')||'无');el('versusPracticePlantBans').textContent='被Ban：'+(d.bans.plant.map(x=>window.S7VersusBattle.cardName('plant',x)).join('、')||'无');const turn=el('versusPracticeTurn'),ins=el('versusPracticeInstruction');if(!st){turn.innerHTML='<small>选卡完成</small><strong>可以开战</strong><span>双方卡组已锁定</span>';ins.textContent='选卡完成';return}const isHuman=st.side===P.side;turn.innerHTML=`<small>${st.kind==='ban'?'BAN':'PICK'}</small><strong>${st.side==='zombie'?'🧟 僵尸方':'🌱 植物方'}${isHuman?'（你）':'（AI）'}</strong><span>${isHuman?'轮到你操作':'AI 正在选择'}</span>`;ins.textContent=isHuman?`轮到你 ${st.kind==='ban'?'Ban 对方1张卡':'Pick 1张自己的卡'}`:'AI 回合自动完成';const targetSide=st.target||(st.kind==='ban'?(st.side==='zombie'?'plant':'zombie'):st.side);const grid=el('versusPracticeCardGrid');grid.innerHTML=P.draft.pool[targetSide].map(id=>{const c=window.S7VersusBattle.cfg(targetSide,id),dis=unavailable(id);return `<button class="versusDraftCard ${dis?'disabled':''}" data-id="${id}"><b>${window.S7VersusBattle.cardName(targetSide,id)}</b><span>${c?.cost??'-'} ${targetSide==='plant'?'阳光':'脑光'}</span><small>CD ${c?.cd??'-'}s${c?.guaranteed?` · 100%变种 ${c.guaranteed}`:''}</small></button>`}).join('');grid.querySelectorAll('.versusDraftCard').forEach(b=>b.onclick=()=>{if(isHuman)act(b.dataset.id)})}
function finishDraft(){renderDraft();el('versusPracticeStartBattleBtn')?.classList.remove('hidden')}
function startBattle(){const d=P.draft;if(!d)return;hide('versusPracticeDraftScreen');nav()?.hideHome();P.lastAiAt=0;window.S7VersusBattle.start({mode:'practice',humanSide:P.side,plantCards:d.picks.plant,zombieCards:d.picks.zombie,online:false,isHost:true});}
function aiTick(){const B=window.S7VersusBattle?.state;if(!B?.active||B.mode!=='practice'||B.versus?.phase!=='battle')return;const ai=P.side==='plant'?'zombie':'plant';if(state.time-P.lastAiAt<1.0)return;P.lastAiAt=state.time;window.S7VersusAI?.decide(ai,window.S7VersusBattle)}
function canvasPointer(ev){
 const B=window.S7VersusBattle?.state;if(!B?.active||B.mode!=='practice')return;
 const rect=canvas.getBoundingClientRect(),side=P.side;if(!side)return;
 const px=(ev.clientX-rect.left)/Math.max(1,rect.width)*innerWidth,py=(ev.clientY-rect.top)/Math.max(1,rect.height)*innerHeight;
 if(window.S7VersusBattle.handleHudPointer?.(side,px,py,innerWidth,innerHeight))return;
 const insideBoard=px>=layout.x&&px<=layout.x+layout.w&&py>=layout.y&&py<=layout.y+layout.cell*5;if(!insideBoard)return;
 if(side==='plant'&&B.shovelMode){const row=Math.max(0,Math.min(4,Math.floor((py-layout.y)/layout.cell))),col=Math.max(0,Math.min(8,Math.floor((px-layout.x)/layout.cell)));window.S7VersusBattle.performAction({type:'shovel',side:'plant',row,col});B.shovelMode=false;return}
 const a=window.S7VersusBattle.actionFromPointer(side,ev.clientX,ev.clientY,rect);window.S7VersusBattle.performAction(a)
}
function open(){nav()?.hideHome();hide('versusPracticeSetupScreen');show('versusPracticeEntryScreen')}
function createRoom(){P.roomOpen=true;P.side=null;P.slots=6;P.bp=false;P.draft=null;hide('versusPracticeEntryScreen');show('versusPracticeSetupScreen');refreshSummary()}
function closeRoom(){P.roomOpen=false;P.draft=null;hide('versusPracticeSetupScreen');show('versusPracticeEntryScreen')}
function backHome(){P.roomOpen=false;P.draft=null;hide('versusPracticeEntryScreen');hide('versusPracticeSetupScreen');nav()?.showHome()}
function exit(){location.reload()}
window.S7VersusPractice={open,aiTick,createRoom};
function bindControls(){
  el('versusPracticeCreateRoomBtn')?.addEventListener('click',createRoom);
  el('versusPracticeEntryBackBtn')?.addEventListener('click',backHome);
  document.querySelectorAll('.versusPracticeSide').forEach(b=>b.addEventListener('click',()=>chooseSide(b.dataset.side)));
  document.querySelectorAll('#versusPracticeSetupScreen [data-slots]').forEach(b=>b.addEventListener('click',()=>{P.slots=Number(b.dataset.slots);refreshSummary()}));
  document.querySelectorAll('#versusPracticeSetupScreen [data-bp]').forEach(b=>b.addEventListener('click',()=>{P.bp=b.dataset.bp==='1';refreshSummary()}));
  el('versusPracticeBeginBtn')?.addEventListener('click',startDraft);
  el('versusPracticeBackBtn')?.addEventListener('click',closeRoom);
  el('versusPracticeCancelDraftBtn')?.addEventListener('click',()=>{hide('versusPracticeDraftScreen');show('versusPracticeSetupScreen')});
  el('versusPracticeStartBattleBtn')?.addEventListener('click',startBattle);
  if(typeof canvas!=='undefined')canvas?.addEventListener('pointerdown',canvasPointer);
  el('versusResultRematchBtn')?.addEventListener('click',()=>{if(window.S7VersusBattle?.state?.mode!=='practice')return;hide('versusResultOverlay');hide('game');P.roomOpen=true;show('versusPracticeSetupScreen')});
  el('versusResultExitBtn')?.addEventListener('click',exit);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindControls,{once:true});else bindControls();
})();
