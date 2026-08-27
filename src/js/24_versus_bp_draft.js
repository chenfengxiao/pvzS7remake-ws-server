"use strict";

// -----------------------------------------------------------------------------
// S7 Versus BP Draft Engine
// Local/headless state machine for the plant-vs-zombie Versus mode.
// This is intentionally separate from 96_battle_mode.js and the legacy online
// BP modes. It owns only profile:versus draft state/settings.
// -----------------------------------------------------------------------------

(function initS7VersusBPDraft(root) {
  const SIDE_PLANT = "plant";
  const SIDE_ZOMBIE = "zombie";
  const ACTION_BAN = "ban";
  const ACTION_PICK = "pick";
  const SETTINGS_KEY = "s7_versus_bp_settings_v1";

  function versusProfile() {
    return root.S7FeatureProfiles?.getProfile?.("versus") || root.S7_VERSUS_PROFILE || null;
  }

  function defaultSettings() {
    return { bpEnabled: false, extraSlot: false };
  }

  function loadSettings() {
    const base = defaultSettings();
    try {
      const raw = root.localStorage?.getItem?.(SETTINGS_KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      return {
        bpEnabled: data?.bpEnabled === true,
        extraSlot: data?.extraSlot === true
      };
    } catch (_) {
      return base;
    }
  }

  let settings = loadSettings();

  function saveSettings() {
    try { root.localStorage?.setItem?.(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  function getSettings() {
    const totalSlots = settings.extraSlot ? 7 : 6;
    return Object.freeze({
      bpEnabled: !!settings.bpEnabled,
      extraSlot: !!settings.extraSlot,
      totalSlots,
      reservedEconomySlots: 1,
      draftedCombatSlots: totalSlots - 1
    });
  }

  function setBpEnabled(value) {
    settings = { ...settings, bpEnabled: !!value };
    saveSettings();
    syncSettingsUI();
    return getSettings();
  }

  function setExtraSlot(value) {
    settings = { ...settings, extraSlot: !!value };
    saveSettings();
    syncSettingsUI();
    return getSettings();
  }

  function phase(actor, action) {
    const targetSide = action === ACTION_BAN
      ? (actor === SIDE_ZOMBIE ? SIDE_PLANT : SIDE_ZOMBIE)
      : actor;
    return Object.freeze({ actor, action, targetSide });
  }

  // Exact user-defined sequence (B2 -> P3 -> B2 -> P2/3):
  // (Z ban P, P ban Z) x2,
  // (Z pick Z, P pick P) x3,
  // (Z ban P, P ban Z) x2,
  // (Z pick Z, P pick P) x2 for 6 slots, x3 for 7 slots.
  // Fixed economy cores are outside these combat-card picks.
  function buildPhases(extraSlot = false) {
    const out = [
      phase(SIDE_ZOMBIE, ACTION_BAN), phase(SIDE_PLANT, ACTION_BAN),
      phase(SIDE_ZOMBIE, ACTION_BAN), phase(SIDE_PLANT, ACTION_BAN),
      phase(SIDE_ZOMBIE, ACTION_PICK), phase(SIDE_PLANT, ACTION_PICK),
      phase(SIDE_ZOMBIE, ACTION_PICK), phase(SIDE_PLANT, ACTION_PICK),
      phase(SIDE_ZOMBIE, ACTION_PICK), phase(SIDE_PLANT, ACTION_PICK),
      phase(SIDE_ZOMBIE, ACTION_BAN), phase(SIDE_PLANT, ACTION_BAN),
      phase(SIDE_ZOMBIE, ACTION_BAN), phase(SIDE_PLANT, ACTION_BAN),
      phase(SIDE_ZOMBIE, ACTION_PICK), phase(SIDE_PLANT, ACTION_PICK),
      phase(SIDE_ZOMBIE, ACTION_PICK), phase(SIDE_PLANT, ACTION_PICK)
    ];
    if (extraSlot) {
      out.push(phase(SIDE_ZOMBIE, ACTION_PICK), phase(SIDE_PLANT, ACTION_PICK));
    }
    return Object.freeze(out.slice());
  }

  function uniqueIds(ids) {
    return [...new Set((ids || []).map(x => String(x || "")).filter(Boolean))];
  }

  function defaultPlantPool() {
    const p = versusProfile();
    const all = Object.keys(p?.cardCooldown?.plants || root.PLANTS || {});
    const economyCore = String(p?.draft?.plantEconomyCoreId || "twinSunflower");
    return all.filter(id => id !== economyCore);
  }

  function defaultZombiePool() {
    const p = versusProfile();
    const all = Object.keys(p?.cardCooldown?.zombies || root.ZOMBIES || {});
    const blocked = new Set(p?.draft?.zombieNonDraftableIds || []);
    return all.filter(id => !blocked.has(id));
  }

  function createDraft(options = {}) {
    const extraSlot = options.extraSlot != null ? !!options.extraSlot : !!settings.extraSlot;
    const phases = buildPhases(extraSlot);
    const state = {
      version: 1,
      sequenceVersion: versusProfile()?.draft?.sequenceVersion || "s7-versus-bp-b2p3b2p23-v2",
      extraSlot,
      totalSlots: extraSlot ? 7 : 6,
      reservedEconomySlots: 1,
      draftedCombatSlots: extraSlot ? 6 : 5,
      plantPool: uniqueIds(options.plantPool || defaultPlantPool()),
      zombiePool: uniqueIds(options.zombiePool || defaultZombiePool()),
      phases,
      phaseIndex: 0,
      bans: { plant: [], zombie: [] },
      picks: { plant: [], zombie: [] },
      history: [],
      complete: false
    };
    validatePoolCapacity(state);
    return state;
  }

  function validatePoolCapacity(state) {
    // Each side suffers four bans. Picks are 5 by default, 6 with extra slot.
    // The two sets are disjoint because bans target the opponent and picks are
    // made by the owning side, but a side's available pool must cover both.
    const need = 4 + state.draftedCombatSlots;
    if (state.plantPool.length < need) throw new Error(`Versus BP 植物池不足：至少需要 ${need} 张`);
    if (state.zombiePool.length < need) throw new Error(`Versus BP 僵尸池不足：至少需要 ${need} 张`);
  }

  function currentPhase(state) {
    if (!state || state.complete) return null;
    return state.phases[state.phaseIndex] || null;
  }

  function unavailableSet(state, targetSide) {
    return new Set([...(state.bans[targetSide] || []), ...(state.picks[targetSide] || [])]);
  }

  function legalCards(state) {
    const ph = currentPhase(state);
    if (!ph) return [];
    const pool = ph.targetSide === SIDE_PLANT ? state.plantPool : state.zombiePool;
    const unavailable = unavailableSet(state, ph.targetSide);
    return pool.filter(id => !unavailable.has(id));
  }

  function applyAction(state, cardId) {
    if (!state || state.complete) return { ok: false, reason: "draft-complete" };
    const ph = currentPhase(state);
    const id = String(cardId || "");
    if (!id || !legalCards(state).includes(id)) return { ok: false, reason: "illegal-card", phase: ph };

    if (ph.action === ACTION_BAN) state.bans[ph.targetSide].push(id);
    else state.picks[ph.actor].push(id);

    state.history.push(Object.freeze({
      index: state.phaseIndex,
      actor: ph.actor,
      action: ph.action,
      targetSide: ph.targetSide,
      cardId: id
    }));
    state.phaseIndex += 1;
    state.complete = state.phaseIndex >= state.phases.length;
    return { ok: true, complete: state.complete, phaseIndex: state.phaseIndex, action: state.history[state.history.length - 1] };
  }

  function result(state) {
    if (!state) return null;
    const p = versusProfile();
    return Object.freeze({
      complete: !!state.complete,
      totalSlots: state.totalSlots,
      reservedEconomySlots: state.reservedEconomySlots,
      draftedCombatSlots: state.draftedCombatSlots,
      plant: Object.freeze({
        combatCards: Object.freeze(state.picks.plant.slice()),
        bannedCards: Object.freeze(state.bans.plant.slice()),
        economyCore: p?.draft?.plantEconomyCoreId || "twinSunflower"
      }),
      zombie: Object.freeze({
        combatCards: Object.freeze(state.picks.zombie.slice()),
        bannedCards: Object.freeze(state.bans.zombie.slice()),
        economyCore: p?.draft?.zombieEconomyCoreId || "zombieGravestone"
      })
    });
  }

  function serialize(state) {
    if (!state) return null;
    return JSON.parse(JSON.stringify({
      version: state.version,
      sequenceVersion: state.sequenceVersion,
      extraSlot: state.extraSlot,
      totalSlots: state.totalSlots,
      reservedEconomySlots: state.reservedEconomySlots,
      draftedCombatSlots: state.draftedCombatSlots,
      plantPool: state.plantPool,
      zombiePool: state.zombiePool,
      phaseIndex: state.phaseIndex,
      bans: state.bans,
      picks: state.picks,
      history: state.history,
      complete: state.complete
    }));
  }

  function restore(data) {
    if (!data || data.version !== 1) throw new Error("不支持的 Versus BP 存档版本");
    const state = createDraft({ extraSlot: !!data.extraSlot, plantPool: data.plantPool, zombiePool: data.zombiePool });
    state.phaseIndex = Math.max(0, Math.min(state.phases.length, Number(data.phaseIndex) || 0));
    state.bans = { plant: uniqueIds(data.bans?.plant), zombie: uniqueIds(data.bans?.zombie) };
    state.picks = { plant: uniqueIds(data.picks?.plant), zombie: uniqueIds(data.picks?.zombie) };
    state.history = Array.isArray(data.history) ? data.history.slice() : [];
    state.complete = !!data.complete || state.phaseIndex >= state.phases.length;
    return state;
  }

  function cardMeta(side, id) {
    const table = side === SIDE_PLANT ? (root.PLANTS || {}) : (root.ZOMBIES || {});
    const c = table[id] || {};
    return { id, name: c.name || id, emoji: c.emoji || (side === SIDE_PLANT ? "🌿" : "🧟") };
  }

  function phaseText(ph) {
    if (!ph) return "BP完成";
    const actor = ph.actor === SIDE_ZOMBIE ? "僵尸方" : "植物方";
    if (ph.action === ACTION_PICK) return `${actor} Pick 1 个${ph.actor === SIDE_ZOMBIE ? "僵尸" : "植物"}`;
    return `${actor} Ban 1 个${ph.targetSide === SIDE_ZOMBIE ? "僵尸" : "植物"}`;
  }

  let uiDraft = null;
  let uiSelected = "";

  function byId(id) { return root.document?.getElementById?.(id) || null; }

  function syncSettingsUI() {
    const s = getSettings();
    const bp = byId("versusBpToggleBtn");
    const extra = byId("versusExtraSlotBtn");
    const preview = byId("versusBpPreviewBtn");
    if (bp) {
      bp.textContent = s.bpEnabled ? "BP：开启" : "开启BP";
      bp.classList.toggle("primary", s.bpEnabled);
      bp.setAttribute("aria-pressed", s.bpEnabled ? "true" : "false");
    }
    if (extra) {
      extra.textContent = s.extraSlot ? "额外卡槽：开启（7槽）" : "开启额外卡槽（6槽）";
      extra.classList.toggle("primary", s.extraSlot);
      extra.setAttribute("aria-pressed", s.extraSlot ? "true" : "false");
    }
    if (preview) preview.classList.toggle("hidden", !s.bpEnabled);
  }

  function renderDraftUI() {
    const overlay = byId("versusBpOverlay");
    if (!overlay || !uiDraft) return;
    const ph = currentPhase(uiDraft);
    byId("versusBpPhase").textContent = uiDraft.complete
      ? "BP 已完成"
      : `第 ${uiDraft.phaseIndex + 1}/${uiDraft.phases.length} 步 · ${phaseText(ph)}`;
    byId("versusBpSlots").textContent = `${uiDraft.totalSlots}槽 = 1经济槽 + ${uiDraft.draftedCombatSlots}战斗卡`;

    const summary = byId("versusBpSummary");
    if (summary) {
      const names = (side, ids) => ids.map(id => cardMeta(side, id).name).join("、") || "无";
      summary.innerHTML = [
        `<b>植物 Pick：</b>${names(SIDE_PLANT, uiDraft.picks.plant)}`,
        `<b>植物被 Ban：</b>${names(SIDE_PLANT, uiDraft.bans.plant)}`,
        `<b>僵尸 Pick：</b>${names(SIDE_ZOMBIE, uiDraft.picks.zombie)}`,
        `<b>僵尸被 Ban：</b>${names(SIDE_ZOMBIE, uiDraft.bans.zombie)}`
      ].map(x => `<div>${x}</div>`).join("");
    }

    const grid = byId("versusBpCardGrid");
    if (grid) {
      grid.innerHTML = "";
      if (!uiDraft.complete && ph) {
        for (const id of legalCards(uiDraft)) {
          const m = cardMeta(ph.targetSide, id);
          const b = root.document.createElement("button");
          b.type = "button";
          b.className = "versusBpCard" + (uiSelected === id ? " selected" : "");
          b.dataset.cardId = id;
          b.innerHTML = `<span class="versusBpEmoji">${m.emoji}</span><span>${m.name}</span>`;
          b.onclick = () => { uiSelected = id; renderDraftUI(); };
          grid.appendChild(b);
        }
      } else if (uiDraft.complete) {
        const done = result(uiDraft);
        grid.innerHTML = `<div class="versusBpDone"><b>BP完成</b><br>植物战斗卡 ${done.plant.combatCards.length} 张，僵尸战斗卡 ${done.zombie.combatCards.length} 张。<br>结果已保存在 <code>S7VersusBP.getLastResult()</code>。</div>`;
      }
    }

    const confirm = byId("versusBpConfirmBtn");
    if (confirm) {
      confirm.disabled = uiDraft.complete || !uiSelected;
      confirm.textContent = uiDraft.complete ? "BP完成" : (ph?.action === ACTION_BAN ? "确认 Ban" : "确认 Pick");
    }
  }

  let lastResult = null;

  function openLocalDraft(options = {}) {
    uiDraft = createDraft({ extraSlot: options.extraSlot != null ? !!options.extraSlot : settings.extraSlot });
    uiSelected = "";
    lastResult = null;
    const overlay = byId("versusBpOverlay");
    if (overlay) overlay.classList.remove("hidden");
    renderDraftUI();
    return uiDraft;
  }

  function closeLocalDraft() {
    const overlay = byId("versusBpOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function getLastResult() { return lastResult; }

  function bindUI() {
    const bp = byId("versusBpToggleBtn");
    const extra = byId("versusExtraSlotBtn");
    const preview = byId("versusBpPreviewBtn");
    const confirm = byId("versusBpConfirmBtn");
    const close = byId("versusBpCloseBtn");
    const reset = byId("versusBpResetBtn");

    if (bp) bp.onclick = () => setBpEnabled(!settings.bpEnabled);
    if (extra) extra.onclick = () => setExtraSlot(!settings.extraSlot);
    if (preview) preview.onclick = () => openLocalDraft();
    if (close) close.onclick = closeLocalDraft;
    if (reset) reset.onclick = () => openLocalDraft();
    if (confirm) confirm.onclick = () => {
      if (!uiDraft || !uiSelected) return;
      const applied = applyAction(uiDraft, uiSelected);
      if (!applied.ok) return;
      uiSelected = "";
      if (uiDraft.complete) lastResult = result(uiDraft);
      renderDraftUI();
    };
    syncSettingsUI();
  }

  const api = Object.freeze({
    SIDE_PLANT, SIDE_ZOMBIE, ACTION_BAN, ACTION_PICK,
    getSettings, setBpEnabled, setExtraSlot,
    buildPhases, createDraft, currentPhase, legalCards, applyAction, result,
    serialize, restore,
    openLocalDraft, closeLocalDraft, getLastResult
  });
  root.S7VersusBP = api;

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", bindUI, { once: true });
    else bindUI();
  }
})(typeof window !== "undefined" ? window : globalThis);
