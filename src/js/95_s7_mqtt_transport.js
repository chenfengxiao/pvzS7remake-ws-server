// ============================================================
// 95_s7_mqtt_transport.js
// S7 Secure MQTT 灾备服 Transport
// - 无自建常驻服务器：浏览器直连公共 MQTT Broker
// - 房主浏览器承担房间权威状态机
// - RoomSecret + AES-256-GCM + ECDSA P-256 + ECDH P-256
// - 命令 seq 防重放；retained 仅保存公开权威房间快照
// - BP 私密命令走 Host↔Player ECDH 点对点密钥
// - battleStart 之后绝不同步战斗过程状态；仅战斗结束提交 battleResult
// ============================================================
(function() {
"use strict";

var ROOT = "pvzs7/v1";
var LOBBY_PREFIX = ROOT + "/lobby/room/";
var DEFAULT_BROKER = "wss://broker.emqx.io:8084/mqtt";
var LOBBY_TTL_MS = 65000;
var LOBBY_HEARTBEAT_MS = 20000;
var PRESENCE_MS = 20000;
var PLAYER_OFFLINE_MS = 70000;
var PLAYER_REAP_SWEEP_MS = 10000;
var SESSION_TTL_MS = 6 * 60 * 60 * 1000;
var MAX_PLAYERS = 5;
var LANE_COUNT = 5;
var GAME_VERSION = "1.7.1";
var SESSION_KEY = "pvz_s7_mqtt_session_v1";
var HOST_STATE_PREFIX = "pvz_s7_mqtt_host_v1_";
var PBKDF2_ITERS = 150000;

var ALLOWED_MODES = new Set(["532", "42421", "51x5", "2p-turn", "2p-blind", "multi", "2p-assign"]);
var ALLOWED_PLANT_KEYS = new Set([
  "wallnut", "tallnut", "cactus", "explodenut", "chomper", "garlic", "spikerock", "snowpea",
  "repeater", "puff", "scaredy", "squash", "threepeater", "seashroom", "splitpea", "cabbage", "cattail",
  "firelotus", "reverseRepeater", "ghost", "sniper", "sunflower", "sunshroom", "hypno", "iceshroom", "kelp",
  "torchwood", "plantern", "blover", "magnet", "kernel", "umbrella", "marigold", "goldmagnet", "timegrass",
  "barley", "starfruit", "fume", "gloom", "potato", "melon", "gatling", "winter"
]);
var CUTOFF_VERSIONS = ["1.4.2", "1.5.1", "1.5.5", "1.5.7", "1.5.8", "1.5.9", "1.6.0", "1.7.0"];

var te = new TextEncoder();
var td = new TextDecoder();

// ============================================================
// Mini MQTT 3.1.1 over WebSocket
// 只实现本项目需要的 CONNECT / SUBSCRIBE / PUBLISH(QoS0) / PING / DISCONNECT
// ============================================================
function _u8(x) { return x instanceof Uint8Array ? x : new Uint8Array(x || 0); }
function _concat() {
  var total = 0, i;
  for (i = 0; i < arguments.length; i++) total += arguments[i].length;
  var out = new Uint8Array(total), off = 0;
  for (i = 0; i < arguments.length; i++) { out.set(arguments[i], off); off += arguments[i].length; }
  return out;
}
function _utf8Field(s) {
  var b = te.encode(String(s || ""));
  if (b.length > 65535) throw new Error("MQTT UTF-8 field too long");
  return _concat(new Uint8Array([b.length >> 8, b.length & 255]), b);
}
function _encRemain(n) {
  var a = [];
  do {
    var d = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) d |= 128;
    a.push(d);
  } while (n > 0);
  return new Uint8Array(a);
}
function _packet(first, body) { return _concat(new Uint8Array([first]), _encRemain(body.length), body); }

function MiniMqtt(url, clientId) {
  this.url = url;
  this.clientId = clientId;
  this.ws = null;
  this.connected = false;
  this.shouldReconnect = false;
  this.reconnectTimer = null;
  this.keepTimer = null;
  this.buffer = new Uint8Array(0);
  this.packetId = 1;
  this.filters = new Set();
  this.onconnect = null;
  this.onclose = null;
  this.onreconnecting = null;
  this.onerror = null;
  this.onmessage = null;
}
MiniMqtt.prototype.connect = function() {
  this.shouldReconnect = true;
  this._open();
};
MiniMqtt.prototype._open = function() {
  var self = this;
  if (!this.shouldReconnect) return;
  try {
    var ws = new WebSocket(this.url, ["mqtt"]);
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    ws.onopen = function() { self._sendConnect(); };
    ws.onmessage = function(ev) { self._feed(_u8(ev.data)); };
    ws.onerror = function() { if (self.onerror) self.onerror(new Error("MQTT WebSocket error")); };
    ws.onclose = function() {
      var was = self.connected;
      self.connected = false;
      self._stopKeepalive();
      if (self.onclose) self.onclose(was);
      if (self.shouldReconnect) self._scheduleReconnect();
    };
  } catch (e) {
    if (this.onerror) this.onerror(e);
    this._scheduleReconnect();
  }
};
MiniMqtt.prototype._scheduleReconnect = function() {
  var self = this;
  if (!this.shouldReconnect || this.reconnectTimer) return;
  if (this.onreconnecting) this.onreconnecting();
  this.reconnectTimer = setTimeout(function() {
    self.reconnectTimer = null;
    self._open();
  }, 3000);
};
MiniMqtt.prototype._sendRaw = function(bytes) {
  if (this.ws && this.ws.readyState === 1) this.ws.send(bytes);
};
MiniMqtt.prototype._sendConnect = function() {
  var vh = _concat(_utf8Field("MQTT"), new Uint8Array([4, 2, 0, 30]));
  var payload = _utf8Field(this.clientId);
  this._sendRaw(_packet(0x10, _concat(vh, payload)));
};
MiniMqtt.prototype.subscribe = function(filter) {
  filter = String(filter || "");
  if (!filter) return;
  this.filters.add(filter);
  if (!this.connected) return;
  var pid = this.packetId++ & 0xffff;
  if (!pid) pid = this.packetId++ & 0xffff;
  var body = _concat(new Uint8Array([pid >> 8, pid & 255]), _utf8Field(filter), new Uint8Array([0]));
  this._sendRaw(_packet(0x82, body));
};
MiniMqtt.prototype.publish = function(topic, payload, retain) {
  if (!this.connected) return false;
  var pb = typeof payload === "string" ? te.encode(payload) : _u8(payload);
  var body = _concat(_utf8Field(topic), pb);
  this._sendRaw(_packet(0x30 | (retain ? 1 : 0), body));
  return true;
};
MiniMqtt.prototype._feed = function(chunk) {
  this.buffer = _concat(this.buffer, chunk);
  var pos = 0;
  while (pos + 2 <= this.buffer.length) {
    var first = this.buffer[pos], mul = 1, rem = 0, idx = pos + 1, d, count = 0;
    do {
      if (idx >= this.buffer.length) { this.buffer = this.buffer.slice(pos); return; }
      d = this.buffer[idx++]; rem += (d & 127) * mul; mul *= 128; count++;
      if (count > 4) { this.buffer = new Uint8Array(0); return; }
    } while (d & 128);
    if (idx + rem > this.buffer.length) { this.buffer = this.buffer.slice(pos); return; }
    var body = this.buffer.slice(idx, idx + rem);
    this._handlePacket(first, body);
    pos = idx + rem;
  }
  this.buffer = this.buffer.slice(pos);
};
MiniMqtt.prototype._handlePacket = function(first, body) {
  var type = first >> 4;
  if (type === 2) {
    if (body.length < 2 || body[1] !== 0) {
      if (this.onerror) this.onerror(new Error("MQTT CONNACK rejected"));
      try { this.ws.close(); } catch (_) {}
      return;
    }
    this.connected = true;
    var self = this;
    this.filters.forEach(function(f) { self.subscribe(f); });
    this._startKeepalive();
    if (this.onconnect) this.onconnect();
    return;
  }
  if (type === 3) {
    if (body.length < 2) return;
    var len = (body[0] << 8) | body[1];
    if (body.length < 2 + len) return;
    var topic = td.decode(body.slice(2, 2 + len));
    var payload = body.slice(2 + len);
    if (this.onmessage) this.onmessage(topic, payload, !!(first & 1));
    return;
  }
  // PINGRESP / SUBACK 无需额外处理
};
MiniMqtt.prototype._startKeepalive = function() {
  var self = this;
  this._stopKeepalive();
  this.keepTimer = setInterval(function() { self._sendRaw(new Uint8Array([0xC0, 0x00])); }, 20000);
};
MiniMqtt.prototype._stopKeepalive = function() {
  if (this.keepTimer) clearInterval(this.keepTimer);
  this.keepTimer = null;
};
MiniMqtt.prototype.end = function() {
  this.shouldReconnect = false;
  if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  this.reconnectTimer = null;
  this._stopKeepalive();
  if (this.ws && this.ws.readyState === 1) {
    try { this.ws.send(new Uint8Array([0xE0, 0x00])); } catch (_) {}
  }
  try { if (this.ws) this.ws.close(); } catch (_) {}
  this.ws = null;
  this.connected = false;
};

// 2服反向 MQTT 隧道复用同一条最小 MQTT wire 实现，避免再维护第二份 MQTT 编解码器。
window.S7MiniMqttV1 = window.S7MiniMqttV1 || MiniMqtt;

// ============================================================
// Crypto helpers
// ============================================================
function _rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function _secureIndex(n) { if (!(n > 0)) return 0; var a = _rand(4); var x = (((a[0] << 24) >>> 0) + (a[1] << 16) + (a[2] << 8) + a[3]) >>> 0; return x % n; }
function _b64u(bytes) {
  var s = "", i; bytes = _u8(bytes);
  for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function _unb64u(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  var bin = atob(s), a = new Uint8Array(bin.length), i;
  for (i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function _hex(bytes) { return Array.from(bytes).map(function(x) { return x.toString(16).padStart(2, "0"); }).join(""); }
async function _sha(bytes) { return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); }
async function _deriveRoomKey(secret) {
  var base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: te.encode("PVZS7-MQTT-V1"), info: te.encode("room-aes") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function _deriveTopicId(secret) { return _hex(await _sha(_concat(te.encode("PVZS7-TOPIC-V1:"), secret))).slice(0, 40); }
async function _genSign() { return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); }
async function _genEcdh() { return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]); }
async function _exportRaw(key) { return new Uint8Array(await crypto.subtle.exportKey("raw", key)); }
async function _exportJwk(key) { return crypto.subtle.exportKey("jwk", key); }
async function _importSignPub(raw) { return crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]); }
async function _importEcdhPub(raw) { return crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, true, []); }
async function _importSignPriv(jwk) { return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]); }
async function _importEcdhPriv(jwk) { return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]); }
async function _sign(priv, bytes) { return new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, bytes)); }
async function _verify(pub, sig, bytes) { return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, bytes); }
async function _derivePairKey(priv, remotePub, roomSecret) {
  var bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: remotePub }, priv, 256));
  var base = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: roomSecret, info: te.encode("PVZS7-MQTT-V1-pair") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function _encrypt(key, obj, aad) {
  var iv = _rand(12);
  var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: te.encode(aad) }, key, te.encode(JSON.stringify(obj))));
  return { iv: _b64u(iv), ct: _b64u(ct) };
}
async function _decrypt(key, iv, ct, aad) {
  var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: _unb64u(iv), additionalData: te.encode(aad) }, key, _unb64u(ct));
  return JSON.parse(td.decode(plain));
}
function _envBytes(e) { return te.encode([e.v, e.k, e.rid, e.from || "", e.seq || 0, e.iv || "", e.ct || ""].join("|")); }
async function _pbkdfKey(password, salt) {
  var base = await crypto.subtle.importKey("raw", te.encode(String(password || "")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: PBKDF2_ITERS }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function _wrapSecret(secret, password) {
  var salt = _rand(16), key = await _pbkdfKey(password, salt), iv = _rand(12);
  var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, secret));
  return { salt: _b64u(salt), iv: _b64u(iv), ct: _b64u(ct) };
}
async function _unwrapSecret(wrap, password) {
  var key = await _pbkdfKey(password, _unb64u(wrap.salt));
  var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: _unb64u(wrap.iv) }, key, _unb64u(wrap.ct));
  return new Uint8Array(plain);
}

