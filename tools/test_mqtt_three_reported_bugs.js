#!/usr/bin/env node
// Regression test for three user-reported 3服 bugs:
// 1) guest must be able to recover startGame/startBattle from authoritative roomUpdate
// 2) host formation upload must not mark guest uploaded
// 3) kicked guest must be absent from authoritative roomUpdate, allowing UI forced exit even if direct event is lost
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TextEncoder, TextDecoder } = require('util');
const crypto = require('crypto').webcrypto;

const ROOT = path.resolve(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'src/js/95_s7_mqtt_transport.js'), 'utf8');

function encRemain(n){const a=[];do{let d=n%128;n=Math.floor(n/128);if(n)d|=128;a.push(d)}while(n);return Uint8Array.from(a)}
function cat(...parts){let n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n),k=0;for(const p of parts){o.set(p,k);k+=p.length}return o}
function utf(s){const b=new TextEncoder().encode(s);return cat(Uint8Array.from([b.length>>8,b.length&255]),b)}
function packet(first,body){return cat(Uint8Array.from([first]),encRemain(body.length),body)}
function parsePacket(bytes){bytes=new Uint8Array(bytes);let first=bytes[0],idx=1,mul=1,rem=0,d;do{d=bytes[idx++];rem+=(d&127)*mul;mul*=128}while(d&128);return {first,body:bytes.slice(idx,idx+rem)}}
function match(filter,topic){const f=filter.split('/'),t=topic.split('/');if(f.length!==t.length)return false;for(let i=0;i<f.length;i++)if(f[i]!=='+'&&f[i]!==t[i])return false;return true}
class Broker{constructor(){this.clients=new Set();this.retained=new Map()}route(topic,payload,retain){if(retain){if(payload.length)this.retained.set(topic,payload);else this.retained.delete(topic)}for(const ws of this.clients){if(ws.readyState!==1)continue;for(const f of ws.filters){if(match(f,topic)){ws.deliverPublish(topic,payload,retain);break}}}}}
class MockWS{
  constructor(broker){this.broker=broker;this.readyState=0;this.binaryType='arraybuffer';this.filters=new Set();broker.clients.add(this);setTimeout(()=>{this.readyState=1;this.onopen?.()},0)}
  send(data){const {first,body}=parsePacket(data),type=first>>4;if(type===1)this.deliver(Uint8Array.from([0x20,0x02,0x00,0x00]));else if(type===8){let pos=2;while(pos<body.length){const len=(body[pos]<<8)|body[pos+1];pos+=2;const filter=new TextDecoder().decode(body.slice(pos,pos+len));pos+=len+1;this.filters.add(filter);for(const [topic,payload] of this.broker.retained)if(match(filter,topic))this.deliverPublish(topic,payload,true)}this.deliver(Uint8Array.from([0x90,0x03,body[0],body[1],0]));}else if(type===3){const len=(body[0]<<8)|body[1],topic=new TextDecoder().decode(body.slice(2,2+len)),payload=body.slice(2+len);this.broker.route(topic,payload,!!(first&1));}else if(type===12)this.deliver(Uint8Array.from([0xD0,0]));else if(type===14)this.close()}
  deliverPublish(topic,payload,retain){this.deliver(packet(0x30|(retain?1:0),cat(utf(topic),payload)))}
  deliver(bytes){setTimeout(()=>{const ab=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);this.onmessage?.({data:ab})},0)}
  close(){if(this.readyState===3)return;this.readyState=3;this.broker.clients.delete(this);setTimeout(()=>this.onclose?.({}),0)}
}
const broker=new Broker();
function makeClient(name){const store=new Map();const ctx={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Map,Set,Date,Math,JSON,Promise,Error,Number,String,Object,Array,parseInt,isNaN,isFinite,setTimeout,clearTimeout,setInterval,clearInterval,crypto,atob:globalThis.atob,btoa:globalThis.btoa,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};ctx.window=ctx;ctx.WebSocket=function(){return new MockWS(broker)};vm.createContext(ctx);vm.runInContext(CODE,ctx);const events=[];ctx.S7MQTTTransport.setSink((k,d)=>events.push([k,d]));return{name,ctx,t:ctx.S7MQTTTransport,events}}
function waitEvent(c,kind,type,pred=()=>true,timeout=6000){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{for(let i=0;i<c.events.length;i++){const[k,d]=c.events[i];if(k===kind&&(!type||d?.type===type)&&pred(d)){c.events.splice(i,1);clearInterval(timer);return resolve(d)}}if(Date.now()-start>timeout){clearInterval(timer);reject(new Error(`${c.name}: timeout ${kind}/${type}`))}},10)})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

