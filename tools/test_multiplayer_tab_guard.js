const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const path = require('path');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'src/js/95_s7_multiplayer_tab_guard.js'), 'utf8');

function makeStorageBackend() {
  const store = new Map();
  return {
    api() {
      return {
        getItem(k) { return store.has(k) ? store.get(k) : null; },
        setItem(k, v) { store.set(String(k), String(v)); },
        removeItem(k) { store.delete(String(k)); }
      };
    }
  };
}

function makeWebLocksManager() {
  const held = new Set();
  return {
    request(name, options, callback) {
      if (options && options.ifAvailable && held.has(name)) {
        return Promise.resolve(callback(null));
      }
      held.add(name);
      return Promise.resolve(callback({ name })).finally(() => held.delete(name));
    }
  };
}

function makePage(name, storage, locks) {
  const listeners = Object.create(null);
  const ctx = {
    console,
    crypto: webcrypto,
    navigator: locks ? { locks } : {},
    localStorage: storage,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Uint8Array, Date, Math, JSON, Number, String, Object, Promise,
    performance,
    CustomEvent: function(type, init) { this.type = type; this.detail = init && init.detail; },
    __name: name,
  };
  ctx.window = ctx;
  ctx.addEventListener = function(type, fn) { (listeners[type] ||= []).push(fn); };
  ctx.dispatchEvent = function(evt) { for (const fn of (listeners[evt.type] || [])) fn(evt); };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: '95_s7_multiplayer_tab_guard.js' });
  return ctx;
}

async function runScenario(kind, locks) {
  const backend = makeStorageBackend();
  const A = makePage(`${kind}-A`, backend.api(), locks);
  const B = makePage(`${kind}-B`, backend.api(), locks);

  if (!(await A.S7MultiplayerTabGuard.acquire('1'))) throw new Error(`${kind}: A should acquire server 1`);
  if (await B.S7MultiplayerTabGuard.acquire('1')) throw new Error(`${kind}: B must be blocked from same server 1`);
  if (!(await B.S7MultiplayerTabGuard.acquire('3'))) throw new Error(`${kind}: B should be allowed into different server 3`);

  if (!A.S7MultiplayerTabGuard.owns('1')) throw new Error(`${kind}: A lost server 1 lock unexpectedly`);
  if (!B.S7MultiplayerTabGuard.owns('3')) throw new Error(`${kind}: B lost server 3 lock unexpectedly`);

  A.S7MultiplayerTabGuard.release('1');
  await new Promise(r => setTimeout(r, 0));
  if (!(await B.S7MultiplayerTabGuard.acquire('1'))) throw new Error(`${kind}: B should acquire server 1 after A releases it`);

  if (!B.S7MultiplayerTabGuard.owns('1') || !B.S7MultiplayerTabGuard.owns('3')) throw new Error(`${kind}: per-server locks are not independent`);
  B.S7MultiplayerTabGuard.releaseAll();
}

(async () => {
  await runScenario('localStorage-fallback', null);
  await runScenario('web-locks', makeWebLocksManager());
  console.log(JSON.stringify({
    ok: true,
    webLocksPath: true,
    localStorageFallbackPath: true,
    sameServerBlocked: true,
    differentServersAllowed: true,
    releasedServerReusable: true
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