// ============================================================
// Shared helpers
// ============================================================
function _parseVer(s) {
  var p = String(s || "").split(".").map(Number);
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
  var v = _parseVer(ver); if (!v) return -1;
  var group = 0, i;
  for (i = 0; i < CUTOFF_VERSIONS.length; i++) {
    var c = _parseVer(CUTOFF_VERSIONS[i]);
    if (_verCmp(v, c) >= 0) group++; else break;
  }
  return group;
}
function _normNick(v) { return String(v || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 24); }
function _validPlant(k) { return typeof k === "string" && ALLOWED_PLANT_KEYS.has(k); }
function _sameMultiset(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  var m = new Map(), i, n;
  for (i = 0; i < a.length; i++) m.set(a[i], (m.get(a[i]) || 0) + 1);
  for (i = 0; i < b.length; i++) { n = m.get(b[i]) || 0; if (!n) return false; if (n === 1) m.delete(b[i]); else m.set(b[i], n - 1); }
  return m.size === 0;
}
function _isBpMode(mode) { return mode === "2p-turn" || mode === "2p-blind" || mode === "multi" || mode === "2p-assign"; }
function _newRoomId() {
  var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", a = _rand(6), s = "", i;
  for (i = 0; i < a.length; i++) s += chars[a[i] % chars.length];
  return s;
}
function _newPlayerId(prefix) { return prefix + "_" + _b64u(_rand(7)); }
function _newSeed() { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; }
function _clone(o) { return JSON.parse(JSON.stringify(o)); }
function _roomBase(topicId) { return ROOT + "/r/" + topicId; }

function _getBpPhases(bpMode) {
  if (bpMode === "2p-turn") return [
    {type:"ban",actor:"first"},{type:"ban",actor:"second"},{type:"ban",actor:"first"},{type:"ban",actor:"second"},
    {type:"pick",actor:"second"},{type:"pick",actor:"first"},{type:"pick",actor:"second"},{type:"pick",actor:"first"},{type:"pick",actor:"second"},{type:"pick",actor:"first"},
    {type:"ban",actor:"first"},{type:"ban",actor:"second"},{type:"ban",actor:"first"},{type:"ban",actor:"second"},
    {type:"pick",actor:"second"},{type:"pick",actor:"first"},{type:"pick",actor:"second"},{type:"pick",actor:"first"}
  ];
  if (bpMode === "2p-blind") return [{type:"ban",count:2,simultaneous:true},{type:"pick",count:3,simultaneous:true},{type:"ban",count:2,simultaneous:true},{type:"pick",count:2,simultaneous:true}];
  if (bpMode === "multi") return [{type:"assign",count:2,simultaneous:true},{type:"ban",count:2,simultaneous:true},{type:"pick",count:3,simultaneous:true}];
  if (bpMode === "2p-assign") return [{type:"assign",count:2,simultaneous:true},{type:"ban",count:3,simultaneous:true},{type:"pick",count:3,simultaneous:true}];
  return [];
}
function _bpCompletedCounts(bp) {
  var c = {ban:0,pick:0,assign:0}, i, ph;
  for (i = 0; i < bp.phaseIndex; i++) { ph = bp.phases[i]; if (ph && c[ph.type] != null) c[ph.type] += ph.count || 1; }
  return c;
}
function _bpForViewer(room, viewerId, forceReveal) {
  var bp = room.bpState; if (!bp) return null;
  var reveal = !!forceReveal || !!bp.revealed || bp.bpMode === "2p-turn";
  var done = _bpCompletedCounts(bp), actions = {}, i, id, src, own;
  for (i = 0; i < bp.playerIds.length; i++) {
    id = bp.playerIds[i]; src = bp.actions[id] || {bans:[],picks:[],assigns:[]}; own = id === viewerId;
    actions[id] = {
      bans: reveal || own ? src.bans.slice() : src.bans.slice(0, done.ban),
      picks: reveal || own ? src.picks.slice() : src.picks.slice(0, done.pick),
      assigns: reveal || own ? src.assigns.map(function(a){return Object.assign({},a);}) : src.assigns.slice(0, done.assign).map(function(a){return Object.assign({},a);})
    };
  }
  return { bpMode:bp.bpMode, firstPlayerId:bp.firstPlayerId, secondPlayerId:bp.secondPlayerId, playerIds:bp.playerIds.slice(), phaseIndex:bp.phaseIndex, currentPlayerId:bp.currentPlayerId, submitted:Object.assign({},bp.submitted), revealed:!!forceReveal||!!bp.revealed, actions:actions, phases:bp.phases.map(function(x){return Object.assign({},x);}) };
}

