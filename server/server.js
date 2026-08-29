import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { startHomeMqttTunnel } from './home_mqtt_tunnel.js';

const PORT = process.env.PORT || 3000;
const SERVER_VERSION = "1.8.0";
const MAX_ROOMS = 100;
const MAX_PLAYERS = 5;
const LANE_COUNT = 5;
const RECONNECT_GRACE_MS = Math.max(5000, Number(process.env.RECONNECT_GRACE_MS) || 120000);
const ROOM_FINISH_TTL_MS = Math.max(1000, Number(process.env.ROOM_FINISH_TTL_MS) || 300000);
const MAX_NICK_LEN = 24;
const MAX_PASSWORD_LEN = 64;
const MAX_WS_PAYLOAD = 512 * 1024;
const ALLOWED_MODES = new Set(["532", "42421", "51x5", "2p-turn", "2p-blind", "multi", "2p-assign"]);
const ALLOWED_PLANT_KEYS = new Set([
  "wallnut", "tallnut", "cactus", "explodenut", "chomper", "garlic", "spikerock", "snowpea",
  "repeater", "puff", "scaredy", "squash", "threepeater", "seashroom", "splitpea", "cabbage", "cattail",
  "firelotus", "reverseRepeater", "ghost", "sniper", "sunflower", "sunshroom", "hypno", "iceshroom", "kelp",
  "torchwood", "plantern", "blover", "magnet", "kernel", "umbrella", "marigold", "goldmagnet", "timegrass",
  "barley", "starfruit", "fume", "gloom", "potato", "melon", "gatling", "winter",
  "cherrybomb", "jalapeno", "doomshroom"
]);

// 积分榜单（JSON文件持久化）
// Railway 部署时挂载持久卷到 /data，本地开发用 server 目录
const SCORES_FILE = process.env.SCORES_FILE || path.resolve(new URL('.', import.meta.url).pathname, 'scores.json');

// ── 版本分组系统（自动按分界线分组） ──
// CUTOFF_VERSIONS: 每条分界线是一个不兼容版本号
// 组0: < CUTOFFS[0], 组1: >=CUTOFFS[0] && <CUTOFFS[1], 组2: >=CUTOFFS[1] && <CUTOFFS[2] ...
const CUTOFF_VERSIONS = ["1.4.2", "1.5.1", "1.5.5", "1.5.7", "1.5.8", "1.5.9", "1.6.0", "1.7.0"];

function _parseVer(s) {
  const p = (s || "").split(".").map(Number);
  return p[0] >= 0 && p[1] >= 0 ? { mj: p[0], mn: p[1], pt: p[2] || 0 } : null;
}

function _verCmp(a, b) {
  if (!a || !b) return 0;
  if (a.mj !== b.mj) return a.mj < b.mj ? -1 : 1;
  if (a.mn !== b.mn) return a.mn < b.mn ? -1 : 1;
  if (a.pt !== b.pt) return a.pt < b.pt ? -1 : 1;
  return 0;
}

function _getVersionGroup(ver) {
  const v = _parseVer(ver);
  if (!v) return -1;
  let group = 0;
  for (const cutoff of CUTOFF_VERSIONS) {
    const cv = _parseVer(cutoff);
    if (!cv) continue;
    if (_verCmp(v, cv) >= 0) group++;
    else break;
  }
  return group;
}
// ─────────────────────────────

function loadScores() {
  try {
    if (fs.existsSync(SCORES_FILE)) {
      return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    }
  } catch (e) { console.error('loadScores err:', e); }
  return {};
}

