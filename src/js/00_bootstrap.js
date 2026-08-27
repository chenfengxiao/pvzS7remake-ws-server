    "use strict";
    if (typeof window.alert !== "function") window.alert = msg => console.warn(String(msg));
    const HASH_PARAMS = new URLSearchParams(location.hash.replace(/^#/, ""));
    const QUAD_MIN_SIDE = 2;
    const QUAD_MAX_SIDE = 10;
    const QUAD_MAX_PLANES = QUAD_MAX_SIDE * QUAD_MAX_SIDE;
    const DEVICE_UA = String(navigator.userAgent || "");
    const IOS_DEVICE = /iPad|iPhone|iPod/i.test(DEVICE_UA) || /Macintosh/i.test(DEVICE_UA) && Number(navigator.maxTouchPoints || 0) > 1;
    const MOBILE_DEVICE = (() => {
      const uaMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile|webOS|BlackBerry/i.test(DEVICE_UA);
      const clientHintMobile = navigator.userAgentData?.mobile === true;
      let coarseAndCompact = false;
      try {
        const coarse = matchMedia("(pointer: coarse)").matches || matchMedia("(any-pointer: coarse)").matches;
        const shortestSide = Math.min(Number(screen.width) || innerWidth, Number(screen.height) || innerHeight);
        coarseAndCompact = coarse && Number(navigator.maxTouchPoints || 0) > 0 && shortestSide <= 1100
      } catch (_) {}
      return IOS_DEVICE || clientHintMobile || uaMobile || coarseAndCompact
    })();
    const MOBILE_PHONE = MOBILE_DEVICE && Math.min(Number(screen.width) || innerWidth, Number(screen.height) || innerHeight) <= 600;

    function applyRuntimeDeviceClasses() {
      const vv = window.visualViewport;
      const width = Math.max(1, Math.round(vv?.width || innerWidth || document.documentElement.clientWidth || 1));
      const height = Math.max(1, Math.round(vv?.height || innerHeight || document.documentElement.clientHeight || 1));
      document.body.classList.toggle("mobileDevice", MOBILE_DEVICE);
      document.body.classList.toggle("desktopDevice", !MOBILE_DEVICE);
      document.body.classList.toggle("iosDevice", IOS_DEVICE);
      document.body.classList.toggle("mobilePhone", MOBILE_PHONE);
      document.body.classList.toggle("mobilePortrait", MOBILE_DEVICE && height > width);
      document.body.classList.toggle("mobileLandscape", MOBILE_DEVICE && width >= height);
      let standalone = navigator.standalone === true;
      try { standalone = standalone || matchMedia("(display-mode: standalone)").matches } catch (_) {}
      document.body.classList.toggle("standaloneMode", standalone);
      const notice = document.getElementById("rotateNotice");
      if (notice) notice.textContent = "已自动启用手机模式；横屏可显示完整棋盘与固定操作栏。";
      const header = document.querySelector(".cardsPanel .panelHeader>span:first-child");
      if (header && MOBILE_DEVICE) header.textContent = "常用卡槽（10）";
      return {width,height}
    }
    applyRuntimeDeviceClasses();
    const QUAD_WINDOW_NAME_PREFIX = "pvzQuadChild:";
    const QUAD_WINDOW_PAYLOAD = (() => {
      const raw = String(window.name || "");
      if (!raw.startsWith(QUAD_WINDOW_NAME_PREFIX)) return null;
      try {
        const parsed = JSON.parse(decodeURIComponent(raw.slice(QUAD_WINDOW_NAME_PREFIX.length)));
        return parsed && typeof parsed === "object" ? parsed : null
      } catch (_) {
        return null
      }
    })();
    const QUAD_CHILD_MODE = HASH_PARAMS.get("quadChild") === "1" || !!QUAD_WINDOW_PAYLOAD;
    const MOBILE_FIXED_QUAD_HOST = MOBILE_DEVICE && !QUAD_CHILD_MODE;
    const QUAD_CHILD_SLOT = Math.max(1, Math.min(QUAD_MAX_PLANES, Number(QUAD_WINDOW_PAYLOAD?.slot ?? HASH_PARAMS.get(
      "slot")) || 1));
    const QUAD_BOOT_LAYOUT = Array.isArray(QUAD_WINDOW_PAYLOAD?.layout) ? QUAD_WINDOW_PAYLOAD.layout : null;
    const QUAD_BOOT_STAMP = String(QUAD_WINDOW_PAYLOAD?.stamp || "");
    const QUAD_BOOT_GRID_SIDE = Math.max(QUAD_MIN_SIDE, Math.min(QUAD_MAX_SIDE, Number(QUAD_WINDOW_PAYLOAD?.gridSide ??
      HASH_PARAMS.get("gridSide")) || QUAD_MIN_SIDE));
    const QUAD_BOOT_PLANE_COUNT = Math.max(QUAD_MIN_SIDE * QUAD_MIN_SIDE, Math.min(QUAD_MAX_PLANES, Number(
      QUAD_WINDOW_PAYLOAD?.planeCount) || QUAD_BOOT_GRID_SIDE * QUAD_BOOT_GRID_SIDE));
    const QUAD_CHILD_RENDER_INTERVAL_MS = QUAD_BOOT_GRID_SIDE <= 3 ? 16 : QUAD_BOOT_GRID_SIDE <= 4 ? 33 :
      QUAD_BOOT_GRID_SIDE <= 6 ? 50 : QUAD_BOOT_GRID_SIDE <= 8 ? 85 : 120;
    const QUAD_PROGRESS_INTERVAL = QUAD_BOOT_PLANE_COUNT <= 16 ? .5 : QUAD_BOOT_PLANE_COUNT <= 49 ? 1 : 2;
    const QUAD_DOCUMENT_BASE = new URL(".", location.href).href;
    const QUAD_INLINE_SOURCE = QUAD_CHILD_MODE ? "" : "<!doctype html>\n" + document.documentElement.outerHTML.replace("<head>", `<head><base href="${QUAD_DOCUMENT_BASE}">`);
    if (MOBILE_FIXED_QUAD_HOST) document.body.classList.add("mobileQuadHost");
    const ROWS = 5,
      COLS = 10,
      PLANT_COLS = 9,
      DAMAGE_BOUNDARY_X = 9,
      CRITICAL = 70,
      ASH = 1800,
      EAT_DPS = 100,
      CHARMED_VEHICLE_DPS = 4e3,
      IMP_LANDING_INVULN = 1.2,
      IMP_LANDING_STUN = .4;
    const TEAM_NAMES = ["1路", "2路", "3路", "4路", "5路"];
    const TEAM_COLORS = ["#f87171", "#60a5fa", "#4ade80", "#fde047", "#c084fc"];
    const canvas = document.getElementById("canvas"),
      ctx = canvas.getContext("2d");
    function preferredCanvasDpr() {
      const raw = Math.max(1, Number(window.devicePixelRatio) || 1);
      if (IOS_DEVICE) return Math.min(raw, MOBILE_PHONE ? 1 : 1.12);
      if (MOBILE_DEVICE) return Math.min(raw, 1.20);
      const area=Math.max(1,innerWidth*innerHeight);
      return Math.min(raw,area>2200000?1.20:area>1400000?1.30:1.40)
    }
    let DPR = preferredCanvasDpr();
    let canvasBackingWidth = 0,
      canvasBackingHeight = 0,
      resizeFrameId = 0,
      resizeTimerId = 0,
      safeAreaProbe = null;

    function viewportMetrics() {
      const vv = window.visualViewport;
      return {
        width: Math.max(1, Math.round(vv?.width || innerWidth || document.documentElement.clientWidth || 1)),
        height: Math.max(1, Math.round(vv?.height || innerHeight || document.documentElement.clientHeight || 1)),
        offsetLeft: Math.round(vv?.offsetLeft || 0),
        offsetTop: Math.round(vv?.offsetTop || 0)
      }
    }

    function safeAreaInsets() {
      if (!IOS_DEVICE && !MOBILE_DEVICE) return {left:0,right:0,top:0,bottom:0};
      if (!safeAreaProbe) {
        safeAreaProbe = document.createElement("div");
        safeAreaProbe.setAttribute("aria-hidden", "true");
        safeAreaProbe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);";
        document.body.appendChild(safeAreaProbe)
      }
      const cs = getComputedStyle(safeAreaProbe);
      const px = value => Math.max(0, parseFloat(value) || 0);
      return {top:px(cs.paddingTop),right:px(cs.paddingRight),bottom:px(cs.paddingBottom),left:px(cs.paddingLeft)}
    }

    function syncCanvasBackingStore(width, height, dpr) {
      const nextWidth = Math.max(1, Math.round(width * dpr));
      const nextHeight = Math.max(1, Math.round(height * dpr));
      if (canvasBackingWidth !== nextWidth || canvasBackingHeight !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvasBackingWidth = nextWidth;
        canvasBackingHeight = nextHeight
      }
      const cssWidth = width + "px";
      const cssHeight = height + "px";
      if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
      if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function queueRuntimeResize(delay = 0) {
      if (resizeTimerId) {
        clearTimeout(resizeTimerId);
        resizeTimerId = 0
      }
      const enqueue = () => {
        if (resizeFrameId) return;
        resizeFrameId = requestAnimationFrame(() => {
          resizeFrameId = 0;
          resize()
        })
      };
      if (delay > 0) resizeTimerId = setTimeout(() => {
        resizeTimerId = 0;
        enqueue()
      }, delay);
      else enqueue()
    }

    // S7_BATTLE_RNG_BEGIN
    // ============================================================
    // Battle RNG domain
    // ============================================================
    // Battle simulation owns one deterministic PRNG stream.  It must never
    // monkey-patch Math.random(): UI/visual/network randomness stays on the
    // browser RNG and therefore cannot consume or shift the battle sequence.
    const S7_BATTLE_RNG = {
      active: false,
      seed: null,
      calls: 0,
      next: null,
      lastSeed: null,
      lastCalls: 0,
      missingSeedReported: false
    };

    function s7Mulberry32(seed) {
      let s = seed >>> 0;
      return function() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    function s7SetBattleSeed(seed) {
      if (seed == null) {
        if (S7_BATTLE_RNG.active) {
          S7_BATTLE_RNG.lastSeed = S7_BATTLE_RNG.seed;
          S7_BATTLE_RNG.lastCalls = S7_BATTLE_RNG.calls
        }
        S7_BATTLE_RNG.active = false;
        S7_BATTLE_RNG.seed = null;
        S7_BATTLE_RNG.calls = 0;
        S7_BATTLE_RNG.next = null;
        S7_BATTLE_RNG.missingSeedReported = false;
        return null
      }
      const normalized = (Number(seed) >>> 0) || 1;
      S7_BATTLE_RNG.active = true;
      S7_BATTLE_RNG.seed = normalized;
      S7_BATTLE_RNG.calls = 0;
      S7_BATTLE_RNG.next = s7Mulberry32(normalized);
      S7_BATTLE_RNG.missingSeedReported = false;
      return normalized
    }

    function s7BattleRandom() {
      if (S7_BATTLE_RNG.active && typeof S7_BATTLE_RNG.next === "function") {
        S7_BATTLE_RNG.calls++;
        return S7_BATTLE_RNG.next()
      }
      // Outside deterministic multiplayer, preserve the original local-game
      // behavior by falling back to the browser RNG.  During an active MP
      // battle, however, an absent seed is a hard deterministic-state bug:
      // fail loudly instead of silently desynchronizing two clients.
      if (typeof window !== "undefined" && window._mpBattleActive) {
        const msg = "[S7 Battle RNG] multiplayer battle is active without a seeded battle RNG";
        if (!S7_BATTLE_RNG.missingSeedReported) {
          S7_BATTLE_RNG.missingSeedReported = true;
          console.error(msg)
        }
        throw new Error(msg)
      }
      return Math.random()
    }

    function s7BattleRnd(a, b) {
      return a + s7BattleRandom() * (b - a)
    }

    function s7BattleIrnd(a, b) {
      return Math.floor(s7BattleRnd(a, b + 1))
    }

    function s7BattleChoose(a) {
      return a[Math.floor(s7BattleRandom() * a.length)]
    }

    function s7BattleRngInfo() {
      return {
        active: S7_BATTLE_RNG.active,
        seed: S7_BATTLE_RNG.seed,
        calls: S7_BATTLE_RNG.calls,
        lastSeed: S7_BATTLE_RNG.lastSeed,
        lastCalls: S7_BATTLE_RNG.lastCalls
      }
    }

    window.s7SetBattleSeed = s7SetBattleSeed;
    window.s7BattleRandom = s7BattleRandom;
    window.s7BattleRnd = s7BattleRnd;
    window.s7BattleIrnd = s7BattleIrnd;
    window.s7BattleChoose = s7BattleChoose;
    window.s7BattleRngInfo = s7BattleRngInfo;
    // S7_BATTLE_RNG_END

    // Generic gameplay rnd/irnd/choose helpers were removed on purpose:
    // deterministic state changes must name the Battle RNG domain explicitly.
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fmt = t => {
      t = Math.max(0, t || 0);
      const m = Math.floor(t / 60),
        s = Math.floor(t % 60);
      return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0")
    };
    let layout = {
      x: 0,
      y: 0,
      cell: 70,
      w: 630,
      h: 350
    };
    let selected = "wallnut",
      selectedZombie = "blind",
      cardMode = "plant",
      tool = "plant",
      glove = null,
      last = performance.now(),
      state = null,
      uid = 1,
      frameAcc = 0,
      entityTextVisible = true;
    const COMMON_SLOT_COUNT = 10;
    let selectedCommonSlot = 0,
      commonInsertCursor = 0;
    const commonSlots = [
      "p:wallnut",
      "p:snowpea",
      "p:cactus",
      "p:torchwood",
      "p:gatling",
      "z:blind",
      "z:normal",
      "z:cone",
      "z:bucket",
      "z:football"
    ];
    const FIXED_FRAME_DT = .04;
    const PERF = {
      MAX_STEPS_PER_FRAME: 8,
      MAX_ZOMBIES: 2 ** 16,
      MAX_BULLETS: 420,
      MAX_EFFECTS: 160,
      MAX_GRID_EFFECTS: 140,
      MAX_ICE_TRAILS: 70,
      MAX_POISON_PITS: 35,
      MAX_SHADOW_SPIKES: 35,
      MAX_TURRETS: 50,
      MAX_SUMMONS: 60,
      MAX_SUNFLOWER_SUNS: 96,
      FULL_CLEANUP_INTERVAL_FRAMES: 8,
      MAX_UNCHANGED_RENDER_GAP_MS: 120
    };

    // -----------------------------------------------------------------------------

    // 页面/启动/通用保护 / finiteNumber

    // [原源码行 1391] 4厘秒/逻辑帧；一帧就是一个完整回合。

    // [原源码行 1394] v7.1: 进一步下调渲染压力，防止 emoji Canvas 在中后期被大量实体拖到假死。

    // -----------------------------------------------------------------------------

    function finiteNumber(v, fallback = 0) {
      return Number.isFinite(v) ? v : fallback
    }

    // Shared guards belong to the bootstrap layer because animation registration
    // executes before projectile/effect modules in the modular build. In the
    // legacy single-file build these declarations were function-hoisted, which
    // concealed the dependency.
    function finitePositive(v, fallback = 1) {
      return Number.isFinite(v) && v > 0 ? v : fallback
    }

    function finiteArray(a) {
      return Array.isArray(a) ? a : []
    }

    // Stable in-place compaction avoids allocating replacement arrays every logic/render frame.
    function compactArrayInPlace(arr, keep) {
      const list = Array.isArray(arr) ? arr : [];
      let write = 0;
      for (let read = 0; read < list.length; read++) {
        const item = list[read];
        if (!keep(item, read)) continue;
        list[write++] = item
      }
      list.length = write;
      return list
    }


// -----------------------------------------------------------------------------
// Unified home-mode entry router.
// New home buttons must declare data-s7-entry instead of binding their own
// DOMContentLoaded click handler or hard-coding a home screen id. This prevents
// the recurring "button only flashes/ghosts" failure when a feature hides the
// wrong container (the real home screen is #startScreen).
// -----------------------------------------------------------------------------
(function initS7HomeEntryRouter(root){
  if (!root || !root.document || root.S7ScreenNav) return;
  const doc = root.document;
  const byId = id => doc.getElementById(id);
  const setHidden = (id, hidden) => {
    const node = typeof id === "string" ? byId(id) : id;
    if (!node) return false;
    node.classList.toggle("hidden", !!hidden);
    return true;
  };
  const nav = {
    homeId: "startScreen",
    hideHome(){ return setHidden(this.homeId, true); },
    showHome(){ return setHidden(this.homeId, false); },
    show(id, options){
      const opts = options || {};
      if (opts.hideHome !== false) this.hideHome();
      return setHidden(id, false);
    },
    hide(id){ return setHidden(id, true); },
    swap(fromId, toId, options){
      if (fromId) this.hide(fromId);
      return this.show(toId, options);
    }
  };
  root.S7ScreenNav = Object.freeze(nav);

  const routes = Object.freeze({
    "versus-online": () => root.S7VersusOnline?.open?.(),
    "versus-practice": () => root.S7VersusPractice?.open?.()
  });
  doc.addEventListener("click", function(ev){
    const btn = ev.target?.closest?.("[data-s7-entry]");
    if (!btn) return;
    const key = btn.getAttribute("data-s7-entry") || "";
    const handler = routes[key];
    if (!handler) return;
    ev.preventDefault();
    const apiReady = key === "versus-online" ? !!root.S7VersusOnline?.open : !!root.S7VersusPractice?.open;
    if (!apiReady) {
      console.error("[S7Entry] feature module not ready:", key);
      root.alert?.("该模式模块未正确加载，请刷新页面后重试。若仍出现，请保留控制台报错用于定位。");
      return;
    }
    handler();
  });
})(window);
