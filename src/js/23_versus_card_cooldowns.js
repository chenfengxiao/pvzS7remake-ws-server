"use strict";

// -----------------------------------------------------------------------------
// Versus Card Cooldown Runtime
// Two independent domains: plant cards and zombie cards.
// Uses simulation time only. Failed placements never consume cooldown.
// -----------------------------------------------------------------------------

(function initS7VersusCardCooldowns(root) {
  const SIDE_PLANT = "plant";
  const SIDE_ZOMBIE = "zombie";
  const SIDES = new Set([SIDE_PLANT, SIDE_ZOMBIE]);

  function profile() {
    return root.S7FeatureProfiles?.getProfile?.("versus") || root.S7_VERSUS_PROFILE || null;
  }

  function sideTable(side) {
    const p = profile();
    if (!p) return {};
    return side === SIDE_PLANT ? p.cardCooldown.plants : p.cardCooldown.zombies;
  }

  function groupTable(side) {
    const p = profile();
    if (!p) return {};
    return side === SIDE_PLANT ? p.cardCooldown.groups.plant : p.cardCooldown.groups.zombie;
  }

  function normalizeSide(side) {
    return SIDES.has(side) ? side : null;
  }

  function canonicalCardId(side, id) {
    id = String(id || "");
    if (side === SIDE_ZOMBIE) {
      if (id.startsWith("var:")) id = id.slice(4);
      if (id.startsWith("cmd:")) id = id.slice(4);
    }
    return id;
  }

  function createRuntime(nowSeconds = 0) {
    return {
      active: true,
      startedAt: Number.isFinite(nowSeconds) ? nowSeconds : 0,
      revision: 0,
      plant: { readyAt: Object.create(null), groupReadyAt: Object.create(null), uses: Object.create(null) },
      zombie: { readyAt: Object.create(null), groupReadyAt: Object.create(null), uses: Object.create(null) }
    };
  }

  function ensureRuntime(gameState, nowSeconds = 0) {
    if (!gameState) throw new Error("Versus cooldowns require a game state");
    gameState.versus = gameState.versus || {};
    if (!gameState.versus.cooldowns) gameState.versus.cooldowns = createRuntime(nowSeconds);
    return gameState.versus.cooldowns;
  }

  function isActive(gameState) {
    return !!(gameState?.versus?.active && gameState?.versus?.cooldowns?.active);
  }

  function cardDef(side, id) {
    side = normalizeSide(side);
    if (!side) return null;
    return sideTable(side)[canonicalCardId(side, id)] || null;
  }

  function suddenDeathMultiplier(side, elapsedSeconds) {
    const cfg = profile()?.cardCooldown?.suddenDeath;
    if (!cfg) return 1;
    const t = Math.max(0, Number(elapsedSeconds) || 0);
    if (t <= cfg.startsAtSeconds) return 1;
    const x = Math.min(1, (t - cfg.startsAtSeconds) / Math.max(1, cfg.rampSeconds));
    const floor = side === SIDE_PLANT ? cfg.plantFloorMultiplier : cfg.zombieFloorMultiplier;
    // Smoothstep avoids a derivative jump when Sudden Death starts.
    const smooth = x * x * (3 - 2 * x);
    return 1 - (1 - floor) * smooth;
  }

  function effectiveCooldown(gameState, side, id, nowSeconds) {
    const def = cardDef(side, id);
    if (!def) return Infinity;
    const rt = ensureRuntime(gameState, nowSeconds);
    const elapsed = Math.max(0, nowSeconds - rt.startedAt);
    return Math.max(.25, def.cooldownSeconds * suddenDeathMultiplier(side, elapsed));
  }

  function openingCooldown(side, id) {
    const def = cardDef(side, id);
    return def ? Math.max(0, Number(def.openingCooldownSeconds) || 0) : Infinity;
  }

  function activate(gameState, options = {}) {
    const now = Number.isFinite(options.nowSeconds) ? options.nowSeconds : Number(gameState?.time) || 0;
    const rt = createRuntime(now);
    gameState.versus = gameState.versus || {};
    gameState.versus.active = true;
    gameState.versus.featureProfile = "versus";
    gameState.versus.cooldowns = rt;

    for (const side of [SIDE_PLANT, SIDE_ZOMBIE]) {
      const domain = rt[side];
      for (const [id, def] of Object.entries(sideTable(side))) {
        const opening = Math.max(0, Number(def.openingCooldownSeconds) || 0);
        if (opening > 0) domain.readyAt[id] = now + opening;
      }
    }
    return rt;
  }

  function deactivate(gameState) {
    if (!gameState?.versus) return;
    if (gameState.versus.cooldowns) gameState.versus.cooldowns.active = false;
    gameState.versus.active = false;
  }

  function status(gameState, side, id, nowSeconds = Number(gameState?.time) || 0) {
    side = normalizeSide(side);
    if (!side) return { known: false, ready: false, reason: "invalid-side", remainingSeconds: Infinity, ratio: 0 };
    const key = canonicalCardId(side, id);
    const def = cardDef(side, key);
    if (!def) return { known: false, ready: false, reason: "unknown-card", remainingSeconds: Infinity, ratio: 0 };
    if (!isActive(gameState)) return { known: true, ready: true, reason: "inactive", remainingSeconds: 0, ratio: 1, definition: def };

    const rt = ensureRuntime(gameState, nowSeconds);
    const domain = rt[side];
    const ownReadyAt = Number(domain.readyAt[key]) || 0;
    const group = def.cooldownGroup || "normal";
    const groupReadyAt = Number(domain.groupReadyAt[group]) || 0;
    const readyAt = Math.max(ownReadyAt, groupReadyAt);
    const remaining = Math.max(0, readyAt - nowSeconds);
    const nominal = Math.max(.25, effectiveCooldown(gameState, side, key, nowSeconds));
    return {
      known: true,
      ready: remaining <= 1e-9,
      reason: remaining <= 1e-9 ? "ready" : (groupReadyAt > ownReadyAt ? "shared-group" : "card"),
      remainingSeconds: remaining,
      readyAt,
      ratio: Math.max(0, Math.min(1, 1 - remaining / nominal)),
      uses: Number(domain.uses[key]) || 0,
      group,
      definition: def
    };
  }

  function canUse(gameState, side, id, nowSeconds = Number(gameState?.time) || 0) {
    return status(gameState, side, id, nowSeconds).ready;
  }

  function commitUse(gameState, side, id, nowSeconds = Number(gameState?.time) || 0) {
    side = normalizeSide(side);
    if (!side) return { ok: false, reason: "invalid-side" };
    const key = canonicalCardId(side, id);
    const before = status(gameState, side, key, nowSeconds);
    if (!before.known) return { ok: false, reason: before.reason };
    if (!before.ready) return { ok: false, reason: before.reason, remainingSeconds: before.remainingSeconds };
    if (!isActive(gameState)) return { ok: true, reason: "inactive", cooldownSeconds: 0 };

    const rt = ensureRuntime(gameState, nowSeconds);
    const domain = rt[side];
    const def = cardDef(side, key);
    const ownCd = effectiveCooldown(gameState, side, key, nowSeconds);
    domain.readyAt[key] = nowSeconds + ownCd;
    domain.uses[key] = (Number(domain.uses[key]) || 0) + 1;

    const group = def.cooldownGroup || "normal";
    const shared = Math.max(0, Number(groupTable(side)[group]) || 0);
    if (shared > 0) domain.groupReadyAt[group] = Math.max(Number(domain.groupReadyAt[group]) || 0, nowSeconds + shared);
    rt.revision++;
    return { ok: true, cardId: key, side, cooldownSeconds: ownCd, sharedCooldownSeconds: shared, readyAt: domain.readyAt[key] };
  }

  function refundUse(gameState, side, id, snapshot) {
    // Intended only for atomic placement transactions: caller may snapshot
    // before commit and restore if a later validation unexpectedly fails.
    if (!isActive(gameState) || !snapshot) return false;
    side = normalizeSide(side);
    if (!side) return false;
    const key = canonicalCardId(side, id);
    const domain = gameState.versus.cooldowns[side];
    domain.readyAt[key] = snapshot.readyAt || 0;
    domain.uses[key] = snapshot.uses || 0;
    if (snapshot.group) domain.groupReadyAt[snapshot.group] = snapshot.groupReadyAt || 0;
    gameState.versus.cooldowns.revision++;
    return true;
  }

  function snapshotBeforeUse(gameState, side, id) {
    if (!isActive(gameState)) return null;
    side = normalizeSide(side);
    if (!side) return null;
    const key = canonicalCardId(side, id);
    const def = cardDef(side, key);
    if (!def) return null;
    const domain = gameState.versus.cooldowns[side];
    const group = def.cooldownGroup || "normal";
    return { readyAt: Number(domain.readyAt[key]) || 0, uses: Number(domain.uses[key]) || 0, group, groupReadyAt: Number(domain.groupReadyAt[group]) || 0 };
  }

  function serialize(gameState) {
    if (!gameState?.versus?.cooldowns) return null;
    const rt = gameState.versus.cooldowns;
    const plain = side => ({
      readyAt: { ...(rt[side]?.readyAt || {}) },
      groupReadyAt: { ...(rt[side]?.groupReadyAt || {}) },
      uses: { ...(rt[side]?.uses || {}) }
    });
    return { active: !!rt.active, startedAt: rt.startedAt, revision: rt.revision || 0, plant: plain(SIDE_PLANT), zombie: plain(SIDE_ZOMBIE) };
  }

  function restore(gameState, data) {
    if (!gameState || !data) return false;
    const rt = createRuntime(Number(data.startedAt) || 0);
    rt.active = data.active !== false;
    rt.revision = Number(data.revision) || 0;
    for (const side of [SIDE_PLANT, SIDE_ZOMBIE]) {
      Object.assign(rt[side].readyAt, data[side]?.readyAt || {});
      Object.assign(rt[side].groupReadyAt, data[side]?.groupReadyAt || {});
      Object.assign(rt[side].uses, data[side]?.uses || {});
    }
    gameState.versus = gameState.versus || {};
    gameState.versus.active = true;
    gameState.versus.featureProfile = "versus";
    gameState.versus.cooldowns = rt;
    return true;
  }

  const api = Object.freeze({
    SIDE_PLANT, SIDE_ZOMBIE,
    activate, deactivate, isActive,
    cardDef, openingCooldown, effectiveCooldown,
    status, canUse, commitUse,
    snapshotBeforeUse, refundUse,
    serialize, restore, canonicalCardId,
    suddenDeathMultiplier
  });

  root.S7VersusCooldowns = api;
})(typeof window !== "undefined" ? window : globalThis);