function saveScores(data) {
  try {
    const dir = path.dirname(SCORES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) { console.error('saveScores err:', e); }
}

// state
const rooms = new Map();
const conns = new Map();
let nextPid = 1;
const _ridPool = [];       // 回收的房间号
let _ridCounter = 1;       // 已分配过的最大号

function newId() {
  // 每次取当前可用的最小号：先查回收池，再查已分配区间内的空洞
  _ridPool.sort((a, b) => a - b);
  // 从池中取最小
  if (_ridPool.length) {
    const n = _ridPool.shift();
    return n.toString(36).toUpperCase().padStart(4, '0');
  }
  // 池空，检查已分配区间内是否有空洞（理论上不应该有，但兜底）
  // 没有空洞则分配新号
  const n = _ridCounter++;
  return n.toString(36).toUpperCase().padStart(4, '0');
}
function recycleId(id) {
  const n = parseInt(id, 36);
  if (n >= 1 && n < _ridCounter && _ridPool.indexOf(n) === -1) _ridPool.push(n);
}

function newSessionToken() { return randomBytes(24).toString("base64url"); }
function normalizeNick(value) {
  const nick = String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return nick.slice(0, MAX_NICK_LEN);
}
function normalizePassword(value) { return String(value || "").slice(0, MAX_PASSWORD_LEN); }
function isValidPlantKey(value) { return typeof value === "string" && ALLOWED_PLANT_KEYS.has(value); }
function realPlayers(room) { return room.players.filter(p => !p.isSpectator); }
function roomHost(room) { return room.players.find(p => p.id === room.hostId) || realPlayers(room)[0] || null; }
function clearPlayerDisconnectTimer(player) {
  if (player?.disconnectTimer) clearTimeout(player.disconnectTimer);
  if (player) player.disconnectTimer = null;
}
function clearRoomDeleteTimer(room) {
  if (room?.deleteTimer) clearTimeout(room.deleteTimer);
  if (room) room.deleteTimer = null;
}
function scheduleRoomDeletion(room) {
  clearRoomDeleteTimer(room);
  room.deleteTimer = setTimeout(() => {
    const current = rooms.get(room.id);
    if (!current || current !== room || room.state !== "finished") return;
    for (const p of room.players) clearPlayerDisconnectTimer(p);
    recycleId(room.id);
    rooms.delete(room.id);
  }, ROOM_FINISH_TTL_MS);
}
function sameMultiset(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const counts = new Map();
  for (const x of a) counts.set(x, (counts.get(x) || 0) + 1);
  for (const x of b) {
    const n = counts.get(x) || 0;
    if (n <= 0) return false;
    if (n === 1) counts.delete(x); else counts.set(x, n - 1);
  }
  return counts.size === 0;
}
function send(ws, o) { if (ws?.readyState === 1) ws.send(JSON.stringify(o)); }
function bcast(r, o, x) { const s = JSON.stringify(o); for (const p of r.players) if (p.ws?.readyState === 1 && p.ws !== x) p.ws.send(s); }

function roomInfo(r) {
  return {
    id: r.id, hostId: r.hostId, seed: r.seed,
    state: r.state, hasPassword: !!r.password,
    mode: r.mode, maxPlayers: r.maxPlayers, speed: r.speed,
    endMode: r.endMode, allowSpectators: !!r.allowSpectators,
    disableReroll: !!r.disableReroll,
    enableBan: !!r.enableBan,
    bannedPlants: (r.bannedPlants || []).map(b => ({ plantKey: b.plantKey, by: b.by })),
    bpMode: r.bpMode || null,
    bpPickAsBan: !!r.bpPickAsBan,
    players: r.players.map(p => ({
      id: p.id, nick: p.nick, lane: p.lane, ready: p.ready,
      alive: p.alive, survivalTime: p.survivalTime,
      formation: p.formation ? p.formation.length : 0,
      uploaded: !!p.formation,
      isSpectator: !!p.isSpectator, connected: !!(p.ws && p.ws.readyState === 1)
    })),
    lanes: r.lanes,
    kind: r.kind || "classic",
    versus: r.kind === "versus" && r.versus ? {
      slots: r.versus.slots, bp: !!r.versus.bp, sides: r.versus.sides,
      draftStarted: !!r.versus.draftStarted, draftDone: !!r.versus.draftDone,
      picks: r.versus.picks, bans: r.versus.bans, step: r.versus.step,
      battleSeq: r.versus.frameSeq || 0, winner: r.versus.winner || null
    } : null
  };
}
function sync(r) { bcast(r, { type: "roomUpdate", room: roomInfo(r) }); _sendSpectatorUpdate(r); }

function _isBpMode(mode) {
  return mode === "2p-turn" || mode === "2p-blind" || mode === "multi" || mode === "2p-assign";
}

// ── BP 阶段定义 ──
function _getBpPhases(bpMode, playerIds) {
  if (bpMode === "2p-turn") {
    return [
      { type: "ban", actor: "first" },
      { type: "ban", actor: "second" },
      { type: "ban", actor: "first" },
      { type: "ban", actor: "second" },
      { type: "pick", actor: "second" },
      { type: "pick", actor: "first" },
      { type: "pick", actor: "second" },
      { type: "pick", actor: "first" },
      { type: "pick", actor: "second" },
      { type: "pick", actor: "first" },
      { type: "ban", actor: "first" },
      { type: "ban", actor: "second" },
      { type: "ban", actor: "first" },
      { type: "ban", actor: "second" },
      { type: "pick", actor: "second" },
      { type: "pick", actor: "first" },
      { type: "pick", actor: "second" },
      { type: "pick", actor: "first" },
    ];
  } else if (bpMode === "2p-blind") {
    return [
      { type: "ban", count: 2, simultaneous: true },
      { type: "pick", count: 3, simultaneous: true },
      { type: "ban", count: 2, simultaneous: true },
      { type: "pick", count: 2, simultaneous: true },
    ];
  } else if (bpMode === "multi") {
    return [
      { type: "assign", count: 2, simultaneous: true },
      { type: "ban", count: 2, simultaneous: true },
      { type: "pick", count: 3, simultaneous: true },
    ];
  } else if (bpMode === "2p-assign") {
    return [
      { type: "assign", count: 2, simultaneous: true },
      { type: "ban", count: 3, simultaneous: true },
      { type: "pick", count: 3, simultaneous: true },
    ];
  }
  return [];
}


function _bpCompletedCounts(bp) {
  const counts = { ban: 0, pick: 0, assign: 0 };
  for (let i = 0; i < bp.phaseIndex; i++) {
    const ph = bp.phases[i];
    if (ph && counts[ph.type] != null) counts[ph.type] += ph.count || 1;
  }
  return counts;
}

// 同时制 BP 的当前阶段在揭示前只把自己的选择发给本人；其他玩家/观战者只看到已完成阶段。
function _bpStateForViewer(room, viewerId, forceReveal = false) {
  const bp = room.bpState;
  if (!bp) return null;
  const reveal = forceReveal || bp.revealed || bp.bpMode === "2p-turn";
  const done = _bpCompletedCounts(bp);
  const actions = {};
  for (const id of bp.playerIds) {
    const src = bp.actions[id] || { bans: [], picks: [], assigns: [] };
    const own = id === viewerId;
    actions[id] = {
      bans: reveal || own ? src.bans.slice() : src.bans.slice(0, done.ban),
      picks: reveal || own ? src.picks.slice() : src.picks.slice(0, done.pick),
      assigns: reveal || own ? src.assigns.map(a => ({ ...a })) : src.assigns.slice(0, done.assign).map(a => ({ ...a }))
    };
  }
  return {
    bpMode: bp.bpMode,
    firstPlayerId: bp.firstPlayerId,
    secondPlayerId: bp.secondPlayerId,
    playerIds: bp.playerIds.slice(),
    phaseIndex: bp.phaseIndex,
    currentPlayerId: bp.currentPlayerId,
    submitted: { ...bp.submitted },
    revealed: !!forceReveal || !!bp.revealed,
    actions,
    phases: bp.phases.map(ph => ({ ...ph }))
  };
}
function _sendBpState(room, forceReveal = false) {
  for (const p of room.players) {
    if (p.ws?.readyState !== 1) continue;
    send(p.ws, { type: "bpStateUpdate", bpState: _bpStateForViewer(room, p.id, forceReveal), revealed: !!forceReveal });
  }
}

// BP 全部阶段完成：把 picks+assigns 转成 formation，进入阵型编辑
function _finishBpMode(room) {
  const bp = room.bpState;
  if (!bp) return;
  const formations = {};
  for (const p of room.players) {
    if (p.isSpectator) continue;
    const a = bp.actions[p.id];
    if (!a) continue;
    // formation = assigns中被指定给我的 + 我的picks
    const assigned = [];
    for (const otherId in bp.actions) {
      const other = bp.actions[otherId];
      for (const asg of other.assigns) {
        if (asg.targetId === p.id) assigned.push(asg.plantKey);
      }
    }
    // 不直接设置 p.formation/p.ready，让玩家在阵型编辑界面手动上传
    formations[p.id] = assigned.concat(a.picks);
  }
  room.bpExpectedFormations = formations;
  room.bpState = null;
  sync(room);
  bcast(room, { type: "bpComplete", formations });
}

// 给观战者推送详细阵型（包含所有玩家的植物 key 顺序）
function _sendSpectatorUpdate(room) {
  const spectators = room.players.filter(p => p.isSpectator);
  if (spectators.length === 0) return;
  const formations = {};
  for (const p of room.players) {
    if (p.isSpectator || p.lane < 0) continue;
    formations["lane" + p.lane] = {
      nick: p.nick,
      lane: p.lane,
      formation: p.formation || null,
      uploaded: !!p.formation
    };
  }
  const msg = { type: "spectatorUpdate", state: room.state, formations };
  for (const sp of spectators) {
    if (sp.ws?.readyState === 1) sp.ws.send(JSON.stringify(msg));
  }
}

function findRoom(ws) {
  const info = conns.get(ws);
  return info?.roomId ? rooms.get(info.roomId) : null;
}
function findPlayer(room, pid) {
  return room?.players.find(p => p.id === pid);
}

// Remove a player from a room; returns true if room still exists
function removePlayer(room, pid) {
  const i = room.players.findIndex(p => p.id === pid);
  if (i < 0) return true;
  const removed = room.players[i];
  clearPlayerDisconnectTimer(removed);
  if (removed.lane >= 0) room.lanes[removed.lane] = null;
  room.players.splice(i, 1);

  // 房间没有正式玩家时直接关闭，观战者不能继承房主身份。
  const active = realPlayers(room);
  if (active.length === 0) {
    clearRoomDeleteTimer(room);
    for (const p of room.players) {
      clearPlayerDisconnectTimer(p);
      send(p.ws, { type: "roomClosed", message: "房间已关闭" });
      const ci = p.ws ? conns.get(p.ws) : null;
      if (ci) { ci.playerId = null; ci.roomId = null; ci.isSpectator = false; }
    }
    recycleId(room.id);
    rooms.delete(room.id);
    return false;
  }
  if (room.kind === "versus") {
    if (room.state === "battling") {
      const wasHost = room.hostId === pid;
      room.state = "finished";
      room.versus = room.versus || {};
      room.versus.winner = wasHost ? "aborted" : (room.versus.sides?.plant === pid ? "zombie" : "plant");
      room.versus.reason = wasHost ? "房主权威已丢失，对局终止" : "对手断线超时，判定弃权";
      bcast(room, { type:"versusEnded", winner:room.versus.winner, reason:room.versus.reason });
      scheduleRoomDeletion(room);
      sync(room);
      return true;
    }
    if (room.hostId === pid) {
      for (const p of room.players) send(p.ws,{type:"roomClosed",message:"房主已离开，Versus 房间关闭"});
      recycleId(room.id); rooms.delete(room.id); return false;
    }
    if (room.versus?.sides) { if (room.versus.sides.plant === pid) room.versus.sides.plant=null; if (room.versus.sides.zombie === pid) room.versus.sides.zombie=null; }
  }
  if (room.hostId === pid || !active.some(p => p.id === room.hostId)) room.hostId = active[0].id;
  if (!removed.isSpectator && (room.state === "laneSelect" || room.state === "laying")) {
    room.state = "lobby";
    room.bpState = null;
    room.bpExpectedFormations = null;
    room.phaseConfirmations = {};
    room.bannedPlants = [];
    room.lanes = Array(LANE_COUNT).fill(null);
    for (const p of room.players) { p.lane = -1; p.ready = false; p.formation = null; p.resultSubmitted = false; }
    bcast(room, { type: "setupReset", message: "有玩家离开，选路/BP已重置" });
  }
  _tryFinishBattle(room);
  sync(room);
  return true;
}

function markPlayerDisconnected(room, pid) {
  const p = findPlayer(room, pid);
  if (!p) return;
  clearPlayerDisconnectTimer(p);
  p.ws = null;
  p.disconnectedAt = Date.now();
  p.disconnectTimer = setTimeout(() => {
    const current = rooms.get(room.id);
    if (!current) return;
    const latest = findPlayer(current, pid);
    if (!latest || latest.ws) return;
    removePlayer(current, pid);
  }, RECONNECT_GRACE_MS);
  sync(room);
}

// Transport-neutral connection lifecycle.
// Real WebSocket (1服/家庭直连备用) 与 2服 MQTT 虚拟 socket 都走同一套业务 handler。
function registerConnection(ws) {
  if (!conns.has(ws)) conns.set(ws, { playerId: null, roomId: null, lastSeen: Date.now() });
}
function receiveConnectionMessage(ws, raw) {
  const info = conns.get(ws);
  if (info) info.lastSeen = Date.now();
  try { handle(ws, String(raw)); } catch (e) { console.error("err:", e); }
}
function closeConnection(ws) {
  const info = conns.get(ws);
  conns.delete(ws);
  if (info?.roomId) {
    const room = rooms.get(info.roomId);
    if (room) markPlayerDisconnected(room, info.playerId);
  }
}


function versusDraftPhases(slots,bp){
  const picks=slots===7?6:5,out=[];
  const round=(kind,n)=>{for(let i=0;i<n;i++){out.push({actorSide:"zombie",kind,targetSide:kind==="ban"?"plant":"zombie"});out.push({actorSide:"plant",kind,targetSide:kind==="ban"?"zombie":"plant"});}};
  if(bp){round("ban",2);round("pick",3);round("ban",2);round("pick",slots===7?3:2);}
  else round("pick",picks);
  return out;
}

// handler
function handle(ws, raw) {
  let msg; try { msg = JSON.parse(raw); } catch { return; }
  if (!msg.type) return;
  const info = conns.get(ws);
  const pid = info?.playerId;

  // ── S7 Versus 1v1 authoritative rooms ──
  if (msg.type === "createVersusRoom") {
    if (rooms.size >= MAX_ROOMS) { send(ws,{type:"error",message:"房间满了"}); return; }
    const nick=normalizeNick(msg.nick); if(!nick){send(ws,{type:"error",message:"需要昵称"});return;}
    if(info?.roomId){const old=rooms.get(info.roomId);if(old)removePlayer(old,info.playerId)}
    const rid=newId(),hostId="P"+(nextPid++),seed=(Math.random()*0xFFFFFFFF>>>0)||1;
    const player={id:hostId,ws,nick,lane:-1,ready:false,alive:true,survivalTime:0,formation:null,isSpectator:false,sessionToken:newSessionToken(),disconnectedAt:0,disconnectTimer:null};
    const room={id:rid,hostId,seed,password:normalizePassword(msg.password),state:"lobby",createdAt:Date.now(),kind:"versus",mode:"versus",maxPlayers:2,speed:1,endMode:"versus",allowSpectators:false,disableReroll:true,enableBan:false,bannedPlants:[],bpMode:null,bpPickAsBan:false,bpState:null,bpExpectedFormations:null,deleteTimer:null,lastRankings:null,ver:msg.ver||SERVER_VERSION,players:[player],lanes:Array(LANE_COUNT).fill(null),versus:{slots:6,bp:false,sides:{plant:null,zombie:null},picks:{plant:[],zombie:[]},bans:{plant:[],zombie:[]},step:0,draftStarted:false,draftDone:false,frameSeq:0,inputSeq:{},winner:null,reason:null}};
    rooms.set(rid,room);const ci=conns.get(ws)||{};conns.set(ws,{...ci,playerId:hostId,roomId:rid,isSpectator:false,lastSeen:Date.now()});send(ws,{type:"versusRoomCreated",room:roomInfo(room),playerId:hostId,seed,sessionToken:player.sessionToken});sync(room);return;
  }
  if (msg.type === "joinVersusRoom") {
    const rid=String(msg.roomId||"").trim().toUpperCase(),room=rooms.get(rid);if(!room||room.kind!=="versus"){send(ws,{type:"error",message:"双人对战房间不存在"});return;}if(room.state!=="lobby"){send(ws,{type:"error",message:"对局已经开始"});return;}if(realPlayers(room).length>=2){send(ws,{type:"error",message:"房间已满"});return;}if(room.password&&room.password!==normalizePassword(msg.password)){send(ws,{type:"error",message:"密码错"});return;}const nick=normalizeNick(msg.nick);if(!nick){send(ws,{type:"error",message:"需要昵称"});return;}if(info?.roomId){const old=rooms.get(info.roomId);if(old)removePlayer(old,info.playerId)}const id="P"+(nextPid++),pl={id,ws,nick,lane:-1,ready:false,alive:true,survivalTime:0,formation:null,isSpectator:false,sessionToken:newSessionToken(),disconnectedAt:0,disconnectTimer:null};room.players.push(pl);const ci=conns.get(ws)||{};conns.set(ws,{...ci,playerId:id,roomId:room.id,isSpectator:false,lastSeen:Date.now()});send(ws,{type:"versusRoomJoined",room:roomInfo(room),playerId:id,seed:room.seed,sessionToken:pl.sessionToken});sync(room);return;
  }
  if (msg.type === "versusClaim") {
    const room=findRoom(ws);if(!room||room.kind!=="versus"||room.state!=="lobby")return;const side=msg.side==="plant"?"plant":msg.side==="zombie"?"zombie":null;if(!side)return;const v=room.versus;if(v.sides[side]&&v.sides[side]!==pid){send(ws,{type:"error",message:"该阵营已被抢占"});return;}for(const s of ["plant","zombie"])if(v.sides[s]===pid)v.sides[s]=null;v.sides[side]=pid;sync(room);return;
  }
  if (msg.type === "versusSwapSides") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.hostId!==pid||room.state!=="lobby")return;const v=room.versus,[a,b]=[v.sides.plant,v.sides.zombie];v.sides.plant=b;v.sides.zombie=a;sync(room);return;}
  if (msg.type === "versusRules") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.hostId!==pid||room.state!=="lobby")return;room.versus.slots=msg.slots===7?7:6;room.versus.bp=!!msg.bp;sync(room);return;}
  if (msg.type === "versusStartDraft") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.hostId!==pid||room.state!=="lobby")return;const v=room.versus;if(!v.sides.plant||!v.sides.zombie){send(ws,{type:"error",message:"双方必须先抢好阵营"});return;}v.picks={plant:[],zombie:[]};v.bans={plant:[],zombie:[]};v.step=0;v.draftStarted=true;v.draftDone=false;room.state="versusDraft";bcast(room,{type:"versusDraftState",room:roomInfo(room)});sync(room);return;}
  if (msg.type === "versusDraftAction") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.state!=="versusDraft")return;const v=room.versus,phases=versusDraftPhases(v.slots,!!v.bp),total=phases.length;if(v.step>=total)return;const ph=phases[v.step],actorSide=ph.actorSide,kind=ph.kind,targetSide=ph.targetSide;if(v.sides[actorSide]!==pid){send(ws,{type:"error",message:"还没轮到你"});return;}const id=String(msg.cardId||"");const valid=targetSide==="plant"?ALLOWED_PLANT_KEYS.has(id):/^[a-zA-Z0-9_]+$/.test(id);if(!valid){send(ws,{type:"error",message:"卡牌无效"});return;}const used=[...v.picks.plant,...v.picks.zombie,...v.bans.plant,...v.bans.zombie];if(used.includes(id)){send(ws,{type:"error",message:"该卡已被选择/Ban"});return;}if(kind==="ban")v.bans[targetSide].push(id);else v.picks[actorSide].push(id);v.step++;if(v.step>=total){v.draftDone=true;room.state="versusReady";}bcast(room,{type:"versusDraftState",room:roomInfo(room)});sync(room);return;}
  if (msg.type === "versusStartBattle") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.hostId!==pid||room.state!=="versusReady")return;room.state="battling";room.versus.frameSeq=0;room.versus.inputSeq={};room.versus.winner=null;room.versus.reason=null;bcast(room,{type:"versusBattleStart",seed:room.seed,hostId:room.hostId,sides:room.versus.sides,slots:room.versus.slots,bp:room.versus.bp,picks:room.versus.picks});sync(room);return;}
  if (msg.type === "versusFrame") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.state!=="battling"||room.hostId!==pid)return;const seq=Math.max(0,Number(msg.seq)||0);if(seq<=room.versus.frameSeq)return;const data=String(msg.data||"");if(data.length>384000)return;room.versus.frameSeq=seq;for(const p of realPlayers(room))if(p.id!==room.hostId)send(p.ws,{type:"versusFrame",seq,data});return;}
  if (msg.type === "versusInput") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.state!=="battling")return;const seq=Math.max(1,Number(msg.seq)||0),last=room.versus.inputSeq[pid]||0;if(seq<=last)return;room.versus.inputSeq[pid]=seq;const side=room.versus.sides.plant===pid?"plant":room.versus.sides.zombie===pid?"zombie":null;if(!side)return;for(const p of realPlayers(room)){if(p.id===pid)continue;send(p.ws,{type:"versusRemoteInput",playerId:pid,side,seq,action:msg.action||null})}return;}
  if (msg.type === "versusProbe") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.state!=="battling")return;for(const p of realPlayers(room)){if(p.id===pid)continue;send(p.ws,{type:"versusProbeToHost",from:pid,probeId:String(msg.probeId||""),sentAt:Number(msg.sentAt)||0})}return;}
  if (msg.type === "versusProbeAck") {const room=findRoom(ws);if(!room||room.kind!=="versus")return;const target=findPlayer(room,String(msg.to||""));if(!target||target.id===pid)return;send(target.ws,{type:"versusProbeAck",probeId:String(msg.probeId||""),sentAt:Number(msg.sentAt)||0});return;}
  if (msg.type === "versusEnd") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.hostId!==pid||room.state!=="battling")return;room.state="finished";room.versus.winner=["plant","zombie","draw"].includes(msg.winner)?msg.winner:"draw";room.versus.reason=String(msg.reason||"").slice(0,160);bcast(room,{type:"versusEnded",winner:room.versus.winner,reason:room.versus.reason,time:Number(msg.time)||0});scheduleRoomDeletion(room);sync(room);return;}
  if (msg.type === "versusRematch") {const room=findRoom(ws);if(!room||room.kind!=="versus"||room.hostId!==pid)return;clearRoomDeleteTimer(room);room.state="lobby";room.versus.picks={plant:[],zombie:[]};room.versus.bans={plant:[],zombie:[]};room.versus.step=0;room.versus.draftStarted=false;room.versus.draftDone=false;room.versus.winner=null;room.versus.reason=null;room.versus.frameSeq=0;room.versus.inputSeq={};bcast(room,{type:"versusRematchReady"});sync(room);return;}

  // ── createRoom ──
  if (msg.type === "createRoom") {
    if (rooms.size >= MAX_ROOMS) { send(ws, { type: "error", message: "房间满了" }); return; }
    const nick = normalizeNick(msg.nick);
    if (!nick) { send(ws, { type: "error", message: "需要昵称" }); return; }
    const mode = ALLOWED_MODES.has(msg.mode) ? msg.mode : "532";
    const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, parseInt(msg.maxPlayers, 10) || 5));
    // 新房间参数验证通过后再退出旧房间。
    if (info?.roomId) { const r = rooms.get(info.roomId); if (r) removePlayer(r, info.playerId); }
    const rid = newId();
    const hostId = "P" + (nextPid++);
    const seed = (Math.random() * 0xFFFFFFFF >>> 0) || 1;
    rooms.set(rid, {
      id: rid, hostId, seed, password: normalizePassword(msg.password),
      state: "lobby", createdAt: Date.now(),
      mode,
      maxPlayers,
      speed: 1,
      endMode: "allDead",
      allowSpectators: !!msg.allowSpectators,
      disableReroll: !!msg.disableReroll,
      enableBan: !!msg.enableBan,
      bannedPlants: [], // [{plantKey, by}]
      bpMode: _isBpMode(mode) ? mode : null,
      bpPickAsBan: !!msg.bpPickAsBan,
      bpState: null, bpExpectedFormations: null, deleteTimer: null, lastRankings: null,
      ver: msg.ver || "unknown",
      players: [{ id: hostId, ws, nick, lane: -1, ready: false, alive: true, survivalTime: 0, formation: null, isSpectator: false, sessionToken: newSessionToken(), disconnectedAt: 0, disconnectTimer: null }],
      lanes: Array(LANE_COUNT).fill(null)
    });
    // 保留 lastSeen，防止覆盖导致僵尸检测误判
    const existingInfo = conns.get(ws) || {};
    conns.set(ws, { ...existingInfo, playerId: hostId, roomId: rid });
    const hostPlayer = findPlayer(rooms.get(rid), hostId);
    send(ws, { type: "roomCreated", room: roomInfo(rooms.get(rid)), playerId: hostId, seed, sessionToken: hostPlayer.sessionToken, isSpectator: false });
    return;
  }

  // ── listRooms ──
  if (msg.type === "listRooms") {
    const list = [];
    for (const r of rooms.values()) {
      if (r.state === "finished") continue;
      list.push({
        id: r.id, state: r.state, hasPassword: !!r.password,
        playerCount: realPlayers(r).length, maxPlayers: r.maxPlayers,
        hostName: roomHost(r)?.nick, mode: r.mode
      });
    }
    send(ws, { type: "roomList", rooms: list });
    return;
  }

  // ── resumeRoom：只恢复 WebSocket 会话，不同步战斗过程状态 ──
  if (msg.type === "resumeRoom") {
    const roomId = String(msg.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) { send(ws, { type: "resumeFailed", message: "房间已失效" }); return; }
    const player = findPlayer(room, String(msg.playerId || ""));
    const token = String(msg.sessionToken || "");
    if (!player || !token || token !== player.sessionToken) {
      send(ws, { type: "resumeFailed", message: "会话已失效" });
      return;
    }
    const currentInfo = conns.get(ws);
    if (currentInfo?.roomId && currentInfo.roomId !== room.id) {
      const oldRoom = rooms.get(currentInfo.roomId);
      if (oldRoom) removePlayer(oldRoom, currentInfo.playerId);
    }
    if (player.ws && player.ws !== ws) {
      const oldWs = player.ws;
      conns.delete(oldWs);
      try { oldWs.close(4001, "session resumed elsewhere"); } catch (_) {}
    }
    clearPlayerDisconnectTimer(player);
    player.ws = ws;
    player.disconnectedAt = 0;
    const ci = conns.get(ws) || {};
    conns.set(ws, { ...ci, playerId: player.id, roomId: room.id, isSpectator: !!player.isSpectator, lastSeen: Date.now() });
    if (room.kind === "versus" && room.versus && player.id !== room.hostId) room.versus.inputSeq[player.id] = 0;
    send(ws, {
      type: "roomResumed", room: roomInfo(room), playerId: player.id, seed: room.seed,
      isSpectator: !!player.isSpectator, sessionToken: player.sessionToken, roomState: room.state
    });
    if (room.bpState) send(ws, { type: "bpStateUpdate", bpState: _bpStateForViewer(room, player.id, false), revealed: !!room.bpState.revealed });
    if (player.isSpectator) _sendSpectatorUpdate(room);
    if (room.state === "finished" && room.lastRankings) send(ws, { type: "battleEnd", rankings: room.lastRankings });
    // battling 时不发送任何战斗快照/进度；同一页面的本地模拟继续自行运行。
    sync(room);
    return;
  }

  // ── joinRoom ──
  if (msg.type === "joinRoom") {
    const roomId = String(msg.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) { send(ws, { type: "error", message: "房间不存在" }); return; }
    const existingConn = conns.get(ws);
    if (existingConn?.roomId === room.id) {
      const existingPlayer = findPlayer(room, existingConn.playerId);
      if (existingPlayer) {
        send(ws, { type: "roomJoined", room: roomInfo(room), playerId: existingPlayer.id, seed: room.seed, isSpectator: !!existingPlayer.isSpectator, sessionToken: existingPlayer.sessionToken });
        return;
      }
    }

    // 所有认证检查必须先于旧连接/同名玩家处理，避免错误密码也能影响房间成员。
    const nick = normalizeNick(msg.nick);
    if (!nick) { send(ws, { type: "error", message: "需要昵称" }); return; }
    if (room.password && room.password !== normalizePassword(msg.password)) { send(ws, { type: "error", message: "密码错" }); return; }
    if (msg.ver && room.ver) {
      const pg = _getVersionGroup(msg.ver);
      const rg = _getVersionGroup(room.ver);
      if (pg < 0 && rg >= 0) { send(ws, { type: "error", message: "你的版本无法识别" }); return; }
      if (rg < 0) { send(ws, { type: "error", message: "房间版本无法识别" }); return; }
      if (pg !== rg) {
        const hint = pg < rg ? "房间版本过高，请升级客户端" : "房间版本过低，请降级客户端";
        send(ws, { type: "error", message: hint + "（组" + rg + " vs 你的组" + pg + "）" });
        return;
      }
      if (msg.ver !== room.ver) send(ws, { type: "versionMismatch", hostVer: room.ver, yourVer: msg.ver });
    }

    const activeCount = realPlayers(room).length;
    const isFull = activeCount >= room.maxPlayers;
    if (room.state === "lobby" && room.allowSpectators && !msg.acceptSpectator && msg.acceptSpectator !== false) {
      send(ws, { type: "spectatorOffer", roomId: room.id, canJoin: !isFull, roomInfo: { playerCount: activeCount, maxPlayers: room.maxPlayers, hostName: roomHost(room)?.nick } });
      return;
    }
    let isSpectator = false;
    if (room.state !== "lobby") {
      if (!room.allowSpectators) { send(ws, { type: "error", message: "已开始" }); return; }
      isSpectator = true;
    } else if (isFull) {
      if (msg.acceptSpectator !== true) { send(ws, { type: "error", message: "房间满了" }); return; }
      isSpectator = true;
    } else {
      isSpectator = msg.acceptSpectator === true;
    }

    if (room.players.some(p => p.nick === nick)) {
      send(ws, { type: "error", message: "该昵称已在房间中；断线请等待自动重连" });
      return;
    }

    // 目标房间已全部验证通过后，才退出当前连接所在的其他房间。
    if (existingConn?.roomId && existingConn.roomId !== room.id) {
      const oldRoom = rooms.get(existingConn.roomId);
      if (oldRoom) removePlayer(oldRoom, existingConn.playerId);
    }

    const newPid = "P" + (nextPid++);
    const player = {
      id: newPid, ws, nick, lane: -1, ready: false, alive: true, survivalTime: 0, formation: null,
      isSpectator, sessionToken: newSessionToken(), disconnectedAt: 0, disconnectTimer: null
    };
    room.players.push(player);
    const joinInfo = conns.get(ws) || {};
    conns.set(ws, { ...joinInfo, playerId: newPid, roomId: room.id, isSpectator, lastSeen: Date.now() });
    send(ws, { type: "roomJoined", room: roomInfo(room), playerId: newPid, seed: room.seed, isSpectator, sessionToken: player.sessionToken });
    if (isSpectator) {
      _sendSpectatorUpdate(room);
      // 战斗已经开始时不补发 battleStart，避免刷新/重连时重启本地战斗模拟。
    }
    if (room.bpState) send(ws, { type: "bpStateUpdate", bpState: _bpStateForViewer(room, newPid, false), revealed: !!room.bpState.revealed });
    sync(room);
    return;
  }

  // ── leaveRoom ──
  if (msg.type === "leaveRoom") {
    const room = findRoom(ws);
    if (!room) return;
    removePlayer(room, pid);
    conns.delete(ws);
    send(ws, { type: "leftRoom" });
    return;
  }

  // ── selectLane ──
  if (msg.type === "selectLane") {
    const room = findRoom(ws);
    if (!room || room.state !== "laneSelect") return;
    const p = findPlayer(room, pid);
    if (!p || p.isSpectator) return;
    const lane = Number(msg.lane);
    if (lane < 0 || lane >= LANE_COUNT) return;
    if (p.lane >= 0) { send(ws, { type: "error", message: "已锁定路线" }); return; }
    if (room.lanes[lane] !== null) { send(ws, { type: "error", message: "路线被占了" }); return; }
    p.lane = lane;
    room.lanes[lane] = p.id;
    sync(room);
    // 全部选完 -> 自动进入BP（排除观战者）
    const allChosen = room.players.filter(p => !p.isSpectator).every(p => p.lane >= 0);
    if (allChosen) {
      room.state = "laying";
      if (room.bpMode) {
        // 新BP模式：初始化BP状态
        const nonSpectators = room.players.filter(p => !p.isSpectator);
        const playerIds = nonSpectators.map(p => p.id);
        const firstPlayerId = room.bpMode === "2p-turn" ? playerIds[Math.floor(Math.random() * playerIds.length)] : null;
        const secondPlayerId = room.bpMode === "2p-turn" ? playerIds.find(id => id !== firstPlayerId) : null;
        const actions = {};
        for (const id of playerIds) actions[id] = { bans: [], picks: [], assigns: [] };
        room.bpState = {
          bpMode: room.bpMode, firstPlayerId, secondPlayerId,
          playerIds, phaseIndex: 0,
          currentPlayerId: room.bpMode === "2p-turn" ? firstPlayerId : null,
          submitted: {}, revealed: false,
          actions, phases: _getBpPhases(room.bpMode, playerIds)
        };
        bcast(room, { type: "startBP", mode: room.mode, bpMode: room.bpMode });
        _sendBpState(room);
      } else {
        bcast(room, { type: "startBP", mode: room.mode });
      }
    }
    return;
  }

  // ── unready / ready ──
  if (msg.type === "unready") {
    const room = findRoom(ws);
    if (!room) return;
    const p = findPlayer(room, pid);
    if (!p) return;
    p.ready = false;
    sync(room);
    return;
  }

  if (msg.type === "ready") {
    const room = findRoom(ws);
    if (!room) return;
    const p = findPlayer(room, pid);
    if (!p || p.lane < 0) { send(ws, { type: "error", message: "先选路线" }); return; }
    p.ready = true;
    sync(room);
    return;
  }

  // ── changeMode (host only) ──
  if (msg.type === "changeMode") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "lobby" && room.state !== "laying") return;
    if (!ALLOWED_MODES.has(msg.mode)) return;
    room.mode = msg.mode;
    room.bpMode = _isBpMode(msg.mode) ? msg.mode : null;
    sync(room);
    return;
  }

  // ── changeMaxPlayers (host only) ──
  if (msg.type === "changeMaxPlayers") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "lobby" && room.state !== "laying") return;
    const n = parseInt(msg.maxPlayers);
    if (isNaN(n) || n < 2 || n > MAX_PLAYERS) return;
    if (realPlayers(room).length > n) { send(ws, { type: "error", message: "当前人数超过新上限" }); return; }
    room.maxPlayers = n;
    sync(room);
    return;
  }

  if (msg.type === "changeSpeed") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "lobby" && room.state !== "laying") return;
    const s = parseInt(msg.speed);
    if (s !== 1 && s !== 2 && s !== 4) return;
    room.speed = s;
    sync(room);
    return;
  }
  if (msg.type === "changeEndMode") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "lobby" && room.state !== "laying") return;
    room.endMode = room.endMode === "allDead" ? "lastLane" : "allDead";
    sync(room);
    return;
  }

  // ── toggleSpectators (host only) ──
  if (msg.type === "toggleSpectators") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    room.allowSpectators = !room.allowSpectators;
    sync(room);
    return;
  }

  // ── toggleDisableReroll (host only) ──
  if (msg.type === "toggleDisableReroll") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    room.disableReroll = !room.disableReroll;
    sync(room);
    return;
  }

  // ── toggleEnableBan (host only) ──
  if (msg.type === "toggleEnableBan") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    room.enableBan = !room.enableBan;
    if (!room.enableBan) room.bannedPlants = [];
    sync(room);
    return;
  }

  // ── banPlant ──
  if (msg.type === "banPlant") {
    const room = findRoom(ws);
    if (!room) return;
    const p = findPlayer(room, pid);
    if (!p || p.isSpectator) return;
    const plantKey = String(msg.plantKey || "").trim();
    if (!isValidPlantKey(plantKey)) { send(ws, { type: "error", message: "非法植物" }); return; }
    if (!room.bannedPlants) room.bannedPlants = [];
    const existing = room.bannedPlants.findIndex(b => b.plantKey === plantKey && b.by === pid);
    if (existing >= 0) {
      room.bannedPlants.splice(existing, 1); // 取消自己的ban
    } else {
      const myBans = room.bannedPlants.filter(b => b.by === pid);
      if (myBans.length >= 2) { send(ws, { type: "error", message: "最多ban 2 个植物" }); return; }
      room.bannedPlants.push({ plantKey, by: pid });
    }
    sync(room);
    return;
  }

  // ── confirmPhase (所有玩家确认后才推进到下一阶段) ──
  if (msg.type === "confirmPhase") {
    const room = findRoom(ws);
    if (!room) return;
    const p = findPlayer(room, pid);
    if (!p || p.isSpectator) return;
    // 每次新阶段废弃旧确认数据（防止跨阶段残留）
    if (!room.phaseConfirmations) room.phaseConfirmations = {};
    room.phaseConfirmations[pid] = true;
    const nonSpecPlayers = room.players.filter(pl => !pl.isSpectator);
    const confirmedCount = nonSpecPlayers.filter(pl => room.phaseConfirmations[pl.id]).length;
    const allConfirmed = confirmedCount === nonSpecPlayers.length;
    // 回复确认状态给发送者（用于显示 "已确认 X/Y"）
    send(ws, { type: "confirmStatus", confirmed: confirmedCount, total: nonSpecPlayers.length });
    if (allConfirmed) {
      room.phaseConfirmations = {}; // 重置
      bcast(room, { type: "phaseComplete" });
    }
    return;
  }
  if (msg.type === "startBpMode") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "laying") return;
    const nonSpectators = room.players.filter(p => !p.isSpectator);
    const playerIds = nonSpectators.map(p => p.id);
    const bpMode = room.bpMode;
    if (!bpMode) return;

    // 随机先手（仅2p-turn）
    const firstPlayerId = bpMode === "2p-turn" ? playerIds[Math.floor(Math.random() * playerIds.length)] : null;
    const secondPlayerId = bpMode === "2p-turn" ? playerIds.find(id => id !== firstPlayerId) : null;

    // 初始化每个玩家的操作记录
    const actions = {};
    for (const id of playerIds) actions[id] = { bans: [], picks: [], assigns: [] };

    room.bpState = {
      bpMode, firstPlayerId, secondPlayerId,
      playerIds,
      phaseIndex: 0,
      currentPlayerId: bpMode === "2p-turn" ? firstPlayerId : null,
      submitted: {},
      revealed: false,
      actions,
      phases: _getBpPhases(bpMode, playerIds)
    };

    _sendBpState(room);
    return;
  }

  // ── bpAction (ban/pick/assign) ──
  if (msg.type === "bpAction") {
    const room = findRoom(ws);
    if (!room || !room.bpState) return;
    const bp = room.bpState;
    const p = findPlayer(room, pid);
    if (!p || p.isSpectator) return;
    const phase = bp.phases[bp.phaseIndex];
    if (!phase) return;

    const action = String(msg.action || ""); // "ban" | "pick" | "assign"
    const plantKey = String(msg.plantKey || "");
    let targetId = msg.targetPlayerId || null;
    if (action !== phase.type) { send(ws, { type: "error", message: "BP阶段操作类型不匹配" }); return; }
    if (!isValidPlantKey(plantKey)) { send(ws, { type: "error", message: "非法植物" }); return; }

    // assign 目标由服务器决定，客户端不能改写目标。
    if (action === "assign") {
      let expectedTarget = null;
      if (bp.bpMode === "multi") {
        const myIdx = bp.playerIds.indexOf(pid);
        expectedTarget = bp.playerIds[(myIdx + 1) % bp.playerIds.length];
      } else if (bp.bpMode === "2p-assign") {
        expectedTarget = bp.playerIds.find(id => id !== pid);
      }
      if (!expectedTarget) return;
      if (targetId && targetId !== expectedTarget) { send(ws, { type: "error", message: "非法指定目标" }); return; }
      targetId = expectedTarget;
    }

    // 只按已完成阶段做全局阻挡；同时盲选阶段不会因为服务端提前知道对手选择而泄漏/阻挡。
    const completed = _bpCompletedCounts(bp);
    const committedBans = [];
    const committedPicks = [];
    for (const id of bp.playerIds) {
      const a = bp.actions[id];
      committedBans.push(...a.bans.slice(0, completed.ban));
      committedPicks.push(...a.picks.slice(0, completed.pick));
    }
    if (committedBans.includes(plantKey)) { send(ws, { type: "error", message: "该植物已被Ban" }); return; }
    if (action === "pick" && room.bpPickAsBan && committedPicks.includes(plantKey)) { send(ws, { type: "error", message: "该植物已被Pick" }); return; }
    const myList = action === "ban" ? bp.actions[pid].bans : action === "pick" ? bp.actions[pid].picks : bp.actions[pid].assigns;
    const alreadyCurrent = action === "assign"
      ? myList.slice(completed.assign).some(a => a.plantKey === plantKey)
      : myList.slice(completed[action]).includes(plantKey);
    if (alreadyCurrent) { send(ws, { type: "error", message: "本阶段不能重复选择同一植物" }); return; }

    // 轮流制：只有当前玩家可以操作
    if (phase.actor && phase.actor === "first" && pid !== bp.firstPlayerId) return;
    if (phase.actor && phase.actor === "second" && pid !== bp.secondPlayerId) return;

    // 同时制：已提交的玩家不能再操作
    if (phase.simultaneous && bp.submitted[pid]) return;

    // 同时制：已达数量上限的操作不再接受
    if (phase.simultaneous) {
      const count = phase.count || 1;
      const list = action === "ban" ? bp.actions[pid].bans : action === "pick" ? bp.actions[pid].picks : bp.actions[pid].assigns;
      const current = list.length - completed[action];
      if (current >= count) return;
    }

    // 记录操作
    if (action === "ban") {
      bp.actions[pid].bans.push(plantKey);
    } else if (action === "pick") {
      bp.actions[pid].picks.push(plantKey);
    } else if (action === "assign") {
      bp.actions[pid].assigns.push({ plantKey, targetId });
    }

    // 轮流制：立即推进
    if (phase.actor) {
      bp.phaseIndex++;
      const nextPhase = bp.phases[bp.phaseIndex];
      if (nextPhase) {
        if (nextPhase.actor === "first") bp.currentPlayerId = bp.firstPlayerId;
        else if (nextPhase.actor === "second") bp.currentPlayerId = bp.secondPlayerId;
      } else {
        // 全部完成
        _finishBpMode(room);
      }
    }

    // 同时制：检查是否所有人已提交
    if (phase.simultaneous) {
      const count = phase.count || 1;
      const list = bp.actions[pid][action === "ban" ? "bans" : action === "pick" ? "picks" : "assigns"];
      const done = (list.length - completed[action]) >= count;
      if (done) bp.submitted[pid] = true;
      const allSubmitted = bp.playerIds.every(id => bp.submitted[id]);
      if (allSubmitted) {
        // 揭示结果并广播
        bp.revealed = true;
        _sendBpState(room, true);
        // 延迟推进到下一阶段
        setTimeout(() => {
          bp.phaseIndex++;
          bp.submitted = {};
          bp.revealed = false;
          if (bp.phaseIndex >= bp.phases.length) {
            _finishBpMode(room);
          } else {
            _sendBpState(room);
          }
        }, 2000);
        return;
      }
    }

    _sendBpState(room);
    return;
  }

  // ── togglePickAsBan (host only) ──
  if (msg.type === "togglePickAsBan") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    room.bpPickAsBan = !room.bpPickAsBan;
    sync(room);
    return;
  }

  // ── requestHostAction (non-host → host) ──
  if (msg.type === "requestHostAction") {
    const room = findRoom(ws);
    if (!room) return;
    const p = findPlayer(room, pid);
    if (!p) return;
    const host = findPlayer(room, room.hostId);
    if (host?.ws?.readyState === 1) {
      send(host.ws, { type: "hostRequest", action: msg.action, value: msg.value, from: p.nick });
    }
    return;
  }

  // ── startGame (host only, broadcast enterLaneSelection) ──
  if (msg.type === "startGame") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "lobby") return;
    const nonSpec = room.players.filter(p => !p.isSpectator);
    if (nonSpec.length < 2) { send(ws, { type: "error", message: "至少2人" }); return; }
    // BP模式人数限制
    if (room.bpMode === "2p-turn" || room.bpMode === "2p-blind" || room.bpMode === "2p-assign") {
      if (nonSpec.length !== 2) { send(ws, { type: "error", message: "双人BP需要恰好2名玩家" }); return; }
    } else if (room.bpMode === "multi") {
      if (nonSpec.length < 3 || nonSpec.length > 5) { send(ws, { type: "error", message: "多人BP需要3-5名玩家" }); return; }
    }
    room.state = "laneSelect";
    bcast(room, { type: "enterLaneSelection", mode: room.mode });
    return;
  }

  // ── startBP (host only, all lanes must be chosen) ──
  if (msg.type === "startBP") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "laying") return;
    // 所有非观战玩家必须选完路线（排除观战者）
    const allChosen = room.players.filter(p => !p.isSpectator).every(p => p.lane >= 0);
    if (!allChosen) { send(ws, { type: "error", message: "所有玩家需先选路线" }); return; }
    bcast(room, { type: "startBP", mode: room.mode });
    return;
  }

  // ── uploadFormation ──
  if (msg.type === "uploadFormation") {
    const room = findRoom(ws);
    if (!room) return;
    const p = findPlayer(room, pid);
    if (!p || p.isSpectator) return;
    if (!Array.isArray(msg.formation) || msg.formation.length !== 5) {
      send(ws, { type: "error", message: "阵型必须是5株植物" }); return;
    }
    const formation = msg.formation.map(x => String(x || ""));
    if (!formation.every(isValidPlantKey)) { send(ws, { type: "error", message: "阵型包含非法植物" }); return; }
    const legacyBanned = new Set((room.bannedPlants || []).map(b => b.plantKey));
    if (formation.some(k => legacyBanned.has(k))) { send(ws, { type: "error", message: "阵型包含已禁用植物" }); return; }
    const expected = room.bpExpectedFormations?.[pid];
    if (expected && !sameMultiset(formation, expected)) { send(ws, { type: "error", message: "阵型与BP结果不一致" }); return; }
    p.formation = formation;
    p.ready = true;
    sync(room);
    // 给观战者推送详细阵型
    _sendSpectatorUpdate(room);
    const allUploaded = room.players.filter(p => !p.isSpectator).every(p => p.formation && p.formation.length === 5);
    if (allUploaded) {
      const host = findPlayer(room, room.hostId);
      if (host?.ws?.readyState === 1) {
        send(host.ws, { type: "allFormationsUploaded" });
      }
    }
    return;
  }

  // ── startBattle ──
  if (msg.type === "startBattle") {
    const room = findRoom(ws);
    if (!room) return;
    if (room.hostId !== pid) { send(ws, { type: "error", message: "仅房主可开始" }); return; }
    if (room.state !== "laying") return;
    const withFormations = room.players.filter(p => !p.isSpectator && p.formation && p.formation.length === 5);
    if (withFormations.length < 2) { send(ws, { type: "error", message: "至少2人上传阵型" }); return; }
    clearRoomDeleteTimer(room);
    room.lastRankings = null;
    room.state = "battling";
    const formations = {};
    for (const p of room.players) {
      if (p.lane >= 0 && p.formation) {
        formations["lane" + p.lane] = p.formation;
      }
    }
    const battleMsg = {
      type: "battleStart",
      seed: room.seed,
      mode: room.mode,
      speed: room.speed,
      endMode: room.endMode,
      formations: formations
    };
    // 保存 battleData 给观战者
    room.battleData = battleMsg;
    bcast(room, battleMsg);
    for (const p of room.players) { p.alive = true; p.survivalTime = 0; p.resultSubmitted = false; }
    room.battleResults = new Map();
    return;
  }

  // ── stopSimulation (host only) ──
  if (msg.type === "stopSimulation") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "battling") return;
    clearRoomDeleteTimer(room);
    room.state = "lobby";
    room.bannedPlants = [];
    for (const p of room.players) { p.formation = null; p.ready = false; p.alive = true; p.survivalTime = 0; p.resultSubmitted = false; p.lane = -1; }
    room.lanes = Array(LANE_COUNT).fill(null);
    room.battleResults = null;
    room.battleData = null;
    room.bpExpectedFormations = null;
    bcast(room, { type: "simulationStopped", forced: true });
    sync(room);
    return;
  }

  // ── resetRoom (任意玩家在游戏结束后重置房间状态) ──
  if (msg.type === "resetRoom") {
    const room = findRoom(ws);
    if (!room) return;
    if (room.state !== "battling" && room.state !== "finished") return;
    if (!room.endedPlayers) room.endedPlayers = {};
    room.endedPlayers[pid] = true;
    // 只记录，不广播不重置
    return;
  }

  // ── checkAllEnded (开始游戏前检查是否所有人都已结束模拟) ──
  if (msg.type === "checkAllEnded") {
    const room = findRoom(ws);
    if (!room) return;
    const nonSpec = room.players.filter(p => !p.isSpectator);
    const endedCount = nonSpec.filter(p => room.endedPlayers && room.endedPlayers[p.id]).length;
    const allEnded = endedCount === nonSpec.length;
    if (allEnded) {
      // 所有人已结束，重置房间状态
      room.state = "lobby";
      room.endedPlayers = {};
      room.bannedPlants = [];
      for (const p of room.players) { p.formation = null; p.ready = false; p.alive = true; p.survivalTime = 0; p.resultSubmitted = false; p.lane = -1; }
      room.lanes = Array(LANE_COUNT).fill(null);
      clearRoomDeleteTimer(room);
      room.battleResults = null;
      room.battleData = null;
      room.bpExpectedFormations = null;
      bcast(room, { type: "simulationStopped", forced: true });
      sync(room);
    } else {
      send(ws, { type: "waitingPlayers", ended: endedCount, total: nonSpec.length });
    }
    return;
  }

  // ── battleResult (只在战斗结束后上报；不进行战斗过程同步) ──
  if (msg.type === "battleResult") {
    const room = findRoom(ws);
    if (!room || room.state !== "battling") return;
    const p = findPlayer(room, pid);
    if (!p || p.isSpectator || p.resultSubmitted) return;
    const rawResults = msg.results && typeof msg.results === "object" ? msg.results : {};
    const results = {};
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const key = "lane" + lane;
      const value = Number(rawResults[key]);
      if (Number.isFinite(value) && value >= 0 && value <= 1e8) results[key] = value;
    }
    p.resultSubmitted = true;
    if (!room.battleResults) room.battleResults = new Map();
    room.battleResults.set(pid, results);
    _tryFinishBattle(room);
    return;
  }

  // ── kick (host only, any state) ──
  if (msg.type === "kick") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    const target = findPlayer(room, msg.playerId);
    if (!target || target.id === pid) return;
    const targetWs = target.ws;
    send(targetWs, { type: "kicked" });
    if (targetWs) conns.delete(targetWs);
    removePlayer(room, target.id);
    try { targetWs?.close(4003, "kicked"); } catch (_) {}
    return;
  }

  // ── checkConnections (host only, returns lastSeen for all players) ──
  if (msg.type === "checkConnections") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    const now = Date.now();
    const info = [];
    for (const p of room.players) {
      // 优先直接查 ws，失败则按 playerId 查找（防止 ws 引用过期）
      let cinfo = conns.get(p.ws);
      if (!cinfo) {
        for (const [ws2, info2] of conns) {
          if (info2.playerId === p.id) { cinfo = info2; break; }
        }
      }
      const lastSeen = cinfo?.lastSeen || 0;
      // 找不到连接信息时视为活跃（不踢）
      const age = cinfo ? Math.round((now - lastSeen) / 1000) : 0;
      info.push({ id: p.id, nick: p.nick, lastSeen, age });
    }
    send(ws, { type: "connectionStatus", players: info });
    return;
  }

  // ── rematch (host only, from results screen) ──
  if (msg.type === "rematch") {
    const room = findRoom(ws);
    if (!room || room.hostId !== pid) return;
    if (room.state !== "finished") return;
    clearRoomDeleteTimer(room);
    room.state = "lobby";
    room.bannedPlants = [];
    for (const p of room.players) { p.formation = null; p.ready = false; p.alive = true; p.survivalTime = 0; p.resultSubmitted = false; p.lane = -1; }
    room.lanes = Array(LANE_COUNT).fill(null);
    room.battleResults = null;
    room.battleData = null;
    room.bpExpectedFormations = null;
    room.lastRankings = null;
    bcast(room, { type: "rematch" });
    sync(room);
    return;
  }

  // ── uploadStats ──
  if (msg.type === "uploadStats") {
    const nick = normalizeNick(msg.nick);
    if (!nick) { send(ws, { type: "error", message: "需要昵称" }); return; }
    const games = parseInt(msg.games);
    const totalScore = parseFloat(msg.totalScore);
    const browserId = (msg.browserId || "").trim();
    if (isNaN(games) || isNaN(totalScore)) { send(ws, { type: "error", message: "数据格式错误" }); return; }
    if (!browserId) { send(ws, { type: "error", message: "缺少浏览器ID" }); return; }
    const scores = loadScores();
    const existing = scores[nick];
    if (existing) {
      // 已有条目：只有同一浏览器才能更新
      if (existing.browserId && existing.browserId !== browserId) {
        send(ws, { type: "uploadStatsError", message: "该昵称已被其他浏览器绑定，无法覆盖" });
        return;
      }
      // 只增不减
      if (games > existing.games || (games === existing.games && totalScore > existing.totalScore)) {
        existing.games = games;
        existing.totalScore = totalScore;
        existing.browserId = browserId;
        existing.lastSeen = Date.now();
      }
    } else {
      // 新条目
      scores[nick] = { nick, games, totalScore, browserId, firstSeen: Date.now(), lastSeen: Date.now() };
    }
    saveScores(scores);
    send(ws, { type: "uploadStatsOk" });
    return;
  }

  // ── getLeaderboard ──
  if (msg.type === "getLeaderboard") {
    const scores = loadScores();
    const list = Object.values(scores)
      .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
      .slice(0, 50)
      .map(e => ({
        nick: e.nick,
        games: e.games || 0,
        totalScore: e.totalScore || 0,
        avgScore: e.games > 0 ? Math.round((e.totalScore / e.games) * 100) / 100 : 0
      }));
    send(ws, { type: "leaderboard", entries: list });
    return;
  }

  // ── ping ──
  if (msg.type === "ping") { send(ws, { type: "pong" }); }
}