// ============================================================
// Host authoritative room engine
// ============================================================
function HostEngine(transport, room, hostKeys) {
  this.t = transport;
  this.room = room;
  this.signPriv = hostKeys.signPriv;
  this.signPub = hostKeys.signPub;
  this.ecdhPriv = hostKeys.ecdhPriv;
  this.ecdhPub = hostKeys.ecdhPub;
  this.pairCache = new Map();
  this.bpAdvanceTimer = null;
  this.finishTimer = null;
}
HostEngine.prototype.player = function(id) { return this.room.players.find(function(p){return p.id===id;}) || null; };
HostEngine.prototype.realPlayers = function() { return this.room.players.filter(function(p){return !p.isSpectator;}); };
HostEngine.prototype.roomInfo = function() {
  var r = this.room, now = Date.now();
  return {
    id:r.id, hostId:r.hostId, seed:r.seed, state:r.state, hasPassword:!!r.hasPassword, mode:r.mode, maxPlayers:r.maxPlayers,
    speed:r.speed, endMode:r.endMode, allowSpectators:!!r.allowSpectators, disableReroll:!!r.disableReroll, enableBan:!!r.enableBan,
    bannedPlants:(r.bannedPlants||[]).map(function(b){return {plantKey:b.plantKey,by:b.by};}), bpMode:r.bpMode||null, bpPickAsBan:!!r.bpPickAsBan,
    players:r.players.map(function(p){return { id:p.id,nick:p.nick,lane:p.lane,ready:p.ready,alive:p.alive,survivalTime:p.survivalTime,formation:p.formation?p.formation.length:0,uploaded:!!p.formation,isSpectator:!!p.isSpectator,connected:(now-(p.lastSeen||0))<PLAYER_OFFLINE_MS };}),
    lanes:r.lanes.slice(),
    // 关键阶段恢复信息：只保存 battleStart 的初始条件，绝不包含战斗过程状态。
    // 这样即使公共 MQTT 的瞬时 event 丢包，客户端仍可从 retained roomUpdate 恢复进入战斗。
    battleInit:(r.state==="battling"&&r.battleInit)?{
      seed:r.battleInit.seed,mode:r.battleInit.mode,speed:r.battleInit.speed,endMode:r.battleInit.endMode,
      formations:Object.keys(r.battleInit.formations||{}).reduce(function(o,k){o[k]=(r.battleInit.formations[k]||[]).slice();return o;},{})
    }:null
  };
};
HostEngine.prototype._persist = function() { this.t._persistHostEngine(); };
HostEngine.prototype.sync = async function() {
  this.room.stateVersion = (this.room.stateVersion || 0) + 1;
  this._persist();
  await this.t._publishState({ type:"roomUpdate", room:this.roomInfo(), sv:this.room.stateVersion });
  await this.t._publishLobby();
  await this._sendSpectatorUpdate();
};
HostEngine.prototype.broadcast = function(msg) { return this.t._publishEvent(msg); };
HostEngine.prototype.sendTo = function(pid, msg) { return this.t._sendDirect(pid, msg); };
HostEngine.prototype.error = function(pid, text) { return this.sendTo(pid, {type:"error",message:text}); };
HostEngine.prototype._pairFor = async function(p) {
  if (p.id === this.room.hostId) return null;
  if (this.pairCache.has(p.id)) return this.pairCache.get(p.id);
  var pub = await _importEcdhPub(_unb64u(p.ecdhPub));
  var k = await _derivePairKey(this.ecdhPriv, pub, this.t.roomSecret);
  this.pairCache.set(p.id, k); return k;
};
HostEngine.prototype._sendBpState = async function(forceReveal) {
  var ps = this.room.players.slice(), i, p;
  for (i = 0; i < ps.length; i++) { p = ps[i]; await this.sendTo(p.id, {type:"bpStateUpdate",bpState:_bpForViewer(this.room,p.id,!!forceReveal),revealed:!!forceReveal}); }
};
HostEngine.prototype._finishBp = async function() {
  var bp = this.room.bpState; if (!bp) return;
  var formations = {}, i, p, a, assigned, oid, other, j, asg;
  for (i = 0; i < this.room.players.length; i++) {
    p = this.room.players[i]; if (p.isSpectator) continue; a = bp.actions[p.id]; if (!a) continue; assigned = [];
    for (oid in bp.actions) { other = bp.actions[oid]; for (j = 0; j < other.assigns.length; j++) { asg = other.assigns[j]; if (asg.targetId === p.id) assigned.push(asg.plantKey); } }
    formations[p.id] = assigned.concat(a.picks);
  }
  this.room.bpExpectedFormations = formations; this.room.bpState = null;
  await this.sync(); await this.broadcast({type:"bpComplete",formations:formations});
};
HostEngine.prototype._sendSpectatorUpdate = async function() {
  var formations = {}, i, p;
  for (i=0;i<this.room.players.length;i++){p=this.room.players[i];if(p.isSpectator||p.lane<0)continue;formations["lane"+p.lane]={nick:p.nick,lane:p.lane,formation:p.formation||null,uploaded:!!p.formation};}
  var specs=this.room.players.filter(function(x){return x.isSpectator;});
  for(i=0;i<specs.length;i++) await this.sendTo(specs[i].id,{type:"spectatorUpdate",state:this.room.state,formations:formations});
};
HostEngine.prototype._removePlayer = async function(pid) {
  var r=this.room, idx=r.players.findIndex(function(p){return p.id===pid;}); if(idx<0)return;
  var removed=r.players[idx]; if(removed.lane>=0)r.lanes[removed.lane]=null; r.players.splice(idx,1); this.pairCache.delete(pid);
  if (pid===r.hostId) { await this.broadcast({type:"roomClosed",message:"3服房主已离开，房间关闭"}); await this.t._closeHostedRoom(); return; }
  var active=this.realPlayers();
  if(active.length===0){await this.broadcast({type:"roomClosed",message:"房间已关闭"});await this.t._closeHostedRoom();return;}
  if(!removed.isSpectator&&(r.state==="laneSelect"||r.state==="laying")){
    r.state="lobby";r.bpState=null;r.bpExpectedFormations=null;r.phaseConfirmations={};r.bannedPlants=[];r.lanes=Array(LANE_COUNT).fill(null);
    r.players.forEach(function(p){p.lane=-1;p.ready=false;p.formation=null;p.resultSubmitted=false;});
    await this.broadcast({type:"setupReset",message:"有玩家离开，选路/BP已重置"});
  }
  await this._tryFinishBattle(); await this.sync();
};
HostEngine.prototype._reapOfflinePlayers = async function() {
  var r=this.room,now=Date.now(),stale=r.players.filter(function(p){return p.id!==r.hostId&&(now-(p.lastSeen||0))>=PLAYER_OFFLINE_MS;}).map(function(p){return p.id;});
  if(!stale.length)return false;
  for(var i=0;i<stale.length;i++){
    var p=this.player(stale[i]);
    // presence/命令可能在扫描期间刚刚到达，再做一次年龄确认，避免误删。
    if(p&&(Date.now()-(p.lastSeen||0))>=PLAYER_OFFLINE_MS)await this._removePlayer(p.id);
  }
  return true;
};
HostEngine.prototype._tryFinishBattle = async function() {
  var r=this.room;if(r.state!=="battling")return false;
  var ps=this.realPlayers();if(!ps.length||!ps.every(function(p){return !!p.resultSubmitted;}))return false;
  var rankings=[],i,p,res,time;
  for(i=0;i<ps.length;i++){p=ps[i];if(p.lane<0)continue;res=(r.battleResults&&r.battleResults[p.id])||{};time=Number(res["lane"+p.lane])||0;rankings.push({lane:p.lane,nick:p.nick,time:time});}
  rankings.sort(function(a,b){return b.time-a.time;});r.state="finished";r.lastRankings=rankings;
  await this.broadcast({type:"battleEnd",rankings:rankings});await this.sync();return true;
};
HostEngine.prototype._resetPlayerRoundState = function(p) {
  if(!p)return;
  var r=this.room;
  if(p.lane>=0&&r.lanes[p.lane]===p.id)r.lanes[p.lane]=null;
  p.lane=-1;
  p.ready=false;
  p.formation=null;
  p.alive=true;
  p.survivalTime=0;
  p.resultSubmitted=false;
};
HostEngine.prototype._resetRoundForLobby = function() {
  // 只清“本局/玩家临时状态”，房主设置必须原样保留：
  // mode/maxPlayers/speed/endMode/allowSpectators/disableReroll/enableBan/bpMode/bpPickAsBan/password 等均不改。
  var r=this.room;
  r.state="lobby";
  r.endedPlayers={};
  r.bannedPlants=[]; // 本局 Ban 结果，不是“是否启用 Ban”的房主设置。
  r.bpState=null;
  r.bpExpectedFormations=null;
  r.phaseConfirmations={};
  r.battleResults={};
  r.lastRankings=null;
  r.battleInit=null;
  r.players.forEach(this._resetPlayerRoundState.bind(this));
  r.lanes=Array(LANE_COUNT).fill(null);
};
HostEngine.prototype.handle = async function(pid,msg) {
  var r=this.room,p=this.player(pid),i,n,lane,allChosen,nonSpec,plantKey,existing,myBans,bp,phase,action,targetId,completed,committedBans,committedPicks,myList,alreadyCurrent,count,list,done,allSubmitted,first,second,actions,formation,expected,withFormations,forms,raw,results,key,val,endedCount,info,now,target;
  if(!msg||!msg.type)return;
  if(p)p.lastSeen=Date.now();

  if(msg.type==="ping"||msg.type==="presence"){if(p)this._persist();return;}
  if(!p){return;}
  if(msg.type==="resumeRoom"){
    p.lastSeen=Date.now();
    await this.sendTo(pid,{type:"roomResumed",room:this.roomInfo(),playerId:p.id,seed:r.seed,isSpectator:!!p.isSpectator,sessionToken:"mqtt-local",roomState:r.state});
    if(r.bpState)await this.sendTo(pid,{type:"bpStateUpdate",bpState:_bpForViewer(r,p.id,false),revealed:!!r.bpState.revealed});
    if(p.isSpectator)await this._sendSpectatorUpdate();
    if(r.state==="finished"&&r.lastRankings)await this.sendTo(pid,{type:"battleEnd",rankings:r.lastRankings});
    await this.sync();return;
  }
  if(msg.type==="leaveRoom"){
    if(pid!==r.hostId)await this.sendTo(pid,{type:"leftRoom"});
    await this._removePlayer(pid);return;
  }

  if(msg.type==="selectLane"){
    if(r.state!=="laneSelect"||p.isSpectator)return;lane=Number(msg.lane);if(lane<0||lane>=LANE_COUNT)return;
    if(p.lane>=0){await this.error(pid,"已锁定路线");return;}if(r.lanes[lane]!==null){await this.error(pid,"路线被占了");return;}
    p.lane=lane;r.lanes[lane]=p.id;await this.sync();allChosen=this.realPlayers().every(function(x){return x.lane>=0;});
    if(allChosen){r.state="laying";if(r.bpMode){nonSpec=this.realPlayers();var ids=nonSpec.map(function(x){return x.id;});first=r.bpMode==="2p-turn"?ids[_secureIndex(ids.length)]:null;second=r.bpMode==="2p-turn"?ids.find(function(id){return id!==first;}):null;actions={};ids.forEach(function(id){actions[id]={bans:[],picks:[],assigns:[]};});r.bpState={bpMode:r.bpMode,firstPlayerId:first,secondPlayerId:second,playerIds:ids,phaseIndex:0,currentPlayerId:r.bpMode==="2p-turn"?first:null,submitted:{},revealed:false,actions:actions,phases:_getBpPhases(r.bpMode)};await this.broadcast({type:"startBP",mode:r.mode,bpMode:r.bpMode});await this._sendBpState(false);}else await this.broadcast({type:"startBP",mode:r.mode});await this.sync();}
    return;
  }
  if(msg.type==="unready"){p.ready=false;await this.sync();return;}
  if(msg.type==="ready"){if(p.lane<0){await this.error(pid,"先选路线");return;}p.ready=true;await this.sync();return;}
  if(msg.type==="changeMode"){
    if(r.hostId!==pid||(r.state!=="lobby"&&r.state!=="laying")||!ALLOWED_MODES.has(msg.mode))return;r.mode=msg.mode;r.bpMode=_isBpMode(msg.mode)?msg.mode:null;await this.sync();return;
  }
  if(msg.type==="changeMaxPlayers"){
    if(r.hostId!==pid||(r.state!=="lobby"&&r.state!=="laying"))return;n=parseInt(msg.maxPlayers,10);if(isNaN(n)||n<2||n>MAX_PLAYERS)return;if(this.realPlayers().length>n){await this.error(pid,"当前人数超过新上限");return;}r.maxPlayers=n;await this.sync();return;
  }
  if(msg.type==="changeSpeed"){
    if(r.hostId!==pid||(r.state!=="lobby"&&r.state!=="laying"))return;n=parseInt(msg.speed,10);if(n!==1&&n!==2&&n!==4)return;r.speed=n;await this.sync();return;
  }
  if(msg.type==="changeEndMode"){
    if(r.hostId!==pid||(r.state!=="lobby"&&r.state!=="laying"))return;r.endMode=r.endMode==="allDead"?"lastLane":"allDead";await this.sync();return;
  }
  if(msg.type==="toggleSpectators"){if(r.hostId!==pid)return;r.allowSpectators=!r.allowSpectators;await this.sync();return;}
  if(msg.type==="toggleDisableReroll"){if(r.hostId!==pid)return;r.disableReroll=!r.disableReroll;await this.sync();return;}
  if(msg.type==="toggleEnableBan"){if(r.hostId!==pid)return;r.enableBan=!r.enableBan;if(!r.enableBan)r.bannedPlants=[];await this.sync();return;}
  if(msg.type==="togglePickAsBan"){if(r.hostId!==pid)return;r.bpPickAsBan=!r.bpPickAsBan;await this.sync();return;}
  if(msg.type==="banPlant"){
    if(p.isSpectator)return;plantKey=String(msg.plantKey||"").trim();if(!_validPlant(plantKey)){await this.error(pid,"非法植物");return;}existing=r.bannedPlants.findIndex(function(b){return b.plantKey===plantKey&&b.by===pid;});
    if(existing>=0)r.bannedPlants.splice(existing,1);else{myBans=r.bannedPlants.filter(function(b){return b.by===pid;});if(myBans.length>=2){await this.error(pid,"最多ban 2 个植物");return;}r.bannedPlants.push({plantKey:plantKey,by:pid});}await this.sync();return;
  }
  if(msg.type==="confirmPhase"){
    if(p.isSpectator)return;if(!r.phaseConfirmations)r.phaseConfirmations={};r.phaseConfirmations[pid]=true;nonSpec=this.realPlayers();var cc=nonSpec.filter(function(x){return r.phaseConfirmations[x.id];}).length;await this.sendTo(pid,{type:"confirmStatus",confirmed:cc,total:nonSpec.length});if(cc===nonSpec.length){r.phaseConfirmations={};await this.broadcast({type:"phaseComplete"});}this._persist();return;
  }
  if(msg.type==="bpAction"){
    if(!r.bpState||p.isSpectator)return;bp=r.bpState;phase=bp.phases[bp.phaseIndex];if(!phase)return;action=String(msg.action||"");plantKey=String(msg.plantKey||"");targetId=msg.targetPlayerId||null;
    if(action!==phase.type){await this.error(pid,"BP阶段操作类型不匹配");return;}if(!_validPlant(plantKey)){await this.error(pid,"非法植物");return;}
    if(action==="assign"){var expectedTarget=null;if(bp.bpMode==="multi"){var mi=bp.playerIds.indexOf(pid);expectedTarget=bp.playerIds[(mi+1)%bp.playerIds.length];}else if(bp.bpMode==="2p-assign")expectedTarget=bp.playerIds.find(function(id){return id!==pid;});if(!expectedTarget)return;if(targetId&&targetId!==expectedTarget){await this.error(pid,"非法指定目标");return;}targetId=expectedTarget;}
    completed=_bpCompletedCounts(bp);committedBans=[];committedPicks=[];bp.playerIds.forEach(function(id){var a=bp.actions[id];committedBans.push.apply(committedBans,a.bans.slice(0,completed.ban));committedPicks.push.apply(committedPicks,a.picks.slice(0,completed.pick));});
    if(committedBans.indexOf(plantKey)>=0){await this.error(pid,"该植物已被Ban");return;}if(action==="pick"&&r.bpPickAsBan&&committedPicks.indexOf(plantKey)>=0){await this.error(pid,"该植物已被Pick");return;}
    myList=action==="ban"?bp.actions[pid].bans:action==="pick"?bp.actions[pid].picks:bp.actions[pid].assigns;alreadyCurrent=action==="assign"?myList.slice(completed.assign).some(function(a){return a.plantKey===plantKey;}):myList.slice(completed[action]).indexOf(plantKey)>=0;if(alreadyCurrent){await this.error(pid,"本阶段不能重复选择同一植物");return;}
    if(phase.actor==="first"&&pid!==bp.firstPlayerId)return;if(phase.actor==="second"&&pid!==bp.secondPlayerId)return;if(phase.simultaneous&&bp.submitted[pid])return;
    if(phase.simultaneous){count=phase.count||1;list=action==="ban"?bp.actions[pid].bans:action==="pick"?bp.actions[pid].picks:bp.actions[pid].assigns;if(list.length-completed[action]>=count)return;}
    if(action==="ban")bp.actions[pid].bans.push(plantKey);else if(action==="pick")bp.actions[pid].picks.push(plantKey);else bp.actions[pid].assigns.push({plantKey:plantKey,targetId:targetId});
    if(phase.actor){bp.phaseIndex++;var np=bp.phases[bp.phaseIndex];if(np){bp.currentPlayerId=np.actor==="first"?bp.firstPlayerId:np.actor==="second"?bp.secondPlayerId:null;}else{await this._finishBp();return;}}
    if(phase.simultaneous){count=phase.count||1;list=bp.actions[pid][action==="ban"?"bans":action==="pick"?"picks":"assigns"];done=(list.length-completed[action])>=count;if(done)bp.submitted[pid]=true;allSubmitted=bp.playerIds.every(function(id){return bp.submitted[id];});if(allSubmitted){bp.revealed=true;await this._sendBpState(true);var self=this;if(this.bpAdvanceTimer)clearTimeout(this.bpAdvanceTimer);this.bpAdvanceTimer=setTimeout(function(){(async function(){bp.phaseIndex++;bp.submitted={};bp.revealed=false;if(bp.phaseIndex>=bp.phases.length)await self._finishBp();else await self._sendBpState(false);self._persist();})().catch(function(e){console.error(e);});},2000);this._persist();return;}}
    await this._sendBpState(false);this._persist();return;
  }
  if(msg.type==="requestHostAction"){
    if(pid===r.hostId)return;await this.sendTo(r.hostId,{type:"hostRequest",action:msg.action,value:msg.value,from:p.nick});return;
  }
  if(msg.type==="startGame"){
    if(r.hostId!==pid||r.state!=="lobby")return;nonSpec=this.realPlayers();if(nonSpec.length<2){await this.error(pid,"至少2人");return;}if((r.bpMode==="2p-turn"||r.bpMode==="2p-blind"||r.bpMode==="2p-assign")&&nonSpec.length!==2){await this.error(pid,"双人BP需要恰好2名玩家");return;}if(r.bpMode==="multi"&&(nonSpec.length<3||nonSpec.length>5)){await this.error(pid,"多人BP需要3-5名玩家");return;}r.state="laneSelect";await this.broadcast({type:"enterLaneSelection",mode:r.mode});await this.sync();return;
  }
  if(msg.type==="startBP"){
    if(r.hostId!==pid||r.state!=="laying")return;allChosen=this.realPlayers().every(function(x){return x.lane>=0;});if(!allChosen){await this.error(pid,"所有玩家需先选路线");return;}await this.broadcast({type:"startBP",mode:r.mode});return;
  }
  if(msg.type==="uploadFormation"){
    if(p.isSpectator)return;if(!Array.isArray(msg.formation)||msg.formation.length!==5){await this.error(pid,"阵型必须是5株植物");return;}formation=msg.formation.map(function(x){return String(x||"");});if(!formation.every(_validPlant)){await this.error(pid,"阵型包含非法植物");return;}var banned=new Set((r.bannedPlants||[]).map(function(b){return b.plantKey;}));if(formation.some(function(k){return banned.has(k);})){await this.error(pid,"阵型包含已禁用植物");return;}expected=r.bpExpectedFormations&&r.bpExpectedFormations[pid];if(expected&&!_sameMultiset(formation,expected)){await this.error(pid,"阵型与BP结果不一致");return;}p.formation=formation;p.ready=true;await this.sync();allSubmitted=this.realPlayers().every(function(x){return x.formation&&x.formation.length===5;});if(allSubmitted)await this.sendTo(r.hostId,{type:"allFormationsUploaded"});return;
  }
  if(msg.type==="startBattle"){
    if(r.hostId!==pid){await this.error(pid,"仅房主可开始");return;}if(r.state!=="laying")return;withFormations=this.realPlayers().filter(function(x){return x.formation&&x.formation.length===5;});if(withFormations.length<2){await this.error(pid,"至少2人上传阵型");return;}r.lastRankings=null;r.state="battling";forms={};r.players.forEach(function(x){if(x.lane>=0&&x.formation)forms["lane"+x.lane]=x.formation.slice();});r.players.forEach(function(x){x.alive=true;x.survivalTime=0;x.resultSubmitted=false;});r.battleResults={};
    // 只缓存 battleStart 初始条件用于 retained 状态恢复；绝不缓存/同步任何战斗过程状态。
    r.battleInit={seed:r.seed,mode:r.mode,speed:r.speed,endMode:r.endMode,formations:Object.keys(forms).reduce(function(o,k){o[k]=forms[k].slice();return o;},{})};
    // 先发低延迟瞬时事件，再发布 retained 权威 roomUpdate 作为可靠兜底。
    await this.broadcast({type:"battleStart",seed:r.seed,mode:r.mode,speed:r.speed,endMode:r.endMode,formations:forms});await this.sync();return;
  }
  if(msg.type==="stopSimulation"){
    if(r.hostId!==pid||r.state!=="battling")return;this._resetRoundForLobby();await this.broadcast({type:"simulationStopped",forced:true});await this.sync();return;
  }
  if(msg.type==="resetRoom"){
    if(r.state!=="battling"&&r.state!=="finished")return;
    if(!r.endedPlayers)r.endedPlayers={};
    r.endedPlayers[pid]=true;
    // 正常结算后的“返回房间”：立即只清这个玩家的本局状态，让其看起来和刚加入房间时一致。
    // 房主的模式/速度/结束条件/观战/Ban/BP 等设置完全保留。
    if(r.state==="finished")this._resetPlayerRoundState(p);
    nonSpec=this.realPlayers();
    endedCount=nonSpec.filter(function(x){return r.endedPlayers&&r.endedPlayers[x.id];}).length;
    if(r.state==="finished"&&endedCount===nonSpec.length){
      this._resetRoundForLobby();
      await this.sync();
    }else{
      await this.sync();
    }
    return;
  }
  if(msg.type==="checkAllEnded"){
    nonSpec=this.realPlayers();endedCount=nonSpec.filter(function(x){return r.endedPlayers&&r.endedPlayers[x.id];}).length;if(endedCount===nonSpec.length){this._resetRoundForLobby();await this.broadcast({type:"simulationStopped",forced:true});await this.sync();}else await this.sendTo(pid,{type:"waitingPlayers",ended:endedCount,total:nonSpec.length});return;
  }
  if(msg.type==="battleResult"){
    if(r.state!=="battling"||p.isSpectator||p.resultSubmitted)return;raw=msg.results&&typeof msg.results==="object"?msg.results:{};results={};for(i=0;i<LANE_COUNT;i++){key="lane"+i;val=Number(raw[key]);if(Number.isFinite(val)&&val>=0&&val<=1e8)results[key]=val;}p.resultSubmitted=true;r.battleResults[pid]=results;this._persist();await this._tryFinishBattle();return;
  }
  if(msg.type==="kick"){
    if(r.hostId!==pid)return;target=this.player(msg.playerId);if(!target||target.id===pid)return;await this.sendTo(target.id,{type:"kicked"});await this._removePlayer(target.id);return;
  }
  if(msg.type==="checkConnections"){
    if(r.hostId!==pid)return;now=Date.now();info=r.players.map(function(x){return {id:x.id,nick:x.nick,lastSeen:x.lastSeen||0,age:Math.max(0,Math.round((now-(x.lastSeen||now))/1000))};});await this.sendTo(pid,{type:"connectionStatus",players:info});return;
  }
  if(msg.type==="rematch"){
    if(r.hostId!==pid||r.state!=="finished")return;this._resetRoundForLobby();await this.broadcast({type:"rematch"});await this.sync();return;
  }
  if(msg.type==="getLeaderboard"){await this.sendTo(pid,{type:"leaderboard",entries:[]});return;}
  if(msg.type==="uploadStats"){await this.sendTo(pid,{type:"uploadStatsError",message:"3服为无服务器灾备线路，不写入官方排行榜"});return;}
};

