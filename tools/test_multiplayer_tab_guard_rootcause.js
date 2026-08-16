const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const path = require('path');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'src/js/95_s7_multiplayer_tab_guard.js'), 'utf8');

function makeContext({locks, storage}) {
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
  };
  ctx.window = ctx;
  ctx.addEventListener = function(type, fn) { (listeners[type] ||= []).push(fn); };
  ctx.dispatchEvent = function(evt) { for (const fn of (listeners[evt.type] || [])) fn(evt); };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: '95_s7_multiplayer_tab_guard.js' });
  return ctx;
}

const brokenStorage = {
  getItem() { throw new Error('storage blocked'); },
  setItem() { throw new Error('storage blocked'); },
  removeItem() { throw new Error('storage blocked'); }
};

const rejectingLocks = {
  request() { return Promise.reject(new Error('Web Locks unavailable in this context')); }
};

const occupiedLocks = {
  request(name, options, callback) { return Promise.resolve(callback(null)); }
};

(async () => {
  // Root-cause regression: backend failure used to become boolean false and was then
  // incorrectly translated by battle_mode into “你已经进入3服”. It must now be a
  // degraded-but-allowed result, not an occupied result.
  const degraded = makeContext({ locks: rejectingLocks, storage: brokenStorage });
  const r = await degraded.S7MultiplayerTabGuard.acquireDetailed('3');
  if (!r.ok || !r.degraded || r.reason === 'occupied') {
    throw new Error('backend failure was still misclassified as duplicate occupancy: ' + JSON.stringify(r));
  }
  if (!degraded.S7MultiplayerTabGuard.owns('3')) throw new Error('degraded path did not allow entry');
  degraded.S7MultiplayerTabGuard.release('3');

  // A real Web Locks collision must still be rejected as occupied.
  const occupied = makeContext({ locks: occupiedLocks, storage: brokenStorage });
  const r2 = await occupied.S7MultiplayerTabGuard.acquireDetailed('3');
  if (r2.ok || r2.reason !== 'occupied') {
    throw new Error('real duplicate occupancy was not rejected: ' + JSON.stringify(r2));
  }

  console.log(JSON.stringify({
    ok: true,
    checks: [
      'lock-backend-failure-is-not-duplicate',
      'degraded-entry-allowed',
      'real-duplicate-still-blocked'
    ]
  }, null, 2));
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
