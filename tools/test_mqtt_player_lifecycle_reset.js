#!/usr/bin/env node
// 3服 regression:
// 1) guest hard-crash/browser close without pageExit must be reaped by host lease timeout fallback;
// 2) returning from a finished simulation resets only per-player round state;
// 3) host room settings survive round reset unchanged.
const fs=require('fs'),path=require('path'),vm=require('vm');
const {TextEncoder,TextDecoder}=require('util');
const crypto=require('crypto').webcrypto;
const ROOT=path.resolve(__dirname,'..');
const CODE=fs.readFileSync(path.join(ROOT,'src/js/95_s7_mqtt_transport.js'),'utf8');
function encRemain(n){const a=[];do{let d=n%128;n=Math.floor(n/128);if(n)d|=128;a.push(d)}while(n);return Uint8Array.from(a)}
function cat(...parts){let n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n),k=0;for(const p of parts){o.set(p,k);k+=p.length}return o}
function utf(s){const b=new TextEncoder().encode(s);return cat(Uint8Array.from([b.length>>8,b.length&255]),b)}
function packet(first,body){return cat(Uint8Array.from([first]),encRemain(body.length),body)}
function parsePacket(bytes){bytes=new Uint8Array(bytes);let first=bytes[0],idx=1,mul=1,rem=0,d;do{d=bytes[idx++];rem+=(d&127)*mul;mul*=128}while(d&128);return{first,body:bytes.slice(idx,idx+rem)}}
function match(filter,topic){const f=filter.split('/'),t=topic.split('/');if(f.length!==t.length)return false;for(let i=0;i<f.length;i++)if(f[i]!=='+'&&f[i]!==t[i])return false;return true}
class Broker{constructor(){this.clients=new Set();this.retained=new Map()}route(topic,payload,retain){if(retain){if(payload.length)this.retained.set(topic,payload);else this.retained.delete(topic)}for(const ws of this.clients){if(ws.readyState!==1)continue;for(const f of ws.filters){if(match(f,topic)){ws.deliverPublish(topic,payload,retain);break}}}}}
class MockWS{constructor(b){this.broker=b;this.readyState=0;this.filters=new Set();b.clients.add(this);setTimeout(()=>{this.readyState=1;this.onopen?.()},0)}send(data){const{first,body}=parsePacket(data),type=first>>4;if(type===1)this.deliver(Uint8Array.from([0x20,2,0,0]));else if(type===8){let pos=2;while(pos<body.length){const len=(body[pos]<<8)|body[pos+1];pos+=2;const f=new TextDecoder().decode(body.slice(pos,pos+len));pos+=len+1;this.filters.add(f);for(const[t,p]of this.broker.retained)if(match(f,t))this.deliverPublish(t,p,true)}this.deliver(Uint8Array.from([0x90,3,body[0],body[1],0]));}else if(type===3){const len=(body[0]<<8)|body[1],topic=new TextDecoder().decode(body.slice(2,2+len)),payload=body.slice(2+len);this.broker.route(topic,payload,!!(first&1));}else if(type===12)this.deliver(Uint8Array.from([0xD0,0]));else if(type===14)this.close()}deliverPublish(t,p,r){this.deliver(packet(0x30|(r?1:0),cat(utf(t),p)))}deliver(bytes){setTimeout(()=>{const ab=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);this.onmessage?.({data:ab})},0)}close(){if(this.readyState===3)return;this.readyState=3;this.broker.clients.delete(this);setTimeout(()=>this.onclose?.({}),0)}}
const broker=new Broker();
function storageApi(store){return{get length(){return store.size},key:i=>Array.from(store.keys())[i]??null,getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}}
function makeClient(name){const store=new Map();const ctx={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Map,Set,Date,Math,JSON,Promise,Error,Number,String,Object,Array,parseInt,isNaN,isFinite,setTimeout,clearTimeout,setInterval,clearInterval,crypto,atob:globalThis.atob,btoa:globalThis.btoa,localStorage:storageApi(store)};ctx.window=ctx;ctx.WebSocket=function(){return new MockWS(broker)};vm.createContext(ctx);vm.runInContext(CODE,ctx);const events=[];ctx.S7MQTTTransport.setSink((k,d)=>events.push([k,d]));return{name,ctx,t:ctx.S7MQTTTransport,events}}
function waitEvent(c,kind,type,pred=()=>true,timeout=6000){return new Promise((resolve,reject)=>{const st=Date.now(),timer=setInterval(()=>{for(let i=0;i<c.events.length;i++){const[k,d]=c.events[i];if(k===kind&&(!type||d?.type===type)&&pred(d)){c.events.splice(i,1);clearInterval(timer);return resolve(d)}}if(Date.now()-st>timeout){clearInterval(timer);reject(new Error(`${c.name}: timeout ${kind}/${type}`))}},10)})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function settings(r){return {mode:r.mode,maxPlayers:r.maxPlayers,speed:r.speed,endMode:r.endMode,allowSpectators:r.allowSpectators,disableReroll:r.disableReroll,enableBan:r.enableBan,bpMode:r.bpMode,bpPickAsBan:r.bpPickAsBan,hasPassword:r.hasPassword}}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
(async()=>{
  const A=makeClient('A'),B=makeClient('B');
  A.t.connect();B.t.connect();await waitEvent(A,'connected');await waitEvent(B,'connected');
  A.t.send({type:'createRoom',nick:'A',mode:'532',maxPlayers:5,ver:'1.7.0'});const created=await waitEvent(A,'message','roomCreated');
  await sleep(100);B.t.send({type:'joinRoom',roomId:created.room.id,nick:'B',ver:'1.7.0'});const joined=await waitEvent(B,'message','roomJoined');

  // Hard browser/process death: no pageExit/leaveRoom packet reaches host.
  B.t.mqtt.end();B.t.mqtt=null;B.t.connected=false;
  const ghost=A.t.hostEngine.player(joined.playerId);if(!ghost)throw new Error('ghost setup failed');
  ghost.lastSeen=Date.now()-71001;
  const reapedP=waitEvent(A,'message','roomUpdate',m=>m.room&&!(m.room.players||[]).some(p=>p.id===joined.playerId));
  await A.t.hostEngine._reapOfflinePlayers();
  await reapedP;
  if(A.t.hostEngine.player(joined.playerId))throw new Error('offline guest was not reaped');

  // A new player joins for a full round reset test.
  const C=makeClient('C');C.t.connect();await waitEvent(C,'connected');await sleep(100);C.t.send({type:'joinRoom',roomId:created.room.id,nick:'C',ver:'1.7.0'});const cj=await waitEvent(C,'message','roomJoined');

  // Host settings chosen before the game must survive the whole return-to-room flow.
  A.t.send({type:'changeMaxPlayers',maxPlayers:4});
  A.t.send({type:'changeSpeed',speed:4});
  A.t.send({type:'changeEndMode'});
  A.t.send({type:'toggleSpectators'});
  A.t.send({type:'toggleDisableReroll'});
  A.t.send({type:'toggleEnableBan'});
  A.t.send({type:'togglePickAsBan'});
  await sleep(300);
  const before=settings(A.t.hostEngine.roomInfo());

  A.t.send({type:'startGame'});await waitEvent(C,'message','roomUpdate',m=>m.room?.state==='laneSelect');
  A.t.send({type:'selectLane',lane:0});C.t.send({type:'selectLane',lane:1});await waitEvent(C,'message','roomUpdate',m=>m.room?.state==='laying');
  const fa=['wallnut','cactus','repeater','sunflower','melon'];
  const fc=['tallnut','snowpea','puff','kernel','winter'];
  A.t.send({type:'uploadFormation',formation:fa});C.t.send({type:'uploadFormation',formation:fc});await waitEvent(A,'message','allFormationsUploaded');
  A.t.send({type:'startBattle'});await waitEvent(C,'message','roomUpdate',m=>m.room?.state==='battling');
  A.t.send({type:'battleResult',results:{lane0:120,lane1:110}});C.t.send({type:'battleResult',results:{lane0:120,lane1:110}});await waitEvent(C,'message','battleEnd');

  // C returns first: only C's round state is cleared; host settings and A's round state remain.
  const cResetP=waitEvent(A,'message','roomUpdate',m=>m.room?.state==='finished'&&m.room.players?.some(p=>p.id===cj.playerId&&p.lane===-1&&!p.uploaded&&!p.ready));
  C.t.send({type:'resetRoom'});const cReset=await cResetP;
  const cState=cReset.room.players.find(p=>p.id===cj.playerId),aState=cReset.room.players.find(p=>p.id===created.playerId);
  if(!cState||cState.lane!==-1||cState.uploaded||cState.ready)throw new Error('returning player state not reset');
  if(!aState||aState.lane!==0||!aState.uploaded)throw new Error('other player state was reset too early');
  if(!same(settings(cReset.room),before))throw new Error('host settings changed when one player returned');

  // A returns last: room becomes lobby and every player's per-round state is fresh, settings unchanged.
  const allResetP=waitEvent(C,'message','roomUpdate',m=>m.room?.state==='lobby'&&same(settings(m.room),before)&&m.room.players?.every(p=>p.lane===-1&&!p.uploaded&&!p.ready));
  A.t.send({type:'resetRoom'});const allReset=await allResetP;
  if(!same(settings(allReset.room),before))throw new Error('host settings changed after round reset');
  if(allReset.room.players.some(p=>p.lane!==-1||p.uploaded||p.ready))throw new Error('not all per-player round state was reset');

  console.log(JSON.stringify({ok:true,checks:['offline-player-auto-reap-fallback','returning-player-only-round-reset','last-return-auto-lobby','host-settings-preserved']},null,2));
  A.t.disconnect();C.t.disconnect();setTimeout(()=>process.exit(0),30);
})().catch(e=>{console.error(e);process.exit(1)});