// ============================================================
// Secure transport coordinator
// ============================================================
function SecureMqttTransport() {
  this.sink = function(){};
  this.broker = DEFAULT_BROKER;
  this.mqtt = null;
  this.connected = false;
  this.lobby = new Map();
  this.roomSecret = null;
  this.roomKey = null;
  this.topicId = null;
  this.roomId = null;
  this.playerId = null;
  this.isHost = false;
  this.isSpectator = false;
  this.playerSign = null;
  this.playerEcdh = null;
  this.hostSignPub = null;
  this.hostEcdhPub = null;
  this.pairKey = null;
  this.seq = 0;
  this.eventSeqSeen = 0;
  this.stateVersionSeen = 0;
  this.hostEngine = null;
  this.pendingJoin = null;
  this.lobbyTimer = null;
  this.presenceTimer = null;
  this.reapTimer = null;
  this._roomSubscriptions = [];
  // 浏览器刷新/关闭属于主动退出，不做跨页面会话恢复。
  // 为 pagehide/beforeunload 预先准备好已加密签名的离房包，避免卸载阶段再等待 WebCrypto。
  this._pageExitPacket = null;
  this._freshPageCleanupDone = false;
}
SecureMqttTransport.prototype.setSink = function(fn) { this.sink = typeof fn === "function" ? fn : function(){}; };
SecureMqttTransport.prototype._emit = function(kind,data){ try{this.sink(kind,data);}catch(e){console.error(e);} };
SecureMqttTransport.prototype.configure = function(opts){opts=opts||{};if(opts.broker)this.broker=opts.broker;if(opts.gameVersion)GAME_VERSION=opts.gameVersion;};
SecureMqttTransport.prototype.isConnected = function(){return !!this.connected;};
SecureMqttTransport.prototype.connect = function() {
  if(this.mqtt&&this.mqtt.shouldReconnect)return;
  var self=this, cid="s7game_"+_b64u(_rand(10));
  this.mqtt=new MiniMqtt(this.broker,cid);
  this.mqtt.onconnect=function(){self.connected=true;self.mqtt.subscribe(LOBBY_PREFIX+"+");self._resubscribeRoom();self._emit("connected");self._cleanupAbandonedPersistedState().catch(function(e){console.warn("S7 MQTT fresh-page cleanup",e);});};
  this.mqtt.onclose=function(){if(self.connected){self.connected=false;self._emit("disconnected");}};
  this.mqtt.onreconnecting=function(){self._emit("reconnecting",{delay:3000,count:1});};
  this.mqtt.onerror=function(e){self._emit("error",{message:"3服 MQTT 连接错误："+(e&&e.message?e.message:"unknown")});};
  this.mqtt.onmessage=function(topic,payload,retain){self._onMessage(topic,payload,retain).catch(function(e){console.error("S7 MQTT message",e);});};
  this.mqtt.connect();
};
SecureMqttTransport.prototype.disconnect = function() {
  this._stopTimers();
  if(this.mqtt)this.mqtt.end();this.mqtt=null;this.connected=false;this._emit("disconnected");
};
SecureMqttTransport.prototype._stopTimers=function(){if(this.lobbyTimer)clearInterval(this.lobbyTimer);if(this.presenceTimer)clearInterval(this.presenceTimer);if(this.reapTimer)clearInterval(this.reapTimer);this.lobbyTimer=null;this.presenceTimer=null;this.reapTimer=null;};
SecureMqttTransport.prototype._resubscribeRoom=function(){if(!this.mqtt||!this.topicId)return;var base=_roomBase(this.topicId);this.mqtt.subscribe(base+"/state");this.mqtt.subscribe(base+"/event");this.mqtt.subscribe(base+"/join");if(this.playerId){this.mqtt.subscribe(base+"/direct/"+this.playerId);if(this.isHost)this.mqtt.subscribe(base+"/cmd/+");}};
SecureMqttTransport.prototype._startTimers=function(){var self=this;this._stopTimers();if(this.isHost){this.lobbyTimer=setInterval(function(){self._publishLobby().catch(function(){});},LOBBY_HEARTBEAT_MS);this.reapTimer=setInterval(function(){if(self.hostEngine)self.hostEngine._reapOfflinePlayers().catch(function(e){console.warn("S7 MQTT reap",e);});},PLAYER_REAP_SWEEP_MS);}this.presenceTimer=setInterval(function(){if(self.roomId&&!self.isHost)self._sendPlayerCommand({type:"presence"}).catch(function(){});else if(self.hostEngine&&self.playerId){var p=self.hostEngine.player(self.playerId);if(p){p.lastSeen=Date.now();self.hostEngine._persist();}}},PRESENCE_MS);};
SecureMqttTransport.prototype._lobbyRooms=function(){var now=Date.now(),arr=[];this.lobby.forEach(function(x){if(x&&x.expiresAt>now&&x.state!=="finished")arr.push({id:x.rid,state:x.state,hasPassword:!!x.hasPassword,playerCount:x.playerCount||0,maxPlayers:x.maxPlayers||5,hostName:x.hostName||"?",mode:x.mode||"532"});});arr.sort(function(a,b){return a.id.localeCompare(b.id);});return arr.slice(0,100);};
SecureMqttTransport.prototype._publishLobby=async function(){if(!this.isHost||!this.hostEngine||!this.mqtt||!this.mqtt.connected)return;var r=this.hostEngine.room,entry={v:1,rid:r.id,topicId:this.topicId,createdAt:r.createdAt,expiresAt:Date.now()+LOBBY_TTL_MS,state:r.state,hasPassword:!!r.hasPassword,playerCount:this.hostEngine.realPlayers().length,maxPlayers:r.maxPlayers,hostName:(this.hostEngine.player(r.hostId)||{}).nick||"?",mode:r.mode,ver:r.ver,hostSignPub:r.hostSignPub,hostEcdhPub:r.hostEcdhPub};if(r.hasPassword)entry.wrap=r.secretWrap;else entry.secret=_b64u(this.roomSecret);this.lobby.set(r.id,entry);this.mqtt.publish(LOBBY_PREFIX+r.id,JSON.stringify(entry),true);};
SecureMqttTransport.prototype._publishState=async function(msg){if(!this.isHost||!this.hostEngine)return;var r=this.hostEngine.room,seq=r.stateVersion||1,aad="state|"+r.id+"|"+seq,x=await _encrypt(this.roomKey,msg,aad),e={v:1,k:"state",rid:r.id,from:r.hostId,seq:seq,iv:x.iv,ct:x.ct,aad:aad};e.sig=_b64u(await _sign(this.hostEngine.signPriv,_envBytes(e)));this.mqtt.publish(_roomBase(this.topicId)+"/state",JSON.stringify(e),true);if(this.playerId===r.hostId)this._emit("message",msg);};
SecureMqttTransport.prototype._publishEvent=async function(msg){if(!this.isHost||!this.hostEngine)return;var r=this.hostEngine.room;r.eventSeq=(r.eventSeq||0)+1;var seq=r.eventSeq,aad="event|"+r.id+"|"+seq,x=await _encrypt(this.roomKey,msg,aad),e={v:1,k:"event",rid:r.id,from:r.hostId,seq:seq,iv:x.iv,ct:x.ct,aad:aad};e.sig=_b64u(await _sign(this.hostEngine.signPriv,_envBytes(e)));this.mqtt.publish(_roomBase(this.topicId)+"/event",JSON.stringify(e),false);this.hostEngine._persist();this._emit("message",msg);this._refreshPageExitPacket().catch(function(){});};
SecureMqttTransport.prototype._sendDirect=async function(pid,msg){if(!this.isHost||!this.hostEngine)return;var r=this.hostEngine.room;if(pid===r.hostId){this._emit("message",msg);return;}var p=this.hostEngine.player(pid);if(!p)return;var key=await this.hostEngine._pairFor(p);r.directSeq=(r.directSeq||0)+1;var seq=r.directSeq,aad="direct|"+r.id+"|"+pid+"|"+seq,x=await _encrypt(key,msg,aad),e={v:1,k:"direct",rid:r.id,to:pid,from:r.hostId,seq:seq,iv:x.iv,ct:x.ct,aad:aad};e.sig=_b64u(await _sign(this.hostEngine.signPriv,_envBytes(e)));this.mqtt.publish(_roomBase(this.topicId)+"/direct/"+pid,JSON.stringify(e),false);this.hostEngine._persist();};
SecureMqttTransport.prototype._persistSession=async function(){if(!this.roomId||!this.playerId)return;try{var s={v:1,savedAt:Date.now(),roomId:this.roomId,topicId:this.topicId,roomSecret:_b64u(this.roomSecret),playerId:this.playerId,isHost:this.isHost,isSpectator:this.isSpectator,seq:this.seq,hostSignPub:_b64u(await _exportRaw(this.hostSignPub)),hostEcdhPub:_b64u(await _exportRaw(this.hostEcdhPub)),playerSignPriv:await _exportJwk(this.playerSign.privateKey),playerSignPub:await _exportJwk(this.playerSign.publicKey),playerEcdhPriv:await _exportJwk(this.playerEcdh.privateKey),playerEcdhPub:await _exportJwk(this.playerEcdh.publicKey)};localStorage.setItem(SESSION_KEY,JSON.stringify(s));}catch(e){console.warn(e);}};
SecureMqttTransport.prototype._clearSession=function(){try{localStorage.removeItem(SESSION_KEY);}catch(_){}this.roomId=null;this.topicId=null;this.roomSecret=null;this.roomKey=null;this.playerId=null;this.isHost=false;this.isSpectator=false;this.pairKey=null;this.hostEngine=null;this.pendingJoin=null;this.seq=0;this.stateVersionSeen=0;this.eventSeqSeen=0;this._pageExitPacket=null;};
SecureMqttTransport.prototype._persistHostEngine=async function(){if(!this.isHost||!this.hostEngine)return;try{var r=this.hostEngine.room,obj={v:1,savedAt:Date.now(),room:r,signPriv:await _exportJwk(this.hostEngine.signPriv),signPub:await _exportJwk(this.hostEngine.signPub),ecdhPriv:await _exportJwk(this.hostEngine.ecdhPriv),ecdhPub:await _exportJwk(this.hostEngine.ecdhPub),roomSecret:_b64u(this.roomSecret)};localStorage.setItem(HOST_STATE_PREFIX+r.id,JSON.stringify(obj));await this._persistSession();}catch(e){console.warn(e);}};
SecureMqttTransport.prototype._cleanupAbandonedPersistedState=async function(){
  // 只有“新页面首次连接且当前尚未进入房间”才执行。
  // 同一页面内的 MQTT 自动重连保留内存会话，不受影响。
  if(this.roomId||this._freshPageCleanupDone)return;
  this._freshPageCleanupDone=true;
  try{localStorage.removeItem(SESSION_KEY);}catch(_){}
  var stale=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.indexOf(HOST_STATE_PREFIX)===0)stale.push(k);
    }
  }catch(_){}
  for(var j=0;j<stale.length;j++){
    var key=stale[j],raw=null,obj=null,rid=null,tid=null;
    try{raw=localStorage.getItem(key);obj=raw?JSON.parse(raw):null;rid=obj&&obj.room&&obj.room.id?String(obj.room.id):key.slice(HOST_STATE_PREFIX.length);if(obj&&obj.roomSecret)tid=await _deriveTopicId(_unb64u(obj.roomSecret));}catch(_){}
    if(rid){this.lobby.delete(rid);if(this.mqtt&&this.mqtt.connected)this.mqtt.publish(LOBBY_PREFIX+rid,new Uint8Array(0),true);}
    if(tid&&this.mqtt&&this.mqtt.connected)this.mqtt.publish(_roomBase(tid)+"/state",new Uint8Array(0),true);
    try{localStorage.removeItem(key);}catch(_){}
  }
};
SecureMqttTransport.prototype._refreshPageExitPacket=async function(){
  if(!this.roomId||!this.playerId||!this.mqtt)return;
  if(this.isHost&&this.hostEngine){
    var r=this.hostEngine.room,seq=(r.eventSeq||0)+1,aad="event|"+r.id+"|"+seq,x=await _encrypt(this.roomKey,{type:"roomClosed",message:"3服房主已离开，房间关闭"},aad),e={v:1,k:"event",rid:r.id,from:r.hostId,seq:seq,iv:x.iv,ct:x.ct,aad:aad};
    e.sig=_b64u(await _sign(this.hostEngine.signPriv,_envBytes(e)));
    this._pageExitPacket={kind:"host",topic:_roomBase(this.topicId)+"/event",payload:JSON.stringify(e),rid:r.id,tid:this.topicId};
    return;
  }
  if(!this.isHost&&this.pairKey&&this.playerSign){
    var nseq=(this.seq||0)+1,body={type:"leaveRoom",playerId:this.playerId,seq:nseq},caad="cmd|"+this.roomId+"|"+this.playerId+"|"+nseq,cx=await _encrypt(this.pairKey,body,caad),ce={v:1,k:"cmd",rid:this.roomId,from:this.playerId,seq:nseq,iv:cx.iv,ct:cx.ct,aad:caad};
    ce.sig=_b64u(await _sign(this.playerSign.privateKey,_envBytes(ce)));
    this._pageExitPacket={kind:"guest",topic:_roomBase(this.topicId)+"/cmd/"+this.playerId,payload:JSON.stringify(ce),seq:nseq};
  }
};
SecureMqttTransport.prototype.pageExit=function(){
  // pagehide/beforeunload 不等待 Promise；这里只发送提前准备好的同步 MQTT PUBLISH。
  var rid=this.roomId,tid=this.topicId,p=this._pageExitPacket;
  try{if(p&&this.mqtt&&this.mqtt.connected)this.mqtt.publish(p.topic,p.payload,false);}catch(_){}
  if(this.isHost&&rid){
    try{if(this.mqtt&&this.mqtt.connected){this.mqtt.publish(LOBBY_PREFIX+rid,new Uint8Array(0),true);if(tid)this.mqtt.publish(_roomBase(tid)+"/state",new Uint8Array(0),true);}}catch(_){}
    this.lobby.delete(rid);
    try{localStorage.removeItem(HOST_STATE_PREFIX+rid);}catch(_){}
  }
  this._stopTimers();
  this._clearSession();
};
SecureMqttTransport.prototype._closeHostedRoom=async function(){var rid=this.roomId,tid=this.topicId;if(rid&&this.mqtt&&this.mqtt.connected){this.mqtt.publish(LOBBY_PREFIX+rid,new Uint8Array(0),true);if(tid)this.mqtt.publish(_roomBase(tid)+"/state",new Uint8Array(0),true);}if(rid)this.lobby.delete(rid);try{if(rid)localStorage.removeItem(HOST_STATE_PREFIX+rid);}catch(_){}this._clearSession();this._stopTimers();};

