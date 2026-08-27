const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const html = read('index.html');
const boot = read('src/js/00_bootstrap.js');
const mp = read('src/js/96_battle_mode.js');
const online = read('src/js/97_versus_online_duel.js');
const practice = read('src/js/100_versus_practice.js');
const css = read('src/styles/versus_duel.css');
const install2 = read('2服_安装自动守护.command');
const status2 = read('2服_状态.command');
function ok(v,msg){ if(!v) throw new Error(msg); }

// Regression for the recurring ghost-button root cause.
ok(html.includes('id="startScreen"'), 'real home screen missing');
ok(!online.includes("hide('setup')") && !practice.includes("hide('setup')"), 'feature still hides nonexistent #setup');
ok(boot.includes('data-s7-entry') && boot.includes('S7ScreenNav'), 'central home entry router missing');
ok(html.includes('data-s7-entry="versus-online"') && html.includes('data-s7-entry="versus-practice"'), 'Versus home buttons not routed centrally');

// Main menu must not own Versus room rule toggles.
ok(!html.includes('id="versusBpToggleBtn"'), 'BP toggle leaked back to home');
ok(!html.includes('id="versusExtraSlotBtn"'), 'extra-slot toggle leaked back to home');
ok(html.includes('id="versusRuleConfigurator"') && html.includes('id="versusSlots7Btn"') && html.includes('id="versusBpBtn"'), 'online room rule controls missing');
ok(html.includes('id="versusPracticeCreateRoomBtn"') && html.includes('id="versusPracticeSetupScreen"'), 'practice room creation flow missing');

// Online Versus must pass through the shared server selector before room creation/join.
ok(online.includes("s7ShowServerSelect?.('versus')"), 'online Versus bypasses shared server selector');
ok(mp.includes('var _serverSelectPurpose = "classic"') && mp.includes('_showVersusServerEntry'), 'multiplayer selector has no Versus purpose dispatch');
ok(mp.includes('cfg.id === "3"') && mp.includes('实时画面同步'), 'Versus 3-server limitation is not guarded before lock');


// Online entry must be static and safely bound; selecting a server must not start network before create/join.
ok(html.includes('id="versusOnlineEntryScreen"') && html.includes('id="versusCreateRoomBtn"') && html.includes('id="versusJoinRoomBtn"'), 'online Versus entry must be static in index.html');
ok(!online.includes("$('#versusCreateRoomBtn').onclick=") && !online.includes("$('#versusJoinRoomBtn').onclick="), 'online entry still uses fragile global .onclick binding');
ok(online.includes('querySelector("#versusCreateRoomBtn")') && online.includes('addEventListener("click"'), 'online entry safe local event binding missing');
const showEntryBody = mp.slice(mp.indexOf('function _showVersusServerEntry()'), mp.indexOf('window.s7ShowServerSelect'));
ok(!showEntryBody.includes('s7WSConnect();'), 'server selection still starts network before Versus create/join UI');
ok(online.includes('2服反向隧道已打通') && online.includes('welcome'), '2-server end-to-end tunnel diagnostic missing');


// Creating/joining a Versus room must land in a full management lobby before draft.
ok(html.includes('id="versusRoomManager"') && html.includes('id="versusRoomPlayerList"'), 'Versus room management lobby/player list missing');
ok(html.includes('id="versusRoomStartDraftBtn"') && html.includes('id="versusRoomLeaveBtn"'), 'Versus room management actions missing');
ok(online.includes('function renderVersusPlayers()') && online.includes("send({type:'kick',playerId:p.id})"), 'Versus host kick UI is not wired');
ok(online.includes("b.textContent=label;b.disabled=disabled") && online.includes("label='等待第2位玩家'"), 'Versus draft start button is not persistent/stateful');
ok(online.includes("classicPlayers.style.display='none'") && online.includes("classicLeave.style.display='none'"), 'classic room chrome still leaks into Versus room lobby');
ok(mp.includes('S7VersusOnline.isInRoom') && online.includes("msg.type==='kicked'&&O.room"), 'Versus kick/room lifecycle is still consumed by classic lobby');
ok(css.includes('.versusRoomStatusGrid') && css.includes('.versusRoomPlayer') && css.includes('.versusKickBtn'), 'Versus room management styling missing');

// Visible-layer protection and uniform home button geometry.
ok(css.includes('.versusEntryScreen{position:fixed') && css.includes('z-index:52'), 'Versus entry screen can fall behind home');
ok(css.includes('.homeMainAction{display:inline-flex') && css.includes('min-height:36px'), 'home action geometry not unified');

// Create/join must never fail silently, and 2-server daemon must not remain pinned to an old extracted package.
ok(online.includes('pendingEntry') && online.includes('服务器已连接，正在创建双人房间'), 'Versus create action has no immediate busy/status feedback');
ok(online.includes('2服已连接，但家庭后端没有响应双人房间命令') && online.includes('2服_安装自动守护.command'), '2-server old-backend timeout diagnosis missing');
ok(online.includes("versionAtLeast(serverVersion,'1.7.8')"), '2-server backend version gate missing');
ok(install2.includes('Application Support/PVZS7/HomeServer') && install2.includes('/usr/bin/rsync -a --delete'), '2-server daemon is still pinned to an extracted package directory');
ok(status2.includes('版本漂移') && status2.includes('RUNNING_VERSION'), '2-server status script does not detect frontend/backend version drift');
console.log('VERSUS ENTRY FLOW REGRESSION PASS');
