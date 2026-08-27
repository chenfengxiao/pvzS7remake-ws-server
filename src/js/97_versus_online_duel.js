// 97_versus_online_duel.js - host-authoritative realtime 1v1 Versus over the shared multiplayer transports
(function(){
"use strict";
const O={room:null,playerId:null,host:false,side:null,entry:null,pendingEntry:null};
const $=id=>document.getElementById(id);
const nav=()=>window.S7ScreenNav;
const show=id=>nav()?.show(id,{hideHome:false}) ?? $(id)?.classList.remove('hidden');
const hide=id=>nav()?.hide(id) ?? $(id)?.classList.add('hidden');
const send=o=>window.s7WSSend?.(o);

function gameVersion(){
  return String(window.s7GetGameVersion?.()||"1.7.8");
}
function transportStatus(text,kind){
  const el=$("versusTransportStatus");
  if(!el)return;
  el.textContent=text||"";
  el.dataset.state=kind||"idle";
}
function setEntryBusy(busy,label){
  const d=$("versusOnlineEntryScreen");
  if(!d)return;
  const createBtn=d.querySelector("#versusCreateRoomBtn"),joinBtn=d.querySelector("#versusJoinRoomBtn"),roomInput=d.querySelector("#versusJoinRoomId"),nickInput=d.querySelector("#versusNick");
  if(createBtn){createBtn.disabled=!!busy;createBtn.textContent=busy&&O.pendingEntry?.kind==='create'?(label||'处理中…'):'创建房间'}
  if(joinBtn){joinBtn.disabled=!!busy;joinBtn.textContent=busy&&O.pendingEntry?.kind==='join'?(label||'处理中…'):'加入房间'}
  if(roomInput)roomInput.disabled=!!busy;
  if(nickInput)nickInput.disabled=!!busy;
}
function clearEntryPending(){
  if(O.pendingEntry?.timer)clearTimeout(O.pendingEntry.timer);
  O.pendingEntry=null;
  setEntryBusy(false);
}
function failEntry(message){
  clearEntryPending();
  transportStatus('❌ '+String(message||'操作失败'),'error');
}
function parseVersion(v){
  const m=String(v||'').match(/(\d+)\.(\d+)\.(\d+)/);return m?[Number(m[1]),Number(m[2]),Number(m[3])]:null;
}
function versionAtLeast(v,min){
  const a=parseVersion(v),b=parseVersion(min);if(!a||!b)return false;
  for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false}return true;
}
function verifyVersusBackend(){
  const sid=String(window.s7GetSelectedMultiplayerServer?.()||'1');
  if(sid!=='2'||window.s7GetHomeServerTransportMode?.()==='direct')return true;
  const dbg=window.s7GetHomeTunnelDiagnostics?.()||{};
  const serverVersion=String(dbg.serverVersion||'');
  if(serverVersion&&!versionAtLeast(serverVersion,'1.7.8')){
    failEntry(`2服家庭后端仍是 v${serverVersion}，不支持当前双人 Versus 房间协议。请在本 v1.7.8 包中双击“2服_安装自动守护.command”（或“2服_重启.command”）升级后端后再试。`);
    return false;
  }
  return true;
}
function beginEntryAction(kind,d){
  if(O.pendingEntry)return;
  d=d||ensureEntry();
  const nickInput=d.querySelector('#versusNick'),roomInput=d.querySelector('#versusJoinRoomId');
  const nick=String(nickInput?.value||'').trim();
  const roomId=String(roomInput?.value||'').trim().toUpperCase();
  if(!nick){failEntry('请先填写昵称');return}
  if(kind==='join'&&!roomId){failEntry('请输入房间号');return}
  O.pendingEntry={kind,timer:null};
  setEntryBusy(true,'连接中…');
  transportStatus(`正在连接${window.s7GetSelectedMultiplayerServer?.()||'1'}服…`,'connecting');
  connectThen(()=>{
    if(!O.pendingEntry||!verifyVersusBackend())return;
    setEntryBusy(true,kind==='create'?'创建中…':'加入中…');
    transportStatus(kind==='create'?'服务器已连接，正在创建双人房间…':'服务器已连接，正在加入双人房间…','connecting');
    const ok=kind==='create'
      ? send({type:'createVersusRoom',nick,ver:gameVersion()})
      : send({type:'joinVersusRoom',roomId,nick,ver:gameVersion()});
    if(!ok){failEntry('服务器连接状态异常，房间命令未发送；请返回重新选择服务器后再试。');return}
    O.pendingEntry.timer=setTimeout(()=>{
      const sid=String(window.s7GetSelectedMultiplayerServer?.()||'1');
      failEntry(sid==='2'
        ? '2服已连接，但家庭后端没有响应双人房间命令。最常见原因是自动守护仍在运行旧版 server.js；请在当前 v1.7.8 包中双击“2服_安装自动守护.command”升级并重启2服。'
        : '服务器已连接，但没有响应双人房间命令；请检查服务器是否已更新到 v1.7.8。');
    },5000);
  },err=>failEntry(err?.message||err||'连接服务器失败'));
}
function bindEntry(d){
  if(!d)return false;
  if(d.dataset.s7VersusBound==="1")return true;
  const createBtn=d.querySelector("#versusCreateRoomBtn");
  const joinBtn=d.querySelector("#versusJoinRoomBtn");
  const backBtn=d.querySelector("#versusEntryBackBtn");
  const nickInput=d.querySelector("#versusNick");
  const roomInput=d.querySelector("#versusJoinRoomId");
  if(!createBtn||!joinBtn||!backBtn||!nickInput||!roomInput){
    console.error("[S7 Versus] static entry DOM incomplete");
    return false;
  }
  createBtn.addEventListener("click",()=>beginEntryAction('create',d));
  joinBtn.addEventListener("click",()=>beginEntryAction('join',d));
  backBtn.addEventListener("click",()=>{
    clearEntryPending();
    hide("versusOnlineEntryScreen");
    window.s7ReturnVersusEntryToServerSelect?.();
  });
  d.dataset.s7VersusBound="1";
  return true;
}
function ensureEntry(){
  const d=$("versusOnlineEntryScreen");
  if(!d)throw new Error("双人对战入口页面缺失，请使用完整 v1.7.8 包");
  O.entry=d;
  if(!bindEntry(d))throw new Error("双人对战入口控件不完整");
  return d;
}

function connectThen(fn,onFail){
  const sid=window.s7GetSelectedMultiplayerServer?.()||"1";
  const fail=(err)=>{try{onFail?.(err)}catch(_){}};
  if(sid==="3"){
    const e=new Error("双人 Versus 实时图像同步目前只支持 1服 / 2服。");
    transportStatus("❌ "+e.message,"error");fail(e);return;
  }
  const homeTunnel=sid==="2"&&window.s7GetHomeServerTransportMode?.()!=="direct";
  if(window.s7WSConnected?.()){
    if(homeTunnel)transportStatus("✅ 2服已打通：浏览器 → MQTT/WSS 中转 → 家庭权威服。","connected");
    else if(sid==="2")transportStatus("⚠️ 当前2服使用旧 IPv6 直连备用链路，不是 MQTT 反向隧道。","direct");
    else transportStatus("✅ 1服已连接。","connected");
    fn();return;
  }
  transportStatus(homeTunnel?"正在连接2服 MQTT/WSS 中转，并等待家庭权威服 welcome 握手…":"正在连接服务器…","connecting");
  let done=false,timer=null,offConnected=null,offError=null;
  const finish=()=>{offConnected?.();offError?.();if(timer)clearTimeout(timer);timer=null;};
  offConnected=window.s7WSOn?.("connected",()=>{
    if(done)return;done=true;finish();
    if(homeTunnel)transportStatus("✅ 2服反向隧道已打通：浏览器 → MQTT/WSS 中转 → 家庭权威服（已收到加密 welcome）。","connected");
    else if(sid==="2")transportStatus("⚠️ 2服已连接，但当前是旧 IPv6 直连备用模式。","direct");
    else transportStatus("✅ 服务器已连接。","connected");
    fn();
  });
  offError=window.s7WSOn?.("error",err=>{
    if(done)return;done=true;finish();
    const msg=err?.message||"连接错误";
    transportStatus("❌ "+msg,"error");fail(err||new Error(msg));
  });
  window.s7WSConnect?.();
  timer=setTimeout(()=>{
    if(done)return;
    if(window.s7WSConnected?.()){done=true;finish();fn();return}
    done=true;finish();
    const dbg=window.s7GetHomeTunnelDiagnostics?.();
    let msg;
    if(homeTunnel&&dbg?.brokerConnected&&dbg?.serverOnline)msg="MQTT中转已连接且家庭服状态在线，但客户端尚未收到 welcome；请重试。";
    else if(homeTunnel&&dbg?.brokerConnected)msg="MQTT中转已连接，但家庭权威服未完成 welcome 握手。请确认 iMac 的2服守护进程已启动。";
    else msg="联机服务器尚未连接，请检查网络或返回切换 1服 / 2服。";
    transportStatus("❌ "+msg,"error");fail(new Error(msg));
  },9500);
}
function showEntryForSelectedServer(cfg){
  nav()?.hideHome();
  ensureEntry();
  const sid=String(cfg?.id||window.s7GetSelectedMultiplayerServer?.()||'1');
  const name=cfg?.name||({1:'Railway 外服',2:'家庭服'}[sid]||'联机服务器');
  const tag=$('versusSelectedServerTag');
  if(tag)tag.textContent=`真人 1v1 · ${sid}服 · ${name}`;
  const summary=$('versusServerEntrySummary');
  if(summary)summary.textContent=`当前线路：${sid}服 · ${name}。房主承担全部战斗计算；房客接收房主画面并回传操作。`;
  if(sid==="2"&&window.s7GetHomeServerTransportMode?.()==="direct") transportStatus("⚠️ 当前浏览器保存的是旧 IPv6 直连备用模式；这不是 MQTT 反向隧道。可在控制台执行 s7SetHomeServerTransportMode('tunnel') 切回。","direct");
  else if(sid==="2") transportStatus("2服将于创建/加入房间时验证：MQTT Broker → 家庭 iMac retained 状态 → 加密 welcome 握手。","idle");
  else transportStatus("尚未连接1服；创建/加入房间时建立连接。","idle");
  show('versusOnlineEntryScreen');
}

function open(){
  // The public multiplayer selector owns home hiding, server lock acquisition and transport selection.
  window.s7ShowServerSelect?.('versus');
}
function roomPlayers(){return O.room?.players||[]}
function nick(pid){return roomPlayers().find(p=>p.id===pid)?.nick||'未被抢占'}
function esc(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function selectedServerInfo(){
  const sid=String(window.s7GetSelectedMultiplayerServer?.()||'1');
  const cfg=(window.s7GetMultiplayerServers?.()||[]).find(x=>String(x.id)===sid);
  return {id:sid,name:cfg?.name||({1:'Railway 外服',2:'家庭服'}[sid]||'联机服务器'),transport:cfg?.transport||''};
}
function sideOf(pid,v){if(!pid)return null;if(v?.sides?.plant===pid)return 'plant';if(v?.sides?.zombie===pid)return 'zombie';return null}
function setHostOnlyControls(host){
  ['versusSlots6Btn','versusSlots7Btn','versusNoBpBtn','versusBpBtn','versusSwapSidesBtn'].forEach(id=>{const b=$(id);if(b)b.disabled=!host});
  const cfg=$('versusRuleConfigurator');
  if(cfg){cfg.style.pointerEvents=host?'auto':'none';cfg.style.opacity=host?'1':'.65'}
  const hint=$('versusConfigHint');
  if(hint)hint.textContent=host?'你是房主，可调整本房间规则':'仅房主可调整；你的界面会实时同步配置';
}
function renderVersusPlayers(){
  const list=$('versusRoomPlayerList');
  if(!list)return;
  const r=O.room,v=r?.versus||{},players=roomPlayers();
  list.innerHTML='';
  players.forEach(p=>{
    const row=document.createElement('div');
    row.className='versusRoomPlayer'+(p.id===r.hostId?' isHost':'')+(p.id===O.playerId?' isSelf':'');
    const side=sideOf(p.id,v);
    const sideText=side==='plant'?'🌱 植物':side==='zombie'?'🧟 僵尸':'未选阵营';
    const conn=p.connected===false?'offline':'online';
    row.innerHTML=`<span class="versusPlayerConnection ${conn}" title="${conn==='online'?'已连接':'已断线'}"></span>`+
      `<span class="versusPlayerIdentity"><strong>${p.id===r.hostId?'👑 ':''}${esc(p.nick||p.id)}${p.id===O.playerId?'（你）':''}</strong><small>${p.connected===false?'连接中断，等待重连':'已连接到房间'}</small></span>`+
      `<span class="versusPlayerSideBadge ${side||''}">${sideText}</span>`;
    if(O.host&&p.id!==O.playerId){
      const kick=document.createElement('button');
      kick.type='button';kick.className='danger versusKickBtn';kick.textContent='踢出';
      kick.addEventListener('click',()=>{if(confirm(`确定把「${p.nick||p.id}」踢出房间吗？`))send({type:'kick',playerId:p.id})});
      row.appendChild(kick);
    }
    list.appendChild(row);
  });
  if(players.length<2){
    const wait=document.createElement('div');wait.className='versusRoomPlayer versusWaitingPlayer';
    wait.innerHTML='<span class="versusPlayerConnection"></span><span class="versusPlayerIdentity"><strong>等待第 2 位玩家加入…</strong><small>把上方房间号发给对方即可</small></span><span class="versusPlayerSideBadge">空位</span>';
    list.appendChild(wait);
  }
  const kickHint=$('versusKickHint');
  if(kickHint)kickHint.textContent=O.host?(players.length>1?'房主可直接踢出其他玩家':'等待其他玩家加入后可在此踢人'):'只有房主可以踢人';
}
function updateStartDraftButton(plant,zombie){
  const b=$('versusRoomStartDraftBtn');if(!b)return;
  const count=roomPlayers().filter(p=>!p.isSpectator).length;
  let label='开始选卡',disabled=false;
  if(!O.host){label='等待房主开始';disabled=true}
  else if(count<2){label='等待第2位玩家';disabled=true}
  else if(!plant||!zombie){label='请双方先选择阵营';disabled=true}
  b.textContent=label;b.disabled=disabled;
}
function restoreClassicRoomChrome(){
  const classicControls=$('roomHostControls');if(classicControls)classicControls.style.display='';
  const classicStart=$('roomStartGameBtn');if(classicStart)classicStart.style.display='';
  const classicLeave=$('roomLeaveBtn');if(classicLeave)classicLeave.style.display='';
  const classicPlayers=$('roomScreenPlayerList');if(classicPlayers)classicPlayers.style.display='';
}
function exitVersusRoom(message){
  hide('roomScreen');hide('versusOnlineDraftScreen');hide('versusRealtimeScreen');hide('versusRoomPanel');
  restoreClassicRoomChrome();
  O.room=null;O.playerId=null;O.host=false;O.side=null;
  if(message){const toast=document.getElementById('lobbyToast');if(toast){toast.textContent=message;toast.style.opacity='1'}else alert(message)}
  try{showEntryForSelectedServer()}catch(_){window.s7ShowServerSelect?.('versus')}
}
function leaveVersusRoom(){if(!O.room)return;send({type:'leaveRoom'});exitVersusRoom()}
function renderRoom(){
  const r=O.room;
  if(!r||r.kind!=='versus')return;
  hide('versusOnlineEntryScreen');hide('versusOnlineDraftScreen');
  show('roomScreen');show('versusRoomPanel');
  O.playerId=window.s7WSPlayerId?.()||O.playerId;
  O.host=r.hostId===O.playerId;
  O.side=sideOf(O.playerId,r.versus);
  const plant=r.versus?.sides?.plant,zombie=r.versus?.sides?.zombie;
  const v=r.versus||{},server=selectedServerInfo(),players=roomPlayers().filter(p=>!p.isSpectator);
  const hostPlayer=roomPlayers().find(p=>p.id===r.hostId);

  if($('#roomIdDisplay'))$('#roomIdDisplay').textContent=r.id;
  if($('#roomHostDisplay'))$('#roomHostDisplay').textContent='房主: '+(hostPlayer?.nick||'?');
  if($('#roomModeDisplay'))$('#roomModeDisplay').textContent='模式: 双人 Versus';
  if($('#roomMaxPlayersDisplay'))$('#roomMaxPlayersDisplay').textContent=`人数: ${players.length}/2`;
  if($('#versusRoomServerLabel'))$('#versusRoomServerLabel').textContent=`${server.id}服 · ${server.name}`;
  if($('#versusRoomHostLabel'))$('#versusRoomHostLabel').textContent=hostPlayer?.nick||'?';
  if($('#versusRoomCountLabel'))$('#versusRoomCountLabel').textContent=`${players.length} / 2`;
  if($('#versusRoomStateLabel'))$('#versusRoomStateLabel').textContent=players.length<2?'等待玩家':(!plant||!zombie?'等待选择阵营':'可开始选卡');

  if($('#versusPlantPlayer'))$('#versusPlantPlayer').textContent=plant?nick(plant):'未被抢占';
  if($('#versusZombiePlayer'))$('#versusZombiePlayer').textContent=zombie?nick(zombie):'未被抢占';
  $('#versusPlantSideCard')?.classList.toggle('claimed',!!plant);
  $('#versusZombieSideCard')?.classList.toggle('claimed',!!zombie);
  if($('#versusPlantClaimText'))$('#versusPlantClaimText').textContent=plant===O.playerId?'你是植物':plant?'已被抢':'抢植物';
  if($('#versusZombieClaimText'))$('#versusZombieClaimText').textContent=zombie===O.playerId?'你是僵尸':zombie?'已被抢':'抢僵尸';
  $('#versusSlots6Btn')?.classList.toggle('selected',v.slots!==7);
  $('#versusSlots7Btn')?.classList.toggle('selected',v.slots===7);
  $('#versusNoBpBtn')?.classList.toggle('selected',!v.bp);
  $('#versusBpBtn')?.classList.toggle('selected',!!v.bp);
  setHostOnlyControls(O.host);
  if($('#versusSwapSidesBtn'))$('#versusSwapSidesBtn').style.display=O.host&&plant&&zombie?'inline-block':'none';
  if($('#versusRoomRulesText'))$('#versusRoomRulesText').innerHTML=`<b>本局规则：</b>${v.slots||6}槽 · ${v.bp?'有BP':'No-BP'} · 75/75开局 · 40:00未决平局。`;
  renderVersusPlayers();
  updateStartDraftButton(plant,zombie);

  // Versus has its own room-management lobby. Never expose classic room controls here.
  const classicControls=$('roomHostControls');if(classicControls)classicControls.style.display='none';
  const classicStart=$('roomStartGameBtn');if(classicStart)classicStart.style.display='none';
  const classicLeave=$('roomLeaveBtn');if(classicLeave)classicLeave.style.display='none';
  const classicPlayers=$('roomScreenPlayerList');if(classicPlayers)classicPlayers.style.display='none';
}
function draftStep(v){const picks=(v.slots||6)-1,banSteps=v.bp?10:0,total=banSteps+picks*2,step=v.step||0;if(step>=total)return {done:true,total};if(step<banSteps)return {side:step%2===0?'zombie':'plant',kind:'ban',target:step%2===0?'plant':'zombie',total};const j=step-banSteps,side=j%2===0?'zombie':'plant';return {side,kind:'pick',target:side,total}}
function used(v,id){return [...(v.picks?.plant||[]),...(v.picks?.zombie||[]),...(v.bans?.plant||[]),...(v.bans?.zombie||[])].includes(id)}
function renderDraft(){const r=O.room,v=r?.versus;if(!r||!v)return;hide('roomScreen');show('versusOnlineDraftScreen');const st=draftStep(v);$('#versusDraftProgress').textContent=`${v.step||0} / ${st.total||0}`;$('#versusDraftRuleBadge').textContent=`${v.slots||6}槽 · ${v.bp?'有BP':'No-BP'} · 僵尸先手`;$('#versusDraftZombieName').textContent=nick(v.sides.zombie);$('#versusDraftPlantName').textContent=nick(v.sides.plant);const chip=(side)=>(v.picks?.[side]||[]).map(id=>`<span class="versusPickChip">${window.S7VersusBattle.cardName(side,id)}</span>`).join('')||'<span class="versusPickChip">待选择</span>';$('#versusZombiePickSlots').innerHTML=chip('zombie');$('#versusPlantPickSlots').innerHTML=chip('plant');$('#versusZombieBanLine').textContent='被Ban：'+((v.bans?.zombie||[]).map(id=>window.S7VersusBattle.cardName('zombie',id)).join('、')||'无');$('#versusPlantBanLine').textContent='被Ban：'+((v.bans?.plant||[]).map(id=>window.S7VersusBattle.cardName('plant',id)).join('、')||'无');if(st.done){$('#versusDraftTurnBanner').innerHTML='<small>选卡完成</small><strong>双方卡组已锁定</strong><span>等待房主开始</span>';$('#versusDraftInstruction').textContent='选卡完成';$('#versusOnlineCardGrid').innerHTML='';$('#versusDraftStartBattleBtn').classList.toggle('hidden',!O.host);return}const mine=v.sides?.[st.side]===O.playerId;$('#versusDraftTurnBanner').innerHTML=`<small>${st.kind==='ban'?'BAN':'PICK'}</small><strong>${st.side==='zombie'?'🧟 僵尸方':'🌱 植物方'}${mine?'（你）':''}</strong><span>${mine?'轮到你操作':'等待对方'}</span>`;$('#versusDraftInstruction').textContent=mine?`轮到你 ${st.kind==='ban'?'Ban 对方1张卡':'Pick 1张自己的卡'}`:`等待${st.side==='zombie'?'僵尸':'植物'}方操作`;const ids=Object.keys(window.S7VersusBattle.CARDS[st.target]||{});$('#versusOnlineCardGrid').innerHTML=ids.map(id=>{const c=window.S7VersusBattle.cfg(st.target,id),dis=used(v,id);return `<button class="versusDraftCard ${dis?'disabled':''}" data-id="${id}"><b>${window.S7VersusBattle.cardName(st.target,id)}</b><span>${c.cost} ${st.target==='plant'?'阳光':'脑光'}</span><small>CD ${c.cd}s${c.guaranteed?` · 100%变种 ${c.guaranteed}`:''}</small></button>`}).join('');$('#versusOnlineCardGrid').querySelectorAll('.versusDraftCard').forEach(b=>b.onclick=()=>{if(mine&&!used(v,b.dataset.id))send({type:'versusDraftAction',cardId:b.dataset.id})});$('#versusDraftStartBattleBtn').classList.add('hidden')}
function onBattleStart(m){const my=O.playerId,host=m.hostId===my,side=m.sides?.plant===my?'plant':'zombie';O.side=side;hide('versusOnlineDraftScreen');if(host){document.getElementById('game')?.classList.remove('hidden');document.getElementById('startScreen')?.classList.add('hidden');window.S7VersusBattle.start({mode:'online',online:true,isHost:true,humanSide:side,role:side,room:O.room,plantCards:m.picks.plant,zombieCards:m.picks.zombie});window.S7VersusRealtime?.startHost?.(side)}else{show('versusRealtimeScreen');window.S7VersusRealtime?.startGuest?.(side)}}
function hostReportResult(result){if(!O.host||!result)return;send({type:'versusEnd',winner:result.winner,reason:result.reason,time:result.time})}
function showResult(res){show('versusResultOverlay');$('#versusResultTitle').textContent=res.winner==='draw'?'平局':res.winner==='plant'?'🌱 植物方胜利':'🧟 僵尸方胜利';$('#versusResultReason').textContent=res.reason||'';$('#versusResultStats').textContent=`用时 ${Math.floor((res.time||0)/60)}:${String(Math.floor((res.time||0)%60)).padStart(2,'0')}`;$('#versusResultRematchBtn').style.display=O.host?'inline-block':'none'}
function handle(msg){
  if(!msg)return;
  if(msg.type==='versusRoomCreated'||msg.type==='versusRoomJoined'||(msg.type==='roomResumed'&&msg.room?.kind==='versus')){
    clearEntryPending();
    O.room=msg.room;O.playerId=msg.playerId||window.s7WSPlayerId?.();renderRoom();
    if(msg.room?.state==='battling'){
      const side=msg.room.versus?.sides?.plant===O.playerId?'plant':'zombie';O.side=side;
      if(msg.room.hostId===O.playerId)window.S7VersusRealtime?.startHost?.(side);else{show('versusRealtimeScreen');window.S7VersusRealtime?.startGuest?.(side)}
    }
    return;
  }
  if(msg.type==='roomUpdate'&&msg.room?.kind==='versus'){
    O.room=msg.room;
    if(!roomPlayers().some(p=>p.id===O.playerId)){exitVersusRoom('你已被移出房间');return}
    if(msg.room.state==='versusDraft'||msg.room.state==='versusReady')renderDraft();else if(msg.room.state==='lobby')renderRoom();
    return;
  }
  if(msg.type==='versusDraftState'&&msg.room){O.room=msg.room;renderDraft();return}
  if(msg.type==='versusBattleStart'){onBattleStart(msg);return}
  if(msg.type==='versusEnded'){window.S7VersusBattle?.finish?.(msg.winner,msg.reason);showResult(msg);return}
  if(msg.type==='versusRematchReady'){hide('versusResultOverlay');hide('versusRealtimeScreen');renderRoom();return}
  if(msg.type==='kicked'&&O.room){exitVersusRoom('你已被房主踢出房间');return}
  if(msg.type==='roomClosed'&&O.room){exitVersusRoom(msg.message||'房间已关闭');return}
  if(msg.type==='resumeFailed'&&O.room){exitVersusRoom(msg.message||'房间会话已失效');return}
  if(msg.type==='leftRoom'&&O.room){exitVersusRoom();return}
  if(msg.type==='error'&&O.pendingEntry){failEntry(msg.message||'创建/加入房间失败');return}
}
window.S7VersusOnline={open,showEntryForSelectedServer,handle,hostReportResult,getRoom:()=>O.room,getSide:()=>O.side,isHost:()=>O.host,isInRoom:()=>!!O.room,showResult};
window.S7VersusUI={showResult};

function bindControls(){
  $('versusPlantSideCard')?.addEventListener('click',()=>send({type:'versusClaim',side:'plant'}));
  $('versusZombieSideCard')?.addEventListener('click',()=>send({type:'versusClaim',side:'zombie'}));
  $('versusSwapSidesBtn')?.addEventListener('click',()=>send({type:'versusSwapSides'}));
  $('versusRoomStartDraftBtn')?.addEventListener('click',()=>{if(O.host&&!$('versusRoomStartDraftBtn').disabled)send({type:'versusStartDraft'})});
  $('versusRoomLeaveBtn')?.addEventListener('click',leaveVersusRoom);
  $('versusSlots6Btn')?.addEventListener('click',()=>send({type:'versusRules',slots:6,bp:!!O.room?.versus?.bp}));
  $('versusSlots7Btn')?.addEventListener('click',()=>send({type:'versusRules',slots:7,bp:!!O.room?.versus?.bp}));
  $('versusNoBpBtn')?.addEventListener('click',()=>send({type:'versusRules',slots:O.room?.versus?.slots||6,bp:false}));
  $('versusBpBtn')?.addEventListener('click',()=>send({type:'versusRules',slots:O.room?.versus?.slots||6,bp:true}));
  $('versusDraftStartBattleBtn')?.addEventListener('click',()=>send({type:'versusStartBattle'}));
  $('versusResultRematchBtn')?.addEventListener('click',()=>{if(window.S7VersusBattle?.state?.mode==='practice')return;send({type:'versusRematch'})});
  $('versusResultExitBtn')?.addEventListener('click',()=>location.reload());
  window.s7WSOn?.('message',handle);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindControls,{once:true});else bindControls();
})();