SecureMqttTransport.prototype._createRoom=async function(msg){
  // 创建新房前必须彻底回收当前/遗留房间，避免旧 Host 会话污染新房。
  if(this.roomId){if(this.isHost&&this.hostEngine)await this._closeHostedRoom();else{try{await this._sendPlayerCommand({type:"leaveRoom"});}catch(_){}this._clearSession();this._stopTimers();}}
  await this._cleanupAbandonedPersistedState();
  var nick=_normNick(msg.nick);if(!nick){this._emit("message",{type:"error",message:"需要昵称"});return;}var mode=ALLOWED_MODES.has(msg.mode)?msg.mode:"532",max=Math.max(2,Math.min(MAX_PLAYERS,parseInt(msg.maxPlayers,10)||5)),rid=_newRoomId(),secret=_rand(32),roomKey=await _deriveRoomKey(secret),tid=await _deriveTopicId(secret),sign=await _genSign(),ecdh=await _genEcdh(),hostId=_newPlayerId("H"),signRaw=_b64u(await _exportRaw(sign.publicKey)),ecdhRaw=_b64u(await _exportRaw(ecdh.publicKey)),password=String(msg.password||"");
  this.roomSecret=secret;this.roomKey=roomKey;this.topicId=tid;this.roomId=rid;this.playerId=hostId;this.isHost=true;this.isSpectator=false;this.playerSign=sign;this.playerEcdh=ecdh;this.hostSignPub=sign.publicKey;this.hostEcdhPub=ecdh.publicKey;this.seq=0;
  var room={id:rid,hostId:hostId,seed:_newSeed(),hasPassword:!!password,secretWrap:password?await _wrapSecret(secret,password):null,state:"lobby",createdAt:Date.now(),stateVersion:0,eventSeq:0,directSeq:0,mode:mode,maxPlayers:max,speed:1,endMode:"allDead",allowSpectators:!!msg.allowSpectators,disableReroll:!!msg.disableReroll,enableBan:!!msg.enableBan,bannedPlants:[],bpMode:_isBpMode(mode)?mode:null,bpPickAsBan:!!msg.bpPickAsBan,bpState:null,bpExpectedFormations:null,battleInit:null,ver:msg.ver||GAME_VERSION,hostSignPub:signRaw,hostEcdhPub:ecdhRaw,players:[{id:hostId,nick:nick,lane:-1,ready:false,alive:true,survivalTime:0,formation:null,isSpectator:false,signPub:signRaw,ecdhPub:ecdhRaw,lastSeq:0,lastSeen:Date.now(),resultSubmitted:false}],lanes:Array(LANE_COUNT).fill(null),endedPlayers:{},battleResults:{},lastRankings:null};
  this.hostEngine=new HostEngine(this,room,{signPriv:sign.privateKey,signPub:sign.publicKey,ecdhPriv:ecdh.privateKey,ecdhPub:ecdh.publicKey});this._resubscribeRoom();await this._persistHostEngine();await this._publishLobby();
  // 先确认 roomCreated，让 UI 建立正确 playerId/roomId，再发布首个权威 roomUpdate。
  // 否则 roomUpdate 先到时可能拿旧 playerId 误判“自己被踢”。
  this._emit("message",{type:"roomCreated",room:this.hostEngine.roomInfo(),playerId:hostId,seed:room.seed,isSpectator:false,sessionToken:"mqtt-local"});
  await this.hostEngine.sync();this._startTimers();await this._refreshPageExitPacket();
};
SecureMqttTransport.prototype._joinRoom=async function(msg){
  var rid=String(msg.roomId||"").trim().toUpperCase(),entry=this.lobby.get(rid),self=this;if(!entry||entry.expiresAt<=Date.now()){this._emit("message",{type:"error",message:"房间不存在或房主已离线"});return;}var nick=_normNick(msg.nick);if(!nick){this._emit("message",{type:"error",message:"需要昵称"});return;}
  var secret;try{secret=entry.hasPassword?await _unwrapSecret(entry.wrap,msg.password||""):_unb64u(entry.secret);}catch(_){this._emit("message",{type:"error",message:"密码错"});return;}
  var tid=await _deriveTopicId(secret);if(tid!==entry.topicId){this._emit("message",{type:"error",message:"房间安全信息校验失败"});return;}
  var pg=_getVersionGroup(msg.ver||GAME_VERSION),rg=_getVersionGroup(entry.ver||GAME_VERSION);if(pg!==rg){this._emit("message",{type:"error",message:pg<rg?"房间版本过高，请升级客户端":"房间版本过低，请降级客户端"});return;}if((msg.ver||GAME_VERSION)!==(entry.ver||GAME_VERSION))this._emit("message",{type:"versionMismatch",hostVer:entry.ver,yourVer:msg.ver||GAME_VERSION});
  var reuse=this.pendingJoin&&this.pendingJoin.roomId===rid?this.pendingJoin:null,sign=reuse?reuse.sign:await _genSign(),ecdh=reuse?reuse.ecdh:await _genEcdh(),pid=reuse?reuse.playerId:_newPlayerId("P");
  this.roomSecret=secret;this.roomKey=await _deriveRoomKey(secret);this.topicId=tid;this.roomId=rid;this.playerId=pid;this.isHost=false;this.isSpectator=!!msg.acceptSpectator;this.playerSign=sign;this.playerEcdh=ecdh;this.hostSignPub=await _importSignPub(_unb64u(entry.hostSignPub));this.hostEcdhPub=await _importEcdhPub(_unb64u(entry.hostEcdhPub));this.pairKey=await _derivePairKey(ecdh.privateKey,this.hostEcdhPub,secret);this.seq=reuse?reuse.seq:0;this.pendingJoin={roomId:rid,playerId:pid,sign:sign,ecdh:ecdh,seq:this.seq};this._resubscribeRoom();
  var signRaw=_b64u(await _exportRaw(sign.publicKey)),ecdhRaw=_b64u(await _exportRaw(ecdh.publicKey));this.seq++;this.pendingJoin.seq=this.seq;var body={type:"join",playerId:pid,nick:nick,ver:msg.ver||GAME_VERSION,acceptSpectator:msg.acceptSpectator,signPub:signRaw,ecdhPub:ecdhRaw,seq:this.seq};var aad="join|"+rid+"|"+pid+"|"+this.seq,x=await _encrypt(this.roomKey,body,aad),env={v:1,k:"join",rid:rid,from:pid,seq:this.seq,sp:signRaw,ep:ecdhRaw,iv:x.iv,ct:x.ct,aad:aad};env.sig=_b64u(await _sign(sign.privateKey,_envBytes(env)));this.mqtt.publish(_roomBase(tid)+"/join",JSON.stringify(env),false);await this._persistSession();this._startTimers();await this._refreshPageExitPacket();
};
SecureMqttTransport.prototype._sendPlayerCommand=async function(msg){if(!this.playerId||!this.pairKey||!this.mqtt||!this.mqtt.connected)return false;this.seq++;var body=Object.assign({},msg,{playerId:this.playerId,seq:this.seq});var aad="cmd|"+this.roomId+"|"+this.playerId+"|"+this.seq,x=await _encrypt(this.pairKey,body,aad),env={v:1,k:"cmd",rid:this.roomId,from:this.playerId,seq:this.seq,iv:x.iv,ct:x.ct,aad:aad};env.sig=_b64u(await _sign(this.playerSign.privateKey,_envBytes(env)));this.mqtt.publish(_roomBase(this.topicId)+"/cmd/"+this.playerId,JSON.stringify(env),false);await this._persistSession();if(msg.type!=="leaveRoom")await this._refreshPageExitPacket();return true;};