(async()=>{
  const A=makeClient('A'),B=makeClient('B');
  A.t.connect();B.t.connect();await waitEvent(A,'connected');await waitEvent(B,'connected');
  A.t.send({type:'createRoom',nick:'A',mode:'532',maxPlayers:5,ver:'1.6.1'});
  const created=await waitEvent(A,'message','roomCreated');
  await sleep(100);B.t.send({type:'listRooms'});const list=await waitEvent(B,'message','roomList');
  if(!list.rooms.find(r=>r.id===created.room.id))throw new Error('room not discoverable');
  B.t.send({type:'joinRoom',roomId:created.room.id,nick:'B',ver:'1.6.1'});
  const joined=await waitEvent(B,'message','roomJoined');const bid=joined.playerId;

  // Bug 1a: even if enterLaneSelection event were lost, authoritative state must expose laneSelect.
  const laneStateP=waitEvent(B,'message','roomUpdate',m=>m.room?.state==='laneSelect');
  A.t.send({type:'startGame'});
  const laneState=await laneStateP;
  if(laneState.room.state!=='laneSelect')throw new Error('laneSelect fallback missing');

  A.t.send({type:'selectLane',lane:0});B.t.send({type:'selectLane',lane:1});
  await waitEvent(B,'message','roomUpdate',m=>m.room?.state==='laying');

  const fa=['wallnut','cactus','repeater','sunflower','melon'];
  const fb=['tallnut','snowpea','puff','kernel','winter'];
  // Bug 2: host upload only. Guest must remain uploaded=false.
  const hostUploadStateP=waitEvent(B,'message','roomUpdate',m=>m.room?.players?.some(p=>p.id===created.playerId&&p.uploaded));
  A.t.send({type:'uploadFormation',formation:fa});
  const hostUploadState=await hostUploadStateP;
  const hostP=hostUploadState.room.players.find(p=>p.id===created.playerId);
  const guestP=hostUploadState.room.players.find(p=>p.id===bid);
  if(!hostP?.uploaded)throw new Error('host upload missing');
  if(guestP?.uploaded)throw new Error('guest incorrectly marked uploaded');

  B.t.send({type:'uploadFormation',formation:fb});
  await waitEvent(A,'message','allFormationsUploaded');

  // Bug 1b: retained roomUpdate must contain complete battleStart initial data.
  const battleStateP=waitEvent(B,'message','roomUpdate',m=>m.room?.state==='battling'&&m.room?.battleInit);
  A.t.send({type:'startBattle'});
  const battleState=await battleStateP;
  const bi=battleState.room.battleInit;
  if(!bi.seed||!bi.formations?.lane0||!bi.formations?.lane1)throw new Error('battleInit fallback incomplete');
  if('zombieHp' in bi||'projectiles' in bi||'frameState' in bi)throw new Error('battleInit contains forbidden live battle state');

  // Finish, then kick B; UI can use roomUpdate absence as reliable fallback if direct kicked is lost.
  A.t.send({type:'battleResult',results:{lane0:120,lane1:110}});B.t.send({type:'battleResult',results:{lane0:120,lane1:110}});
  await waitEvent(B,'message','battleEnd');
  const removedStateP=waitEvent(B,'message','roomUpdate',m=>m.room&&!(m.room.players||[]).some(p=>p.id===bid));
  A.t.send({type:'kick',playerId:bid});
  const removed=await removedStateP;
  if(removed.room.players.some(p=>p.id===bid))throw new Error('kicked guest still present in authoritative room state');

  console.log(JSON.stringify({ok:true,checks:[
    'startGame-roomUpdate-fallback',
    'formation-upload-owned-by-correct-player',
    'battleStart-retained-battleInit-fallback',
    'battleInit-no-live-battle-state',
    'kick-roomUpdate-removes-player'
  ]},null,2));
  A.t.disconnect();B.t.disconnect();setTimeout(()=>process.exit(0),50);
})().catch(e=>{console.error(e);process.exit(1)});