function _tryFinishBattle(room) {
  if (!room || room.state !== "battling" || !room.battleResults) return false;
  const participants = realPlayers(room);
  if (participants.length === 0 || !participants.every(p => p.resultSubmitted)) return false;
  const rankings = [];
  for (const pl of participants) {
    if (pl.lane < 0) continue;
    const results = room.battleResults.get(pl.id) || {};
    const time = Number(results["lane" + pl.lane]) || 0;
    rankings.push({ lane: pl.lane, nick: pl.nick, time });
  }
  rankings.sort((a, b) => b.time - a.time);
  room.state = "finished";
  room.lastRankings = rankings;
  bcast(room, { type: "battleEnd", rankings });
  scheduleRoomDeletion(room);
  return true;
}

// server
// Railway 的 Edge Proxy 会通过 HTTP/HTTPS 访问服务；WebSocket 也从同一 HTTP 端口 Upgrade。
// 显式绑定 0.0.0.0 + Railway 注入的 PORT，避免 502 Application failed to respond。
const HOST = process.env.HOST || "0.0.0.0";
let homeTunnel = null;

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Railway healthcheck：必须快速返回 HTTP 200。
  if (url.pathname === "/health" || url.pathname === "/healthz") {
    const body = JSON.stringify({
      ok: true,
      service: "pvz-s7-battle-server",
      version: SERVER_VERSION,
      uptime: Math.round(process.uptime()),
      rooms: rooms.size,
      connections: conns.size,
      homeTunnel: homeTunnel ? {
        enabled: !!homeTunnel.enabled,
        brokerConnected: !!homeTunnel.status().brokerConnected,
        clients: Number(homeTunnel.status().clients || 0)
      } : { enabled: false, brokerConnected: false, clients: 0 }
    });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body)
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return;
  }

  // 直接访问 Railway 域名时给出可读的在线状态，而不是 ws 库默认的 426。
  if (url.pathname === "/") {
    const body = JSON.stringify({
      ok: true,
      service: "PVZ S7 multiplayer WebSocket server",
      websocket: "ready",
      health: "/health"
    });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body)
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

