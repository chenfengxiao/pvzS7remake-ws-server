"use strict";

    /* ============================================================================
     * S7 Animation Engine B01
     * Deterministic 25Hz animation timeline. Inspired by JSPVZ state naming and
     * ImgSpriter/PicArr playback, but driven exclusively by S7's 0.04s logic tick.
     * ========================================================================== */

    const S7_ANIMATION_VERSION = "S7_SINGLEFILE_FINAL_2026_07_28";
    const S7_ANIMATION_FIXED_DT = FIXED_FRAME_DT; // canonical 0.04s / 25Hz
    const S7_ANIMATION_STORAGE_KEY = "pvz_s7_animation_renderer";
    const S7_ANIMATION_RENDER_MODES = Object.freeze({
      LEGACY: "legacy",
      TIMELINE: "timeline"
    });

    function s7LoadAnimationRenderMode() {
      try {
        const saved = localStorage.getItem(S7_ANIMATION_STORAGE_KEY);
        if (saved === S7_ANIMATION_RENDER_MODES.TIMELINE || saved === S7_ANIMATION_RENDER_MODES.LEGACY) return saved
      } catch (_) {}
      return S7_ANIMATION_RENDER_MODES.TIMELINE
    }

    let s7AnimationRenderMode = s7LoadAnimationRenderMode();

    const S7_TIMELINE_THEME = (() => {
      let levelBadges = null;
      let poolBoard = null;
      function load(src) {
        if (typeof Image === 'undefined') return null;
        const img = new Image();
        img.decoding = 'async';
        img.src = window.s7ResolveEmbeddedAsset ? window.s7ResolveEmbeddedAsset(src) : src;
        return img
      }
      function release() {
        for (const img of [levelBadges, poolBoard]) {
          if (!img) continue;
          img.onload = null;
          img.onerror = null;
          // Abort an in-flight decode when timeline visuals are disabled. Completed
          // images are released by dropping the last JS reference below.
          try { if (!img.complete) img.src = "data:," } catch (_) {}
        }
        levelBadges = null;
        poolBoard = null
      }
      return {
        get levelBadges() {
          if (s7AnimationRenderMode !== S7_ANIMATION_RENDER_MODES.TIMELINE) return null;
          return levelBadges || (levelBadges = load('./assets/ui/level_badges.png'))
        },
        get poolBoard() {
          if (s7AnimationRenderMode !== S7_ANIMATION_RENDER_MODES.TIMELINE) return null;
          return poolBoard || (poolBoard = load('./assets/ui/pool_lilypad_bg_aligned.png'))
        },
        release
      }
    })();

    function s7ThemeImageReady(img) {
      return !!(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
    }

    // B02A: shared external sprite/audio asset registry. Assets stay as files next to the HTML;
    // they are intentionally NOT base64-packed into the large game document.
    const S7_SPRITES = (() => {
      const assets = new Map();
      const images = new Map();
      const failures = new Map();
      let redrawQueued = false;

      function queueRedraw() {
        if (redrawQueued || typeof requestAnimationFrame !== "function") return;
        redrawQueued = true;
        requestAnimationFrame(() => {
          redrawQueued = false;
          if (typeof draw !== "function" || !state) return;
          try { draw() } catch (_) {}
        })
      }

      function register(id, src, opt = {}) {
        const key = String(id || "");
        if (!key || !src) return false;
        assets.set(key, { id:key, src:String(src), ...opt });
        return true
      }

      function meta(id) { return assets.get(String(id || "")) || null }

      // Images are decoded only when the corresponding clip/effect is actually used.
      // This prevents hundreds of sprite sheets from competing with the game loop at boot.
      function image(id) {
        const key = String(id || "");
        const a = assets.get(key);
        if (!a || typeof Image === "undefined") return null;
        if (images.has(key)) return images.get(key);
        const img = new Image();
        img.decoding = "async";
        img.onload = () => { failures.delete(key); queueRedraw() };
        img.onerror = () => { failures.set(key, `load failed: ${a.src}`); queueRedraw() };
        images.set(key, img);
        img.src = window.s7ResolveEmbeddedAsset ? window.s7ResolveEmbeddedAsset(a.src) : a.src;
        return img
      }

      function ready(id) {
        const img = image(id);
        return !!(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
      }

      function preload(ids) {
        const list = ids == null ? [] : (Array.isArray(ids) ? ids : ids instanceof Set ? [...ids] : [ids]);
        for (const id of list) image(id);
        return list.length
      }

      function preloadClip(clip) {
        if (!clip?.layers?.length) return 0;
        let count = 0;
        for (const layer of clip.layers) if (layer?.asset && !images.has(layer.asset)) { image(layer.asset); count++ }
        return count
      }

      // Explicit diagnostic API only. It is intentionally never called during boot.
      function preloadAll() { return preload([...assets.keys()]) }

      // Drop JS references to decoded timeline sheets when the user switches back to
      // legacy drawing. Browser HTTP cache remains available for a later re-enable,
      // while the renderer is no longer forced to retain hundreds of large Image objects.
      function releaseImages() {
        const count = images.size;
        for (const img of images.values()) {
          if (!img) continue;
          img.onload = null;
          img.onerror = null;
          // Merely clearing the Map does not guarantee that a pending decode stops.
          // Repoint unfinished requests to an empty data URL so the legacy renderer
          // cannot receive a delayed main-thread decode spike after the mode switch.
          try { if (!img.complete) img.src = "data:," } catch (_) {}
        }
        images.clear();
        failures.clear();
        return count
      }

      return { register, meta, image, ready, preload, preloadClip, preloadAll, releaseImages, assets, images, failures }
    })();

    const S7_AUDIO = (() => {
      const assets = new Map();
      const cache = new Map();
      function register(id, src, opt = {}) {
        if (!id || !src) return false;
        assets.set(String(id), { src:String(src), volume:Math.max(0, Math.min(1, finiteNumber(opt.volume, 1))) });
        return true
      }
      function play(id) {
        const key = String(id || "");
        const a = assets.get(key);
        if (!a || typeof Audio === "undefined") return false;
        let base = cache.get(key);
        if (!base) {
          base = new Audio(window.s7ResolveEmbeddedAsset ? window.s7ResolveEmbeddedAsset(a.src) : a.src);
          base.preload = "metadata";
          cache.set(key, base)
        }
        try {
          const node = base.cloneNode(true);
          node.volume = a.volume;
          const promise = node.play();
          if (promise && typeof promise.catch === "function") promise.catch(() => {});
          return true
        } catch (_) { return false }
      }
      return { register, play, assets, cache }
    })();

    const S7_ANIM = (() => {
      const clips = new Map();
      const runtime = new Map();
      const handlers = new Map();
      const anonIds = new WeakMap();
      let anonSeq = 1;
      const stats = {
        ticks: 0,
        stateChanges: 0,
        events: 0,
        lastSelfTest: null
      };

      const clamp01 = v => Math.max(0, Math.min(1, finiteNumber(v, 0)));

      function normalizeKeyframes(track) {
        const src = Array.isArray(track) ? track : [];
        return src.map(k => ({
          frame: Math.max(0, finiteNumber(k.frame, 0)),
          value: finiteNumber(k.value, 0),
          hold: !!k.hold
        })).sort((a, b) => a.frame - b.frame)
      }

      class AnimationClip {
        constructor(def = {}) {
          this.id = String(def.id || "");
          this.frames = Math.max(1, Math.round(finiteNumber(def.frames, 1)));
          this.loop = def.loop !== false;
          this.source = def.source || null;
          this.tracks = {};
          for (const [name, track] of Object.entries(def.tracks || {})) this.tracks[name] = normalizeKeyframes(track);
          // B02A LayeredSpritePose: each layer owns an asset, local transform and optional tracks.
          this.layers = Object.entries(def.layers || {}).map(([name, layer], index) => {
            const src = layer || {};
            const layerTracks = {};
            for (const [trackName, track] of Object.entries(src.tracks || {})) layerTracks[trackName] = normalizeKeyframes(track);
            return {
              name,
              index,
              asset: String(src.asset || ""),
              z: finiteNumber(src.z, index),
              x: finiteNumber(src.x, 0),
              y: finiteNumber(src.y, 0),
              rotation: finiteNumber(src.rotation, 0),
              scaleX: finiteNumber(src.scaleX, finiteNumber(src.scale, 1)),
              scaleY: finiteNumber(src.scaleY, finiteNumber(src.scale, 1)),
              opacity: Math.max(0, Math.min(1, finiteNumber(src.opacity, 1))),
              visible: src.visible === false ? 0 : 1,
              pivotX: Math.max(0, Math.min(1, finiteNumber(src.pivotX, .5))),
              pivotY: Math.max(0, Math.min(1, finiteNumber(src.pivotY, .5))),
              pixelScale: Math.max(.001, finiteNumber(src.pixelScale, .01)),
              tracks: layerTracks
            }
          }).sort((a, b) => a.z - b.z || a.index - b.index);
          this.events = (Array.isArray(def.events) ? def.events : []).map((ev, index) => ({
            frame: Math.max(0, finiteNumber(ev.frame, 0)),
            type: String(ev.type || "event"),
            value: ev.value,
            once: ev.once !== false,
            index
          })).sort((a, b) => a.frame - b.frame)
        }
      }

      function registerClip(def) {
        const clip = def instanceof AnimationClip ? def : new AnimationClip(def);
        if (!clip.id) throw new Error("AnimationClip.id 不能为空");
        clips.set(clip.id, clip);
        return clip
      }

      function getClip(id) {
        return clips.get(String(id || "")) || null
      }

      function runtimeKey(kind, entity) {
        if (!entity) return `${kind}:null`;
        let id = entity.id ?? entity._animId;
        if (id == null && (typeof entity === "object" || typeof entity === "function")) {
          id = anonIds.get(entity);
          if (id == null) {
            id = `anon${anonSeq++}`;
            anonIds.set(entity, id)
          }
        }
        return `${kind}:${id ?? "anon"}`
      }

      function ensureRuntime(kind, entity) {
        const key = runtimeKey(kind, entity);
        let rt = runtime.get(key);
        if (!rt) {
          rt = {
            key,
            kind,
            entityId: entity?.id ?? null,
            clipId: "",
            state: "",
            cursor: 0,
            prevCursor: 0,
            loopCount: 0,
            completed: false,
            eventEpoch: 0,
            fired: new Set(),
            pose: null,
            rate: 1
          };
          runtime.set(key, rt)
        }
        return rt
      }

      function setState(kind, entity, state, clipId, opt = {}) {
        const rt = ensureRuntime(kind, entity);
        const nextState = String(state || "idle");
        const nextClipId = String(clipId || "");
        if (rt.state === nextState && rt.clipId === nextClipId && !opt.restart) return rt;
        rt.state = nextState;
        rt.clipId = nextClipId;
        rt.cursor = Math.max(0, finiteNumber(opt.startFrame, 0));
        rt.prevCursor = rt.cursor;
        rt.loopCount = 0;
        rt.completed = false;
        rt.eventEpoch++;
        rt.fired.clear();
        rt.pose = null;
        // Legacy mode still uses a small subset of animation event tracks as gameplay clocks,
        // but it must not start loading visual sprite sheets. Visual assets are requested only
        // when the timeline renderer is actually enabled.
        if (s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE || opt.preload === true) {
          S7_SPRITES.preloadClip(getClip(nextClipId));
        }
        stats.stateChanges++;
        return rt
      }

      function sampleTrack(track, frame, fallback) {
        const length = track?.length || 0;
        if (!length) return fallback;
        if (frame <= track[0].frame) return track[0].value;
        const last = track[length - 1];
        if (frame >= last.frame) return last.value;
        let upper = 1;
        if (length <= 8) {
          while (upper < length && frame > track[upper].frame) upper++
        } else {
          let lo = 1, hi = length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (frame <= track[mid].frame) hi = mid;
            else lo = mid + 1
          }
          upper = lo
        }
        const b = track[upper], a = track[upper - 1];
        if (a.hold || b.frame <= a.frame) return a.value;
        const t = clamp01((frame - a.frame) / (b.frame - a.frame));
        return a.value + (b.value - a.value) * t
      }

      function safeAnimationScale(value) {
        const v = finiteNumber(value, 1);
        if (Math.abs(v) < .001) return v < 0 ? -.001 : .001;
        return v
      }

      function sampleLayerPose(layer, frame, reuse) {
        const t = layer.tracks || {};
        const sampledScaleX = finiteNumber(sampleTrack(t.scaleX, frame, layer.scaleX), layer.scaleX);
        const sampledScaleY = finiteNumber(sampleTrack(t.scaleY, frame, layer.scaleY), layer.scaleY);
        const p = reuse || {};
        p.name = layer.name;
        p.asset = layer.asset;
        p.z = layer.z;
        p.x = sampleTrack(t.x, frame, layer.x);
        p.y = sampleTrack(t.y, frame, layer.y);
        p.rotation = sampleTrack(t.rotation, frame, layer.rotation);
        p.scaleX = safeAnimationScale(sampledScaleX);
        p.scaleY = safeAnimationScale(sampledScaleY);
        p.opacity = clamp01(sampleTrack(t.opacity, frame, layer.opacity));
        p.visible = sampleTrack(t.visible, frame, layer.visible) >= .5 ? 1 : 0;
        p.pivotX = layer.pivotX;
        p.pivotY = layer.pivotY;
        p.pixelScale = layer.pixelScale;
        p.frameIndex = Math.max(0, Math.floor(sampleTrack(t.frameIndex, frame, 0)));
        return p
      }

      function samplePose(rt) {
        const clip = getClip(rt?.clipId);
        if (!clip) {
          const p = rt._pose || (rt._pose = {});
          p.x = 0; p.y = 0; p.rotation = 0; p.scaleX = 1; p.scaleY = 1;
          p.opacity = 1; p.frameIndex = 0; p.visible = 1;
          p.state = rt?.state || "idle"; p.clipId = rt?.clipId || "";
          p.layers = null;
          return p;
        }
        const frame = Math.max(0, Math.min(clip.frames - 1e-6, finiteNumber(rt.cursor, 0)));
        const t = clip.tracks;
        const p = rt._pose || (rt._pose = {});
        p.x = sampleTrack(t.x, frame, 0);
        p.y = sampleTrack(t.y, frame, 0);
        p.rotation = sampleTrack(t.rotation, frame, 0);
        p.scaleX = sampleTrack(t.scaleX, frame, 1);
        p.scaleY = sampleTrack(t.scaleY, frame, 1);
        p.opacity = clamp01(sampleTrack(t.opacity, frame, 1));
        p.frameIndex = Math.max(0, Math.floor(sampleTrack(t.frameIndex, frame, frame)));
        p.visible = sampleTrack(t.visible, frame, 1) >= .5 ? 1 : 0;
        p.state = rt.state;
        p.clipId = rt.clipId;
        p.progress = clip.frames <= 1 ? 1 : clamp01(frame / (clip.frames - 1));
        const layers = clip.layers;
        let arr = rt._layerArr;
        if (!arr || arr.length !== layers.length) {
          arr = new Array(layers.length);
          rt._layerArr = arr
        }
        for (let i = 0; i < layers.length; i++) arr[i] = sampleLayerPose(layers[i], frame, arr[i]);
        p.layers = arr;
        return p
      }

      function dispatchEvent(kind, entity, rt, ev) {
        stats.events++;
        const payload = {
          kind,
          entity,
          runtime: rt,
          clip: getClip(rt.clipId),
          event: ev,
          logicFrame: state?.frame ?? 0,
          time: state?.time ?? 0
        };
        const specific = handlers.get(ev.type);
        if (specific) {
          try { specific(payload) } catch (err) { console.warn("animation event handler failed", ev.type, err) }
        }
        const all = handlers.get("*");
        if (all) {
          try { all(payload) } catch (err) { console.warn("animation wildcard handler failed", err) }
        }
      }

      function advance(kind, entity, rate = 1) {
        const rt = ensureRuntime(kind, entity);
        const clip = getClip(rt.clipId);
        rt.rate = Math.max(0, finiteNumber(rate, 1));
        const sampleVisualPose = s7AnimationRenderMode === S7_ANIMATION_RENDER_MODES.TIMELINE;
        if (!clip || rt.completed || rt.rate <= 0) {
          rt.pose = sampleVisualPose ? samplePose(rt) : null;
          return rt
        }
        const from = rt.cursor;
        let to = from + rt.rate;
        let wrapped = false;
        if (clip.loop) {
          while (to >= clip.frames) {
            to -= clip.frames;
            rt.loopCount++;
            rt.eventEpoch++;
            rt.fired.clear();
            wrapped = true
          }
        } else if (to >= clip.frames) {
          to = Math.max(0, clip.frames - 1e-6);
          rt.completed = true
        }
        for (const ev of clip.events) {
          const crossed = wrapped ? (ev.frame > from || ev.frame <= to) : (ev.frame > from && ev.frame <= to);
          if (!crossed) continue;
          const token = `${rt.eventEpoch}:${ev.index}`;
          if (ev.once && rt.fired.has(token)) continue;
          rt.fired.add(token);
          dispatchEvent(kind, entity, rt, ev)
        }
        rt.prevCursor = from;
        rt.cursor = to;
        rt.pose = sampleVisualPose ? samplePose(rt) : null;
        return rt
      }

      function on(type, handler) {
        if (typeof handler !== "function") return false;
        handlers.set(String(type || "*"), handler);
        return true
      }

      function off(type) {
        return handlers.delete(String(type || "*"))
      }

      function purge(validKeys) {
        const keep = validKeys instanceof Set ? validKeys : new Set(validKeys || []);
        for (const key of runtime.keys()) if (!keep.has(key)) runtime.delete(key)
      }

      function snapshot(kind, entity) {
        const rt = runtime.get(runtimeKey(kind, entity));
        if (!rt) return null;
        if (!rt.pose) rt.pose = samplePose(rt);
        const snap = rt._snapshot || (rt._snapshot = {});
        snap.state = rt.state;
        snap.clipId = rt.clipId;
        snap.cursor = rt.cursor;
        snap.loopCount = rt.loopCount;
        snap.completed = rt.completed;
        snap.rate = rt.rate;
        snap.pose = rt.pose;
        return snap
      }

      function selfTest() {
        const fake = { id: "__selftest__" };
        const observed = [];
        const old = handlers.get("__selftest_event__");
        on("__selftest_event__", p => observed.push(p.logicFrame));
        registerClip({
          id: "__selftest_clip__",
          frames: 5,
          loop: false,
          tracks: { x: [{ frame: 0, value: 0 }, { frame: 4, value: 4 }] },
          events: [{ frame: 2, type: "__selftest_event__" }]
        });
        setState("test", fake, "run", "__selftest_clip__", { restart: true });
        for (let i = 0; i < 4; i++) advance("test", fake, 1);
        const snap = snapshot("test", fake);
        const ok = !!snap && Math.abs(snap.pose.x - 4) < .01 && observed.length === 1;
        runtime.delete(runtimeKey("test", fake));
        clips.delete("__selftest_clip__");
        if (old) handlers.set("__selftest_event__", old); else handlers.delete("__selftest_event__");
        stats.lastSelfTest = { ok, observed: observed.length, at: Date.now() };
        return stats.lastSelfTest
      }

      return {
        AnimationClip,
        registerClip,
        getClip,
        setState,
        advance,
        samplePose,
        snapshot,
        on,
        off,
        purge,
        selfTest,
        stats,
        clips,
        runtime,
        runtimeKey
      }
    })();


    function s7RegisterJspvzSequence(id, sequence, opt = {}) {
      const sourceTickMs = Math.max(1, finiteNumber(opt.sourceTickMs, 10));
      const fixedMs = S7_ANIMATION_FIXED_DT * 1000;
      const seq = Array.isArray(sequence) ? sequence : [];
      const frameRefs = [];
      const frameTrack = [];
      let cursor = 0;
      for (let i = 0; i < seq.length; i++) {
        const item = seq[i] || [];
        const ref = item[0] ?? i;
        const sourceDelayTicks = Math.max(1, finiteNumber(item[1], 1));
        const quantizedFrames = Math.max(1, Math.round(sourceDelayTicks * sourceTickMs / fixedMs));
        frameRefs.push(ref);
        frameTrack.push({ frame: cursor, value: i, hold: true });
        cursor += quantizedFrames
      }
      if (!frameTrack.length) {
        frameRefs.push(0);
        frameTrack.push({ frame: 0, value: 0, hold: true });
        cursor = 1
      }
      return S7_ANIM.registerClip({
        id,
        frames: cursor,
        loop: opt.loop !== false,
        source: {
          type: "jspvz-sequence",
          sourceTickMs,
          fixedTickMs: fixedMs,
          frames: frameRefs,
          asset: opt.asset || null,
          note: "JSPVZ ImgSpriter timing quantized to S7 0.04s logic frames"
        },
        tracks: { frameIndex: frameTrack },
        events: opt.events || []
      })
    }

    function s7RegisterB01GenericClips() {
      const clips = [
        {
          id: "plant.idle", frames: 24, loop: true,
          tracks: {
            y: [{frame:0,value:0},{frame:6,value:-.018},{frame:12,value:0},{frame:18,value:.018},{frame:23,value:0}],
            rotation: [{frame:0,value:-.018},{frame:12,value:.018},{frame:23,value:-.018}],
            scaleY: [{frame:0,value:1},{frame:6,value:1.025},{frame:12,value:1},{frame:18,value:.985},{frame:23,value:1}]
          }
        },
        {
          id: "plant.sleep", frames: 32, loop: true,
          tracks: { y:[{frame:0,value:.02},{frame:16,value:.035},{frame:31,value:.02}], scaleY:[{frame:0,value:.88},{frame:16,value:.9},{frame:31,value:.88}] }
        },
        {
          id: "plant.attack", frames: 12, loop: false,
          tracks: {
            x:[{frame:0,value:0},{frame:4,value:.035},{frame:7,value:-.02},{frame:11,value:0}],
            scaleX:[{frame:0,value:1},{frame:4,value:1.08},{frame:7,value:.97},{frame:11,value:1}],
            scaleY:[{frame:0,value:1},{frame:4,value:.94},{frame:7,value:1.04},{frame:11,value:1}]
          },
          events:[{frame:5,type:"release",value:"generic"}]
        },
        {
          id: "plant.special", frames: 20, loop: true,
          tracks: { rotation:[{frame:0,value:-.06},{frame:5,value:.06},{frame:10,value:-.06},{frame:15,value:.06},{frame:19,value:-.06}], scaleX:[{frame:0,value:1},{frame:10,value:1.08},{frame:19,value:1}] }
        },
        {
          id: "zombie.move", frames: 18, loop: true,
          tracks: {
            y:[{frame:0,value:0},{frame:4,value:-.02},{frame:9,value:0},{frame:13,value:-.02},{frame:17,value:0}],
            rotation:[{frame:0,value:-.035},{frame:4,value:.025},{frame:9,value:-.03},{frame:13,value:.03},{frame:17,value:-.035}],
            scaleY:[{frame:0,value:1},{frame:4,value:1.015},{frame:9,value:.99},{frame:13,value:1.015},{frame:17,value:1}]
          }
        },
        {
          id: "zombie.attack", frames: 20, loop: true,
          tracks: { x:[{frame:0,value:0},{frame:8,value:-.055},{frame:12,value:-.035},{frame:19,value:0}], rotation:[{frame:0,value:0},{frame:8,value:-.06},{frame:12,value:-.02},{frame:19,value:0}] },
          events:[{frame:10,type:"impact",value:"bite"}]
        },
        {
          id: "zombie.pacing", frames: 20, loop: true,
          tracks: { x:[{frame:0,value:-.035},{frame:5,value:.035},{frame:10,value:-.035},{frame:15,value:.035},{frame:19,value:-.035}], rotation:[{frame:0,value:-.02},{frame:10,value:.02},{frame:19,value:-.02}] }
        },
        {
          id: "zombie.airborne", frames: 16, loop: true,
          tracks: { y:[{frame:0,value:-.03},{frame:8,value:-.07},{frame:15,value:-.03}], rotation:[{frame:0,value:-.04},{frame:8,value:.04},{frame:15,value:-.04}] }
        },
        {
          id: "zombie.stunned", frames: 12, loop: true,
          tracks: { rotation:[{frame:0,value:-.07},{frame:3,value:.07},{frame:6,value:-.07},{frame:9,value:.07},{frame:11,value:-.07}], opacity:[{frame:0,value:.85},{frame:6,value:1},{frame:11,value:.85}] }
        },
        {
          id: "bullet.fly", frames: 8, loop: true,
          tracks: { rotation:[{frame:0,value:0},{frame:7,value:Math.PI*2}] }
        }
      ];
      for (const clip of clips) S7_ANIM.registerClip(clip)
    }

    s7RegisterB01GenericClips();

