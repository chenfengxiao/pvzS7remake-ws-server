// ============================================================
// 96_battle_mode.js - 联机战斗模式（WebSocket + 种子 RNG + BP + 5路模拟）
// ============================================================

(function() {
"use strict";

// ============================================================
// 1. 独立 Battle RNG
// ============================================================
// RNG 实现在 00_bootstrap.js：联机战斗只给 Battle RNG 设种子，
// 不再覆写全局 Math.random。UI / 视觉 / 网络随机不会消耗战斗随机序列。

// ============================================================
// 2. 联机 Transport（1服 WebSocket；2服反向 MQTT 隧道；3服 Secure MQTT）
// ============================================================

var GAME_VERSION = "1.7.6";

// 业务层继续只认“当前线路”，传输层可独立替换。
// 1服：Railway WebSocket。
// 2服：iMac server.js 仍是权威服务器，但通过主动出站 MQTT/WSS 反向隧道接入；家庭路由器无需开放入站端口。
// 3服：浏览器房主权威的 Secure MQTT 灾备模式。
// 2服保留旧公网 IPv6 WebSocket 作为隐藏手动 fallback，不作为默认链路。
var S7_HOME_SERVER_DEFAULT_URL = "ws://[240e:b8f:5c28:d201:e6:c038:b0d3:c61e]:8080";
var S7_HOME_TRANSPORT_MODE_KEY = "pvz_s7_home_transport_mode";
var S7_MULTIPLAYER_SERVERS = {
  "1": { id: "1", label: "1服", name: "Railway 外服", transport: "websocket", url: "wss://pvzs7remake-ws-server-production.up.railway.app", available: true },
  "2": { id: "2", label: "2服", name: "家庭服", transport: "home-tunnel", fallbackUrl: localStorage.getItem("pvz_s7_home_server_url") || S7_HOME_SERVER_DEFAULT_URL, available: true },
  "3": { id: "3", label: "3服", name: "Secure MQTT 灾备服", transport: "mqtt", broker: "wss://broker.emqx.io:8084/mqtt", available: true }
};
var _selectedServerId = localStorage.getItem("pvz_s7_multiplayer_server") || "1";
if (!S7_MULTIPLAYER_SERVERS[_selectedServerId]) _selectedServerId = "1";
var _tabGuardServerId = null; // 当前页面已确认占用的联机服务器；同服跨标签页互斥，不同服互不影响。
var _pendingServerEnterId = null; // 仅用于 3服：MQTT 尚未确认连接前只处于“尝试进入”，不能提前占锁。
var _pendingGuardFinalize = null;

function _serverConfig(id) { return S7_MULTIPLAYER_SERVERS[String(id || _selectedServerId)] || S7_MULTIPLAYER_SERVERS["1"]; }
function _activeServer() { return _serverConfig(_selectedServerId); }
function _homeTransportMode() { var m = localStorage.getItem(S7_HOME_TRANSPORT_MODE_KEY) || "tunnel"; return m === "direct" ? "direct" : "tunnel"; }
function _transportKind(cfg) { return cfg && cfg.id === "2" && _homeTransportMode() === "direct" ? "websocket" : (cfg ? cfg.transport : "websocket"); }
function _wsUrlFor(cfg) { if (_transportKind(cfg) !== "websocket") return ""; return cfg.id === "2" ? (cfg.fallbackUrl || "") : (cfg.url || ""); }
function _activeWSUrl() { return _wsUrlFor(_activeServer()); }
function _customTransportFor(cfg) { var k = _transportKind(cfg); if (k === "mqtt") return window.S7MQTTTransport || null; if (k === "home-tunnel") return window.S7HomeTunnelTransport || null; return null; }

window.s7GetMultiplayerServers = function() {
  return Object.keys(S7_MULTIPLAYER_SERVERS).map(function(k) {
    var x = S7_MULTIPLAYER_SERVERS[k];
    return { id: x.id, label: x.label, name: x.name, transport: _transportKind(x), url: x.url || x.fallbackUrl || "", broker: x.broker || "", available: !!x.available };
  });
};
window.s7GetSelectedMultiplayerServer = function() { return _selectedServerId; };
window.s7MultiplayerLockDebug = function() {
  return window.S7MultiplayerTabGuard && window.S7MultiplayerTabGuard.debug
    ? window.S7MultiplayerTabGuard.debug()
    : { unavailable: true, selectedServerId: _selectedServerId, tabGuardServerId: _tabGuardServerId };
};

// 2服旧公网 IPv6 直连只保留为隐藏 fallback。默认使用反向 MQTT/WSS 隧道。
window.s7ConfigureHomeServer = function(url) {
  url = String(url || "").trim();
  if (url && !/^wss?:\/\//i.test(url)) throw new Error("家庭服地址必须以 ws:// 或 wss:// 开头");
  S7_MULTIPLAYER_SERVERS["2"].fallbackUrl = url || S7_HOME_SERVER_DEFAULT_URL;
  if (url) localStorage.setItem("pvz_s7_home_server_url", url); else localStorage.removeItem("pvz_s7_home_server_url");
  return S7_MULTIPLAYER_SERVERS["2"].fallbackUrl;
};
window.s7GetHomeServerURL = function() { return S7_MULTIPLAYER_SERVERS["2"].fallbackUrl || ""; };
window.s7ResetHomeServer = function() {
  localStorage.removeItem("pvz_s7_home_server_url");
  S7_MULTIPLAYER_SERVERS["2"].fallbackUrl = S7_HOME_SERVER_DEFAULT_URL;
  return S7_HOME_SERVER_DEFAULT_URL;
};
window.s7SetHomeServerTransportMode = function(mode) {
  mode = String(mode || "tunnel").toLowerCase();
  if (mode !== "tunnel" && mode !== "direct") throw new Error("2服模式只能是 tunnel 或 direct");
  localStorage.setItem(S7_HOME_TRANSPORT_MODE_KEY, mode);
  _refreshServerSelectUI();
  return mode;
};
window.s7GetHomeServerTransportMode = function() { return _homeTransportMode(); };

var HEARTBEAT_MS = 30000;
var RECONNECT_DELAY = 3000;
var MAX_RECONNECT = 10;

var _ws = null;
var _wsConnected = false;
var _firstConnectTime = 0;
var _wsPlayerId = null;
var _wsRoomId = null;
var _wsReconnectCount = 0;
var _wsReconnectTimer = null;
var _wsHeartbeatTimer = null;
var _wsSessionToken = null;
var _wsListeners = {};

window.s7WSConnected = function() { return _wsConnected; };
window.s7WSPlayerId = function() { return _wsPlayerId; };
window.s7WSRoomId = function() { return _wsRoomId; };

function _on(event, fn) {
  if (!_wsListeners[event]) _wsListeners[event] = [];
  _wsListeners[event].push(fn);
}
function _emit(event, data) {
  if (!_wsListeners[event]) return;
  for (var i = 0; i < _wsListeners[event].length; i++) {
    _wsListeners[event][i](data);
  }
}

function _acceptTransportMessage(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === "roomCreated" || msg.type === "roomJoined" || msg.type === "roomResumed") {
    if (msg.playerId) _wsPlayerId = msg.playerId;
    if (msg.room) _wsRoomId = msg.room.id;
    if (msg.sessionToken) _wsSessionToken = msg.sessionToken;
  }
  if (msg.type === "leftRoom" || msg.type === "resumeFailed" || msg.type === "roomClosed" || msg.type === "kicked") {
    _wsPlayerId = null; _wsRoomId = null; _wsSessionToken = null;
  }
  _emit("message", msg);
}

function _markCustomTransportConnected(cfg, t) {
  _wsConnected = true; _wsReconnectCount = 0; _firstConnectTime = 0;
  _emit("connected"); _startHeartbeat();
  // 2服隧道对 server.js 是透明 socket；重连后按原 WebSocket 协议恢复房间会话。
  if (cfg.id === "2" && _wsRoomId && _wsPlayerId && _wsSessionToken) {
    t.send({ type: "resumeRoom", roomId: _wsRoomId, playerId: _wsPlayerId, sessionToken: _wsSessionToken });
  }
}

async function _finalizeThreeServerEntryAfterConnected(cfg, t) {
  if (_tabGuardServerId === cfg.id && window.S7MultiplayerTabGuard && window.S7MultiplayerTabGuard.owns(cfg.id)) {
    _pendingServerEnterId = null;
    _markCustomTransportConnected(cfg, t);
    return;
  }
  if (_pendingGuardFinalize) return _pendingGuardFinalize;

  _pendingGuardFinalize = (async function() {
    var lockResult = null;
    try {
      lockResult = window.S7MultiplayerTabGuard.acquireDetailed
        ? await window.S7MultiplayerTabGuard.acquireDetailed(cfg.id)
        : { ok: await window.S7MultiplayerTabGuard.acquire(cfg.id), reason: "legacy", method: "legacy", degraded: false };
    } catch (e) {
      lockResult = { ok: true, reason: "guard-error", method: "memory", degraded: true };
    }

    // 用户在等待锁的过程中已经退出/切服：若刚取得锁，立即释放，绝不能留下幽灵占用。
    if (_pendingServerEnterId !== cfg.id || _activeServer().id !== cfg.id || !_lobbyVisible) {
      if (lockResult && lockResult.ok && window.S7MultiplayerTabGuard) window.S7MultiplayerTabGuard.release(cfg.id);
      return;
    }

    if (!lockResult || !lockResult.ok) {
      _pendingServerEnterId = null;
      _wsConnected = false;
      _stopHeartbeat();
      try { t.disconnect(); } catch (_) {}
      if (_$.lobbyScreen) _$.lobbyScreen.classList.add("hidden");
      _lobbyVisible = false;
      if (_$.serverSelectScreen) _$.serverSelectScreen.classList.remove("hidden");
      if (lockResult && lockResult.reason === "occupied") {
        var duplicateMsg = "你已经进入" + cfg.label + "联机模式，不可继续进入";
        _serverHint(duplicateMsg + "。只有已实际连接的同服页面才会占用。不同服务器互不影响。");
        _showToast(duplicateMsg);
      } else {
        _serverHint("浏览器联机独占锁暂不可用，请重新打开页面后再试");
        _showToast("联机独占锁初始化失败");
      }
      return;
    }

    if (_tabGuardServerId && _tabGuardServerId !== cfg.id && window.S7MultiplayerTabGuard) {
      window.S7MultiplayerTabGuard.release(_tabGuardServerId);
    }
    _tabGuardServerId = cfg.id;
    _pendingServerEnterId = null;
    if (lockResult.degraded) {
      _serverHint(cfg.label + "已连接；浏览器独占锁处于兼容模式，请避免同时打开第二个同服页面。");
    }
    _markCustomTransportConnected(cfg, t);
  })();

  try { await _pendingGuardFinalize; }
  finally { _pendingGuardFinalize = null; }
}

function _bindCustomTransportSink(cfg) {
  var t = _customTransportFor(cfg);
  if (!t) return;
  var mark = "__s7SinkBound_" + cfg.id;
  if (t[mark]) return;
  t[mark] = true;
  t.setSink(function(kind, data) {
    var active = _activeServer();
    if (!active || active.id !== cfg.id || _transportKind(active) !== _transportKind(cfg)) return;
    if (kind === "connected") {
      // 3服必须先真正连上 MQTT，再取得同浏览器独占锁。
      // 旧逻辑在点击时就占锁，MQTT 失败也会留下“已进入3服”的假状态。
      if (cfg.id === "3" && _pendingServerEnterId === cfg.id && _tabGuardServerId !== cfg.id) {
        _finalizeThreeServerEntryAfterConnected(cfg, t);
        return;
      }
      _markCustomTransportConnected(cfg, t);
    } else if (kind === "disconnected") {
      _wsConnected = false; _stopHeartbeat(); _emit("disconnected");
    } else if (kind === "reconnecting") {
      _wsConnected = false; _emit("reconnecting", data || {});
    } else if (kind === "error") {
      _emit("error", data || { message: cfg.id === "2" ? "2服隧道连接错误" : "3服连接错误" });
    } else if (kind === "message") {
      _acceptTransportMessage(data);
    }
  });
}

window.s7WSSend = function(obj) {
  // 观战者只能发送：离开房间、心跳、列表、排行榜、上传战绩、恢复会话
  if (_isSpectator) {
    var allowed = ["leaveRoom", "ping", "listRooms", "getLeaderboard", "uploadStats", "resumeRoom", "battleResult", "resetRoom"];
    if (allowed.indexOf(obj.type) < 0) return false;
  }
  var cfg = _activeServer();
  var custom = _customTransportFor(cfg);
  if (custom) {
    _bindCustomTransportSink(cfg);
    return custom.send(obj);
  }
  if (_ws && _ws.readyState === 1) {
    _ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
};

window.s7WSConnect = function() {
  var cfg = _activeServer();
  var custom = _customTransportFor(cfg);
  if (custom) {
    _bindCustomTransportSink(cfg);
    if (!_firstConnectTime) _firstConnectTime = Date.now();
    if (_transportKind(cfg) === "mqtt") custom.configure({ broker: cfg.broker, gameVersion: GAME_VERSION });
    else custom.configure({ gameVersion: GAME_VERSION });
    custom.connect();
    return;
  }
  if (_transportKind(cfg) !== "websocket") { _emit("error", { message: "当前线路 Transport 未加载" }); return; }
  if (_ws && (_ws.readyState === 0 || _ws.readyState === 1)) return;
  if (_ws) { _ws.onclose = null; _ws = null; }
  _wsReconnectCount = 0;
  if (!_firstConnectTime) _firstConnectTime = Date.now();
  _doConnect();
};

function _doConnect() {
  if (_wsReconnectCount > MAX_RECONNECT) {
    _emit("error", { message: "重连失败" });
    return;
  }
  var wsUrl = _activeWSUrl();
  if (!wsUrl) { _emit("error", { message: "当前线路没有可用的 WebSocket 地址" }); return; }
  try { _ws = new WebSocket(wsUrl); } catch (e) { _scheduleReconnect(); return; }

  _ws.onopen = function() {
    _wsConnected = true;
    _wsReconnectCount = 0;
    _emit("connected");
    _startHeartbeat();
    if (_wsRoomId && _wsPlayerId && _wsSessionToken) {
      // 只恢复网络会话；战斗过程仍由本地模拟继续运行，不请求服务器战斗快照。
      _ws.send(JSON.stringify({ type: "resumeRoom", roomId: _wsRoomId, playerId: _wsPlayerId, sessionToken: _wsSessionToken }));
    }
  };

  _ws.onmessage = function(evt) {
    var msg;
    try { msg = JSON.parse(evt.data); } catch (e) { return; }
    if (msg.type === "pong") return;
    _acceptTransportMessage(msg);
  };

  _ws.onclose = function() {
    _wsConnected = false;
    _stopHeartbeat();
    _emit("disconnected");
    _scheduleReconnect();
  };

  _ws.onerror = function() {
    var active = _activeServer();
    _emit("error", { message: active && active.id === "2" ? "2服家庭服务器未启动或当前网络无法访问" : "连接错误" });
  };
}

function _heartbeat() {
  if (!_wsConnected) return;
  var cfg = _activeServer();
  var custom = _customTransportFor(cfg);
  if (custom) {
    custom.send({ type: "ping" });
  } else if (_ws && _ws.readyState === 1) {
    _ws.send(JSON.stringify({ type: "ping" }));
  }
}
function _startHeartbeat() { _stopHeartbeat(); _wsHeartbeatTimer = setInterval(_heartbeat, HEARTBEAT_MS); }
function _stopHeartbeat() { if (_wsHeartbeatTimer) { clearInterval(_wsHeartbeatTimer); _wsHeartbeatTimer = null; } }

function _scheduleReconnect() {
  _stopHeartbeat();
  _stopReconnectTimer();
  _wsReconnectCount++;
  var delay = RECONNECT_DELAY * _wsReconnectCount;
  _emit("reconnecting", { delay: delay, count: _wsReconnectCount });
  _wsReconnectTimer = setTimeout(function() { _ws = null; _doConnect(); }, delay);
}
function _stopReconnectTimer() { if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; } }

window.s7WSDisconnect = function() {
  _stopReconnectTimer(); _stopHeartbeat();
  _wsReconnectCount = MAX_RECONNECT + 1;
  var cfg = _activeServer();
  var custom = _customTransportFor(cfg);
  if (custom) {
    custom.disconnect();
  } else if (_ws) {
    _ws.onclose = null; _ws.close(); _ws = null;
  }
  _wsConnected = false; _wsPlayerId = null; _wsRoomId = null; _wsSessionToken = null;
};

// ============================================================
// 3. 状态变量
// ============================================================

var _lobbyVisible = false;
var _roomListData = [];
var _nick = "";

var _roomState = null;
var _roomPlayerId = null;
var _isSpectator = false;

var _bpPhase = "idle"; // idle | round1 | round2 | round3 | formation | uploaded
var _bpSelected = [];  // 当前轮次选中的植物 key
var _bpAllPicks = [];  // 所有轮次累积选中的植物 key（5个）
var _bpDraws = [];     // 当前轮次随机抽出的植物 key
var _bpRound = 0;
var _bpRerollsLeft = 0;
var _formationOrder = []; // 阵型排列顺序（5个 key）
var _formSlotSel = -1;    // 阵型编辑中选中的槽位

var _battleMonitorTimer = null;
var _battleTimerInterval = null;
var _battleSpeed = 1;
var _laneDeathTimes = [null, null, null, null, null];
var _battleAborted = false;
var _battleResultSent = false;
var _forceStopped = false;
var _pendingPhaseFn = null;
var _formationCheckTimer = null;
var _mpBgInterval = null;
var _mpBgVisHandler = null;
var _banSelected = []; // ban 阶段我选的ban植物

// ---------- DOM ----------
var _$ = {};
function _cacheDom() {
  _$.startScreen = document.getElementById("startScreen");
  _$.game = document.getElementById("game");
  _$.serverSelectScreen = document.getElementById("serverSelectScreen");
  _$.serverSelectBackBtn = document.getElementById("serverSelectBackBtn");
  _$.serverSelectHint = document.getElementById("serverSelectHint");
  _$.server2StatusText = document.getElementById("server2StatusText");
  _$.serverChoice1 = document.getElementById("serverChoice1");
  _$.serverChoice2 = document.getElementById("serverChoice2");
  _$.serverChoice3 = document.getElementById("serverChoice3");
  _$.lobbyScreen = document.getElementById("lobbyScreen");
  _$.lobbyServerBadge = document.getElementById("lobbyServerBadge");
  _$.lobbyNick = document.getElementById("lobbyNick");
  _$.lobbyStatus = document.getElementById("lobbyStatus");
  _$.lobbyStatGames = document.getElementById("lobbyStatGames");
  _$.lobbyStatScore = document.getElementById("lobbyStatScore");
  _$.lobbyStatAvg = document.getElementById("lobbyStatAvg");
  _$.lobbyUploadBtn = document.getElementById("lobbyUploadBtn");
  _$.lobbyUploadStatus = document.getElementById("lobbyUploadStatus");
  _$.lobbyRoomTbody = document.getElementById("lobbyRoomTbody");
  _$.lobbyEmpty = document.getElementById("lobbyEmpty");
  _$.lobbyCreateBtn = document.getElementById("lobbyCreateBtn");
  _$.lobbyJoinByIdBtn = document.getElementById("lobbyJoinByIdBtn");
  _$.lobbyRefreshBtn = document.getElementById("lobbyRefreshBtn");
  _$.lobbyBackBtn = document.getElementById("lobbyBackBtn");
  _$.lobbyDialog = document.getElementById("lobbyDialog");
  _$.lobbyDialogTitle = document.getElementById("lobbyDialogTitle");
  _$.lobbyDialogName = document.getElementById("lobbyDialogName");
  _$.lobbyDialogRoomIdLabel = document.getElementById("lobbyDialogRoomIdLabel");
  _$.lobbyDialogRoomId = document.getElementById("lobbyDialogRoomId");
  _$.lobbyDialogPass = document.getElementById("lobbyDialogPass");
  _$.lobbyDialogMaxPlayers = document.getElementById("lobbyDialogMaxPlayers");
  _$.lobbyDialogMode = document.getElementById("lobbyDialogMode");
  _$.lobbyDialogConfirm = document.getElementById("lobbyDialogConfirm");
  _$.lobbyDialogCancel = document.getElementById("lobbyDialogCancel");
  _$.battleBtn = document.getElementById("battleBtn");

  _$.roomScreen = document.getElementById("roomScreen");
  _$.roomIdDisplay = document.getElementById("roomIdDisplay");
  _$.roomHostDisplay = document.getElementById("roomHostDisplay");
  _$.roomModeDisplay = document.getElementById("roomModeDisplay");
  _$.roomMaxPlayersDisplay = document.getElementById("roomMaxPlayersDisplay");
  _$.roomHostControls = document.getElementById("roomHostControls");
  _$.roomModeSelect = document.getElementById("roomModeSelect");
  _$.roomMaxPlayersSelect = document.getElementById("roomMaxPlayersSelect");
  _$.roomPlayerList = document.getElementById("roomScreenPlayerList");
  _$.roomStartGameBtn = document.getElementById("roomStartGameBtn");
  _$.roomLeaveBtn = document.getElementById("roomLeaveBtn");
  _$.roomSpeedBtns = document.getElementById("roomSpeedBtns");
  _$.roomEndModeBtn = document.getElementById("roomEndModeBtn");
  _$.roomToggleSpecBtn = document.getElementById("roomToggleSpecBtn");
  _$.roomToggleRerollBtn = document.getElementById("roomToggleRerollBtn");
  _$.roomToggleBanBtn = document.getElementById("roomToggleBanBtn");

  _$.laneSelectScreen = document.getElementById("laneSelectScreen");
  _$.laneSelectGrid = document.getElementById("laneSelectGrid");
  _$.laneSelectPlayerList = document.getElementById("laneSelectPlayerList");

  _$.battleScreen = document.getElementById("battleScreen");
  _$.battleSeedDisplay = document.getElementById("battleSeedDisplay");
  _$.battleTimer = document.getElementById("battleTimer");
  _$.battleHostControls = document.getElementById("battleHostControls");
  _$.battleStopBtn = document.getElementById("battleStopBtn");
  _$.battleKickBtn = document.getElementById("battleKickBtn");
  _$.battlePlantsDisplay = document.getElementById("battlePlantsDisplay");

  _$.resultScreen = document.getElementById("resultScreen");
  _$.resultRanking = document.getElementById("resultRanking");
  _$.resultBackBtn = document.getElementById("resultBackBtn");
  _$.resultStats = document.getElementById("resultStats");
  _$.resultScoreDisplay = document.getElementById("resultScoreDisplay");
  _$.resultCareerStats = document.getElementById("resultCareerStats");
  _$.resultUploadBtn = document.getElementById("resultUploadBtn");
  _$.resultUploadStatus = document.getElementById("resultUploadStatus");

  _$.lobbyLeaderboardBtn = document.getElementById("lobbyLeaderboardBtn");
  _$.leaderboardDialog = document.getElementById("leaderboardDialog");
  _$.leaderboardBody = document.getElementById("leaderboardBody");
  _$.lbCloseBtn = document.getElementById("lbCloseBtn");

  _$.bpOverlay = document.getElementById("bpOverlay");
  _$.bpTitle = document.getElementById("bpTitle");
  _$.bpRoundInfo = document.getElementById("bpRoundInfo");
  _$.bpPlayerList = document.getElementById("bpPlayerList");
  _$.bpPlantGrid = document.getElementById("bpPlantGrid");
  _$.bpSelected = document.getElementById("bpSelected");
  _$.bpHistory = document.getElementById("bpHistory");
  _$.bpConfirmBtn = document.getElementById("bpConfirmBtn");

  // 新BP模式弹窗
  _$.bpModeOverlay = document.getElementById("bpModeOverlay");
  _$.bpModeTitle = document.getElementById("bpModeTitle");
  _$.bpModeInfo = document.getElementById("bpModeInfo");
  _$.bpModeTopSlots = document.getElementById("bpModeTopSlots");
  _$.bpModeStatus = document.getElementById("bpModeStatus");
  _$.bpModePlantGrid = document.getElementById("bpModePlantGrid");
  _$.bpModeBottomSlots = document.getElementById("bpModeBottomSlots");
  _$.bpModeConfirmBtn = document.getElementById("bpModeConfirmBtn");
  _$.bpModePlayerList = document.getElementById("bpModePlayerList");
  _$.roomTogglePickAsBanBtn = document.getElementById("roomTogglePickAsBanBtn");

  _$.formationOverlay = document.getElementById("formationOverlay");
  _$.formationPlayerList = document.getElementById("formationPlayerList");
  _$.formationSlots = document.getElementById("formationSlots");
  _$.formationConfirmBtn = document.getElementById("formationConfirmBtn");
}

// ============================================================
// 4. 初始化
// ============================================================

function _initLobby() {
  _cacheDom();

  // 读取昵称
  var saved = localStorage.getItem("pvz_player_name");
  _nick = saved || ("游客" + Math.floor(Math.random() * 10000));
  localStorage.setItem("pvz_player_name", _nick);
  _$.lobbyNick.value = _nick;

  _$.lobbyNick.addEventListener("input", function() {
    _nick = _$.lobbyNick.value.trim() || ("游客" + Math.floor(Math.random() * 10000));
    localStorage.setItem("pvz_player_name", _nick);
  });

  _$.battleBtn.onclick = function() { s7ShowServerSelect(); };
  if (_$.serverChoice1) _$.serverChoice1.onclick = function() { _selectServerAndEnter("1"); };
  if (_$.serverChoice2) _$.serverChoice2.onclick = function() { _selectServerAndEnter("2"); };
  if (_$.serverChoice3) _$.serverChoice3.onclick = function() { _selectServerAndEnter("3"); };
  if (_$.serverSelectBackBtn) _$.serverSelectBackBtn.onclick = function() { s7HideServerSelect(); };
  _refreshServerSelectUI();

  _$.lobbyCreateBtn.onclick = function() { _openDialog("create"); };
  _$.lobbyJoinByIdBtn.onclick = function() { _openDialog("join"); };
  _$.lobbyRefreshBtn.onclick = function() { _fetchRoomList(); };
  _$.lobbyBackBtn.onclick = function() { s7HideLobby(); };
  _$.lobbyDialogConfirm.onclick = function() { _submitDialog(); };
  _$.lobbyDialogCancel.onclick = function() { _closeDialog(); };

  _on("connected", function() { _updateStatus("connected"); _fetchRoomList(); });
  _on("disconnected", function() { _updateStatus("disconnected"); });
  _on("reconnecting", function() { _updateStatus("reconnecting"); });
  _on("error", function(e) { _showToast(e.message || "连接异常"); });
  _on("message", function(msg) { _handleWSMessage(msg); });

  // 房间按钮
  _$.roomLeaveBtn.onclick = function() {
    s7WSSend({ type: "leaveRoom" });
    _leaveRoom();
  };
  _$.roomStartGameBtn.onclick = function() {
    if (_roomState && _roomState.players && _roomState.players.filter(function(p) { return !p.isSpectator; }).length < 2) {
      _showToast("人数不足，至少需要 2 名玩家");
      return;
    }
    // 如果房间还在战斗/结束状态，先检查所有人是否已结束
    if (_roomState && _roomState.state !== "lobby") {
      s7WSSend({ type: "checkAllEnded" });
      return;
    }
    if (_isHost()) {
      s7WSSend({ type: "startGame" });
    } else {
      s7WSSend({ type: "requestHostAction", action: "startGame" });
      _showToast("已向房主请求开始游戏");
    }
  };

  // 房主设置
  _$.roomModeSelect.onchange = function() {
    if (_isHost()) {
      s7WSSend({ type: "changeMode", mode: _$.roomModeSelect.value });
    } else {
      var label = _$.roomModeSelect.options[_$.roomModeSelect.selectedIndex].text;
      s7WSSend({ type: "requestHostAction", action: "changeMode", value: _$.roomModeSelect.value });
      _showToast("已向房主请求改为 " + label);
      // 恢复显示为实际值
      _$.roomModeSelect.value = (_roomState && _roomState.mode) || "532";
    }
  };
  _$.roomMaxPlayersSelect.onchange = function() {
    if (_isHost()) {
      s7WSSend({ type: "changeMaxPlayers", maxPlayers: parseInt(_$.roomMaxPlayersSelect.value, 10) });
    } else {
      s7WSSend({ type: "requestHostAction", action: "changeMaxPlayers", value: parseInt(_$.roomMaxPlayersSelect.value, 10) });
      _showToast("已向房主请求改为 " + _$.roomMaxPlayersSelect.value + " 人");
      _$.roomMaxPlayersSelect.value = String((_roomState && _roomState.maxPlayers) || 5);
    }
  };

  // BP 按钮
  _$.bpConfirmBtn.onclick = function() {
    if (_bpPhase === "ban1" || _bpPhase === "ban2") { _confirmBan(); } else { _bpConfirmRound(); }
  };

  // 阵型按钮
  _$.formationConfirmBtn.onclick = function() { _uploadFormation(); };

  // 战斗按钮
  _$.battleStopBtn.onclick = function() {
    s7WSSend({ type: "stopSimulation" });
  };
  _$.battleKickBtn.onclick = function() {
    _showKickDialog();
  };

  // 速度按钮（房间内选择，房主直接改，非房主发请求）
  var roomSpeedBtns = _$.roomSpeedBtns ? _$.roomSpeedBtns.querySelectorAll(".roomSpeedBtn") : [];
  for (var i = 0; i < roomSpeedBtns.length; i++) {
    roomSpeedBtns[i].onclick = function() {
      var sp = parseInt(this.getAttribute("data-speed"), 10);
      if (_isHost()) {
        s7WSSend({ type: "changeSpeed", speed: sp });
        // 本地立即更新UI（不等待服务端roomUpdate）
        if (_roomState) _roomState.speed = sp;
        _updateRoomSpeedUI();
      } else {
        s7WSSend({ type: "requestHostAction", action: "changeSpeed", value: sp });
        _showToast("已向房主请求改为 " + sp + "×");
        _updateRoomSpeedUI();
      }
    };
  }

  // 结束条件按钮（房主直接改，非房主发请求）
  _$.roomEndModeBtn.onclick = function() {
    if (_isHost()) {
      s7WSSend({ type: "changeEndMode" });
    } else {
      s7WSSend({ type: "requestHostAction", action: "changeEndMode" });
      _showToast("已向房主请求切换结束条件");
      _updateRoomEndModeUI();
    }
  };

  // 观战开关
  _$.roomToggleSpecBtn.onclick = function() {
    if (_isHost()) { s7WSSend({ type: "toggleSpectators" }); } else { _showToast("仅房主可设置"); }
  };
  // 重随机开关
  _$.roomToggleRerollBtn.onclick = function() {
    if (_isHost()) { s7WSSend({ type: "toggleDisableReroll" }); } else { _showToast("仅房主可设置"); }
  };
  // Ban选开关
  _$.roomToggleBanBtn.onclick = function() {
    if (_isHost()) { s7WSSend({ type: "toggleEnableBan" }); } else { _showToast("仅房主可设置"); }
  };

  // 以pick代ban开关
  _$.roomTogglePickAsBanBtn.onclick = function() {
    if (_isHost()) { s7WSSend({ type: "togglePickAsBan" }); } else { _showToast("仅房主可设置"); }
  };

  // 新BP确认按钮
  _$.bpModeConfirmBtn.onclick = function() { _bpModeConfirm(); };

  // 结算按钮
  _$.resultBackBtn.onclick = function() {
    // 告知服务端我已结束模拟（不触发重置，仅记录），然后返回房间
    s7WSSend({ type: "resetRoom" });
    _$.resultScreen.classList.add("hidden");
    _resetToRoom();
  };

  // 上传战绩
  _$.resultUploadBtn.onclick = function() { _uploadStats(); };

  // 排行榜
  _$.lobbyLeaderboardBtn.onclick = function() { _showLeaderboard(); };
  _$.lbCloseBtn.onclick = function() { _hideLeaderboard(); };
  var lbSortBtns = _$.leaderboardDialog ? _$.leaderboardDialog.querySelectorAll(".lbSortBtn") : [];
  for (var j = 0; j < lbSortBtns.length; j++) {
    lbSortBtns[j].onclick = function() {
      _lbSort = this.getAttribute("data-sort");
      _renderLeaderboard();
    };
  }

  // 大厅上传战绩
  _$.lobbyUploadBtn.onclick = function() { _uploadStats(); };
}

// ============================================================
// 5. 状态更新 & WS 消息处理
// ============================================================

function _updateStatus(st, serverOverride) {
  var el = _$.lobbyStatus;
  if (!el) return;
  // [1.7.2 hotfix] 状态文案必须绑定到“本次正在进入的服务器”，不能沿用上一服退出时留下的 DOM 文本。
  var cfg = serverOverride || _activeServer();
  var kind = _transportKind(cfg);
  if (st === "connected") { el.textContent = "✅ 已连接"; el.style.color = "#22c55e"; _firstConnectTime = 0; }
  else if (st === "reconnecting") { el.textContent = "⏳ 重连中…"; el.style.color = "#f59e0b"; }
  else if (st === "connecting") {
    if (kind === "mqtt") el.textContent = "⏳ MQTT 连接中…";
    else if (kind === "home-tunnel") el.textContent = "⏳ 2服隧道连接中…";
    else el.textContent = "⏳ 连接中…";
    el.style.color = "#f59e0b";
  } else {
    if (kind === "mqtt") {
      el.textContent = "⚪ MQTT 未连接"; el.style.color = "#9fb7c6";
    } else if (kind === "home-tunnel") {
      el.textContent = "⚪ 2服隧道未连接"; el.style.color = "#9fb7c6";
    } else if (_firstConnectTime && Date.now() - _firstConnectTime < 30000) {
      // 1服 Serverless 可能处于冷启动
      el.textContent = "🌙 服务器正在冷启动…"; el.style.color = "#a78bfa";
    } else {
      el.textContent = "⚪ 未连接"; el.style.color = "#9fb7c6";
    }
  }
}

function _handleWSMessage(msg) {
  switch (msg.type) {
    case "roomList":
      _roomListData = msg.rooms || [];
      _renderRoomList();
      break;
    case "roomCreated":
    case "roomJoined":
      _joiningRoom = false;
      _isSpectator = !!msg.isSpectator;
      _closeDialog();
      s7HideLobby(true);
      _showRoom(msg.room, msg.playerId);
      break;
    case "roomResumed":
      _joiningRoom = false;
      _isSpectator = !!msg.isSpectator;
      if (msg.room) _roomState = msg.room;
      if (msg.playerId) _roomPlayerId = msg.playerId;
      _showToast("✅ 联机连接已恢复");
      if (_roomState) _renderRoom();
      break;
    case "resumeFailed":
      _showToast(msg.message || "房间会话已失效，已返回大厅");
      _leaveRoom();
      break;
    case "roomClosed":
      _showToast(msg.message || "房间已关闭");
      _leaveRoom();
      break;
    case "spectatorOffer":
      _joiningRoom = false;
      _showSpectatorChoice(msg.roomId, msg.roomInfo);
      break;
    case "enterLaneSelection":
      _showLaneSelect();
      break;
    case "roomUpdate":
      if (msg.room) {
        // 丢弃旧房/其他房的延迟 roomUpdate，避免用旧 playerId 对新房做“被踢”误判。
        if (_wsRoomId && msg.room.id && msg.room.id !== _wsRoomId) break;
        _roomState = msg.room;
        // 先执行权威状态纠偏：可恢复丢失的 start/kick 事件，并纠正阵型提交状态。
        if (_reconcileAuthoritativeRoomState()) break;
        if (!_$.laneSelectScreen.classList.contains("hidden")) {
          _renderLaneSelect();
          _renderPlayerList(_$.laneSelectPlayerList);
        } else if (!_$.bpModeOverlay.classList.contains("hidden")) {
          _renderPlayerList(_$.bpModePlayerList);
        } else if (!_$.bpOverlay.classList.contains("hidden")) {
          _renderPlayerList(_$.bpPlayerList);
          if (_bpPhase === "ban1" || _bpPhase === "ban2") _renderBanPhase(_bpPhase === "ban1" ? 1 : 1);
        } else if (!_$.formationOverlay.classList.contains("hidden")) {
          _renderPlayerList(_$.formationPlayerList);
          _syncFormationSubmissionUIFromRoom();
        } else {
          _renderRoom();
        }
      }
      break;
    case "spectatorUpdate":
      // 观战者收到的详细阵型信息
      if (_isSpectator && msg.formations) {
        var specHtml = '<div style="font-size:13px;padding:8px;background:#0a1c2a;border:1px solid #334;border-radius:6px;margin:8px 0;max-height:200px;overflow-y:auto">';
        for (var key in msg.formations) {
          var f = msg.formations[key];
          var status = f.uploaded ? '✅已上传' : '⏳未上传';
          var plants = f.formation ? f.formation.map(function(pk) {
            var pd = typeof PLANTS !== 'undefined' ? PLANTS[pk] : null;
            return (pd ? pd.emoji : "🌿") + (pd ? pd.name : pk);
          }).join(' ') : '...';
          specHtml += '<div style="margin-bottom:4px;border-bottom:1px solid #222;padding-bottom:4px">';
          specHtml += '<b style="color:#38bdf8">' + _escapeHtml(f.nick) + '</b> 路线' + (f.lane+1) + ' ' + status;
          if (f.uploaded) specHtml += '<br><span style="color:#a78bfa;font-size:12px">' + plants + '</span>';
          specHtml += '</div>';
        }
        specHtml += '</div>';
        // 显示在 formationOverlay 和 laneSelectScreen 中
        if (!_$.formationOverlay.classList.contains("hidden")) {
          var existingSpec = document.getElementById("specFormationView");
          if (existingSpec) existingSpec.remove();
          var specDiv = document.createElement("div");
          specDiv.id = "specFormationView";
          specDiv.innerHTML = specHtml;
          _$.formationOverlay.querySelector(".dialog").insertBefore(specDiv, _$.formationPlayerList);
        }
        if (!_$.laneSelectScreen.classList.contains("hidden")) {
          var existingSpec2 = document.getElementById("specLaneView");
          if (existingSpec2) existingSpec2.remove();
          var specDiv2 = document.createElement("div");
          specDiv2.id = "specLaneView";
          specDiv2.innerHTML = '<h3 style="color:#a78bfa;font-size:15px;margin:8px 0">👁️ 观战者视角</h3>' + specHtml;
          _$.laneSelectScreen.querySelector(".dialog").insertBefore(specDiv2, _$.laneSelectPlayerList);
        }
      }
      break;
    case "startBP":
      if (_isSpectator) {
        _showToast("👁️ 其他玩家正在选将，请稍候...");
      } else if (msg.bpMode) {
        // 新BP模式：等待 bpStateUpdate
        _$.laneSelectScreen.classList.add("hidden");
      } else {
        _$.laneSelectScreen.classList.add("hidden");
        _startBP(msg.mode);
      }
      break;
    case "bpStateUpdate":
      if (!_isSpectator) {
        _$.laneSelectScreen.classList.add("hidden");
        _renderBpMode(msg.bpState, msg.revealed);
      } else {
        // 观战者：显示上帝视角BP
        _renderBpModeSpectator(msg.bpState);
      }
      break;
    case "bpComplete":
      _$.bpModeOverlay.classList.add("hidden");
      // 使用服务端传来的阵型
      if (msg.formations && msg.formations[_roomPlayerId]) {
        _formationOrder = msg.formations[_roomPlayerId];
      }
      _startFormation();
      break;
    case "allFormationsUploaded":
      if (_isHost()) {
        _showToast("所有玩家已上传阵型，可以开始战斗");
        _enableStartBattleBtn();
      }
      break;
    case "battleStart":
      // event 与 retained state 是双路径；网络乱序时只允许初始化一次。
      if (window._mpBattleActive) break;
      _$.bpOverlay.classList.add("hidden");
      _$.bpModeOverlay.classList.add("hidden");
      _$.formationOverlay.classList.add("hidden");
      _$.laneSelectScreen.classList.add("hidden");
      _setupBattle(msg.seed, msg.formations, msg.speed || 1, msg.endMode);
      break;
    case "phaseComplete":
      clearTimeout(_confirmPhaseTimer);
      if (_pendingPhaseFn) {
        var fn = _pendingPhaseFn;
        _pendingPhaseFn = null;
        fn();
      }
      break;
    case "confirmStatus":
      // 显示 "已确认 X/Y"
      if (_bpPhase === "ban1" || _bpPhase === "ban2") {
        _$.bpConfirmBtn.textContent = "等待其他玩家...（" + msg.confirmed + "/" + msg.total + "）";
      } else if (_bpPhase.indexOf("round") === 0) {
        _$.bpConfirmBtn.textContent = "等待其他玩家...（" + msg.confirmed + "/" + msg.total + "）";
      }
      break;
    case "waitingPlayers":
      _showToast("请等待所有人模拟结束（" + msg.ended + "/" + msg.total + "）");
      break;
    case "setupReset":
      _showToast(msg.message || "房间准备阶段已重置");
      _resetToRoom();
      break;
    case "simulationStopped":
      _forceStopped = true;
      if (msg.forced) {
        // 房主强制停止：不弹结算，直接回房间
        _cleanupBattle();
        _$.resultScreen.classList.add("hidden");
        _resetToRoom();
      } else {
        _abortBattle();
      }
      // 1秒后重置停止标志
      setTimeout(function() { _forceStopped = false; }, 1000);
      break;
    case "battleEnd":
      // 防止双重计分（forced-stop后到达的battleEnd不再处理）
      if (_battleAborted) break;
      _showResult(msg.rankings || []);
      break;
    case "leaderboard":
      _lbData = msg.entries || [];
      _renderLeaderboard();
      break;
    case "uploadStatsOk":
      _$.resultUploadStatus.textContent = "✅ 已上传";
      if (_$.lobbyUploadStatus) _$.lobbyUploadStatus.textContent = "✅ 已上传";
      _updateLobbyStats();
      break;
    case "uploadStatsError":
      var errMsg = "❌ " + (msg.message || "上传失败");
      _$.resultUploadStatus.textContent = errMsg;
      if (_$.lobbyUploadStatus) _$.lobbyUploadStatus.textContent = errMsg;
      break;
    case "connectionStatus":
      if (!_isHost() || !msg.players) break;
      // 房主自动踢掉断线超过 90 秒的僵尸玩家
      for (var ci = 0; ci < msg.players.length; ci++) {
        var cp = msg.players[ci];
        if (cp.id === _roomPlayerId) continue; // 不踢自己
        if (cp.age > 240) {
          s7WSSend({ type: "kick", playerId: cp.id });
        }
      }
      break;
    case "rematch":
      _$.resultScreen.classList.add("hidden");
      _resetToRoom();
      break;
    case "kicked":
      _showToast("你已被移出房间");
      _leaveRoom();
      break;
    case "error":
      _joiningRoom = false;
      _showToast(msg.message || "错误");
      break;
    case "versionMismatch":
      _showToast("⚠️ 版本不一致！房主版本 " + msg.hostVer + "，你的版本 " + GAME_VERSION + "，可能影响游戏体验");
      break;
    case "hostRequest":
      _handleHostRequest(msg);
      break;
  }
}

// ============================================================
// 6. 大厅 UI
// ============================================================

function _handleHostRequest(msg) {
  var actionText = "";
  if (msg.action === "changeMode") {
    var modeLabel = msg.value === "532" ? "532" : "42421";
    actionText = "将模式改为 " + modeLabel;
  } else if (msg.action === "changeMaxPlayers") {
    actionText = "将人数上限改为 " + msg.value + " 人";
  } else if (msg.action === "changeSpeed") {
    actionText = "将模拟速度改为 " + msg.value + "×";
  } else if (msg.action === "changeEndMode") {
    actionText = "切换结束条件";
  } else if (msg.action === "startGame") {
    actionText = "开始游戏";
  } else {
    actionText = msg.action;
  }
  _showToast("📋 " + (msg.from || "玩家") + " 请求" + actionText);
}

function _fetchRoomList() {
  s7WSSend({ type: "listRooms" });
}

function _renderRoomList() {
  var tbody = _$.lobbyRoomTbody;
  var empty = _$.lobbyEmpty;
  tbody.innerHTML = "";
  if (!_roomListData || _roomListData.length === 0) {
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";
  for (var i = 0; i < _roomListData.length; i++) {
    var r = _roomListData[i];
    var tr = document.createElement("tr");
    var statusClass = "lobbyStatusWaiting", statusText = "等待";
    if (r.state === "battling") { statusClass = "lobbyStatusBattling"; statusText = "战斗中"; }
    else if (r.state === "laying") { statusText = "选路中"; }
    if (r.playerCount >= r.maxPlayers) { statusClass = "lobbyStatusFull"; statusText = "已满"; }
    tr.innerHTML = "<td>" + r.id + "</td><td>" + _escapeHtml(r.hostName || r.id) +
      "</td><td>" + r.playerCount + "/" + r.maxPlayers + "</td>" +
      "<td class='" + statusClass + "'>" + statusText + "</td>";
    (function(rid) { tr.addEventListener("click", function() { _joinRoom(rid); }); })(r.id);
    tbody.appendChild(tr);
  }
}

var _joiningRoom = false;

function _notConnectedToast() {
  var kind = _transportKind(_activeServer());
  if (kind === "mqtt") {
    _showToast("3服 MQTT 正在连接，请稍候…");
  } else if (kind === "home-tunnel") {
    _showToast("2服家庭服务器隧道正在连接，请确认 iMac 已启动…");
  } else if (_firstConnectTime && Date.now() - _firstConnectTime < 30000) {
    _showToast("🌙 服务器正在冷启动，请稍候…");
  } else {
    _showToast("未连接到服务器");
  }
}

function _joinRoom(roomId) {
  if (!_wsConnected) { _notConnectedToast(); return; }
  if (_joiningRoom) return;
  var meta = (_roomListData || []).find(function(r) { return r.id === roomId; });
  if (meta && meta.hasPassword) {
    _openDialog("join");
    _$.lobbyDialogRoomId.value = roomId;
    _$.lobbyDialogPass.focus();
    return;
  }
  _joiningRoom = true;
  s7WSSend({ type: "joinRoom", roomId: roomId, nick: _nick, ver: GAME_VERSION });
}

var _dialogMode = "create";
function _openDialog(mode) {
  _dialogMode = mode;
  var isCreate = (mode === "create");
  _$.lobbyDialogTitle.textContent = isCreate ? "创建房间" : "加入房间";
  _$.lobbyDialogRoomIdLabel.style.display = isCreate ? "none" : "";
  _$.lobbyDialogName.parentElement.style.display = isCreate ? "" : "none";
  _$.lobbyDialogMaxPlayers.parentElement.style.display = isCreate ? "" : "none";
  _$.lobbyDialogMode.parentElement.style.display = isCreate ? "" : "none";
  if (isCreate) {
    _$.lobbyDialogName.value = _nick + "的房间";
    _$.lobbyDialogRoomId.value = "";
  } else {
    _$.lobbyDialogName.value = "";
    _$.lobbyDialogRoomId.value = "";
    _$.lobbyDialogRoomId.placeholder = "输入房间号";
  }
  _$.lobbyDialogPass.value = "";
  _$.lobbyDialog.classList.remove("hidden");
}
function _closeDialog() { _$.lobbyDialog.classList.add("hidden"); }

function _submitDialog() {
  if (!_wsConnected) { _notConnectedToast(); return; }
  if (_dialogMode === "create") {
    var pass = _$.lobbyDialogPass.value.trim();
    var maxPlayers = parseInt(_$.lobbyDialogMaxPlayers.value, 10) || 5;
    var mode = _$.lobbyDialogMode.value;
    s7WSSend({ type: "createRoom", password: pass || undefined, maxPlayers: maxPlayers, mode: mode, nick: _nick, ver: GAME_VERSION });
  } else {
    _joiningRoom = true;
    var roomId = _$.lobbyDialogRoomId.value.trim();
    if (!roomId) { _showToast("请输入房间号"); return; }
    var pass2 = _$.lobbyDialogPass.value.trim();
    s7WSSend({ type: "joinRoom", roomId: roomId, password: pass2 || undefined, nick: _nick, ver: GAME_VERSION });
  }
  _closeDialog();
}

// ============================================================
// 7. 联机服务器选择 / Transport 接口
// ============================================================

function _refreshServerSelectUI() {
  if (!_$.serverSelectScreen) return;
  var home = S7_MULTIPLAYER_SERVERS["2"];
  if (_$.server2StatusText) _$.server2StatusText.textContent = home.available ? (_homeTransportMode() === "direct" ? "直连备用 · 家庭电脑需开机" : "反向隧道 · 无需开放公网端口") : "未配置";
  if (_$.serverChoice2) {
    _$.serverChoice2.classList.toggle("serverReady", !!home.available);
    _$.serverChoice2.classList.toggle("serverPending", !home.available);
  }
}

function _serverHint(text) { if (_$.serverSelectHint) _$.serverSelectHint.textContent = text || ""; }

async function _selectServerAndEnter(id) {
  var cfg = _serverConfig(id);

  // 先检查线路本身，尚未可用的线路不占浏览器联机锁。
  if (cfg.id === "2" && !cfg.available) {
    _serverHint("2服家庭服当前不可用");
    _showToast("2服家庭服当前不可用");
    return;
  }
  var kind = _transportKind(cfg);
  if (kind === "home-tunnel" && !window.S7HomeTunnelTransport) {
    _serverHint("2服反向 MQTT 隧道 Transport 未加载");
    _showToast("2服隧道未加载");
    return;
  }
  if (kind === "mqtt" && (!cfg.broker || !window.S7MQTTTransport)) {
    _serverHint("3服 Secure MQTT Transport 当前不可用");
    _showToast("3服 MQTT Transport 未加载");
    return;
  }
  if (kind === "websocket" && !_wsUrlFor(cfg)) {
    _serverHint("当前 WebSocket 线路尚未配置地址");
    return false;
  }
  if (["websocket","home-tunnel","mqtt"].indexOf(kind) < 0) {
    _serverHint("该线路当前还没有可用的传输接口");
    return;
  }

  // 同一浏览器按 serverId 分锁：同服只能一个页面进入；不同服务器允许分别进入。
  if (!window.S7MultiplayerTabGuard) {
    _serverHint("浏览器联机独占锁未加载，已禁止进入以避免同服重复登录");
    _showToast("联机独占锁未加载");
    return;
  }

  _selectedServerId = cfg.id;
  localStorage.setItem("pvz_s7_multiplayer_server", _selectedServerId);

  // 3服是浏览器直连 MQTT：必须“MQTT CONNACK 成功”后才算真正进入。
  // 因此点击3服时只记录 pending，不提前取得跨标签页锁。
  // 这可从根上避免“MQTT没连上，但页面已经把3服锁死”的假占用。
  if (cfg.id === "3") {
    if (_pendingServerEnterId === cfg.id && _lobbyVisible) return;
    _pendingServerEnterId = cfg.id;
    var pendingEntered = false;
    try { pendingEntered = s7ShowLobby() !== false; }
    catch (e) {
      pendingEntered = false;
      _pendingServerEnterId = null;
      _showToast("进入" + cfg.label + "失败：" + (e && e.message ? e.message : "未知错误"));
    }
    if (!pendingEntered) _pendingServerEnterId = null;
    return;
  }

  var lockResult = null;
  try {
    lockResult = window.S7MultiplayerTabGuard.acquireDetailed
      ? await window.S7MultiplayerTabGuard.acquireDetailed(cfg.id)
      : { ok: await window.S7MultiplayerTabGuard.acquire(cfg.id), reason: "legacy", method: "legacy", degraded: false };
  } catch (e) {
    lockResult = { ok: true, reason: "guard-error", method: "memory", degraded: true };
  }
  if (!lockResult || !lockResult.ok) {
    if (lockResult && lockResult.reason === "occupied") {
      var duplicateMsg = "你已经进入" + cfg.label + "联机模式，不可继续进入";
      _serverHint(duplicateMsg + "。同一浏览器仍可进入其他服务器。");
      _showToast(duplicateMsg);
    } else {
      _serverHint("浏览器联机独占锁暂不可用，请重新打开页面后再试");
      _showToast("联机独占锁初始化失败");
    }
    return;
  }

  // 当前页面若此前残留了另一服务器的锁，切线时释放旧锁；其他标签页的不同服锁不受影响。
  if (_tabGuardServerId && _tabGuardServerId !== cfg.id) {
    window.S7MultiplayerTabGuard.release(_tabGuardServerId);
  }
  _tabGuardServerId = cfg.id;

  // 锁后端降级时允许进入，但绝不能误报“已经进入”。
  if (lockResult.degraded) {
    _serverHint(cfg.label + "已进入；浏览器独占锁处于兼容模式，请避免同时打开第二个同服页面。");
  }

  var entered = false;
  try { entered = s7ShowLobby() !== false; }
  catch (e) {
    entered = false;
    _showToast("进入" + cfg.label + "失败：" + (e && e.message ? e.message : "未知错误"));
  }
  if (!entered) {
    window.S7MultiplayerTabGuard.release(cfg.id);
    if (_tabGuardServerId === cfg.id) _tabGuardServerId = null;
  }
}

window.s7ShowServerSelect = function() {
  if (!_$.serverSelectScreen) { s7ShowLobby(); return; }
  _$.startScreen.classList.add("hidden");
  if (_$.game) _$.game.style.display = "none";
  _$.serverSelectScreen.classList.remove("hidden");
  _refreshServerSelectUI();
  _serverHint("1服为外服，大概率需要 VPN；2服为家庭权威服务器，通过反向 MQTT/WSS 隧道接入，无需开放家庭公网端口；3服为 Secure MQTT 灾备服。");
};

window.s7HideServerSelect = function() {
  if (_$.serverSelectScreen) _$.serverSelectScreen.classList.add("hidden");
  _$.startScreen.classList.remove("hidden");
};

window.s7SelectMultiplayerServer = function(id) { _selectServerAndEnter(String(id)); };

// fallback 租约极端情况下若被另一标签页抢占，当前页面立即退出该服务器联机模式。
try {
  window.addEventListener("s7multiplayerlocklost", function(evt) {
    var sid = evt && evt.detail ? String(evt.detail.serverId || "") : "";
    if (!sid || sid !== String(_tabGuardServerId || "")) return;
    _tabGuardServerId = null;
    _showToast("检测到同一浏览器已有另一个页面进入" + _serverConfig(sid).label + "，当前联机已退出");
    if (_lobbyVisible) s7HideLobby(false);
    else s7WSDisconnect();
  });
} catch (_) {}

// ============================================================
// 8. 公共 API
// ============================================================

window.s7ShowLobby = function() {
  if (_lobbyVisible) return true;
  var cfg = _activeServer();
  var guardOwned = !!(window.S7MultiplayerTabGuard && window.S7MultiplayerTabGuard.owns(cfg.id));
  var threePending = cfg.id === "3" && _pendingServerEnterId === cfg.id;
  if (!guardOwned && !threePending) {
    _serverHint("请先在服务器选择界面进入；同一浏览器同一个服务器只允许一个联机页面");
    _showToast("该服务器尚未取得浏览器联机独占锁");
    return false;
  }
  var kind = _transportKind(cfg);
  if (kind === "websocket" && !_activeWSUrl()) {
    _serverHint("当前 WebSocket 线路尚未配置地址");
    return false;
  }
  if (kind === "home-tunnel" && !window.S7HomeTunnelTransport) {
    _serverHint("2服反向 MQTT 隧道尚未加载");
    return false;
  }
  if (kind === "mqtt" && (!cfg.broker || !window.S7MQTTTransport)) {
    _serverHint("3服 Secure MQTT Transport 尚未加载");
    return false;
  }
  _$.startScreen.classList.add("hidden");
  if (_$.serverSelectScreen) _$.serverSelectScreen.classList.add("hidden");
  if (_$.game) _$.game.style.display = "none";
  _$.lobbyScreen.classList.remove("hidden");
  _lobbyVisible = true;
  if (_$.lobbyServerBadge) _$.lobbyServerBadge.textContent = cfg.label + " · " + cfg.name;
  // 每次进入大厅先按当前线路重置状态，避免上一服务器的“未连接”文案串到新服务器。
  _updateStatus("connecting", cfg);
  s7WSConnect();
  _$.lobbyNick.value = _nick;
  _updateLobbyStats();
  if (_wsConnected) _fetchRoomList();
  return true;
};

window.s7HideLobby = function(keepConnection) {
  if (!_lobbyVisible) return;
  _$.lobbyScreen.classList.add("hidden");
  if (!keepConnection) {
    _pendingServerEnterId = null;
    s7WSDisconnect();
    if (_tabGuardServerId && window.S7MultiplayerTabGuard) {
      window.S7MultiplayerTabGuard.release(_tabGuardServerId);
      _tabGuardServerId = null;
    }
    if (_$.serverSelectScreen) {
      _$.serverSelectScreen.classList.remove("hidden");
      _refreshServerSelectUI();
    } else {
      _$.startScreen.classList.remove("hidden");
    }
  }
  _lobbyVisible = false;
};

// ============================================================
// 8. 房间 UI
var _roomMonitorTimer = null;

function _startRoomMonitor() {
  _stopRoomMonitor();
  // 观战者不检测僵尸连接
  if (_isSpectator) return;
  // 房主每 10 秒检测僵尸连接
  if (!_isHost()) return;
  _roomMonitorTimer = setInterval(function() {
    s7WSSend({ type: "checkConnections" });
  }, 10000);
}

function _stopRoomMonitor() {
  if (_roomMonitorTimer) { clearInterval(_roomMonitorTimer); _roomMonitorTimer = null; }
}

// ============================================================

function _showRoom(room, playerId) {
  _roomState = room;
  _roomPlayerId = playerId;
  _$.roomScreen.classList.remove("hidden");
  _renderRoom();
  _startRoomMonitor();
}

function _isHost() {
  return _roomState && _roomState.hostId === _roomPlayerId;
}

function _renderRoom() {
  if (!_roomState) return;
  _$.roomIdDisplay.textContent = _roomState.id || "";
  var host = _findPlayer(_roomState.hostId);
  _$.roomHostDisplay.textContent = "房主: " + (host ? host.nick : "?");
  _$.roomModeDisplay.textContent = "模式: " + (_roomState.mode || "532");
  _$.roomMaxPlayersDisplay.textContent = "上限: " + (_roomState.maxPlayers || 5) + "人";

  // 房主控件 - 非房主也显示但操作时发请求给房主
  _$.roomHostControls.style.display = "";
  _$.roomModeSelect.value = _roomState.mode || "532";
  _$.roomMaxPlayersSelect.value = String(_roomState.maxPlayers || 5);
  _$.roomModeSelect.classList.toggle("guestControl", !_isHost());
  _$.roomMaxPlayersSelect.classList.toggle("guestControl", !_isHost());
  _updateRoomSpeedUI();
  _updateRoomEndModeUI();
  _updateRoomSpectatorUI();

  _renderPlayerList();
  _updateRoomButtons();
}

function _updateRoomSpectatorUI() {
  if (!_$.roomToggleSpecBtn) return;
  var enabled = _roomState && _roomState.allowSpectators;
  _$.roomToggleSpecBtn.textContent = enabled ? "开启" : "关闭";
  _$.roomToggleSpecBtn.style.borderColor = enabled ? "#22c55e" : "#a78bfa";
  _$.roomToggleSpecBtn.style.color = enabled ? "#22c55e" : "#a78bfa";
  // 显示观战者人数
  var specCount = _roomState ? _roomState.players.filter(function(p) { return p.isSpectator; }).length : 0;
  if (specCount > 0) {
    _$.roomToggleSpecBtn.textContent = (enabled ? "开启" : "关闭") + " (" + specCount + "人)";
  }
  // 人数上限：BP模式锁死人数，隐藏选择器
  var curMode = _roomState ? _roomState.mode : "";
  var isBpMode = (curMode === "2p-turn" || curMode === "2p-blind" || curMode === "multi" || curMode === "2p-assign");
  var mpLabel = _$.roomMaxPlayersSelect ? _$.roomMaxPlayersSelect.parentElement : null;
  if (mpLabel) mpLabel.style.display = isBpMode ? "none" : "";
  // 重随机按钮：仅有随机抽卡的模式显示（532/42421/51x5）
  var hasReroll = (curMode === "532" || curMode === "42421" || curMode === "51x5");
  var rrLabel = _$.roomToggleRerollBtn ? _$.roomToggleRerollBtn.parentElement : null;
  if (rrLabel) rrLabel.style.display = hasReroll ? "" : "none";
  if (_$.roomToggleRerollBtn && hasReroll) {
    var rrOff = _roomState && _roomState.disableReroll;
    _$.roomToggleRerollBtn.textContent = rrOff ? "禁用" : "开启";
    _$.roomToggleRerollBtn.style.borderColor = rrOff ? "#ef4444" : "#f59e0b";
    _$.roomToggleRerollBtn.style.color = rrOff ? "#ef4444" : "#f59e0b";
  }
  // Ban选按钮：仅 532/42421 显示
  var isStdMode = (curMode === "532" || curMode === "42421");
  var banLabel = _$.roomToggleBanBtn ? _$.roomToggleBanBtn.parentElement : null;
  if (banLabel) banLabel.style.display = isStdMode ? "" : "none";
  if (_$.roomToggleBanBtn && isStdMode) {
    var banOn = _roomState && _roomState.enableBan;
    _$.roomToggleBanBtn.textContent = banOn ? "开启" : "关闭";
    _$.roomToggleBanBtn.style.borderColor = banOn ? "#22c55e" : "#ef4444";
    _$.roomToggleBanBtn.style.color = banOn ? "#22c55e" : "#ef4444";
  }
  // 以pick代ban按钮：仅 2p-turn/2p-blind/2p-assign 显示
  var is2pBp = (curMode === "2p-turn" || curMode === "2p-blind" || curMode === "2p-assign");
  var pabLabel = _$.roomTogglePickAsBanBtn ? _$.roomTogglePickAsBanBtn.parentElement : null;
  if (pabLabel) pabLabel.style.display = is2pBp ? "" : "none";
  if (_$.roomTogglePickAsBanBtn && is2pBp) {
    var pabOn = _roomState && _roomState.bpPickAsBan;
    _$.roomTogglePickAsBanBtn.textContent = pabOn ? "开启" : "关闭";
    _$.roomTogglePickAsBanBtn.style.borderColor = pabOn ? "#22c55e" : "#38bdf8";
    _$.roomTogglePickAsBanBtn.style.color = pabOn ? "#22c55e" : "#38bdf8";
  }
  // 观战者提示
  if (_isSpectator) {
    var specNotice = document.getElementById("spectatorNotice");
    if (!specNotice) {
      specNotice = document.createElement("div");
      specNotice.id = "spectatorNotice";
      specNotice.style.cssText = "padding:8px 12px;margin-top:8px;border:1px solid #a78bfa;border-radius:6px;background:#1a0a2a;color:#a78bfa;font-size:13px;text-align:center";
      specNotice.textContent = "👁️ 你是观战者，将能看到所有玩家的操作";
      _$.roomScreen.querySelector(".dialog").insertBefore(specNotice, _$.roomPlayerList);
    }
  } else {
    var existingNotice = document.getElementById("spectatorNotice");
    if (existingNotice) existingNotice.remove();
  }
}

function _updateRoomEndModeUI() {
  if (!_$.roomEndModeBtn) return;
  var mode = (_roomState && _roomState.endMode) || "allDead";
  _$.roomEndModeBtn.textContent = mode === "allDead" ? "全灭结束" : "仅剩一路结束";
  _$.roomEndModeBtn.classList.toggle("guestControl", !_isHost());
}

function _updateRoomSpeedUI() {
  if (!_$.roomSpeedBtns) return;
  var currentSpeed = (_roomState && _roomState.speed) || 1;
  var btns = _$.roomSpeedBtns.querySelectorAll(".roomSpeedBtn");
  for (var i = 0; i < btns.length; i++) {
    var sp = parseInt(btns[i].getAttribute("data-speed"), 10);
    btns[i].classList.toggle("selected", sp === currentSpeed);
  }
}

function _findPlayer(pid) {
  if (!_roomState || !_roomState.players) return null;
  for (var i = 0; i < _roomState.players.length; i++) {
    if (_roomState.players[i].id === pid) return _roomState.players[i];
  }
  return null;
}

function _findSelf() { return _findPlayer(_roomPlayerId); }

// 3服使用公共 MQTT 时，瞬时 event/direct 可能极少数丢失；roomUpdate 是 retained 权威状态。
// UI 必须能够仅根据权威 room state 自我修复，而不能把本地阶段变量当成事实来源。
function _syncFormationSubmissionUIFromRoom() {
  if (!_roomState || !_$.formationOverlay || _$.formationOverlay.classList.contains("hidden")) return;
  var me = _findSelf();
  if (!me || me.isSpectator) return;
  var allUp = (_roomState.players || []).filter(function(p) { return !p.isSpectator; }).every(function(p) { return !!p.uploaded; });
  var hint = document.getElementById("formationWaitHint");

  if (me.uploaded) {
    _bpPhase = "uploaded";
    if (_isHost() && allUp) {
      _enableStartBattleBtn();
      if (hint) hint.textContent = "所有玩家已上传阵型，可以开始战斗";
    } else {
      _$.formationConfirmBtn.textContent = "等待其他玩家...";
      _$.formationConfirmBtn.disabled = true;
      _$.formationConfirmBtn.onclick = function() {};
      if (!hint) {
        hint = document.createElement("p");
        hint.id = "formationWaitHint";
        hint.style.cssText = "color:#9fb7c6;font-size:13px;text-align:center;margin-top:8px";
        _$.formationOverlay.querySelector(".dialog").appendChild(hint);
      }
      hint.textContent = "已上传阵型，等待其他玩家...";
    }
  } else {
    // 明确以服务端/房主权威状态纠正本地误判：别人上传不等于我已上传。
    _bpPhase = "formation";
    _$.formationConfirmBtn.textContent = "确认上传阵型";
    _$.formationConfirmBtn.disabled = false;
    _$.formationConfirmBtn.onclick = function() { _uploadFormation(); };
    if (hint) hint.remove();
  }
}

function _reconcileAuthoritativeRoomState() {
  if (!_roomState || !_roomPlayerId) return false;

  // 若 retained roomUpdate 中已经没有自己，说明踢出/移除已由房主权威状态确认。
  // 即使瞬时 kicked direct 消息丢失，也必须立即退出房间 UI。
  if (!_findSelf()) {
    _showToast("你已被移出房间");
    _leaveRoom();
    return true;
  }

  // startGame 的 enterLaneSelection 是低延迟事件；laneSelect 状态是可靠兜底。
  if (_roomState.state === "laneSelect" && !window._mpBattleActive) {
    if (_$.laneSelectScreen.classList.contains("hidden")) _showLaneSelect();
  }

  // battleStart 亦以 retained roomUpdate 中的 battleInit 兜底。
  // battleInit 只含 seed/模式/速度/结束条件/初始阵型，不包含任何战斗过程状态。
  if (_roomState.state === "battling" && _roomState.battleInit && !window._mpBattleActive) {
    var bi = _roomState.battleInit;
    _setupBattle(bi.seed, bi.formations || {}, bi.speed || 1, bi.endMode);
    return true;
  }

  _syncFormationSubmissionUIFromRoom();
  return false;
}

function _renderPlayerList(container) {
  var el = container || _$.roomPlayerList;
  el.innerHTML = "";
  if (!_roomState || !_roomState.players) return;
  for (var i = 0; i < _roomState.players.length; i++) {
    var p = _roomState.players[i];
    var div = document.createElement("div");
    div.className = "roomPlayer" + (p.id === _roomState.hostId ? " isHost" : "");
    var laneText = (p.lane >= 0) ? "路线" + (p.lane + 1) : "未选";
    var uploadText = p.uploaded ? " ✅" : "";
    div.innerHTML =
      (p.id === _roomState.hostId ? '<span class="crown">👑</span>' : "") +
      '<span class="readyDot ' + (p.ready ? "ready" : "notReady") + '"></span>' +
      '<span>' + _escapeHtml(p.nick || p.id) + '</span>' +
      '<span class="laneBadge">' + laneText + uploadText + '</span>';
    // 房主可以踢人（全过程可用）
    if (_isHost() && p.id !== _roomPlayerId) {
      var kickBtn = document.createElement("button");
      kickBtn.textContent = "踢出";
      kickBtn.className = "danger kickBtn";
      kickBtn.style.cssText = "font-size:11px;padding:2px 8px;margin-left:4px";
      (function(pid) { kickBtn.onclick = function() { s7WSSend({ type: "kick", playerId: pid }); }; })(p.id);
      div.appendChild(kickBtn);
    }
    el.appendChild(div);
  }
}

function _showKickDialog() {
  if (!_roomState || !_roomState.players) return;
  var others = _roomState.players.filter(function(p) { return p.id !== _roomPlayerId; });
  if (others.length === 0) { _showToast("没有其他玩家"); return; }
  var msg = "选择要踢出的玩家：\n";
  for (var i = 0; i < others.length; i++) {
    msg += (i + 1) + ". " + others[i].nick + (others[i].id === _roomState.hostId ? " (房主)" : "") + "\n";
  }
  msg += "\n输入序号（0=取消）：";
  var input = prompt(msg);
  if (!input) return;
  var idx = parseInt(input, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= others.length) return;
  s7WSSend({ type: "kick", playerId: others[idx].id });
}

function _findPlayerByLane(lane) {
  if (!_roomState || !_roomState.players) return null;
  for (var i = 0; i < _roomState.players.length; i++) {
    if (_roomState.players[i].lane === lane) return _roomState.players[i];
  }
  return null;
}

// ---------- 选路界面 ----------
function _showLaneSelect() {
  _$.roomScreen.classList.add("hidden");
  _$.laneSelectScreen.classList.remove("hidden");
  _renderLaneSelect();
}

function _renderLaneSelect() {
  var el = _$.laneSelectGrid;
  el.innerHTML = "";
  if (!_roomState) return;
  // 观战者：只显示玩家路线分配，不提供选择
  if (_isSpectator) {
    el.innerHTML = '<p style="color:#a78bfa;font-size:14px;text-align:center;padding:20px">👁️ 你正在观战，路线选择已在进行中</p>';
    _renderPlayerList(_$.laneSelectPlayerList);
    return;
  }
  var self = _findSelf();
  var myLane = self ? self.lane : -1;
  for (var lane = 0; lane < 5; lane++) {
    var div = document.createElement("div");
    var occupant = _findPlayerByLane(lane);
    var isMine = (myLane === lane);
    var canSelect = !occupant && myLane < 0;

    div.className = "roomLane";
    if (isMine) div.classList.add("selfChosen");
    else if (occupant) div.classList.add("otherChosen");
    if (canSelect) div.classList.add("selectable");

    div.innerHTML =
      '<div class="laneNum">路线 ' + (lane + 1) + '</div>' +
      (occupant
        ? '<div class="lanePlayer">' + _escapeHtml(occupant.nick || occupant.id) + '</div>'
        : '<div class="laneEmpty">-</div>');

    if (canSelect) {
      (function(l) {
        div.addEventListener("click", function() {
          s7WSSend({ type: "selectLane", lane: l });
        });
      })(lane);
    }
    el.appendChild(div);
  }
  // 选路界面也显示玩家列表（含踢人按钮）
  _renderPlayerList(_$.laneSelectPlayerList);
}

function _updateRoomButtons() {
  if (!_roomState) return;
  // 离开按钮所有人可见（包括观战者）
  _$.roomLeaveBtn.style.display = "";
  if (_isSpectator) {
    // 观战者：隐藏开始游戏按钮，离开按钮始终可见
    _$.roomStartGameBtn.style.display = "none";
    return;
  }
  // "开始游戏"按钮所有人可见可点，人数不足时点击显示提示
  _$.roomStartGameBtn.style.display = "";
  _$.roomStartGameBtn.disabled = false;
  // 非房主按钮文字加"请求"
  _$.roomStartGameBtn.textContent = _isHost() ? "开始游戏" : "请求开始游戏";
}

// ============================================================
// 9. BP 植物选择
// ============================================================

function _startBP(mode) {
  _$.roomScreen.classList.add("hidden");
  _bpPhase = "round1";
  _bpAllPicks = [];
  _bpSelected = [];
  _bpRound = 0;
  _bpRerollsLeft = 2;
  _banSelected = [];
  // 如果开启Ban模式，先进入 Ban1（每人ban1个）
  if (_roomState && _roomState.enableBan) {
    _bpPhase = "ban1";
    _renderBanPhase(1, "每人禁用 1 个植物，所有人ban完后进入选将");
    return;
  }
  _bpNextRound(mode);
}

function _getBannedKeys() {
  return (_roomState && _roomState.bannedPlants) ? _roomState.bannedPlants.map(function(b) { return b.plantKey; }) : [];
}

function _bpDrawRandom(count) {
  var pool = PLANT_KEYS.filter(function(k) { return _getBannedKeys().indexOf(k) < 0; });
  var result = [];
  for (var i = 0; i < count && pool.length > 0; i++) {
    var idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

// Ban阶段：显示完整植物列表
function _renderBanPhase(banCount, description) {
  banCount = banCount || 2;
  _$.bpOverlay.classList.remove("hidden");
  _$.bpTitle.textContent = "Ban 阶段";
  _$.bpRoundInfo.textContent = description || "每人最多禁用 " + banCount + " 个植物";
  _$.bpHistory.style.display = "none";

  var grid = _$.bpPlantGrid;
  grid.innerHTML = "";
  var banned = (_roomState && _roomState.bannedPlants) || [];
  var myBans = banned.filter(function(b) { return b.by === _roomPlayerId; });
  // ban2阶段：只显示ban2的ban（ban1的ban不计入当前阶段）
  if (_bpPhase === "ban2") {
    _banSelected = myBans.slice(1).map(function(b) { return b.plantKey; });
  } else {
    _banSelected = myBans.map(function(b) { return b.plantKey; });
  }
  _$.bpConfirmBtn.disabled = false;
  _$.bpConfirmBtn.textContent = "确认ban选（" + _banSelected.length + "/" + banCount + "）";

  for (var i = 0; i < PLANT_KEYS.length; i++) {
    var key = PLANT_KEYS[i];
    var def = PLANTS[key];
    if (!def) continue;
    var card = document.createElement("div");
    card.className = "bpCard";
    var isBanned = banned.some(function(b) { return b.plantKey === key; });
    if (isBanned) {
      card.classList.add("bpBanned");
      card.innerHTML = '<div class="bpEmoji">' + (def.emoji || "🌿") + '</div><div class="bpName">' + _escapeHtml(def.name || key) + '</div><div class="bpBannedTag">已禁</div>';
    } else {
      card.innerHTML = '<div class="bpEmoji">' + (def.emoji || "🌿") + '</div><div class="bpName">' + _escapeHtml(def.name || key) + '</div>';
    }
    (function(k, cardEl, currentBanned, currentDef, currentBanCount) {
      cardEl.addEventListener("click", function() {
        var myIdx = _banSelected.indexOf(k);
        if (myIdx >= 0) {
          // 乐观取消：即时移除标记，然后通知服务器
          _banSelected.splice(myIdx, 1);
          cardEl.classList.remove("bpBanned", "bpSelected");
          cardEl.innerHTML = '<div class="bpEmoji">' + ((currentDef && currentDef.emoji) || "🌿") + '</div><div class="bpName">' + _escapeHtml((currentDef && currentDef.name) || k) + '</div>';
          s7WSSend({ type: "banPlant", plantKey: k });
        } else if (_banSelected.length < currentBanCount && !currentBanned.some(function(b) { return b.plantKey === k; })) {
          // 乐观ban：即时添加标记，然后通知服务器
          _banSelected.push(k);
          cardEl.classList.add("bpBanned");
          cardEl.innerHTML = '<div class="bpEmoji">' + ((currentDef && currentDef.emoji) || "🌿") + '</div><div class="bpName">' + _escapeHtml((currentDef && currentDef.name) || k) + '</div><div class="bpBannedTag">已禁</div>';
          s7WSSend({ type: "banPlant", plantKey: k });
        }
        // 更新确认按钮文字
        _$.bpConfirmBtn.textContent = "确认ban选（" + _banSelected.length + "/" + currentBanCount + "）";
      });
    })(key, card, banned, def, banCount);
    grid.appendChild(card);
  }

  var oldBtn = document.getElementById("bpRerollBtn");
  if (oldBtn) oldBtn.remove();
  _renderPlayerList(_$.bpPlayerList);
}

// 确认ban选，发送服务端等待全员确认
function _confirmBan() {
  var mode = (_roomState && _roomState.mode) || "532";
  _pendingPhaseFn = function() {
    if (_bpPhase === "ban2") {
      _bpPhase = mode === "532" ? "round2" : "round3";
      _bpRound = mode === "532" ? 1 : 2;
      _bpSelected = [];
      var bannedKeys = _getBannedKeys();
      var pickCount = mode === "532" ? 2 : 1;
      var title = mode === "532" ? "自由选择 2 株" : "自由选择 1 株";
      _bpDraws = PLANT_KEYS.filter(function(k) { return bannedKeys.indexOf(k) < 0; });
      _renderBP(title, pickCount, false);
    } else {
      _bpPhase = "round1";
      _bpRound = 0;
      _bpAllPicks = [];
      _bpSelected = [];
      _bpNextRound(mode);
    }
  };
  _sendConfirmPhase();
  _$.bpConfirmBtn.disabled = true;
  _$.bpConfirmBtn.textContent = "等待其他玩家...";
}

// 发送确认 + 超时重发
var _confirmPhaseTimer = null;
function _sendConfirmPhase() {
  clearTimeout(_confirmPhaseTimer);
  s7WSSend({ type: "confirmPhase" });
  // 10秒未收到phaseComplete则重发（用命名函数避免arguments.callee在strict mode崩溃）
  _confirmPhaseTimer = setTimeout(_resendConfirmPhase, 10000);
}
function _resendConfirmPhase() {
  if (_pendingPhaseFn) {
    _showToast("等待超时，重新发送确认...");
    s7WSSend({ type: "confirmPhase" });
    _confirmPhaseTimer = setTimeout(_resendConfirmPhase, 10000);
  }
}

function _bpNextRound(mode) {
  _bpRound++;
  _bpSelected = [];
  _bpRerollsLeft = 2;

  // 排除被ban的植物
  var bannedKeys = _getBannedKeys();

  if (mode === "532") {
    if (_bpRound === 1) {
      _bpDraws = _bpDrawRandom(5);
      _bpPhase = "round1";
      _renderBP("从以下 5 株中选 3 株", 3, true);
    } else if (_bpRound === 2) {
      // 532随机选完后、自由选前：若有ban模式则插入ban2
      if (_roomState && _roomState.enableBan) {
        _bpPhase = "ban2";
        _renderBanPhase(1, "每人再禁用 1 个植物，然后进入自由选择");
        return;
      }
      _bpDraws = PLANT_KEYS.filter(function(k) { return bannedKeys.indexOf(k) < 0; });
      _bpPhase = "round2";
      _renderBP("自由选择 2 株", 2, false);
    } else {
      _startFormation();
    }
  } else if (mode === "42421") {
    if (_bpRound === 1) {
      _bpDraws = _bpDrawRandom(4);
      _bpPhase = "round1";
      _renderBP("从以下 4 株中选 2 株", 2, true);
    } else if (_bpRound === 2) {
      _bpDraws = _bpDrawRandom(4);
      _bpPhase = "round2";
      _renderBP("再从以下 4 株中选 2 株", 2, true);
    } else if (_bpRound === 3) {
      // 42421随机选完后、自由选前：若有ban模式则插入ban2
      if (_roomState && _roomState.enableBan) {
        _bpPhase = "ban2";
        _renderBanPhase(1, "每人再禁用 1 个植物，然后进入自由选择");
        return;
      }
      _bpDraws = PLANT_KEYS.filter(function(k) { return bannedKeys.indexOf(k) < 0; });
      _bpPhase = "round3";
      _renderBP("自由选择 1 株", 1, false);
    } else {
      _startFormation();
    }
  } else if (mode === "51x5") {
    if (_bpRound <= 5) {
      _bpDraws = _bpDrawRandom(5);
      _bpPhase = "round" + _bpRound;
      _renderBP("第 " + _bpRound + "/5 轮：从 5 株中选 1 株", 1, true);
    } else {
      _startFormation();
    }
  }
}

function _renderBP(infoText, pickCount, canReroll) {
  _$.bpTitle.textContent = "BP 选将 - 第 " + _bpRound + " 轮";
  _$.bpRoundInfo.textContent = infoText;
  _$.bpConfirmBtn.disabled = true;

  // 显示之前轮次已选的植物
  if (_bpAllPicks.length > 0) {
    var hist = [];
    for (var hi = 0; hi < _bpAllPicks.length; hi++) {
      var hd = PLANTS[_bpAllPicks[hi]];
      hist.push((hd ? hd.emoji : "🌿") + _escapeHtml(hd ? hd.name : _bpAllPicks[hi]));
    }
    _$.bpHistory.innerHTML = '<span style="color:#9fb7c6;font-size:12px">已选植物：</span><span style="color:#a78bfa;font-size:13px">' + hist.join(" ") + '</span>';
    _$.bpHistory.style.display = "";
  } else {
    _$.bpHistory.style.display = "none";
  }

  // 显示被ban的植物
  var bannedList = (_roomState && _roomState.bannedPlants) || [];
  var oldBanDisplay = document.getElementById("bpBannedDisplay");
  if (oldBanDisplay) oldBanDisplay.remove();
  if (bannedList.length > 0) {
    var banDiv = document.createElement("div");
    banDiv.id = "bpBannedDisplay";
    banDiv.style.cssText = "margin:6px 0;padding:4px 8px;border:1px solid #ef4444;border-radius:6px;background:#1a0a0a;font-size:12px;color:#ef4444";
    var banParts = [];
    for (var bi = 0; bi < bannedList.length; bi++) {
      var bd = PLANTS[bannedList[bi].plantKey];
      var byNick = "";
      if (_roomState) {
        var byP = _roomState.players.find(function(p) { return p.id === bannedList[bi].by; });
        if (byP) byNick = " (" + _escapeHtml(byP.nick) + ")";
      }
      banParts.push((bd ? bd.emoji : "🌿") + _escapeHtml(bd ? bd.name : bannedList[bi].plantKey) + byNick);
    }
    banDiv.innerHTML = "🚫 已禁用: " + banParts.join(" ");
    _$.bpOverlay.querySelector(".dialog").insertBefore(banDiv, _$.bpPlantGrid);
  }

  // 渲染植物网格
  var grid = _$.bpPlantGrid;
  grid.innerHTML = "";
  var bannedKeys = _getBannedKeys();
  for (var i = 0; i < _bpDraws.length; i++) {
    var key = _bpDraws[i];
    var def = PLANTS[key];
    if (!def) continue;
    var card = document.createElement("div");
    card.className = "bpCard";
    var isBanned = bannedKeys.indexOf(key) >= 0;
    if (isBanned) {
      card.classList.add("bpBanned");
      card.innerHTML = '<div class="bpEmoji">' + (def.emoji || "🌿") + '</div><div class="bpName">' + _escapeHtml(def.name || key) + '</div><div class="bpBannedTag" style="font-size:10px;color:#ef4444">已禁</div>';
    } else {
      card.innerHTML =
        '<div class="bpEmoji">' + (def.emoji || "🌿") + '</div>' +
        '<div class="bpName">' + _escapeHtml(def.name || key) + '</div>';
    }
    (function(k, c, banned) {
      c.addEventListener("click", function() {
        if (banned) return;
        var idx = _bpSelected.indexOf(k);
        if (idx >= 0) {
          _bpSelected.splice(idx, 1);
          c.classList.remove("bpSelected");
        } else {
          if (_bpSelected.length >= pickCount) return;
          _bpSelected.push(k);
          c.classList.add("bpSelected");
        }
        _bpUpdateSelected(pickCount);
      });
    })(key, card, isBanned);
    grid.appendChild(card);
  }
  _bpUpdateSelected(pickCount);

  // 重随机按钮
  var oldBtn = document.getElementById("bpRerollBtn");
  if (oldBtn) oldBtn.remove();
  var disableReroll = _roomState && _roomState.disableReroll;
  if (canReroll && !disableReroll && _bpRerollsLeft > 0) {
    var rerollBtn = document.createElement("button");
    rerollBtn.id = "bpRerollBtn";
    rerollBtn.className = "primary";
    rerollBtn.style.cssText = "margin-top:8px;width:100%";
    rerollBtn.textContent = "换一批（剩余 " + _bpRerollsLeft + " 次）";
    rerollBtn.onclick = function() {
      _bpRerollsLeft--;
      _bpSelected = [];
      var mode = (_roomState && _roomState.mode) || "532";
      if (mode === "532" && _bpRound === 1) _bpDraws = _bpDrawRandom(5);
      else if (mode === "42421" && (_bpRound === 1 || _bpRound === 2)) _bpDraws = _bpDrawRandom(4);
      else if (mode === "51x5") _bpDraws = _bpDrawRandom(5);
      _renderBP(infoText, pickCount, canReroll);
    };
    _$.bpOverlay.querySelector(".dialog").appendChild(rerollBtn);
  }

  // BP界面也显示玩家列表（含踢人按钮）
  _renderPlayerList(_$.bpPlayerList);

  _$.bpOverlay.classList.remove("hidden");
}

function _bpUpdateSelected(pickCount) {
  var parts = [];
  for (var i = 0; i < _bpSelected.length; i++) {
    var def = PLANTS[_bpSelected[i]];
    parts.push((def ? def.emoji : "？") + " " + (def ? def.name : _bpSelected[i]));
  }
  _$.bpSelected.innerHTML = parts.join("、") || '<span style="color:#6b8b9c">未选</span>';
  _$.bpConfirmBtn.disabled = (_bpSelected.length !== pickCount);
  _$.bpConfirmBtn.textContent = "确认选择（" + _bpSelected.length + "/" + pickCount + "）";
}

function _bpConfirmRound() {
  // 将本轮选中的植物加入累积列表
  for (var i = 0; i < _bpSelected.length; i++) {
    _bpAllPicks.push(_bpSelected[i]);
  }
  var mode = (_roomState && _roomState.mode) || "532";
  // 发送服务端等待全员确认再进入下一轮
  _pendingPhaseFn = function() { _bpNextRound(mode); };
  _sendConfirmPhase();
  _$.bpConfirmBtn.disabled = true;
  _$.bpConfirmBtn.textContent = "等待其他玩家...";
}

function _startFormation() {
  _bpPhase = "formation";
  // 新BP模式：_formationOrder已由服务端设置，不覆盖
  if (!_formationOrder || _formationOrder.length !== 5) {
    _formationOrder = _bpAllPicks.slice(); // 标准BP模式从_bpAllPicks取
  }
  _formSlotSel = -1;
  _$.bpOverlay.classList.add("hidden");
  _renderFormation();
  _renderPlayerList(_$.formationPlayerList);
  _$.formationOverlay.classList.remove("hidden");
  // 每次进入阵型页都从权威 room state 决定“我是否已提交”，避免继承其他玩家/上一局的本地 UI 状态。
  _syncFormationSubmissionUIFromRoom();
}

// ============================================================
// 10. 阵型编辑（点击交换）
// ============================================================

function _renderFormation() {
  var el = _$.formationSlots;
  el.innerHTML = "";
  for (var i = 0; i < _formationOrder.length; i++) {
    var key = _formationOrder[i];
    var def = PLANTS[key];
    var slot = document.createElement("div");
    slot.className = "formSlot" + (i === _formSlotSel ? " formSlotSel" : "");
    slot.innerHTML =
      '<div class="formEmoji">' + (def ? def.emoji : "？") + '</div>' +
      '<div class="formName">' + _escapeHtml(def ? def.name : key) + '</div>' +
      '<div class="formPos">' + (i === 0 ? "后排" : i === 4 ? "前排" : "") + '</div>';
    (function(idx) {
      slot.addEventListener("click", function() { _formSlotClick(idx); });
    })(i);
    el.appendChild(slot);
  }
}

function _formSlotClick(idx) {
  if (_formSlotSel < 0) {
    _formSlotSel = idx;
  } else if (_formSlotSel === idx) {
    _formSlotSel = -1;
  } else {
    // 交换
    var tmp = _formationOrder[_formSlotSel];
    _formationOrder[_formSlotSel] = _formationOrder[idx];
    _formationOrder[idx] = tmp;
    _formSlotSel = -1;
  }
  _renderFormation();
}

function _uploadFormation() {
  if (_formationOrder.length !== 5) return;
  s7WSSend({ type: "uploadFormation", formation: _formationOrder.slice() });
  _bpPhase = "uploaded";
  _$.formationConfirmBtn.textContent = "等待其他玩家...";
  _$.formationConfirmBtn.disabled = true;
  _$.formationConfirmBtn.onclick = function() {};

  // 更新等待提示
  var hint = document.createElement("p");
  hint.id = "formationWaitHint";
  hint.style.cssText = "color:#9fb7c6;font-size:13px;text-align:center;margin-top:8px";
  hint.textContent = "已上传阵型，等待其他玩家...";
  var existing = document.getElementById("formationWaitHint");
  if (existing) existing.remove();
  _$.formationOverlay.querySelector(".dialog").appendChild(hint);

  // 兜底：每2秒检查全员上传状态，更新开始战斗按钮
  clearTimeout(_formationCheckTimer);
  (function checkAllUploaded() {
    _formationCheckTimer = setTimeout(function() {
      if (_bpPhase !== "uploaded" || !_roomState) return;
      if (_isHost()) {
        var allUp = _roomState.players.filter(function(p) { return !p.isSpectator; }).every(function(p) { return p.uploaded; });
        if (allUp) {
          _enableStartBattleBtn();
          _showToast("所有玩家已上传阵型，可以开始战斗");
          return;
        }
      }
      checkAllUploaded(); // 继续轮询
    }, 2000);
  })();
}

// 切回前台时重新绑定确认按钮
document.addEventListener("visibilitychange", function() {
  if (!document.hidden) {
    // 重新绑定BP确认按钮
    if (_$.bpConfirmBtn) {
      _$.bpConfirmBtn.onclick = function() {
        if (_bpPhase === "ban1" || _bpPhase === "ban2") { _confirmBan(); } else { _bpConfirmRound(); }
      };
    }
    // 重新绑定阵型确认按钮（按当前阶段决定）
    if (_$.formationConfirmBtn) {
      if (_bpPhase === "formation") {
        _$.formationConfirmBtn.onclick = function() { _uploadFormation(); };
      }
      // "uploaded" 阶段不重绑（等待中或已是开始战斗）
    }
    // 重新绑定BP模式确认按钮
    if (_$.bpModeConfirmBtn) {
      _$.bpModeConfirmBtn.onclick = function() { _bpModeConfirm(); };
    }
  }
});

// ============================================================
// 11. 战斗设置 & 监控
// ============================================================

function _setupBattle(seed, formations, speed, endMode) {
  _battleSpeed = speed || 1;
  _battleResultSent = false;

  // 隐藏所有覆盖层
  _$.bpOverlay.classList.add("hidden");
  _$.formationOverlay.classList.add("hidden");
  _$.roomScreen.classList.add("hidden");

  // 显示游戏画面（和正常"进入斗蛐蛐"一致）
  _$.startScreen.classList.add("hidden");
  if (_$.game) _$.game.style.display = "block";

  // 设置种子 RNG
  s7SetBattleSeed(seed);

  // 创建新游戏状态
  newState(false);
  if (endMode) state.endMode = endMode;

  // 清除默认植物，设置阵型植物
  state.plants = [];
  for (var lane = 0; lane < 5; lane++) {
    var formation = formations["lane" + lane];
    if (formation && formation.length === 5) {
      for (var col = 0; col < 5; col++) {
        var p = makePlant(formation[col], lane, col);
        state.plants.push(p);
      }
    }
  }
  // 初始化植物
  for (var i = 0; i < state.plants.length; i++) {
    s7InitPlant(state.plants[i], true);
  }

  // 开始战斗（开启出怪）
  startOrResetBattle();
  state.running = true;
  s7SetSpeed(_battleSpeed);
  resize();

  // 显示战斗信息条（顶部浮动）
  _$.battleSeedDisplay.textContent = seed + " · " + _battleSpeed + "×";
  _$.battleTimer.textContent = "00:00";

  // 显示已选植物
  var myFormation = null;
  for (var fi = 0; fi < 5; fi++) {
    var f = formations["lane" + fi];
    if (f && f.length === 5) {
      // 找到自己的阵型（通过 _roomState 中的 lane）
      if (_roomState) {
        var myP = _roomState.players.find(function(p) { return p.id === _roomPlayerId; });
        if (myP && myP.lane === fi) { myFormation = f; break; }
      }
    }
  }
  if (!myFormation && _bpAllPicks.length === 5) myFormation = _bpAllPicks;
  if (myFormation) {
    var parts = [];
    for (var pi = 0; pi < myFormation.length; pi++) {
      var pd = PLANTS[myFormation[pi]];
      parts.push((pd ? pd.emoji : "🌿") + (pd ? pd.name : myFormation[pi]));
    }
    _$.battlePlantsDisplay.textContent = "已选: " + parts.join(" ");
  }

  _$.battleScreen.classList.remove("hidden");
  _$.battleScreen.classList.add("mp-battle-overlay");

  // 房主显示停止按钮和踢人按钮
  if (_isHost()) {
    _$.battleHostControls.style.display = "";
  } else {
    _$.battleHostControls.style.display = "none";
  }

  // 锁定游戏操作面板（CSS 用 display:none 隐藏 #side 和 iOS 按钮）
  document.body.classList.add("mp-locked");

  // 后台运行：追踪墙上时间，直接追赶模拟
  window._mpBattleActive = true;
  // 用 Page Visibility API：前台 rAF 驱动，后台 setInterval 驱动，互斥不重复
  if (typeof document !== "undefined") {
    var _onVisChange = function() {
      if (!window._mpBattleActive) return;
      if (document.hidden) {
        // 切到后台：启动 setInterval 兜底
        if (!_mpBgInterval) {
          _mpBgInterval = setInterval(function() {
            if (typeof runGameFrame === "function") runGameFrame(performance.now());
          }, 100);
        }
      } else {
        // 切回前台：停止 setInterval，让 rAF 接管
        if (_mpBgInterval) { clearInterval(_mpBgInterval); _mpBgInterval = null; }
      }
    };
    document.addEventListener("visibilitychange", _onVisChange);
    _mpBgVisHandler = _onVisChange;
    // 初始检查（如果加载时就在后台）
    if (document.hidden) _onVisChange();
  }

  _battleAborted = false;
  _laneDeathTimes = [null, null, null, null, null];
  _startBattleMonitor();
}

function _startBattleMonitor() {
  _stopBattleMonitor();

  _battleTimerInterval = setInterval(function() {
    if (_battleAborted) return;
    if (typeof state === "undefined" || !state) return;
    var t = state.time || 0;
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    _$.battleTimer.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }, 200);

  _battleMonitorTimer = setInterval(function() {
    if (_battleAborted) return;
    if (typeof state === "undefined" || !state || !state.teams) return;
    var allDead = true;
    for (var i = 0; i < 5; i++) {
      if (!state.teams[i]) continue;
      if (!state.teams[i].alive && _laneDeathTimes[i] === null) {
        _laneDeathTimes[i] = state.time || 0;
      }
      if (state.teams[i].alive) allDead = false;
    }
    // 结束条件检测（按房主设置）
    var aliveCount = 0;
    for (var j = 0; j < 5; j++) {
      if (state.teams[j] && state.teams[j].alive) aliveCount++;
    }
    var ended = state.endMode === "lastLane" ? aliveCount <= 1 : allDead;
    if (ended && !_battleAborted && !_forceStopped) {
      _battleAborted = true;
      _stopBattleMonitor();
      _stopBgLoop();
      s7SetBattleSeed(null);
      if (typeof state !== "undefined" && state) { state.battle = false; state.running = false; }
      document.body.classList.remove("mp-locked");
      _$.battleScreen.classList.add("hidden");
      _$.battleScreen.classList.remove("mp-battle-overlay");
      if (_$.game) _$.game.style.display = "none";
      window._mpBattleActive = false;
      var rankings = _buildRankings();
      _submitBattleResult(rankings);
      _showResult(rankings);
    }
  }, 500);
}

function _stopBattleMonitor() {
  if (_battleMonitorTimer) { clearInterval(_battleMonitorTimer); _battleMonitorTimer = null; }
  if (_battleTimerInterval) { clearInterval(_battleTimerInterval); _battleTimerInterval = null; }
}

function _stopBgLoop() {
  window._mpBattleActive = false;
  if (_mpBgInterval) { clearInterval(_mpBgInterval); _mpBgInterval = null; }
  if (_mpBgVisHandler && document) { document.removeEventListener("visibilitychange", _mpBgVisHandler); _mpBgVisHandler = null; }
}

function _cleanupBattle() {
  _stopBattleMonitor();
  _stopBgLoop();
  s7SetBattleSeed(null);
  if (typeof state !== "undefined" && state) { state.battle = false; state.running = false; }
  document.body.classList.remove("mp-locked");
  _$.battleScreen.classList.add("hidden");
  _$.battleScreen.classList.remove("mp-battle-overlay");
  if (_$.game) _$.game.style.display = "none";
  window._mpBattleActive = false;
}

// 只把“当前玩家的本局临时状态”恢复到刚进入房间时的样子。
// 注意：绝不修改房主设置（模式/人数/速度/结束条件/观战/Ban/BP 等）。
function _resetLocalPlayerRoundState() {
  var me = _findSelf();
  if (!me) return;
  if (_roomState && Array.isArray(_roomState.lanes) && me.lane >= 0 && _roomState.lanes[me.lane] === me.id) {
    _roomState.lanes[me.lane] = null;
  }
  me.lane = -1;
  me.ready = false;
  me.alive = true;
  me.survivalTime = 0;
  me.formation = 0;
  me.uploaded = false;
}

// 重置回房间屏：清理本地本局状态，但保留房间/房主设置。
function _resetToRoom() {
  _bpPhase = "idle";
  _bpAllPicks = [];
  _bpSelected = [];
  _bpDraws = [];
  _bpRound = 0;
  _bpRerollsLeft = 0;
  _formationOrder = [];
  _banSelected = [];
  _bpModeSelected = [];
  _bpModeAssignTarget = null;
  _bpModeState = null;
  _battleAborted = false;
  _battleResultSent = false;
  _forceStopped = false;
  _resetLocalPlayerRoundState();
  var meAfterReset = _findSelf();
  _isSpectator = !!(meAfterReset && meAfterReset.isSpectator);
  _laneDeathTimes = [null, null, null, null, null];
  clearTimeout(_confirmPhaseTimer);
  clearTimeout(_formationCheckTimer);
  _pendingPhaseFn = null;
  _$.laneSelectScreen.classList.add("hidden");
  _$.bpOverlay.classList.add("hidden");
  _$.formationOverlay.classList.add("hidden");
  _$.bpModeOverlay.classList.add("hidden");
  _$.roomScreen.classList.remove("hidden");
  _renderRoom();
  _renderPlayerList();
}

// 战斗结束后才上报最终结果；不包含任何战斗过程快照。
function _submitBattleResult(rankings) {
  if (_battleResultSent || !rankings || !rankings.length) return;
  var results = {};
  for (var i = 0; i < rankings.length; i++) {
    var r = rankings[i];
    if (r && r.lane >= 0 && r.lane < 5 && isFinite(r.time)) results["lane" + r.lane] = Number(r.time) || 0;
  }
  _battleResultSent = true;
  s7WSSend({ type: "battleResult", results: results });
}

// 从当前游戏状态构建排名
function _buildRankings() {
  var rankings = [];
  if (typeof state === "undefined" || !state || !state.teams) return rankings;
  for (var j = 0; j < 5; j++) {
    var t = state.teams[j];
    if (t) {
      var playerData = _roomState ? _roomState.players.find(function(p) { return p.lane === j; }) : null;
      // 只有有玩家的路线才参与积分结算
      if (!playerData) continue;
      rankings.push({
        lane: j,
        nick: playerData.nick,
        time: t.alive ? (state.time || 0) : (_laneDeathTimes[j] !== null ? _laneDeathTimes[j] : (t.defeatAt || state.time || 0))
      });
    }
  }
  rankings.sort(function(a, b) { return b.time - a.time; });
  return rankings;
}

// 启用开始战斗按钮
function _enableStartBattleBtn() {
  _$.formationConfirmBtn.textContent = "开始战斗";
  _$.formationConfirmBtn.disabled = false;
  _$.formationConfirmBtn.onclick = function() {
    s7WSSend({ type: "startBattle" });
  };
}

function _abortBattle() {
  _battleAborted = true;
  _cleanupBattle();

  var rankings = _buildRankings();

  // 显示结算积分界面
  if (rankings.length > 0) {
    _showResult(rankings);
  } else {
    // 无排名数据则回到房间
    _bpPhase = "idle";
    _bpAllPicks = [];
    _formationOrder = [];
    _$.laneSelectScreen.classList.add("hidden");
    _$.roomScreen.classList.remove("hidden");
  }
}

// ============================================================
// 12. 结算
// ============================================================

function _showResult(rankings) {
  _stopBattleMonitor();
  _stopBgLoop();
  document.body.classList.remove("mp-locked");
  _$.battleScreen.classList.add("hidden");
  _$.battleScreen.classList.remove("mp-battle-overlay");
  if (_$.game) _$.game.style.display = "none";

  // 清除本局 Battle RNG
  s7SetBattleSeed(null);

  // 用我的路线匹配排名（比昵称更可靠）
  var myLane = -1;
  if (_roomState) {
    var myP = _roomState.players.find(function(p) { return p.id === _roomPlayerId; });
    if (myP) myLane = myP.lane;
  }
  var myRank = -1;
  var totalPlayers = rankings ? rankings.length : 0;
  if (rankings) {
    for (var ri = 0; ri < rankings.length; ri++) {
      if (rankings[ri].lane === myLane) { myRank = ri; break; }
    }
  }

  var el = _$.resultRanking;
  el.innerHTML = "";
  if (!rankings || rankings.length === 0) {
    el.innerHTML = '<p style="color:#9fb7c6">暂无结果数据</p>';
  } else {
    for (var i = 0; i < rankings.length; i++) {
      var r = rankings[i];
      var div = document.createElement("div");
      div.className = "resultEntry";
      if (r.lane === myLane) div.classList.add("isSelf");
      var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
      var score = _calcScore(i, totalPlayers);
      div.innerHTML =
        '<span class="rankNum">' + medal + '</span>' +
        '<span class="rankNick">路线' + (r.lane + 1) + " " + _escapeHtml(r.nick || "?") + '</span>' +
        '<span class="rankTime">' + _formatTime(r.time || 0) + '</span>' +
        '<span class="rankScore" style="color:#38bdf8;font-size:13px;margin-left:8px">+' + score + '</span>';
      el.appendChild(div);
    }
  }

  // 显示积分统计与上传按钮（始终显示）
  if (myRank >= 0) {
    var earned = _calcScore(myRank, totalPlayers);
    var stats = _updateLocalStats(earned);
    _$.resultScoreDisplay.textContent = "本场 +" + earned + " 分（第 " + (myRank + 1) + " 名 / " + totalPlayers + " 人）";
    _$.resultCareerStats.textContent = "生涯: " + stats.games + " 场 | 总分 " + stats.totalScore + " | 平均 " + (stats.games > 0 ? (stats.totalScore / stats.games).toFixed(2) : "0");
  } else {
    var stats2 = _loadStats();
    _$.resultScoreDisplay.textContent = "本场未计分";
    _$.resultCareerStats.textContent = "生涯: " + stats2.games + " 场 | 总分 " + stats2.totalScore + " | 平均 " + (stats2.games > 0 ? (stats2.totalScore / stats2.games).toFixed(2) : "0");
  }
  _$.resultUploadStatus.textContent = "";
  _$.resultStats.style.display = "";

  _$.resultScreen.classList.remove("hidden");
}

// ============================================================
// 12a. 新BP模式（双人BP/无先手/多人/带指定）
// ============================================================

var _bpModeSelected = []; // 当前阶段我选的植物
var _bpModeAssignTarget = null; // assign阶段选中的目标玩家
var _bpModeState = null; // 最新的bpState（从bpStateUpdate消息保存）

function _renderBpMode(bp, revealed) {
  if (!bp || !bp.phases) return;
  // 阶段推进时清空本地选中状态
  if (_bpModeState && _bpModeState.phaseIndex !== bp.phaseIndex) {
    _bpModeSelected = [];
  }
  _bpModeState = bp; // 保存最新bpState
  _$.bpModeOverlay.classList.remove("hidden");
  var phase = bp.phases[bp.phaseIndex];
  if (!phase) return;

  var isTurnBased = bp.bpMode === "2p-turn";
  var isMyTurn = isTurnBased ? (bp.currentPlayerId === _roomPlayerId) : !bp.submitted[_roomPlayerId];
  var myActions = bp.actions[_roomPlayerId] || { bans: [], picks: [], assigns: [] };

  // 标题
  var modeNames = { "2p-turn": "双人BP(轮流)", "2p-blind": "无先手双人BP", "multi": "多人BP", "2p-assign": "带指定双人BP" };
  _$.bpModeTitle.textContent = modeNames[bp.bpMode] || "BP 选将";

  // 阶段信息 - 醒目显示当前操作类型
  var actionEmoji = phase.type === "ban" ? "🚫" : phase.type === "pick" ? "✅" : "👉";
  var actionName = phase.type === "ban" ? "Ban" : phase.type === "pick" ? "Pick" : "指定";
  var phaseText = "";
  if (isTurnBased) {
    var actorName = phase.actor === "first" ? "先手" : "后手";
    var actorId = phase.actor === "first" ? bp.firstPlayerId : bp.secondPlayerId;
    var actorNick = _getPlayerNick(bp, actorId);
    phaseText = actorName + "（" + actorNick + "）";
  }
  if (phase.simultaneous) {
    if (phase.type === "assign") {
      // 指定阶段：显示为谁指定
      if (bp.bpMode === "multi") {
        var myIdx = bp.playerIds.indexOf(_roomPlayerId);
        var targetIdx = (myIdx + 1) % bp.playerIds.length;
        var targetId = bp.playerIds[targetIdx];
        var targetNick = _getPlayerNick(bp, targetId);
        phaseText = "请为 " + (targetIdx + 1) + " 号（" + targetNick + "）指定 " + (phase.count || 2) + " 个植物";
      } else {
        phaseText = "请为对方指定 " + (phase.count || 2) + " 个植物";
      }
    } else {
      phaseText = "需选 " + (phase.count || 1) + " 个";
    }
  }
  _$.bpModeInfo.innerHTML = '<span style="font-size:18px;font-weight:bold;color:' + (phase.type === "ban" ? "#ef4444" : phase.type === "pick" ? "#22c55e" : "#f59e0b") + '">' + actionEmoji + " " + actionName + '</span>' + (phaseText ? ' <span style="color:#9fb7c6;font-size:13px">' + phaseText + '</span>' : '');

  // 状态文字
  if (isTurnBased) {
    _$.bpModeStatus.textContent = isMyTurn ? "👉 轮到你 " + actionName : "⏳ 等待对方" + actionName + "...";
  } else {
    var done = bp.submitted[_roomPlayerId];
    var totalSubmitted = Object.keys(bp.submitted).length;
    var totalPlayers = bp.playerIds.length;
    if (revealed) {
      _$.bpModeStatus.textContent = "📋 本轮结果已揭示，即将进入下一阶段...";
    } else if (done) {
      _$.bpModeStatus.textContent = "✅ 已提交，等待其他玩家 (" + totalSubmitted + "/" + totalPlayers + ")";
    } else {
      _$.bpModeStatus.textContent = "👉 请" + actionName + " " + (phase.count || 1) + " 个植物";
    }
  }

  // 槽位显示
  if (isTurnBased) {
    _renderBpSlots(bp, _$.bpModeTopSlots, bp.firstPlayerId, "先手");
    _renderBpSlots(bp, _$.bpModeBottomSlots, bp.secondPlayerId, "后手");
  } else if (bp.bpMode === "multi" || bp.bpMode === "2p-blind" || bp.bpMode === "2p-assign") {
    // 顶部始终显示所有玩家的已完成操作（已完成阶段的内容不受揭示状态影响）
    var allSlotsHtml = "";
    for (var si = 0; si < bp.playerIds.length; si++) {
      var spid = bp.playerIds[si];
      var snick = _getPlayerNick(bp, spid);
      var sActions = bp.actions[spid] || { bans: [], picks: [], assigns: [] };
      var isSelf = spid === _roomPlayerId;
      // 计算已完成的操作数量（已完成阶段的操作始终显示）
      var cb = 0, cp = 0, ca = 0;
      for (var pi = 0; pi < bp.phaseIndex; pi++) {
        var pp = bp.phases[pi];
        if (pp.type === "assign") ca += pp.count || 1;
        if (pp.type === "ban") cb += pp.count || 1;
        if (pp.type === "pick") cp += pp.count || 1;
      }
      allSlotsHtml += '<div style="padding:3px 8px;background:#0a1c2a;border-radius:6px;border:1px solid #334;margin-bottom:4px">';
      allSlotsHtml += '<span style="color:#38bdf8;font-size:12px;font-weight:bold">' + (si + 1) + '号 ' + _escapeHtml(snick) + (isSelf ? " (你)" : "") + '</span>';
      // 指定（始终显示已完成阶段的指定，当前阶段只显示自己的指定）
      if (sActions.assigns.length > 0) {
        var visibleAssigns = sActions.assigns.filter(function(a, idx) { return idx < ca || isSelf || revealed; });
        if (visibleAssigns.length > 0) {
          allSlotsHtml += ' <span style="color:#f59e0b;font-size:11px">指定:</span>';
          for (var ai = 0; ai < visibleAssigns.length; ai++) {
            var ad = PLANTS[visibleAssigns[ai].plantKey];
            var aTarget = _getPlayerNick(bp, visibleAssigns[ai].targetId);
            allSlotsHtml += '<span style="padding:1px 4px;background:#1a1a0a;border:1px solid #f59e0b;border-radius:3px;font-size:10px;color:#f59e0b">' + (ad ? ad.emoji : "") + '→' + _escapeHtml(aTarget) + '</span>';
          }
        }
      }
      // Ban（已完成阶段的始终显示，当前阶段只显示自己的）
      if (sActions.bans.length > 0) {
        var visibleBans = sActions.bans.filter(function(b, idx) { return idx < cb || isSelf || revealed; });
        if (visibleBans.length > 0) {
          allSlotsHtml += ' <span style="color:#ef4444;font-size:11px">Ban:</span>';
          for (var bi = 0; bi < visibleBans.length; bi++) {
            var bd = PLANTS[visibleBans[bi]];
            allSlotsHtml += '<span style="padding:1px 4px;background:#1a0a0a;border:1px solid #ef4444;border-radius:3px;font-size:10px;color:#ef4444">' + (bd ? bd.emoji : "") + '</span>';
          }
        }
      }
      // Pick（同上）
      if (sActions.picks.length > 0) {
        var visiblePicks = sActions.picks.filter(function(p, idx) { return idx < cp || isSelf || revealed; });
        if (visiblePicks.length > 0) {
          allSlotsHtml += ' <span style="color:#22c55e;font-size:11px">Pick:</span>';
          for (var pi = 0; pi < visiblePicks.length; pi++) {
            var pd2 = PLANTS[visiblePicks[pi]];
            allSlotsHtml += '<span style="padding:1px 4px;background:#0a241a;border:1px solid #22c55e;border-radius:3px;font-size:10px;color:#22c55e">' + (pd2 ? pd2.emoji : "") + '</span>';
          }
        }
      }
      if (sActions.assigns.length === 0 && sActions.bans.length === 0 && sActions.picks.length === 0) {
        allSlotsHtml += '<span style="color:#6b8b9c;font-size:11px">暂无操作</span>';
      }
      allSlotsHtml += '</div>';
    }
    _$.bpModeTopSlots.innerHTML = allSlotsHtml;
    // 底部显示自己的植物（我指定的 + 被指定的 + 自己pick的）
    var myBottomHtml = '<div style="padding:4px 10px;background:#0a1c2a;border-radius:6px;border:1px solid #38bdf8">';
    myBottomHtml += '<span style="color:#38bdf8;font-size:12px;font-weight:bold">我的植物</span>';
    // 我指定给对方的
    var myAssigns = (myActions.assigns || []).map(function(a) { return a.plantKey; });
    if (myAssigns.length > 0) {
      myBottomHtml += '<br><span style="color:#f59e0b;font-size:11px">我指定的: </span>';
      for (var mai = 0; mai < myAssigns.length; mai++) {
        var mad = PLANTS[myAssigns[mai]];
        myBottomHtml += '<span style="padding:1px 4px;background:#1a1a0a;border:1px solid #f59e0b;border-radius:3px;font-size:10px;color:#f59e0b">' + (mad ? mad.emoji : "") + (mad ? mad.name : myAssigns[mai]) + '</span> ';
      }
    }
    // 被指定的植物
    var myAssigned = [];
    for (var opid2 in bp.actions) {
      var oa = bp.actions[opid2];
      for (var oai = 0; oai < oa.assigns.length; oai++) {
        if (oa.assigns[oai].targetId === _roomPlayerId) {
          myAssigned.push(oa.assigns[oai].plantKey);
        }
      }
    }
    if (myAssigned.length > 0) {
      myBottomHtml += '<br><span style="color:#f59e0b;font-size:11px">被指定: </span>';
      for (var mai = 0; mai < myAssigned.length; mai++) {
        var mad = PLANTS[myAssigned[mai]];
        myBottomHtml += '<span style="padding:1px 4px;background:#1a1a0a;border:1px solid #f59e0b;border-radius:3px;font-size:10px;color:#f59e0b">' + (mad ? mad.emoji : "") + (mad ? mad.name : myAssigned[mai]) + '</span> ';
      }
    }
    // 自己pick的
    var myPicks = myActions.picks || [];
    if (myPicks.length > 0) {
      myBottomHtml += '<br><span style="color:#22c55e;font-size:11px">我选的: </span>';
      for (var mpi = 0; mpi < myPicks.length; mpi++) {
        var mpd = PLANTS[myPicks[mpi]];
        myBottomHtml += '<span style="padding:1px 4px;background:#0a241a;border:1px solid #22c55e;border-radius:3px;font-size:10px;color:#22c55e">' + (mpd ? mpd.emoji : "") + (mpd ? mpd.name : myPicks[mpi]) + '</span> ';
      }
    }
    if (myAssigned.length === 0 && myPicks.length === 0) {
      myBottomHtml += '<br><span style="color:#6b8b9c;font-size:11px">暂无</span>';
    }
    myBottomHtml += '</div>';
    _$.bpModeBottomSlots.innerHTML = myBottomHtml;
  } else {
    _$.bpModeTopSlots.innerHTML = "";
    _$.bpModeBottomSlots.innerHTML = "";
  }

  // 植物网格
  _renderBpModeGrid(bp, phase, isMyTurn, myActions, revealed);

  // 确认按钮
  if (isTurnBased) {
    _$.bpModeConfirmBtn.style.display = "none"; // 轮流制不用确认按钮
  } else {
    _$.bpModeConfirmBtn.style.display = "";
    var needed = phase.count || 1;
    _$.bpModeConfirmBtn.textContent = "确认选择（" + _bpModeSelected.length + "/" + needed + "）";
    _$.bpModeConfirmBtn.disabled = _bpModeSelected.length !== needed;
  }

  _renderPlayerList(_$.bpModePlayerList);
}

function _getPlayerNick(bp, playerId) {
  if (!_roomState) return playerId;
  var p = _roomState.players.find(function(p) { return p.id === playerId; });
  return p ? p.nick : playerId;
}

function _renderBpSlots(bp, container, playerId, label) {
  var actions = bp.actions[playerId] || { bans: [], picks: [] };
  var nick = _getPlayerNick(bp, playerId);
  var html = '<div style="padding:4px 8px;background:#0a1c2a;border-radius:6px;border:1px solid #334">';
  html += '<div style="color:#38bdf8;font-size:12px;font-weight:bold;margin-bottom:4px">' + label + ' ' + _escapeHtml(nick) + '</div>';
  // Ban行
  html += '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">';
  html += '<span style="color:#ef4444;font-size:11px">Ban:</span>';
  for (var i = 0; i < actions.bans.length; i++) {
    var bd = PLANTS[actions.bans[i]];
    html += '<span style="padding:2px 6px;background:#1a0a0a;border:1px solid #ef4444;border-radius:4px;font-size:11px;color:#ef4444">' + (bd ? bd.emoji : "") + '</span>';
  }
  if (actions.bans.length === 0) html += '<span style="color:#6b8b9c;font-size:11px">-</span>';
  html += '</div>';
  // Pick行
  html += '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">';
  html += '<span style="color:#22c55e;font-size:11px">Pick:</span>';
  for (var j = 0; j < actions.picks.length; j++) {
    var pd = PLANTS[actions.picks[j]];
    html += '<span style="padding:2px 6px;background:#0a241a;border:1px solid #22c55e;border-radius:4px;font-size:11px;color:#22c55e">' + (pd ? pd.emoji : "") + (pd ? pd.name : actions.picks[j]) + '</span>';
  }
  if (actions.picks.length === 0) html += '<span style="color:#6b8b9c;font-size:11px">-</span>';
  html += '</div>';
  html += '</div>';
  container.innerHTML = html;
}

function _renderBpModeGrid(bp, phase, isMyTurn, myActions, revealed) {
  var grid = _$.bpModePlantGrid;
  grid.innerHTML = "";

  var isTurnBased = bp.bpMode === "2p-turn";
  // 无先手模式：未揭示时只看到自己的操作，对方的隐藏
  var showAll = isTurnBased || revealed;

  // 计算已完成阶段的操作数量（这些始终可见）
  var completedBans = 0, completedPicks = 0;
  for (var pi = 0; pi < bp.phaseIndex; pi++) {
    var pp = bp.phases[pi];
    if (pp.type === "ban") completedBans += pp.count || 1;
    if (pp.type === "pick") completedPicks += pp.count || 1;
  }

  // 阻挡逻辑：始终取所有玩家的 ban（并集），不受揭示影响
  var allBans = [];
  var allPicks = [];
  for (var pid in bp.actions) {
    allBans = allBans.concat(bp.actions[pid].bans);
    allPicks = allPicks.concat(bp.actions[pid].picks);
  }

  // 显示逻辑：已完成阶段的操作始终可见，当前阶段按揭示状态
  var displayBans = [];
  var displayPicks = [];
  for (var pid2 in bp.actions) {
    var a = bp.actions[pid2];
    var isSelf = pid2 === _roomPlayerId;
    // 已完成阶段的 ban（前 completedBans 个）全部显示
    for (var bi = 0; bi < a.bans.length; bi++) {
      if (bi < completedBans || isSelf || showAll) displayBans.push(a.bans[bi]);
    }
    // 已完成阶段的 pick（前 completedPicks 个）全部显示
    for (var pj = 0; pj < a.picks.length; pj++) {
      if (pj < completedPicks || isSelf || showAll) displayPicks.push(a.picks[pj]);
    }
  }

  // 以pick代ban：已pick的也不能再选
  var pickAsBan = _roomState && _roomState.bpPickAsBan;
  var blockedKeys = allBans.slice();
  if (pickAsBan) blockedKeys = blockedKeys.concat(allPicks);

  for (var i = 0; i < PLANT_KEYS.length; i++) {
    var key = PLANT_KEYS[i];
    var def = PLANTS[key];
    if (!def) continue;
    var card = document.createElement("div");
    card.className = "bpCard";

    var isBlocked = blockedKeys.indexOf(key) >= 0;
    var isSel = _bpModeSelected.indexOf(key) >= 0;

    // 分别检查自己和对方的ban/pick
    var myBan = myActions.bans.indexOf(key) >= 0;
    var myPick = myActions.picks.indexOf(key) >= 0;
    var otherBan = false;
    var otherPick = false;
    for (var opid in bp.actions) {
      if (opid === _roomPlayerId) continue;
      if (bp.actions[opid].bans.indexOf(key) >= 0) otherBan = true;
      if (bp.actions[opid].picks.indexOf(key) >= 0) otherPick = true;
    }
    // 未揭示时对方操作不可见
    if (!showAll) { otherBan = false; otherPick = false; }

    var label = "";
    var labelColor = "";
    if (myBan && otherBan) { label = "🚫双方禁"; labelColor = "#ef4444"; card.classList.add("bpBanned"); }
    else if (myBan) { label = "🚫我禁的"; labelColor = "#ef4444"; card.classList.add("bpBanned"); }
    else if (otherBan) { label = "🚫对方禁"; labelColor = "#f97316"; card.classList.add("bpBanned"); }
    else if (myPick && otherPick) { label = "✓双方都选"; labelColor = "#22c55e"; card.classList.add("bpSelected"); }
    else if (myPick) { label = "✓我选的"; labelColor = "#22c55e"; card.classList.add("bpSelected"); }
    else if (otherPick) { label = "对方已选"; labelColor = "#f59e0b"; card.classList.add("bpDisabled"); }
    else if (isSel) { label = ""; card.classList.add("bpSelected"); }

    card.innerHTML = '<div class="bpEmoji">' + (def.emoji || "🌿") + '</div><div class="bpName">' + _escapeHtml(def.name || key) + '</div>' +
      (label ? '<div style="font-size:10px;color:' + labelColor + '">' + label + '</div>' : '');

    (function(k, c, blocked, sel) {
      c.addEventListener("click", function() {
        if (blocked) return;
        var turnBased = bp.bpMode === "2p-turn";
        if (turnBased && !isMyTurn) return;
        if (!turnBased && bp.submitted[_roomPlayerId]) return;

        if (phase.simultaneous) {
          // 同时制：本地选中，确认后提交
          var idx = _bpModeSelected.indexOf(k);
          if (idx >= 0) { _bpModeSelected.splice(idx, 1); c.classList.remove("bpSelected"); }
          else {
            var needed = phase.count || 1;
            if (_bpModeSelected.length >= needed) return;
            _bpModeSelected.push(k);
            c.classList.add("bpSelected");
          }
          _$.bpModeConfirmBtn.textContent = "确认选择（" + _bpModeSelected.length + "/" + (phase.count || 1) + "）";
          _$.bpModeConfirmBtn.disabled = _bpModeSelected.length !== (phase.count || 1);
        } else {
          // 轮流制：直接发送操作
          s7WSSend({ type: "bpAction", action: phase.type, plantKey: k, targetPlayerId: _bpModeAssignTarget });
        }
      });
    })(key, card, isBlocked, isSel);

    grid.appendChild(card);
  }
}

function _bpModeConfirm() {
  var bp = _bpModeState;
  if (!bp) return;
  var phase = bp.phases[bp.phaseIndex];
  if (!phase || !phase.simultaneous) return;

  // 同时制：提交所有选中的植物
  for (var i = 0; i < _bpModeSelected.length; i++) {
    s7WSSend({ type: "bpAction", action: phase.type, plantKey: _bpModeSelected[i], targetPlayerId: _bpModeAssignTarget });
  }
  // 不立即清空，等阶段推进后再清（防止bpStateUpdate重渲染时丢失显示）
}

// ============================================================
// 12c. 观战选择 + 上帝视角BP
// ============================================================

function _showSpectatorChoice(roomId, roomInfo) {
  var existing = document.getElementById("specChoiceDialog");
  if (existing) existing.remove();
  var dlg = document.createElement("div");
  dlg.id = "specChoiceDialog";
  dlg.style.cssText = "position:fixed;inset:0;z-index:200;background:rgba(1,5,8,.88);display:flex;align-items:center;justify-content:center";
  var canJoin = roomInfo && roomInfo.playerCount < roomInfo.maxPlayers;
  var html = '<div style="background:#0a1c2a;border:1px solid #335267;border-radius:14px;padding:24px;max-width:360px;text-align:center">';
  html += '<h2 style="color:#38bdf8;margin:0 0 12px">加入房间 ' + _escapeHtml(roomId) + '</h2>';
  html += '<p style="color:#9fb7c6;font-size:13px;margin:8px 0">房主: ' + _escapeHtml(roomInfo.hostName || "?") + ' · ' + roomInfo.playerCount + '/' + roomInfo.maxPlayers + '人</p>';
  html += '<p style="color:#a78bfa;font-size:14px;margin:12px 0">请选择加入方式：</p>';
  if (canJoin) {
    html += '<button class="primary" style="width:100%;margin:4px 0;padding:10px" id="specChoiceJoin">🎮 以玩家身份加入</button>';
  }
  html += '<button class="primary" style="width:100%;margin:4px 0;padding:10px;border-color:#a78bfa;color:#a78bfa" id="specChoiceSpec">👁️ 观战</button>';
  html += '<button style="width:100%;margin:4px 0;padding:8px" id="specChoiceCancel">取消</button>';
  html += '</div>';
  dlg.innerHTML = html;
  document.body.appendChild(dlg);

  if (canJoin) {
    document.getElementById("specChoiceJoin").onclick = function() {
      dlg.remove();
      s7WSSend({ type: "joinRoom", roomId: roomId, nick: _nick, ver: GAME_VERSION, acceptSpectator: false });
    };
  }
  document.getElementById("specChoiceSpec").onclick = function() {
    dlg.remove();
    s7WSSend({ type: "joinRoom", roomId: roomId, nick: _nick, ver: GAME_VERSION, acceptSpectator: true });
  };
  document.getElementById("specChoiceCancel").onclick = function() { dlg.remove(); };
}

// 观战者上帝视角BP
function _renderBpModeSpectator(bp) {
  if (!bp || !bp.phases) return;
  _$.bpModeOverlay.classList.remove("hidden");
  var phase = bp.phases[bp.phaseIndex];
  if (!phase) return;

  var modeNames = { "2p-turn": "双人BP(轮流)", "2p-blind": "无先手双人BP", "multi": "多人BP", "2p-assign": "带指定双人BP" };
  _$.bpModeTitle.textContent = "👁️ " + (modeNames[bp.bpMode] || "BP") + " - 观战中";

  // 当前阶段
  var actionEmoji = phase.type === "ban" ? "🚫" : phase.type === "pick" ? "✅" : "👉";
  var actionName = phase.type === "ban" ? "Ban" : phase.type === "pick" ? "Pick" : "指定";
  var infoText = actionEmoji + " " + actionName;
  if (bp.bpMode === "2p-turn") {
    var actorName = phase.actor === "first" ? "先手" : "后手";
    var actorId = phase.actor === "first" ? bp.firstPlayerId : bp.secondPlayerId;
    infoText += " - " + actorName + "（" + _getPlayerNick(bp, actorId) + "）";
  }
  if (phase.simultaneous) infoText += " - 需选 " + (phase.count || 1) + " 个";
  _$.bpModeInfo.textContent = infoText;

  // 提交状态
  var submitted = Object.keys(bp.submitted).length;
  var total = bp.playerIds.length;
  _$.bpModeStatus.textContent = bp.bpMode === "2p-turn"
    ? "⏳ 等待 " + _getPlayerNick(bp, bp.currentPlayerId) + " 操作..."
    : "📊 已提交 " + submitted + "/" + total;

  // 显示所有玩家的操作（上帝视角始终可见）
  var allSlotsHtml = "";
  for (var si = 0; si < bp.playerIds.length; si++) {
    var spid = bp.playerIds[si];
    var snick = _getPlayerNick(bp, spid);
    var sA = bp.actions[spid] || { bans: [], picks: [], assigns: [] };
    var isCurrent = bp.bpMode === "2p-turn" && bp.currentPlayerId === spid;
    var hasSubmitted = !!bp.submitted[spid];
    allSlotsHtml += '<div style="padding:4px 10px;background:' + (isCurrent ? "#0a2a1a" : "#0a1c2a") + ';border-radius:6px;border:1px solid ' + (isCurrent ? "#22c55e" : "#334") + ';margin-bottom:4px">';
    allSlotsHtml += '<span style="color:#38bdf8;font-size:13px;font-weight:bold">' + (si + 1) + '号 ' + _escapeHtml(snick) + '</span>';
    if (isCurrent) allSlotsHtml += ' <span style="color:#22c55e;font-size:11px">👈当前</span>';
    if (bp.bpMode !== "2p-turn" && hasSubmitted) allSlotsHtml += ' <span style="color:#22c55e;font-size:11px">✅已提交</span>';
    if (bp.bpMode !== "2p-turn" && !hasSubmitted) allSlotsHtml += ' <span style="color:#f59e0b;font-size:11px">⏳未提交</span>';
    // 指定
    if (sA.assigns.length > 0) {
      allSlotsHtml += '<br><span style="color:#f59e0b;font-size:11px">指定: </span>';
      for (var ai = 0; ai < sA.assigns.length; ai++) {
        var ad = PLANTS[sA.assigns[ai].plantKey];
        allSlotsHtml += '<span style="padding:1px 4px;background:#1a1a0a;border:1px solid #f59e0b;border-radius:3px;font-size:10px;color:#f59e0b">' + (ad ? ad.emoji : "") + '→' + _escapeHtml(_getPlayerNick(bp, sA.assigns[ai].targetId)) + '</span> ';
      }
    }
    // Ban
    if (sA.bans.length > 0) {
      allSlotsHtml += '<br><span style="color:#ef4444;font-size:11px">Ban: </span>';
      for (var bi = 0; bi < sA.bans.length; bi++) {
        var bd = PLANTS[sA.bans[bi]];
        allSlotsHtml += '<span style="padding:1px 4px;background:#1a0a0a;border:1px solid #ef4444;border-radius:3px;font-size:10px;color:#ef4444">' + (bd ? bd.emoji : "") + '</span> ';
      }
    }
    // Pick
    if (sA.picks.length > 0) {
      allSlotsHtml += '<br><span style="color:#22c55e;font-size:11px">Pick: </span>';
      for (var pi = 0; pi < sA.picks.length; pi++) {
        var pd2 = PLANTS[sA.picks[pi]];
        allSlotsHtml += '<span style="padding:1px 4px;background:#0a241a;border:1px solid #22c55e;border-radius:3px;font-size:10px;color:#22c55e">' + (pd2 ? pd2.emoji : "") + '</span> ';
      }
    }
    if (sA.assigns.length === 0 && sA.bans.length === 0 && sA.picks.length === 0) {
      allSlotsHtml += '<br><span style="color:#6b8b9c;font-size:11px">暂无操作</span>';
    }
    allSlotsHtml += '</div>';
  }
  _$.bpModeTopSlots.innerHTML = allSlotsHtml;
  _$.bpModeBottomSlots.innerHTML = "";
  _$.bpModePlantGrid.innerHTML = "";
  _$.bpModeConfirmBtn.style.display = "none";
  _renderPlayerList(_$.bpModePlayerList);
}

// ============================================================
// 12b. 积分系统
// ============================================================

// 积分表：按人数查名次积分
// 2人: [12, 0]  3人: [12, 6, 0]  4人: [12, 8, 4, 0]  5人: [12, 9, 6, 3, 0]
var _SCORE_TABLE = {
  2: [12, 0],
  3: [12, 6, 0],
  4: [12, 8, 4, 0],
  5: [12, 9, 6, 3, 0]
};

function _calcScore(rank, totalPlayers) {
  var table = _SCORE_TABLE[totalPlayers];
  if (!table) return 0;
  var idx = Math.min(rank, table.length - 1);
  return table[idx];
}

function _updateLobbyStats() {
  var stats = _loadStats();
  if (_$.lobbyStatGames) _$.lobbyStatGames.textContent = String(stats.games);
  if (_$.lobbyStatScore) _$.lobbyStatScore.textContent = String(stats.totalScore);
  if (_$.lobbyStatAvg) _$.lobbyStatAvg.textContent = stats.games > 0 ? (stats.totalScore / stats.games).toFixed(2) : "0";
}

// 浏览器唯一ID（防止冒名上传他人战绩）
function _getBrowserId() {
  var bid = localStorage.getItem("pvz_browser_id");
  if (!bid) {
    bid = "b_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("pvz_browser_id", bid);
  }
  return bid;
}

function _loadStats() {
  try {
    var raw = localStorage.getItem("pvz_game_stats");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { games: 0, totalScore: 0 };
}

function _saveStats(stats) {
  try { localStorage.setItem("pvz_game_stats", JSON.stringify(stats)); } catch (e) {}
}

function _updateLocalStats(score) {
  var stats = _loadStats();
  stats.games++;
  stats.totalScore += score;
  _saveStats(stats);
  return stats;
}

// 当前排行榜数据和排序方式
var _lbData = [];
var _lbSort = "totalScore";

function _renderLeaderboard() {
  var body = _$.leaderboardBody;
  if (!body) return;
  // 排序
  var sorted = _lbData.slice().sort(function(a, b) {
    return (b[_lbSort] || 0) - (a[_lbSort] || 0);
  });
  // 更新按钮高亮
  var btns = _$.leaderboardDialog.querySelectorAll(".lbSortBtn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("primary", btns[i].getAttribute("data-sort") === _lbSort);
  }
  if (sorted.length === 0) {
    body.innerHTML = '<p style="color:#9fb7c6;text-align:center;padding:20px">暂无数据</p>';
    return;
  }
  var html = '<table style="width:100%;font-size:13px;border-collapse:collapse">';
  html += '<tr style="color:#9fb7c6;border-bottom:1px solid #334">';
  html += '<th style="padding:6px 4px;text-align:left">#</th>';
  html += '<th style="padding:6px 4px;text-align:left">玩家</th>';
  html += '<th style="padding:6px 4px;text-align:center">场次</th>';
  html += '<th style="padding:6px 4px;text-align:center">总积分</th>';
  html += '<th style="padding:6px 4px;text-align:center">平均分</th>';
  html += '</tr>';
  for (var j = 0; j < sorted.length; j++) {
    var e = sorted[j];
    var avg = e.games > 0 ? (e.totalScore / e.games).toFixed(2) : "0";
    var hl = (_lbSort === "totalScore" ? 'color:#38bdf8;font-weight:bold' : _lbSort === "games" ? 'color:#f59e0b;font-weight:bold' : 'color:#a78bfa;font-weight:bold');
    html += '<tr style="border-bottom:1px solid #222">';
    html += '<td style="padding:6px 4px;color:#9fb7c6">' + (j + 1) + '</td>';
    html += '<td style="padding:6px 4px">' + _escapeHtml(e.nick) + '</td>';
    html += '<td style="padding:6px 4px;text-align:center;' + (_lbSort === "games" ? hl : '') + '">' + (e.games || 0) + '</td>';
    html += '<td style="padding:6px 4px;text-align:center;' + (_lbSort === "totalScore" ? hl : '') + '">' + (e.totalScore || 0) + '</td>';
    html += '<td style="padding:6px 4px;text-align:center;' + (_lbSort === "avgScore" ? hl : '') + '">' + avg + '</td>';
    html += '</tr>';
  }
  html += '</table>';
  body.innerHTML = html;
}

function _showLeaderboard() {
  _$.leaderboardDialog.classList.remove("hidden");
  if (_wsConnected) {
    s7WSSend({ type: "getLeaderboard" });
  } else {
    _lbData = [];
    _renderLeaderboard();
  }
}

function _hideLeaderboard() {
  _$.leaderboardDialog.classList.add("hidden");
}

function _uploadStats() {
  var stats = _loadStats();
  if (stats.games === 0) {
    var msg = "还没有战绩可上传";
    _$.resultUploadStatus.textContent = msg;
    if (_$.lobbyUploadStatus) _$.lobbyUploadStatus.textContent = msg;
    return;
  }
  _$.resultUploadStatus.textContent = "上传中...";
  if (_$.lobbyUploadStatus) _$.lobbyUploadStatus.textContent = "上传中...";
  s7WSSend({ type: "uploadStats", nick: _nick, games: stats.games, totalScore: stats.totalScore, browserId: _getBrowserId() });
}

// ============================================================
// 13. 工具函数
// ============================================================

function _formatTime(sec) {
  if (!sec && sec !== 0) return "--:--";
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

function _escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var _toastTimer = null;
function _showToast(msg) {
  var el = document.getElementById("lobbyToast") || (function() {
    var d = document.createElement("div");
    d.id = "lobbyToast";
    d.style.cssText = "position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:999;background:#1c3344;border:1px solid #38bdf8;color:#ecfeff;padding:8px 20px;border-radius:10px;font-size:14px;max-width:80vw;text-align:center;transition:opacity .3s";
    document.body.appendChild(d);
    return d;
  })();
  el.textContent = msg;
  el.style.opacity = "1";
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.style.opacity = "0"; }, 3000);
}

function _leaveRoom() {
  _stopRoomMonitor();
  _stopBattleMonitor();
  _stopBgLoop();
  s7SetBattleSeed(null);
  if (typeof state !== "undefined" && state) { state.battle = false; state.running = false; }
  _roomState = null;
  _roomPlayerId = null;
  _wsPlayerId = null;
  _wsRoomId = null;
  _wsSessionToken = null;
  _isSpectator = false;
  _bpPhase = "idle";
  _bpAllPicks = [];
  _formationOrder = [];
  _$.roomScreen.classList.add("hidden");
  _$.laneSelectScreen.classList.add("hidden");
  _$.bpOverlay.classList.add("hidden");
  if (_$.bpModeOverlay) _$.bpModeOverlay.classList.add("hidden");
  _$.formationOverlay.classList.add("hidden");
  _closeDialog();
  _$.battleScreen.classList.add("hidden");
  _$.battleScreen.classList.remove("mp-battle-overlay");
  _$.resultScreen.classList.add("hidden");
  document.body.classList.remove("mp-locked");
  window._mpBattleActive = false;
  if (_$.game) _$.game.style.display = "none";
  _$.lobbyScreen.classList.remove("hidden");
  _lobbyVisible = true;
  s7WSConnect();
  setTimeout(function() { _fetchRoomList(); }, 300);
}

// ============================================================
// 浏览器刷新/关闭：视为主动退出当前房间与当前服务器
// ============================================================
var _pageExitHandled = false;
function _exitMultiplayerForPageUnload() {
  if (_pageExitHandled) return;
  _pageExitHandled = true;
  try {
    var cfg = _activeServer();
    var custom = cfg ? _customTransportFor(cfg) : null;
    if (custom && typeof custom.pageExit === "function") {
      custom.pageExit();
    } else if (_ws && _ws.readyState === 1 && (_wsRoomId || _roomPlayerId)) {
      // WebSocket.send 本身是同步入发送缓冲区；随后页面销毁即不再尝试 resume。
      try { _ws.send(JSON.stringify({ type: "leaveRoom" })); } catch (_) {}
    }
  } catch (_) {}
  _wsPlayerId = null;
  _wsRoomId = null;
  _wsSessionToken = null;
  _roomPlayerId = null;
  _roomState = null;
}
try {
  window.addEventListener("pagehide", _exitMultiplayerForPageUnload);
  window.addEventListener("beforeunload", _exitMultiplayerForPageUnload);
} catch (_) {}

// ============================================================
// 14. 启动
// ============================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _initLobby);
} else {
  _initLobby();
}

})();