// WebSocket 与 HTTP 健康检查共用同一端口。
const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_WS_PAYLOAD });

// 心跳超时检测：90秒无响应的连接视为断线，自动清理
const HEARTBEAT_TIMEOUT = 240000;
const heartbeatCheck = setInterval(() => {
  wss.clients.forEach((ws) => {
    const info = conns.get(ws);
    if (!info) return;
    if (!info.lastSeen) { info.lastSeen = Date.now(); return; }
    if (Date.now() - info.lastSeen > HEARTBEAT_TIMEOUT) {
      try { ws.terminate(); } catch (_) {}
    }
  });
}, 15000);

wss.on("connection", (ws) => {
  registerConnection(ws);
  ws.on("message", (data) => receiveConnectionMessage(ws, data.toString()));
  ws.on("close", () => closeConnection(ws));
  ws.on("error", () => {});
});

// 2服家庭服反向隧道：只有家庭启动脚本设置 S7_HOME_TUNNEL=1 时启用。
// Railway 1服默认不启用，因此不会争抢家庭服 MQTT channel。
homeTunnel = startHomeMqttTunnel({
  enabled: process.env.S7_HOME_TUNNEL === "1",
  serverVersion: SERVER_VERSION,
  onOpen: (sock) => registerConnection(sock),
  onMessage: (sock, raw) => receiveConnectionMessage(sock, raw),
  onClose: (sock) => closeConnection(sock)
});

wss.on("close", () => { clearInterval(heartbeatCheck); });

httpServer.on("error", (err) => {
  console.error("[PVZ-S7 Server] HTTP server error:", err);
  process.exitCode = 1;
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[PVZ-S7 Server] HTTP health: http://${HOST}:${PORT}/health`);
  console.log(`[PVZ-S7 Server] WebSocket: ws://${HOST}:${PORT}`);
  console.log(`[PVZ-S7 Server] listening on ${HOST}:${PORT}`);
  if (homeTunnel?.enabled) console.log(`[PVZ-S7 Server] 2服反向 MQTT 隧道: enabled`);
});

function shutdown(signal) {
  console.log(`[PVZ-S7 Server] ${signal} received, shutting down...`);
  clearInterval(heartbeatCheck);
  try { homeTunnel?.stop(); } catch (_) {}
  for (const ws of wss.clients) {
    try { ws.close(1001, "server shutdown"); } catch (_) {}
  }
  wss.close(() => {
    httpServer.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
