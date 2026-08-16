#!/usr/bin/env node
// 3服 room lifecycle regressions:
// - roomCreated must precede first host roomUpdate (prevents false self-kick)
// - guest pageExit sends prepared leaveRoom and is removed from authority state
// - host pageExit tombstones lobby/state immediately
// - a fresh page must NOT restore old session; it cleans abandoned hosted retained rooms
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
function makeClient(name,store=new Map()){const ctx={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Map,Set,Date,Math,JSON,Promise,Error,Number,String,Object,Array,parseInt,isNaN,isFinite,setTimeout,clearTimeout,setInterval,clearInterval,crypto,atob:globalThis.atob,btoa:globalThis.btoa,localStorage:storageApi(store)};ctx.window=ctx;ctx.WebSocket=function(){return new MockWS(broker)};vm.createContext(ctx);vm.runInContext(CODE,ctx);const events=[];ctx.S7MQTTTransport.setSink((k,d)=>events.push([k,d]));return{name,ctx,t:ctx.S7MQTTTransport,events,store}}
function waitEvent(c,kind,type,pred=()=>true,timeout=6000){return new Promise((resolve,reject)=>{const st=Date.now(),timer=setInterval(()=>{for(let i=0;i<c.events.length;i++){const[k,d]=c.events[i];if(k===kind&&(!type||d?.type===type)&&pred(d)){c.events.splice(i,1);clearInterval(timer);return resolve(d)}}if(Date.now()-st>timeout){clearInterval(timer);reject(new Error(`${c.name}: timeout ${kind}/${type}`))}},10)})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const A=makeClient('A'),B=makeClient('B');
  A.t.connect();B.t.connect();await waitEvent(A,'connected');await waitEvent(B,'connected');
  A.t.send({type:'createRoom',nick:'A',mode:'532',maxPlayers:5,ver:'1.6.1'});
  await sleep(300);
  const types=A.events.filter(x=>x[0]==='message').map(x=>x[1]?.type);
  const ci=types.indexOf('roomCreated'),ui=types.indexOf('roomUpdate');
  if(ci<0||ui<0||ci>ui)throw new Error('roomCreated did not precede first roomUpdate');
  const created=A.events.find(x=>x[0]==='message'&&x[1]?.type==='roomCreated')[1];
  B.t.send({type:'joinRoom',roomId:created.room.id,nick:'B',ver:'1.6.1'});const joined=await waitEvent(B,'message','roomJoined');
  await sleep(150);
  // Make sure exit packet reflects a post-join seq.
  B.t.send({type:'selectLane',lane:1}); await sleep(200); // ignored in lobby but seq still advances and exit packet refreshes
  const removedP=waitEvent(A,'message','roomUpdate',m=>m.room&&!m.room.players.some(p=>p.id===joined.playerId));
  B.t.pageExit();
  await removedP;
  if(B.t.roomId!==null)throw new Error('guest pageExit did not clear local session');

  // Rejoin with a new browser client, then host pageExit must kill room immediately.
  const C=makeClient('C');C.t.connect();await waitEvent(C,'connected');await sleep(100);C.t.send({type:'listRooms'});let list=await waitEvent(C,'message','roomList');if(!list.rooms.some(r=>r.id===created.room.id))throw new Error('room unexpectedly absent before host exit');
  const closeP=waitEvent(C,'message','roomList',()=>true,1500).catch(()=>null); // optional
  A.t.pageExit();await sleep(250);C.t.send({type:'listRooms'});list=await waitEvent(C,'message','roomList');if(list.rooms.some(r=>r.id===created.room.id))throw new Error('host pageExit left lobby room retained');
  if([...broker.retained.keys()].some(k=>k.endsWith('/lobby/room/'+created.room.id)))throw new Error('broker retained lobby not tombstoned');

  // Simulate old-version crash: create a hosted room and drop WS WITHOUT pageExit, leaving localStorage + retained.
  const shared=new Map();const D=makeClient('D-old',shared);D.t.connect();await waitEvent(D,'connected');D.t.send({type:'createRoom',nick:'D',mode:'532',maxPlayers:5,ver:'1.6.1'});const dc=await waitEvent(D,'message','roomCreated');await sleep(200);
  // hard crash: no pageExit, just destroy MQTT socket; persistent keys remain
  D.t.mqtt.end();D.t.mqtt=null;D.t.connected=false;
  if(![...broker.retained.keys()].some(k=>k.endsWith('/lobby/room/'+dc.room.id)))throw new Error('crash setup failed: retained lobby missing');
  const D2=makeClient('D-new-page',shared);D2.t.connect();await waitEvent(D2,'connected');await sleep(350);
  if(D2.t.roomId!==null||D2.t.playerId!==null)throw new Error('fresh page restored old 3服 session');
  if([...broker.retained.keys()].some(k=>k.endsWith('/lobby/room/'+dc.room.id)))throw new Error('fresh-page cleanup did not reclaim abandoned hosted room');
  console.log(JSON.stringify({ok:true,checks:['roomCreated-before-roomUpdate','guest-pageExit-leave','host-pageExit-tombstone','fresh-page-no-auto-resume','abandoned-host-room-reclaimed']},null,2));
  A.t.disconnect();B.t.disconnect();C.t.disconnect();D2.t.disconnect();setTimeout(()=>process.exit(0),30);
})().catch(e=>{console.error(e);process.exit(1)});
