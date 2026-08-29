import WebSocket from 'ws';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const DEFAULT_CHANNEL = 'c2c3c40bfadc237a9f757c8c';
const DEFAULT_KEY = 'rdsOv39NiQMBhiKseS0e-E5egR0PwDlFnlIJT0yR5v4';
const STATUS_HEARTBEAT_MS = 20000;
const STATUS_TTL_MS = 65000;
const CLIENT_IDLE_MS = 240000;
const RECONNECT_MS = 3000;
const MAX_ENVELOPE_BYTES = 640 * 1024;

function b64uToBuffer(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function bufferToB64u(b) {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function utf8Field(s) {
  const b = Buffer.from(String(s || ''), 'utf8');
  if (b.length > 65535) throw new Error('MQTT UTF-8 field too long');
  const h = Buffer.alloc(2); h.writeUInt16BE(b.length, 0);
  return Buffer.concat([h, b]);
}
function encRemain(n) {
  const out = [];
  do {
    let d = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) d |= 128;
    out.push(d);
  } while (n > 0);
  return Buffer.from(out);
}
function packet(first, body) { return Buffer.concat([Buffer.from([first]), encRemain(body.length), body]); }

class MiniMqttNode {
  constructor(url, clientId, WebSocketImpl = WebSocket) {
    this.url = url;
    this.clientId = clientId;
    this.WebSocketImpl = WebSocketImpl;
    this.ws = null;
    this.connected = false;
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.keepTimer = null;
    this.buffer = Buffer.alloc(0);
    this.packetId = 1;
    this.filters = new Set();
    this.onconnect = null;
    this.onclose = null;
    this.onreconnecting = null;
    this.onerror = null;
    this.onmessage = null;
  }
  connect() { this.shouldReconnect = true; this._open(); }
  _bind(ws, name, fn) {
    if (typeof ws.on === 'function') ws.on(name, fn);
    else ws['on' + name] = fn;
  }
  _open() {
    if (!this.shouldReconnect) return;
    try {
      const ws = new this.WebSocketImpl(this.url, 'mqtt');
      this.ws = ws;
      if ('binaryType' in ws) ws.binaryType = 'arraybuffer';
      this._bind(ws, 'open', () => this._sendConnect());
      this._bind(ws, 'message', (ev) => {
        const data = ev && ev.data !== undefined ? ev.data : ev;
        this._feed(Buffer.from(data));
      });
      this._bind(ws, 'error', (e) => { if (this.onerror) this.onerror(e instanceof Error ? e : new Error('MQTT WebSocket error')); });
      this._bind(ws, 'close', () => {
        const was = this.connected;
        this.connected = false;
        this._stopKeepalive();
        if (this.onclose) this.onclose(was);
        if (this.shouldReconnect) this._scheduleReconnect();
      });
    } catch (e) {
      if (this.onerror) this.onerror(e);
      this._scheduleReconnect();
    }
  }
  _scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectTimer) return;
    if (this.onreconnecting) this.onreconnecting();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._open();
    }, RECONNECT_MS);
  }
  _sendRaw(bytes) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(bytes);
  }
  _sendConnect() {
    const vh = Buffer.concat([utf8Field('MQTT'), Buffer.from([4, 2, 0, 30])]);
    this._sendRaw(packet(0x10, Buffer.concat([vh, utf8Field(this.clientId)])));
  }
  subscribe(filter) {
    filter = String(filter || '');
    if (!filter) return;
    this.filters.add(filter);
    if (!this.connected) return;
    let pid = this.packetId++ & 0xffff;
    if (!pid) pid = this.packetId++ & 0xffff;
    const id = Buffer.from([pid >> 8, pid & 255]);
    this._sendRaw(packet(0x82, Buffer.concat([id, utf8Field(filter), Buffer.from([0])])));
  }
  publish(topic, payload, retain = false) {
    if (!this.connected) return false;
    const pb = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
    this._sendRaw(packet(0x30 | (retain ? 1 : 0), Buffer.concat([utf8Field(topic), pb])));
    return true;
  }
  _feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let pos = 0;
    while (pos + 2 <= this.buffer.length) {
      const first = this.buffer[pos];
      let mul = 1, rem = 0, idx = pos + 1, d = 0, count = 0;
      do {
        if (idx >= this.buffer.length) { this.buffer = this.buffer.subarray(pos); return; }
        d = this.buffer[idx++]; rem += (d & 127) * mul; mul *= 128; count++;
        if (count > 4) { this.buffer = Buffer.alloc(0); return; }
      } while (d & 128);
      if (idx + rem > this.buffer.length) { this.buffer = this.buffer.subarray(pos); return; }
      const body = this.buffer.subarray(idx, idx + rem);
      this._handlePacket(first, body);
      pos = idx + rem;
    }
    this.buffer = this.buffer.subarray(pos);
  }
  _handlePacket(first, body) {
    const type = first >> 4;
    if (type === 2) {
      if (body.length < 2 || body[1] !== 0) {
        if (this.onerror) this.onerror(new Error('MQTT CONNACK rejected'));
        try { this.ws?.close(); } catch {}
        return;
      }
      this.connected = true;
      for (const f of this.filters) this.subscribe(f);
      this._startKeepalive();
      if (this.onconnect) this.onconnect();
      return;
    }
    if (type === 3) {
      if (body.length < 2) return;
      const len = body.readUInt16BE(0);
      if (body.length < 2 + len) return;
      const topic = body.subarray(2, 2 + len).toString('utf8');
      const payload = body.subarray(2 + len);
      if (this.onmessage) this.onmessage(topic, payload, !!(first & 1));
    }
  }
  _startKeepalive() {
    this._stopKeepalive();
    this.keepTimer = setInterval(() => this._sendRaw(Buffer.from([0xC0, 0x00])), 20000);
  }
  _stopKeepalive() { if (this.keepTimer) clearInterval(this.keepTimer); this.keepTimer = null; }
  end() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this._stopKeepalive();
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(Buffer.from([0xE0, 0x00])); } catch {}
    }
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
  }
}