SecureMqttTransport.prototype.send=function(msg){var self=this;if(!msg||!msg.type)return false;(async function(){
  if(msg.type==="listRooms"){setTimeout(function(){self._emit("message",{type:"roomList",rooms:self._lobbyRooms()});},250);return;}
  if(msg.type==="createRoom"){await self._createRoom(msg);return;}
  if(msg.type==="joinRoom"){await self._joinRoom(msg);return;}
  if(msg.type==="getLeaderboard"&&!self.roomId){self._emit("message",{type:"leaderboard",entries:[]});return;}
  if(msg.type==="uploadStats"&&!self.roomId){self._emit("message",{type:"uploadStatsError",message:"3服为无服务器灾备线路，不写入官方排行榜"});return;}
  if(!self.roomId){if(msg.type!=="ping")self._emit("message",{type:"error",message:"尚未加入 3服 房间"});return;}
  if(self.isHost&&self.hostEngine){await self.hostEngine.handle(self.playerId,msg);}
  else {
    await self._sendPlayerCommand(msg);
    if(msg.type==="leaveRoom"){self._clearSession();self._stopTimers();}
  }
})().catch(function(e){console.error(e);self._emit("error",{message:"3服协议错误："+(e.message||e)});});return true;};

SecureMqttTransport.prototype._onLobbyMessage=function(topic,payload){var rid=topic.slice(LOBBY_PREFIX.length).toUpperCase();if(!rid)return;if(!payload.length){this.lobby.delete(rid);if(this.roomId===rid&&!this.isHost){this._stopTimers();this._clearSession();this._emit("message",{type:"roomClosed",message:"3服房主已离开，房间关闭"});}return;}try{var e=JSON.parse(td.decode(payload));if(!e||e.rid!==rid||!e.topicId||!e.hostSignPub||!e.hostEcdhPub)return;if(e.expiresAt<=Date.now()){this.lobby.delete(rid);return;}this.lobby.set(rid,e);}catch(_){} };
SecureMqttTransport.prototype._onMessage=async function(topic,payload,retain){
  if(topic.indexOf(LOBBY_PREFIX)===0){this._onLobbyMessage(topic,payload);return;}if(!this.topicId||!this.roomId)return;var base=_roomBase(this.topicId);if(!payload.length)return;
  if(topic===base+"/join"&&this.isHost&&this.hostEngine){await this._handleJoinEnvelope(payload);return;}
  if(topic.indexOf(base+"/cmd/")===0&&this.isHost&&this.hostEngine){await this._handleCmdEnvelope(payload);return;}
  if(topic===base+"/state"){await this._handleStateEnvelope(payload,retain);return;}
  if(topic===base+"/event"){await this._handleEventEnvelope(payload);return;}
  if(topic===base+"/direct/"+this.playerId&&!this.isHost){await this._handleDirectEnvelope(payload);return;}
};
SecureMqttTransport.prototype._handleJoinEnvelope=async function(payload){var env;try{env=JSON.parse(td.decode(payload));}catch(_){return;}if(env.k!=="join"||env.rid!==this.roomId)return;var pub;try{pub=await _importSignPub(_unb64u(env.sp));if(!(await _verify(pub,_unb64u(env.sig),_envBytes(env))))return;var body=await _decrypt(this.roomKey,env.iv,env.ct,env.aad);if(body.playerId!==env.from||body.seq!==env.seq||body.signPub!==env.sp||body.ecdhPub!==env.ep)return;}catch(_){return;}var r=this.hostEngine.room,existing=this.hostEngine.player(body.playerId),nick=_normNick(body.nick);if(!nick)return;
  var active=this.hostEngine.realPlayers().length,isFull=active>=r.maxPlayers;
  if(r.state==="lobby"&&r.allowSpectators&&body.acceptSpectator===undefined){var temp={id:body.playerId,ecdhPub:body.ecdhPub};var remote=await _importEcdhPub(_unb64u(temp.ecdhPub)),pk=await _derivePairKey(this.hostEngine.ecdhPriv,remote,this.roomSecret);this.hostEngine.pairCache.set(body.playerId,pk);r.players.push({id:body.playerId,nick:nick,lane:-1,ready:false,alive:true,survivalTime:0,formation:null,isSpectator:true,pendingOffer:true,signPub:body.signPub,ecdhPub:body.ecdhPub,lastSeq:body.seq,lastSeen:Date.now(),resultSubmitted:false});await this._sendDirect(body.playerId,{type:"spectatorOffer",roomId:r.id,canJoin:!isFull,roomInfo:{playerCount:active,maxPlayers:r.maxPlayers,hostName:(this.hostEngine.player(r.hostId)||{}).nick}});r.players=r.players.filter(function(p){return p.id!==body.playerId;});this.hostEngine.pairCache.delete(body.playerId);return;}
  var isSpectator=false;if(r.state!=="lobby"){if(!r.allowSpectators){var tmp={id:body.playerId,ecdhPub:body.ecdhPub};var rem=await _importEcdhPub(_unb64u(tmp.ecdhPub));this.hostEngine.pairCache.set(body.playerId,await _derivePairKey(this.hostEngine.ecdhPriv,rem,this.roomSecret));r.players.push({id:body.playerId,nick:nick,isSpectator:true,pendingOffer:true,signPub:body.signPub,ecdhPub:body.ecdhPub,lastSeq:body.seq,lastSeen:Date.now(),lane:-1,ready:false,alive:true,survivalTime:0,formation:null,resultSubmitted:false});await this._sendDirect(body.playerId,{type:"error",message:"已开始"});r.players=r.players.filter(function(p){return p.id!==body.playerId;});this.hostEngine.pairCache.delete(body.playerId);return;}isSpectator=true;}else if(isFull){if(body.acceptSpectator!==true){var rem2=await _importEcdhPub(_unb64u(body.ecdhPub));this.hostEngine.pairCache.set(body.playerId,await _derivePairKey(this.hostEngine.ecdhPriv,rem2,this.roomSecret));r.players.push({id:body.playerId,nick:nick,isSpectator:true,pendingOffer:true,signPub:body.signPub,ecdhPub:body.ecdhPub,lastSeq:body.seq,lastSeen:Date.now(),lane:-1,ready:false,alive:true,survivalTime:0,formation:null,resultSubmitted:false});await this._sendDirect(body.playerId,{type:"error",message:"房间满了"});r.players=r.players.filter(function(p){return p.id!==body.playerId;});this.hostEngine.pairCache.delete(body.playerId);return;}isSpectator=true;}else isSpectator=body.acceptSpectator===true;
  if(r.players.some(function(p){return p.nick===nick&&p.id!==body.playerId;})){var rem3=await _importEcdhPub(_unb64u(body.ecdhPub));this.hostEngine.pairCache.set(body.playerId,await _derivePairKey(this.hostEngine.ecdhPriv,rem3,this.roomSecret));r.players.push({id:body.playerId,nick:nick,isSpectator:true,pendingOffer:true,signPub:body.signPub,ecdhPub:body.ecdhPub,lastSeq:body.seq,lastSeen:Date.now(),lane:-1,ready:false,alive:true,survivalTime:0,formation:null,resultSubmitted:false});await this._sendDirect(body.playerId,{type:"error",message:"该昵称已在房间中；断线请等待自动重连"});r.players=r.players.filter(function(p){return p.id!==body.playerId;});this.hostEngine.pairCache.delete(body.playerId);return;}
  if(existing){if(existing.signPub!==body.signPub||existing.ecdhPub!==body.ecdhPub)return;existing.lastSeen=Date.now();existing.lastSeq=Math.max(existing.lastSeq||0,body.seq);isSpectator=existing.isSpectator;}else{r.players.push({id:body.playerId,nick:nick,lane:-1,ready:false,alive:true,survivalTime:0,formation:null,isSpectator:isSpectator,signPub:body.signPub,ecdhPub:body.ecdhPub,lastSeq:body.seq,lastSeen:Date.now(),resultSubmitted:false});}
  await this._sendDirect(body.playerId,{type:existing?"roomResumed":"roomJoined",room:this.hostEngine.roomInfo(),playerId:body.playerId,seed:r.seed,isSpectator:isSpectator,sessionToken:"mqtt-local",roomState:r.state});if(r.bpState)await this._sendDirect(body.playerId,{type:"bpStateUpdate",bpState:_bpForViewer(r,body.playerId,false),revealed:!!r.bpState.revealed});if(isSpectator)await this.hostEngine._sendSpectatorUpdate();if(r.state==="finished"&&r.lastRankings)await this._sendDirect(body.playerId,{type:"battleEnd",rankings:r.lastRankings});await this.hostEngine.sync();
};
SecureMqttTransport.prototype._handleCmdEnvelope=async function(payload){var env;try{env=JSON.parse(td.decode(payload));}catch(_){return;}if(env.k!=="cmd"||env.rid!==this.roomId)return;var p=this.hostEngine.player(env.from);if(!p)return;if(env.seq<=(p.lastSeq||0))return;var pub=await _importSignPub(_unb64u(p.signPub));try{if(!(await _verify(pub,_unb64u(env.sig),_envBytes(env))))return;var pair=await this.hostEngine._pairFor(p),body=await _decrypt(pair,env.iv,env.ct,env.aad);if(body.playerId!==p.id||body.seq!==env.seq)return;p.lastSeq=env.seq;p.lastSeen=Date.now();await this.hostEngine.handle(p.id,body);this.hostEngine._persist();}catch(_){return;}};
SecureMqttTransport.prototype._handleStateEnvelope=async function(payload,retain){if(!this.hostSignPub)return;var env;try{env=JSON.parse(td.decode(payload));}catch(_){return;}if(env.k!=="state"||env.rid!==this.roomId||env.seq<this.stateVersionSeen)return;try{if(!(await _verify(this.hostSignPub,_unb64u(env.sig),_envBytes(env))))return;var msg=await _decrypt(this.roomKey,env.iv,env.ct,env.aad);this.stateVersionSeen=env.seq;if(!this.isHost)this._emit("message",msg);}catch(_){return;}};
SecureMqttTransport.prototype._handleEventEnvelope=async function(payload){if(!this.hostSignPub)return;var env;try{env=JSON.parse(td.decode(payload));}catch(_){return;}if(env.k!=="event"||env.rid!==this.roomId||env.seq<=this.eventSeqSeen)return;try{if(!(await _verify(this.hostSignPub,_unb64u(env.sig),_envBytes(env))))return;var msg=await _decrypt(this.roomKey,env.iv,env.ct,env.aad);this.eventSeqSeen=env.seq;if(!this.isHost)this._emit("message",msg);}catch(_){return;}};
SecureMqttTransport.prototype._handleDirectEnvelope=async function(payload){if(!this.hostSignPub||!this.pairKey)return;var env;try{env=JSON.parse(td.decode(payload));}catch(_){return;}if(env.k!=="direct"||env.rid!==this.roomId||env.to!==this.playerId)return;try{if(!(await _verify(this.hostSignPub,_unb64u(env.sig),_envBytes(env))))return;var msg=await _decrypt(this.pairKey,env.iv,env.ct,env.aad);if(msg.type==="spectatorOffer"){}else if(msg.type==="roomJoined"||msg.type==="roomResumed"){this.isSpectator=!!msg.isSpectator;this.pendingJoin=null;await this._persistSession();await this._refreshPageExitPacket();}else if(msg.type==="kicked"||msg.type==="roomClosed"||msg.type==="leftRoom"){this._clearSession();}this._emit("message",msg);}catch(_){return;}};

var transport = new SecureMqttTransport();
window.S7MQTTTransport = transport;
window.s7MQTTDebug = function(){return {connected:transport.connected,roomId:transport.roomId,playerId:transport.playerId,isHost:transport.isHost,topicId:transport.topicId,lobby:transport._lobbyRooms()};};
})();
