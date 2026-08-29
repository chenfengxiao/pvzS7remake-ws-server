const {spawn}=require('child_process');
const WebSocket=require('ws');
const path=require('path');
const PORT=18987+Math.floor(Math.random()*400);
const env={...process.env,HOST:'127.0.0.1',PORT:String(PORT),S7_HOME_TUNNEL:'0'};
const server=spawn(process.execPath,[path.join(__dirname,'../server/server.js')],{env,stdio:['ignore','pipe','pipe']});
let out='';server.stdout.on('data',d=>out+=d);server.stderr.on('data',d=>out+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function onceMsg(ws,pred,timeout=4000){return new Promise((resolve,reject)=>{const t=setTimeout(()=>{cleanup();reject(new Error('timeout waiting message'))},timeout);function on(d){let m;try{m=JSON.parse(d.toString())}catch{return}if(!pred(m))return;cleanup();resolve(m)}function cleanup(){clearTimeout(t);ws.off('message',on)}ws.on('message',on)})}
function open(){return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}`);ws.once('open',()=>resolve(ws));ws.once('error',reject)})}
(async()=>{try{
  for(let i=0;i<50&&!out.includes('listening on');i++)await sleep(100);
  if(!out.includes('listening on'))throw new Error('server did not start: '+out);
  const host=await open(),guest=await open();
  host.send(JSON.stringify({type:'createVersusRoom',nick:'房主',ver:'1.8.0'}));
  const created=await onceMsg(host,m=>m.type==='versusRoomCreated');
  const rid=created.room.id,hostId=created.playerId;
  guest.send(JSON.stringify({type:'joinVersusRoom',roomId:rid,nick:'房客',ver:'1.8.0'}));
  const joined=await onceMsg(guest,m=>m.type==='versusRoomJoined');
  const guestId=joined.playerId;
  const two=await onceMsg(host,m=>m.type==='roomUpdate'&&m.room?.kind==='versus'&&m.room.players.length===2);
  if(two.room.maxPlayers!==2)throw new Error('Versus room maxPlayers must be 2');
  host.send(JSON.stringify({type:'versusClaim',side:'zombie'}));
  guest.send(JSON.stringify({type:'versusClaim',side:'plant'}));
  const claimed=await onceMsg(host,m=>m.type==='roomUpdate'&&m.room?.versus?.sides?.zombie===hostId&&m.room?.versus?.sides?.plant===guestId);
  host.send(JSON.stringify({type:'versusRules',slots:7,bp:true}));
  const configured=await onceMsg(host,m=>m.type==='roomUpdate'&&m.room?.versus?.slots===7&&m.room?.versus?.bp===true);
  if(configured.room.state!=='lobby')throw new Error('configuration must remain in lobby');
  const kickedP=onceMsg(guest,m=>m.type==='kicked');
  const hostUpdated=onceMsg(host,m=>m.type==='roomUpdate'&&m.room?.players?.length===1);
  host.send(JSON.stringify({type:'kick',playerId:guestId}));
  await kickedP;const after=await hostUpdated;
  if(after.room.players.some(p=>p.id===guestId))throw new Error('kicked player still present');
  if(after.room.versus.sides.plant!==null)throw new Error('kicked player side was not cleared');
  if(after.room.versus.slots!==7||after.room.versus.bp!==true)throw new Error('host room settings were not preserved after kick');
  host.close();guest.close();
  console.log(JSON.stringify({ok:true,checks:['create-enters-lobby','join-visible-to-host','host-config-persists','host-kick-removes-player','kick-clears-side']},null,2));
}catch(e){console.error(e.stack||e);process.exitCode=1}finally{server.kill('SIGTERM')}})();