function deriveClientKey(secret, channel, clientId) {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.from(channel), Buffer.from('PVZS7-HOME-TUNNEL-V1:' + clientId), 32));
}
function encryptEnvelope(key, direction, channel, clientId, seq, payload) {
  const iv = randomBytes(12);
  const aad = Buffer.from(`PVZS7-HOME-TUNNEL-V1|${direction}|${channel}|${clientId}|${seq}`);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(Buffer.from(String(payload), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, cid: clientId, seq, iv: bufferToB64u(iv), ct: bufferToB64u(Buffer.concat([ct, tag])) });
}
function decryptEnvelope(key, direction, channel, clientId, raw) {
  if (raw.length > MAX_ENVELOPE_BYTES) throw new Error('tunnel envelope too large');
  const env = JSON.parse(raw.toString('utf8'));
  if (!env || env.v !== 1 || env.cid !== clientId || !Number.isSafeInteger(env.seq) || env.seq < 1) throw new Error('bad tunnel envelope');
  const iv = b64uToBuffer(env.iv);
  const all = b64uToBuffer(env.ct);
  if (iv.length !== 12 || all.length < 16) throw new Error('bad tunnel cipher');
  const ct = all.subarray(0, all.length - 16), tag = all.subarray(all.length - 16);
  const aad = Buffer.from(`PVZS7-HOME-TUNNEL-V1|${direction}|${channel}|${clientId}|${env.seq}`);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad); decipher.setAuthTag(tag);
  return { seq: env.seq, text: Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8') };
}

class TunnelVirtualSocket {
  constructor(bridge, clientId, key) {
    this.bridge = bridge;
    this.clientId = clientId;
    this.key = key;
    this.readyState = 1;
    this.seqIn = 0;
    this.seqOut = 0;
    this.lastSeen = Date.now();
  }
  send(raw) {
    if (this.readyState !== 1) return;
    this.seqOut++;
    this.bridge._publishDown(this, String(raw), this.seqOut);
  }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    try { this.bridge._publishControl(this, { __tunnel: 'serverClose', code, reason: String(reason || '').slice(0, 120) }); } catch {}
    this.bridge._closeVirtual(this, true);
  }
  terminate() { this.bridge._closeVirtual(this, true); }
}

