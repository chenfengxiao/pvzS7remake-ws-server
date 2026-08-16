// ============================================================
// 95_s7_multiplayer_tab_guard.js
// 同一浏览器“同服单实例”联机锁。
//
// 设计原则：
// - 同一个 serverId 最多一个页面持有；不同 serverId 互不影响。
// - 首选 Web Locks；失败时退到 localStorage 租约；再失败时退到 BroadcastChannel。
// - “确实被其他页面占用”与“锁后端不可用”必须区分，绝不能把后端故障误报成“你已经进入X服”。
// - 页面正常退出/崩溃后不留下永久死锁。
// - v2 命名空间用于隔离 1.7.0 旧实现可能遗留的“未连上却持锁”状态。
// ============================================================
(function () {
  "use strict";

  var NS = "pvz_s7_multiplayer_tab_guard_v2";
  var LEASE_MS = 8000;
  var HEARTBEAT_MS = 2000;
  var CONFIRM_MIN_MS = 80;
  var CONFIRM_JITTER_MS = 70;
  var BC_PROBE_MS = 90;
  var BC_CLAIM_MS = 90;

  var fallbackTokenCounter = 0;
  function randomToken() {
    try {
      if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (v) { return v.toString(16).padStart(2, "0"); }).join("");
    } catch (_) {
      fallbackTokenCounter++;
      var perf = 0;
      try { perf = performance && typeof performance.now === "function" ? performance.now() : 0; } catch (_) {}
      return String(Date.now()) + "_" + String(perf) + "_" + String(fallbackTokenCounter);
    }
  }

  function randomJitter(maxExclusive) {
    if (!(maxExclusive > 0)) return 0;
    try {
      var a = new Uint8Array(1);
      crypto.getRandomValues(a);
      return a[0] % maxExclusive;
    } catch (_) {
      return Date.now() % maxExclusive;
    }
  }

  var pageId = randomToken();
  var held = Object.create(null);
  var pending = Object.create(null);
  var last = Object.create(null);

  function normalizeServerId(serverId) {
    var id = String(serverId == null ? "" : serverId).trim();
    if (!id) throw new Error("缺少联机服务器 ID");
    return id;
  }

  function result(ok, reason, method, degraded) {
    return { ok: !!ok, reason: String(reason || ""), method: String(method || ""), degraded: !!degraded };
  }
  function remember(id, r) { last[id] = r; return r; }

  function webLockName(id) { return NS + ":server:" + id; }
  function storageKey(id) { return NS + ":lease:" + id; }
  function broadcastName(id) { return NS + ":bc:" + id; }

  function canUseWebLocks() {
    try { return !!(navigator && navigator.locks && typeof navigator.locks.request === "function"); }
    catch (_) { return false; }
  }

  function canUseStorage() {
    var k = NS + ":probe:" + pageId;
    try {
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (_) { return false; }
  }

  function readLease(id) {
    try {
      var raw = localStorage.getItem(storageKey(id));
      if (!raw) return null;
      var x = JSON.parse(raw);
      if (!x || !x.owner || !x.token || !Number.isFinite(Number(x.expiresAt))) return null;
      return x;
    } catch (_) { return null; }
  }

  function writeLease(id, lease) {
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(lease));
      return true;
    } catch (_) { return false; }
  }

  function removeLeaseIfOwned(id, record) {
    try {
      var cur = readLease(id);
      if (cur && cur.owner === pageId && cur.token === record.token) localStorage.removeItem(storageKey(id));
    } catch (_) {}
  }

  function emitLost(id, reason) {
    try {
      window.dispatchEvent(new CustomEvent("s7multiplayerlocklost", {
        detail: { serverId: id, reason: reason || "lost" }
      }));
    } catch (_) {}
  }

  function markFallbackLost(id, record, reason) {
    if (held[id] !== record) return;
    if (record.timer) clearInterval(record.timer);
    delete held[id];
    emitLost(id, reason || "lease-lost");
  }

  function refreshLease(id, record) {
    if (held[id] !== record) return;
    var cur = readLease(id);
    if (!cur || cur.owner !== pageId || cur.token !== record.token) {
      markFallbackLost(id, record, "lease-replaced");
      return;
    }
    cur.expiresAt = Date.now() + LEASE_MS;
    cur.updatedAt = Date.now();
    if (!writeLease(id, cur)) markFallbackLost(id, record, "lease-write-failed");
  }

  function acquireStorage(id) {
    return new Promise(function (resolve) {
      if (!canUseStorage()) { resolve(result(false, "backend-unavailable", "local-storage", true)); return; }

      var now = Date.now();
      var cur = readLease(id);
      if (cur && Number(cur.expiresAt) > now && cur.owner !== pageId) {
        resolve(result(false, "occupied", "local-storage", false));
        return;
      }

      var token = randomToken();
      var lease = { v: 2, serverId: id, owner: pageId, token: token, updatedAt: now, expiresAt: now + LEASE_MS };
      if (!writeLease(id, lease)) {
        resolve(result(false, "backend-unavailable", "local-storage", true));
        return;
      }

      var delay = CONFIRM_MIN_MS + randomJitter(CONFIRM_JITTER_MS);
      setTimeout(function () {
        var check = readLease(id);
        if (!check || check.owner !== pageId || check.token !== token || Number(check.expiresAt) <= Date.now()) {
          // 若被另一页面竞争覆盖，这是实际占用；不是存储故障。
          resolve(result(false, "occupied", "local-storage", false));
          return;
        }
        var record = { kind: "lease", token: token, timer: null };
        held[id] = record;
        record.timer = setInterval(function () { refreshLease(id, record); }, HEARTBEAT_MS);
        resolve(result(true, "acquired", "local-storage", false));
      }, delay);
    });
  }

  // Web Locks/localStorage 都不可用时的最后跨标签页兜底。
  // 两阶段 probe + claim，避免把“API 不可用”直接当成“已有页面占用”。
  function acquireBroadcast(id) {
    return new Promise(function (resolve) {
      var BC = null;
      try { BC = typeof BroadcastChannel === "function" ? BroadcastChannel : null; } catch (_) { BC = null; }
      if (!BC) {
        // 最后的 memory-only 兜底：允许当前页面进入，但明确标记 degraded。
        held[id] = { kind: "memory" };
        resolve(result(true, "backend-unavailable", "memory", true));
        return;
      }

      var channel;
      try { channel = new BC(broadcastName(id)); }
      catch (_) {
        held[id] = { kind: "memory" };
        resolve(result(true, "backend-unavailable", "memory", true));
        return;
      }

      var token = randomToken();
      var occupied = false;
      var claims = [token];
      var phase = "probe";

      channel.onmessage = function (evt) {
        var m = evt && evt.data;
        if (!m || m.serverId !== id) return;
        if (m.type === "held" && m.forToken === token) occupied = true;
        if (m.type === "probe") {
          var r = held[id];
          if (r && r.kind === "broadcast") {
            try { channel.postMessage({ type: "held", serverId: id, forToken: m.token, owner: pageId }); } catch (_) {}
          }
        }
        if (phase === "claim" && m.type === "claim" && m.token) claims.push(String(m.token));
      };

      try { channel.postMessage({ type: "probe", serverId: id, token: token, owner: pageId }); }
      catch (_) {
        try { channel.close(); } catch (_) {}
        held[id] = { kind: "memory" };
        resolve(result(true, "backend-unavailable", "memory", true));
        return;
      }

      setTimeout(function () {
        if (occupied) {
          try { channel.close(); } catch (_) {}
          resolve(result(false, "occupied", "broadcast-channel", false));
          return;
        }
        phase = "claim";
        try { channel.postMessage({ type: "claim", serverId: id, token: token, owner: pageId }); }
        catch (_) {}
        setTimeout(function () {
          claims.sort();
          if (claims[0] !== token) {
            try { channel.close(); } catch (_) {}
            resolve(result(false, "occupied", "broadcast-channel", false));
            return;
          }
          phase = "held";
          var record = { kind: "broadcast", channel: channel, token: token };
          held[id] = record;
          resolve(result(true, "acquired", "broadcast-channel", true));
        }, BC_CLAIM_MS);
      }, BC_PROBE_MS);
    });
  }

  function acquireFallback(id) {
    return acquireStorage(id).then(function (r) {
      if (r.ok || r.reason === "occupied") return r;
      return acquireBroadcast(id);
    });
  }

  function acquireWebLock(id) {
    return new Promise(function (resolve) {
      var settled = false;
      try {
        var requestPromise = navigator.locks.request(
          webLockName(id),
          { mode: "exclusive", ifAvailable: true },
          function (lock) {
            if (!lock) {
              settled = true;
              resolve(result(false, "occupied", "web-lock", false));
              return undefined;
            }
            var releaseResolver = null;
            var holdPromise = new Promise(function (r) { releaseResolver = r; });
            held[id] = { kind: "web-lock", release: releaseResolver };
            settled = true;
            resolve(result(true, "acquired", "web-lock", false));
            return holdPromise;
          }
        );
        Promise.resolve(requestPromise).catch(function () {
          if (!settled) acquireFallback(id).then(resolve);
        });
      } catch (_) {
        acquireFallback(id).then(resolve);
      }
    });
  }

  function acquireDetailed(serverId) {
    var id;
    try { id = normalizeServerId(serverId); }
    catch (e) { return Promise.reject(e); }

    if (held[id]) return Promise.resolve(remember(id, result(true, "already-owned", held[id].kind, held[id].kind === "broadcast" || held[id].kind === "memory")));
    if (pending[id]) return pending[id];

    var p = canUseWebLocks() ? acquireWebLock(id) : acquireFallback(id);
    pending[id] = p;
    return p.then(function (r) {
      delete pending[id];
      return remember(id, r);
    }, function (err) {
      delete pending[id];
      throw err;
    });
  }

  function acquire(serverId) {
    return acquireDetailed(serverId).then(function (r) { return !!r.ok; });
  }

  function release(serverId) {
    var id;
    try { id = normalizeServerId(serverId); } catch (_) { return; }
    var record = held[id];
    if (!record) return;
    delete held[id];
    if (record.kind === "web-lock") {
      try { record.release(); } catch (_) {}
      return;
    }
    if (record.kind === "lease") {
      if (record.timer) clearInterval(record.timer);
      removeLeaseIfOwned(id, record);
      return;
    }
    if (record.kind === "broadcast") {
      try { record.channel.close(); } catch (_) {}
    }
  }

  function releaseAll() { Object.keys(held).forEach(release); }

  function owns(serverId) {
    var id;
    try { id = normalizeServerId(serverId); } catch (_) { return false; }
    return !!held[id];
  }

  function lastResult(serverId) {
    var id;
    try { id = normalizeServerId(serverId); } catch (_) { return null; }
    return last[id] || null;
  }

  function debug() {
    var out = {};
    Object.keys(held).forEach(function (id) { out[id] = { kind: held[id].kind }; });
    return { pageId: pageId, held: out, last: Object.assign({}, last), webLocks: canUseWebLocks(), storage: canUseStorage() };
  }

  // localStorage 租约若被其他标签页覆盖，当前页必须立刻失去资格。
  try {
    window.addEventListener("storage", function (evt) {
      if (!evt || !evt.key || evt.key.indexOf(NS + ":lease:") !== 0) return;
      var id = evt.key.slice((NS + ":lease:").length);
      var record = held[id];
      if (!record || record.kind !== "lease") return;
      var cur = readLease(id);
      if (!cur || cur.owner !== pageId || cur.token !== record.token) markFallbackLost(id, record, "lease-replaced");
    });
  } catch (_) {}

  // 正常关闭主动释放 fallback；Web Locks 在页面销毁时也会由浏览器自动释放。
  try {
    window.addEventListener("pagehide", releaseAll);
    window.addEventListener("beforeunload", releaseAll);
  } catch (_) {}

  window.S7MultiplayerTabGuard = Object.freeze({
    acquire: acquire,
    acquireDetailed: acquireDetailed,
    release: release,
    releaseAll: releaseAll,
    owns: owns,
    lastResult: lastResult,
    debug: debug,
    pageId: pageId,
    leaseMs: LEASE_MS
  });
})();
