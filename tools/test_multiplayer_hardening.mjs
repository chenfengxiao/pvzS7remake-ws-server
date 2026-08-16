import WebSocket from 'ws';

const URL = process.env.TEST_WS_URL || 'ws://127.0.0.1:43211';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(URL);
  const q = [];
  const waiters = [];
  ws.on('message', data => {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    q.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.pred(msg)) { waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(msg); }
    }
  });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve); ws.once('error', reject);
  });
  function waitFor(pred, timeout=3000) {
    for (const m of q) if (pred(m)) return Promise.resolve(m);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, timer: null };
      w.timer = setTimeout(() => {
        const idx = waiters.indexOf(w); if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`${name}: timeout; queue=${JSON.stringify(q.slice(-8))}`));
      }, timeout);
      waiters.push(w);
    });
  }
  return {name, ws, q, opened, send:o=>ws.send(JSON.stringify(o)), waitFor, close:()=>{try{ws.close()}catch{}}};
}
const t = type => m => m.type === type;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function testAuthAndResume() {
  const a=client('alice'); await a.opened;
  a.send({type:'createRoom', nick:'Alice', password:'secret', maxPlayers:3, mode:'532', allowSpectators:true, ver:'1.5.8'});
  const created=await a.waitFor(t('roomCreated'));
  const rid=created.room.id;
  assert(created.sessionToken, 'host session token missing');

  const b=client('bob'); await b.opened;
  b.send({type:'joinRoom', roomId:rid, password:'secret', nick:'Bob', ver:'1.5.8', acceptSpectator:false});
  const joined=await b.waitFor(t('roomJoined'));
  assert(joined.sessionToken, 'join session token missing');

  const atk=client('attacker'); await atk.opened;
  atk.send({type:'joinRoom', roomId:rid, password:'wrong', nick:'Bob', ver:'1.5.8', acceptSpectator:false});
  const e1=await atk.waitFor(m=>m.type==='error' && m.message==='密码错');
  assert(!!e1, 'wrong password not rejected first');
  atk.send({type:'joinRoom', roomId:rid, password:'secret', nick:'Bob', ver:'1.5.8', acceptSpectator:false});
  const e2=await atk.waitFor(m=>m.type==='error' && /昵称已在房间/.test(m.message));
  assert(!!e2, 'duplicate nick not rejected');

  b.send({type:'ready'});
  await b.waitFor(m=>m.type==='error' && m.message==='先选路线');

  const bobPid=joined.playerId, bobToken=joined.sessionToken;
  b.ws.close();
  await sleep(100);
  const b2=client('bob-resume'); await b2.opened;
  b2.send({type:'resumeRoom', roomId:rid, playerId:bobPid, sessionToken:bobToken});
  const resumed=await b2.waitFor(t('roomResumed'));
  assert(resumed.playerId===bobPid, 'resume changed player id');

  atk.send({type:'listRooms'});
  const list=await atk.waitFor(t('roomList'));
  const room=list.rooms.find(r=>r.id===rid);
  assert(room && room.playerCount===2, `playerCount wrong after resume: ${JSON.stringify(room)}`);
  a.close(); b2.close(); atk.close();
}