export function startHomeMqttTunnel(options = {}) {
  const enabled = options.enabled ?? (process.env.S7_HOME_TUNNEL === '1');
  if (!enabled) {
    return { enabled: false, stop() {}, status: () => ({ enabled: false, brokerConnected: false, clients: 0 }) };
  }
  const broker = options.broker || process.env.S7_HOME_TUNNEL_BROKER || DEFAULT_BROKER;
  const channel = options.channel || process.env.S7_HOME_TUNNEL_CHANNEL || DEFAULT_CHANNEL;
  const keyText = options.key || process.env.S7_HOME_TUNNEL_KEY || DEFAULT_KEY;
  const secret = b64uToBuffer(keyText);
  if (secret.length !== 32) throw new Error('S7_HOME_TUNNEL_KEY must be 32 bytes (base64url)');
  const root = `pvzs7/v1/home/${channel}`;
  const clients = new Map();
  const keyCache = new Map();
  const onOpen = typeof options.onOpen === 'function' ? options.onOpen : () => {};
  const onMessage = typeof options.onMessage === 'function' ? options.onMessage : () => {};
  const onClose = typeof options.onClose === 'function' ? options.onClose : () => {};
  const log = typeof options.log === 'function' ? options.log : (...a) => console.log(...a);
  const warn = typeof options.warn === 'function' ? options.warn : (...a) => console.warn(...a);
  let statusTimer = null, idleTimer = null, stopped = false;

  const mqtt = new MiniMqttNode(broker, `s7home_server_${channel}_${bufferToB64u(randomBytes(6))}`, options.WebSocketImpl || WebSocket);
  function keyFor(cid) {
    let k = keyCache.get(cid);
    if (!k) { k = deriveClientKey(secret, channel, cid); keyCache.set(cid, k); }
    return k;
  }
  function publishStatus(online) {
    if (!mqtt.connected) return;
    const body = JSON.stringify({ v: 1, online: !!online, expiresAt: Date.now() + (online ? STATUS_TTL_MS : 1000), serverVersion: options.serverVersion || '1.8.0' });
    mqtt.publish(`${root}/status`, body, true);
  }
  function dropAll(notifyApp) {
    for (const sock of Array.from(clients.values())) bridge._closeVirtual(sock, notifyApp);
  }

  const bridge = {
    enabled: true,
    broker,
    channel,
    root,
    mqtt,
    clients,
    _publishDown(sock, text, seq) {
      if (!mqtt.connected || sock.readyState !== 1) return false;
      const env = encryptEnvelope(sock.key, 'down', channel, sock.clientId, seq, text);
      return mqtt.publish(`${root}/down/${sock.clientId}`, env, false);
    },
    _publishControl(sock, obj) {
      sock.seqOut++;
      return bridge._publishDown(sock, JSON.stringify(obj), sock.seqOut);
    },
    _closeVirtual(sock, notifyApp) {
      if (!sock || sock.readyState !== 1) return;
      sock.readyState = 3;
      clients.delete(sock.clientId);
      keyCache.delete(sock.clientId);
      if (notifyApp) {
        try { onClose(sock); } catch (e) { warn('[PVZ-S7 HomeTunnel] onClose:', e); }
      }
    },
    status() { return { enabled: true, brokerConnected: !!mqtt.connected, clients: clients.size, broker, channel }; },
    stop() {
      if (stopped) return;
      stopped = true;
      if (statusTimer) clearInterval(statusTimer);
      if (idleTimer) clearInterval(idleTimer);
      statusTimer = idleTimer = null;
      try { publishStatus(false); } catch {}
      dropAll(true);
      mqtt.end();
    }
  };

  mqtt.onconnect = () => {
    mqtt.subscribe(`${root}/up/+`);
    publishStatus(true);
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(() => publishStatus(true), STATUS_HEARTBEAT_MS);
    log(`[PVZ-S7 HomeTunnel] broker connected: ${broker}`);
    log(`[PVZ-S7 HomeTunnel] channel: ${channel}`);
  };
  mqtt.onclose = (wasConnected) => {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = null;
    if (wasConnected) {
      log('[PVZ-S7 HomeTunnel] broker disconnected; virtual clients enter reconnect grace');
      dropAll(true);
    }
  };
  mqtt.onreconnecting = () => log('[PVZ-S7 HomeTunnel] broker reconnecting...');
  mqtt.onerror = (e) => warn('[PVZ-S7 HomeTunnel] MQTT error:', e?.message || e);
  mqtt.onmessage = (topic, payload) => {
    const prefix = `${root}/up/`;
    if (!topic.startsWith(prefix)) return;
    const cid = topic.slice(prefix.length);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(cid)) return;
    let decoded;
    try { decoded = decryptEnvelope(keyFor(cid), 'up', channel, cid, payload); }
    catch { return; }
    let sock = clients.get(cid);
    let obj;
    try { obj = JSON.parse(decoded.text); } catch { return; }
    if (obj && obj.__tunnel === 'hello') {
      if (!sock || sock.readyState !== 1) {
        sock = new TunnelVirtualSocket(bridge, cid, keyFor(cid));
        sock.seqIn = decoded.seq;
        clients.set(cid, sock);
        try { onOpen(sock); } catch (e) { warn('[PVZ-S7 HomeTunnel] onOpen:', e); }
      } else if (decoded.seq <= sock.seqIn) return;
      else sock.seqIn = decoded.seq;
      sock.lastSeen = Date.now();
      bridge._publishControl(sock, { __tunnel: 'welcome', serverVersion: options.serverVersion || '1.8.0', serverTime: Date.now() });
      return;
    }
    if (!sock || sock.readyState !== 1) return;
    if (decoded.seq <= sock.seqIn) return;
    sock.seqIn = decoded.seq;
    sock.lastSeen = Date.now();
    if (obj && obj.__tunnel === 'pageExit') {
      try { onMessage(sock, JSON.stringify({ type: 'leaveRoom' })); } catch (e) { warn('[PVZ-S7 HomeTunnel] pageExit:', e); }
      bridge._closeVirtual(sock, true);
      return;
    }
    try { onMessage(sock, decoded.text); } catch (e) { warn('[PVZ-S7 HomeTunnel] onMessage:', e); }
  };

  idleTimer = setInterval(() => {
    const now = Date.now();
    for (const sock of Array.from(clients.values())) {
      if (now - sock.lastSeen > CLIENT_IDLE_MS) bridge._closeVirtual(sock, true);
    }
  }, 15000);

  mqtt.connect();
  return bridge;
}

export const HOME_TUNNEL_DEFAULTS = Object.freeze({ broker: DEFAULT_BROKER, channel: DEFAULT_CHANNEL, key: DEFAULT_KEY });
