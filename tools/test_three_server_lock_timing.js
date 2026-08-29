const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const battle = fs.readFileSync(path.join(root, 'src/js/96_battle_mode.js'), 'utf8');
const guard = fs.readFileSync(path.join(root, 'src/js/95_s7_multiplayer_tab_guard.js'), 'utf8');
function must(cond, msg) { if (!cond) throw new Error(msg); }

must(/var GAME_VERSION = "1\.8\.0";/.test(battle), 'battle mode version is not 1.7.8');
must(/pvz_s7_multiplayer_tab_guard_v2/.test(guard), 'guard namespace was not migrated to v2');

const selectStart = battle.indexOf('async function _selectServerAndEnter(id)');
const selectEnd = battle.indexOf('window.s7ShowServerSelect', selectStart);
const select = battle.slice(selectStart, selectEnd);
const threeBranch = select.indexOf('if (cfg.id === "3")');
const acquire = select.indexOf('acquireDetailed');
must(threeBranch >= 0, '3-server pending branch missing');
must(acquire > threeBranch, '3-server path can acquire lock before pending branch');
must(select.includes('_pendingServerEnterId = cfg.id;'), '3-server pending marker missing');
must(select.includes('s7ShowLobby()'), '3-server does not enter lobby pending state');

const sinkStart = battle.indexOf('function _bindCustomTransportSink(cfg)');
const sinkEnd = battle.indexOf('window.s7WSSend', sinkStart);
const sink = battle.slice(sinkStart, sinkEnd);
must(sink.includes('kind === "connected"'), 'custom transport connected handler missing');
must(sink.includes('_finalizeThreeServerEntryAfterConnected(cfg, t)'), '3-server lock is not finalized after transport connected');

const finalizeStart = battle.indexOf('async function _finalizeThreeServerEntryAfterConnected');
const finalizeEnd = battle.indexOf('function _bindCustomTransportSink', finalizeStart);
const finalize = battle.slice(finalizeStart, finalizeEnd);
must(finalize.indexOf('acquireDetailed') >= 0, 'post-connect guard acquire missing');
must(finalize.includes('t.disconnect()'), 'duplicate connected 3-server page is not disconnected');
must(finalize.includes('_pendingServerEnterId = null;'), 'pending state is not cleared');

const showStart = battle.indexOf('window.s7ShowLobby = function()');
const showEnd = battle.indexOf('window.s7HideLobby', showStart);
const show = battle.slice(showStart, showEnd);
must(show.includes('threePending'), 'lobby does not allow pre-lock 3-server pending state');

console.log(JSON.stringify({ok:true, checks:[
  '3-server-does-not-lock-on-click',
  '3-server-locks-after-mqtt-connected',
  'old-v1-locks-isolated-by-v2-namespace',
  'pending-entry-can-open-lobby',
  'duplicate-after-real-connect-is-disconnected'
]}, null, 2));
