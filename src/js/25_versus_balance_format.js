"use strict";

// -----------------------------------------------------------------------------
// S7 Versus Balance Baseline Format
// The balance truth source is intentionally NOT BP:
//   - BP off
//   - 6 total slots per side
//   - 1 fixed economy core + 5 combat cards
//   - public alternating picks: Zombie first, Plant second, repeated 5 rounds
// BP matches are classified separately as resilience/playability evidence only.
// -----------------------------------------------------------------------------

(function initS7VersusBalanceFormat(root) {
  const SIDE_PLANT = "plant";
  const SIDE_ZOMBIE = "zombie";
  const FORMAT_ID = "versus-nobp-6slot-zfirst-v1";

  function profile() {
    return root.S7FeatureProfiles?.getProfile?.("versus") || root.S7_VERSUS_PROFILE || null;
  }

  function uniqueIds(ids) {
    return [...new Set((ids || []).map(x => String(x || "")).filter(Boolean))];
  }

  function defaultPlantPool() {
    const p = profile();
    const all = Object.keys(p?.cardCooldown?.plants || root.PLANTS || {});
    const economyCore = String(p?.draft?.plantEconomyCoreId || "twinSunflower");
    return all.filter(id => id !== economyCore);
  }

  function defaultZombiePool() {
    const p = profile();
    const all = Object.keys(p?.cardCooldown?.zombies || root.ZOMBIES || {});
    const blocked = new Set(p?.draft?.zombieNonDraftableIds || []);
    return all.filter(id => !blocked.has(id));
  }

  function buildPhases() {
    const phases = [];
    for (let round = 0; round < 5; round++) {
      phases.push(Object.freeze({ round, actor: SIDE_ZOMBIE, action: "pick", targetSide: SIDE_ZOMBIE }));
      phases.push(Object.freeze({ round, actor: SIDE_PLANT, action: "pick", targetSide: SIDE_PLANT }));
    }
    return Object.freeze(phases);
  }

  function createDraft(options = {}) {
    const state = {
      version: 1,
      formatId: FORMAT_ID,
      bpEnabled: false,
      totalSlots: 6,
      reservedEconomySlots: 1,
      draftedCombatSlots: 5,
      firstPicker: SIDE_ZOMBIE,
      alternating: true,
      plantPool: uniqueIds(options.plantPool || defaultPlantPool()),
      zombiePool: uniqueIds(options.zombiePool || defaultZombiePool()),
      phases: buildPhases(),
      phaseIndex: 0,
      picks: { plant: [], zombie: [] },
      history: [],
      complete: false
    };
    if (state.plantPool.length < 5) throw new Error("Versus Balance 植物池不足：至少需要5张战斗卡");
    if (state.zombiePool.length < 5) throw new Error("Versus Balance 僵尸池不足：至少需要5张战斗卡");
    return state;
  }

  function currentPhase(state) {
    if (!state || state.complete) return null;
    return state.phases[state.phaseIndex] || null;
  }

  function legalCards(state) {
    const ph = currentPhase(state);
    if (!ph) return [];
    const pool = ph.actor === SIDE_PLANT ? state.plantPool : state.zombiePool;
    const used = new Set(state.picks[ph.actor] || []);
    return pool.filter(id => !used.has(id));
  }

  function applyAction(state, cardId) {
    if (!state || state.complete) return { ok: false, reason: "draft-complete" };
    const ph = currentPhase(state);
    const id = String(cardId || "");
    if (!id || !legalCards(state).includes(id)) return { ok: false, reason: "illegal-card", phase: ph };
    state.picks[ph.actor].push(id);
    state.history.push(Object.freeze({
      index: state.phaseIndex,
      round: ph.round,
      actor: ph.actor,
      action: "pick",
      targetSide: ph.actor,
      cardId: id
    }));
    state.phaseIndex++;
    state.complete = state.phaseIndex >= state.phases.length;
    return { ok: true, complete: state.complete, phaseIndex: state.phaseIndex };
  }

  function result(state) {
    if (!state) return null;
    const p = profile();
    return Object.freeze({
      formatId: FORMAT_ID,
      complete: !!state.complete,
      bpEnabled: false,
      totalSlots: 6,
      combatSlots: 5,
      firstPicker: SIDE_ZOMBIE,
      alternating: true,
      plant: Object.freeze({
        economyCore: p?.draft?.plantEconomyCoreId || "twinSunflower",
        combatCards: Object.freeze(state.picks.plant.slice())
      }),
      zombie: Object.freeze({
        economyCore: p?.draft?.zombieEconomyCoreId || "zombieGravestone",
        combatCards: Object.freeze(state.picks.zombie.slice())
      })
    });
  }

  function isBalanceEligibleMatch(meta) {
    if (!meta) return false;
    const formatId = String(meta.formatId || "");
    if (formatId) return formatId === FORMAT_ID;
    return meta.bpEnabled === false
      && Number(meta.totalSlots) === 6
      && Number(meta.combatSlots ?? meta.draftedCombatSlots) === 5
      && String(meta.firstPicker || "") === SIDE_ZOMBIE
      && meta.alternating === true;
  }

  function telemetryClass(meta) {
    if (isBalanceEligibleMatch(meta)) return "strength_truth";
    if (meta?.bpEnabled === true) return "bp_resilience";
    return "excluded_other_format";
  }

  function splitTelemetry(rows) {
    const out = { strength_truth: [], bp_resilience: [], excluded_other_format: [] };
    for (const row of rows || []) out[telemetryClass(row?.meta || row)].push(row);
    return out;
  }

  function serialize(state) {
    if (!state) return null;
    return JSON.parse(JSON.stringify({
      version: state.version,
      formatId: state.formatId,
      bpEnabled: false,
      totalSlots: 6,
      reservedEconomySlots: 1,
      draftedCombatSlots: 5,
      firstPicker: SIDE_ZOMBIE,
      alternating: true,
      plantPool: state.plantPool,
      zombiePool: state.zombiePool,
      phaseIndex: state.phaseIndex,
      picks: state.picks,
      history: state.history,
      complete: state.complete
    }));
  }

  function restore(data) {
    if (!data || data.version !== 1 || data.formatId !== FORMAT_ID) throw new Error("不支持的 Versus Balance Draft 存档");
    const state = createDraft({ plantPool: data.plantPool, zombiePool: data.zombiePool });
    state.phaseIndex = Math.max(0, Math.min(state.phases.length, Number(data.phaseIndex) || 0));
    state.picks = { plant: uniqueIds(data.picks?.plant), zombie: uniqueIds(data.picks?.zombie) };
    state.history = Array.isArray(data.history) ? data.history.slice() : [];
    state.complete = !!data.complete || state.phaseIndex >= state.phases.length;
    return state;
  }

  root.S7VersusBalanceFormat = Object.freeze({
    FORMAT_ID, SIDE_PLANT, SIDE_ZOMBIE,
    buildPhases, createDraft, currentPhase, legalCards, applyAction, result,
    isBalanceEligibleMatch, telemetryClass, splitTelemetry,
    serialize, restore
  });
})(typeof window !== "undefined" ? window : globalThis);
