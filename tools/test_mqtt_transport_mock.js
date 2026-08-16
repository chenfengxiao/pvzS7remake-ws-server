#!/usr/bin/env node
// Offline protocol regression for src/js/95_s7_mqtt_transport.js.
// A tiny in-memory MQTT broker drives two isolated browser-like VM clients.
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

class Broker {
  constructor(){this.clients=new Set();this.retained=new Map()}
  createWS(ctx,url,protocols){return new MockWS(this,ctx,url,protocols)}
  route(topic,payload,retain){
    if(retain){if(payload.length)this.retained.set(topic,payload);else this.retained.delete(topic)}
    for(const ws of this.clients){
      if(ws.readyState!==1)continue;
      for(const f of ws.filters){if(match(f,topic)){ws.deliverPublish(topic,payload,retain);break}}
    }
  }
}
class MockWS {
  constructor(broker){this.broker=broker;this.readyState=0;this.binaryType='arraybuffer';this.filters=new Set();broker.clients.add(this);setTimeout(()=>{this.readyState=1;this.onopen?.()},0)}
  send(data){
    const {first,body}=parsePacket(data),type=first>>4;
    if(type===1)this.deliver(Uint8Array.from([0x20,0x02,0x00,0x00]));
    else if(type===8){let pos=2;while(pos<body.length){const len=(body[pos]<<8)|body[pos+1];pos+=2;const filter=new TextDecoder().decode(body.slice(pos,pos+len));pos+=len+1;this.filters.add(filter);for(const [topic,payload] of this.broker.retained)if(match(filter,topic))this.deliverPublish(topic,payload,true)}this.deliver(Uint8Array.from([0x90,0x03,body[0],body[1],0]));}
    else if(type===3){const len=(body[0]<<8)|body[1],topic=new TextDecoder().decode(body.slice(2,2+len)),payload=body.slice(2+len);this.broker.route(topic,payload,!!(first&1));}
    else if(type===12)this.deliver(Uint8Array.from([0xD0,0]));
    else if(type===14)this.close();
  }
  deliverPublish(topic,payload,retain){this.deliver(packet(0x30|(retain?1:0),cat(utf(topic),payload)))}
  deliver(bytes){setTimeout(()=>{const ab=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);this.onmessage?.({data:ab})},0)}
  close(){if(this.readyState===3)return;this.readyState=3;this.broker.clients.delete(this);setTimeout(()=>this.onclose?.({}),0)}
}

const broker = new Broker();
function makeClient(name){
  const store=new Map();
  const ctx={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Map,Set,Date,Math,JSON,Promise,Error,Number,String,Object,Array,parseInt,isNaN,isFinite,setTimeout,clearTimeout,setInterval,clearInterval,crypto,atob:globalThis.atob,btoa:globalThis.btoa,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};
  ctx.window=ctx;ctx.WebSocket=function(){return new MockWS(broker)};
  vm.createContext(ctx);vm.runInContext(CODE,ctx);
  const events=[];ctx.S7MQTTTransport.setSink((k,d)=>events.push([k,d]));
  return {name,ctx,t:ctx.S7MQTTTransport,events,store};
}
function waitEvent(c,kind,type,timeout=5000){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{for(let i=0;i<c.events.length;i++){const [k,d]=c.events[i];if(k===kind&&(!type||d?.type===type)){c.events.splice(i,1);clearInterval(timer);return resolve(d)}}if(Date.now()-start>timeout){clearInterval(timer);reject(new Error(`${c.name}: timeout ${kind}/${type}`))}},10)})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

(async()=>{
  const A=makeClient('A'),B=makeClient('B');
  A.t.connect();B.t.connect();await waitEvent(A,'connected');await waitEvent(B,'connected');
  A.t.send({type:'createRoom',nick:'A',mode:'532',maxPlayers:5,ver:'1.6.1'});
  const created=await waitEvent(A,'message','roomCreated',6000);
  await sleep(100);B.t.send({type:'listRooms'});const list=await waitEvent(B,'message','roomList');
  if(!list.rooms.find(r=>r.id===created.room.id))throw new Error('retained lobby discovery failed');
  B.t.send({type:'joinRoom',roomId:created.room.id,nick:'B',ver:'1.6.1'});
  const joined=await waitEvent(B,'message','roomJoined',6000);if(joined.room.players.length!==2)throw new Error('join failed');
  A.t.send({type:'startGame'});await waitEvent(B,'message','enterLaneSelection');
  A.t.send({type:'selectLane',lane:0});B.t.send({type:'selectLane',lane:1});await waitEvent(B,'message','startBP',6000);
  const fa=['wallnut','cactus','repeater','sunflower','melon'],fb=['tallnut','snowpea','puff','kernel','winter'];
  A.t.send({type:'uploadFormation',formation:fa});B.t.send({type:'uploadFormation',formation:fb});await waitEvent(A,'message','allFormationsUploaded',6000);
  A.t.send({type:'startBattle'});const bs=await waitEvent(B,'message','battleStart',6000);if(!bs.seed||!bs.formations.lane0||!bs.formations.lane1)throw new Error('battleStart incomplete');
  // No live battle state is exchanged here. Only final battleResult is sent.
  A.t.send({type:'battleResult',results:{lane0:120,lane1:110}});B.t.send({type:'battleResult',results:{lane0:120,lane1:110}});
  const end=await waitEvent(B,'message','battleEnd',6000);if(end.rankings?.length!==2||end.rankings[0].time!==120)throw new Error('battleResult aggregation failed');
  console.log(JSON.stringify({ok:true,roomId:created.room.id,checks:['mqtt-wire','retained-lobby','ecdh-join','room-state','lane-select','formation','battleStart-boundary','battleResult-after-end']},null,2));
  A.t.disconnect();B.t.disconnect();
  setTimeout(()=>process.exit(0),50);
})().catch(e=>{console.error(e);process.exit(1)});