async function testBlindBpPrivacy() {
  const a=client('bp-a'); await a.opened;
  a.send({type:'createRoom', nick:'A', maxPlayers:2, mode:'2p-blind', ver:'1.5.8'});
  const cr=await a.waitFor(t('roomCreated')); const rid=cr.room.id; const aid=cr.playerId;
  const b=client('bp-b'); await b.opened;
  b.send({type:'joinRoom', roomId:rid, nick:'B', ver:'1.5.8', acceptSpectator:false});
  const jr=await b.waitFor(t('roomJoined')); const bid=jr.playerId;
  a.send({type:'startGame'});
  await a.waitFor(t('enterLaneSelection')); await b.waitFor(t('enterLaneSelection'));
  a.send({type:'selectLane', lane:0});
  b.send({type:'selectLane', lane:1});
  await a.waitFor(t('startBP')); await b.waitFor(t('startBP'));
  await a.waitFor(t('bpStateUpdate')); await b.waitFor(t('bpStateUpdate'));

  a.send({type:'bpAction', action:'ban', plantKey:'wallnut'});
  const hidden1=await b.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.actions?.[aid]);
  assert(hidden1.bpState.actions[aid].bans.length===0, 'blind BP leaked first hidden ban');
  a.send({type:'bpAction', action:'ban', plantKey:'tallnut'});
  const hidden2=await b.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.submitted?.[aid]);
  assert(hidden2.bpState.actions[aid].bans.length===0, 'blind BP leaked submitted bans before reveal');

  b.send({type:'bpAction', action:'ban', plantKey:'cactus'});
  await sleep(30);
  b.send({type:'bpAction', action:'ban', plantKey:'garlic'});
  const reveal=await b.waitFor(m=>m.type==='bpStateUpdate' && m.revealed===true);
  assert(reveal.bpState.actions[aid].bans.length===2, 'revealed BP missing opponent actions');
  assert(reveal.bpState.actions[bid].bans.length===2, 'revealed BP missing own actions');

  // phase 1: pick 3
  await a.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.phaseIndex===1 && !m.revealed, 3500);
  await b.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.phaseIndex===1 && !m.revealed, 3500);
  for (const k of ['snowpea','repeater','puff']) a.send({type:'bpAction',action:'pick',plantKey:k});
  for (const k of ['scaredy','squash','threepeater']) b.send({type:'bpAction',action:'pick',plantKey:k});
  await a.waitFor(m=>m.type==='bpStateUpdate' && m.revealed===true && m.bpState?.phaseIndex===1, 3000);

  // phase 2: second ban stage; regression for cumulative-count bug
  await a.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.phaseIndex===2 && !m.revealed, 3500);
  await b.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.phaseIndex===2 && !m.revealed, 3500);
  for (const k of ['seashroom','splitpea']) a.send({type:'bpAction',action:'ban',plantKey:k});
  for (const k of ['cabbage','cattail']) b.send({type:'bpAction',action:'ban',plantKey:k});
  const reveal2=await a.waitFor(m=>m.type==='bpStateUpdate' && m.revealed===true && m.bpState?.phaseIndex===2, 3000);
  assert(reveal2.bpState.actions[aid].bans.length===4, 'second ban stage did not accept two more bans');

  // phase 3: pick 2, then validate server-owned BP formation
  await a.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.phaseIndex===3 && !m.revealed, 3500);
  await b.waitFor(m=>m.type==='bpStateUpdate' && m.bpState?.phaseIndex===3 && !m.revealed, 3500);
  for (const k of ['firelotus','reverseRepeater']) a.send({type:'bpAction',action:'pick',plantKey:k});
  for (const k of ['ghost','sniper']) b.send({type:'bpAction',action:'pick',plantKey:k});
  await a.waitFor(m=>m.type==='bpStateUpdate' && m.revealed===true && m.bpState?.phaseIndex===3, 3000);
  const completeA=await a.waitFor(t('bpComplete'), 3500);
  await b.waitFor(t('bpComplete'), 3500);
  const expectedA=completeA.formations[aid];
  assert(expectedA && expectedA.length===5, 'BP complete formation missing');
  a.send({type:'uploadFormation',formation:['wallnut','tallnut','cactus','garlic','snowpea']});
  await a.waitFor(m=>m.type==='error' && /阵型与BP结果不一致/.test(m.message));
  a.send({type:'uploadFormation',formation:expectedA.slice().reverse()});
  await a.waitFor(m=>m.type==='roomUpdate' && m.room?.players?.some(p=>p.id===aid && p.uploaded));
  a.close(); b.close();
}

async function testSpectatorFinishAndRematchTimer() {
  const a=client('battle-a'); await a.opened;
  a.send({type:'createRoom', nick:'A2', maxPlayers:2, mode:'532', allowSpectators:true, ver:'1.5.8'});
  const cr=await a.waitFor(t('roomCreated')); const rid=cr.room.id;
  const b=client('battle-b'); await b.opened;
  b.send({type:'joinRoom', roomId:rid, nick:'B2', ver:'1.5.8', acceptSpectator:false});
  await b.waitFor(t('roomJoined'));
  a.send({type:'startGame'}); await a.waitFor(t('enterLaneSelection')); await b.waitFor(t('enterLaneSelection'));
  a.send({type:'selectLane', lane:0}); b.send({type:'selectLane', lane:1});
  await a.waitFor(t('startBP')); await b.waitFor(t('startBP'));
  const formation=['wallnut','tallnut','cactus','garlic','snowpea'];
  a.send({type:'uploadFormation', formation}); b.send({type:'uploadFormation', formation});
  await a.waitFor(t('allFormationsUploaded'));
  a.send({type:'startBattle'}); await a.waitFor(t('battleStart')); await b.waitFor(t('battleStart'));

  const sp=client('spectator'); await sp.opened;
  sp.send({type:'joinRoom', roomId:rid, nick:'Spec', ver:'1.5.8', acceptSpectator:true});
  const sj=await sp.waitFor(t('roomJoined')); assert(sj.isSpectator===true, 'spectator not marked');

  a.send({type:'battleResult', results:{lane0:100}});
  b.send({type:'battleResult', results:{lane1:90}});
  const end=await a.waitFor(t('battleEnd'));
  assert(end.rankings.length===2, 'spectator blocked battle finish');
  a.send({type:'rematch'}); await a.waitFor(t('rematch'));
  await sleep(1300);
  sp.send({type:'listRooms'});
  const list=await sp.waitFor(t('roomList'));
  assert(list.rooms.some(r=>r.id===rid), 'old finish timer deleted rematched room');
  a.close(); b.close(); sp.close();
}

await testAuthAndResume();
await testBlindBpPrivacy();
await testSpectatorFinishAndRematchTimer();
console.log(JSON.stringify({ok:true, tests:['auth-order-and-nick','session-resume','blind-bp-privacy-and-multiphase','bp-formation-validation','spectator-finish','rematch-timer']}, null, 2));
