"use strict";

// -----------------------------------------------------------------------------
// S7 Versus Balance Telemetry
// Records both No-BP and BP matches, but tags them so strength estimation can
// ONLY use the canonical No-BP 6-slot alternating-pick format.
// -----------------------------------------------------------------------------

(function initS7VersusBalanceTelemetry(root) {
  const STORAGE_KEY = "s7_versus_balance_telemetry_v1";
  const MAX_LOCAL_MATCHES = 500;

  function nowIso() { return new Date().toISOString(); }
  function profile() { return root.S7FeatureProfiles?.getProfile?.("versus") || root.S7_VERSUS_PROFILE || null; }
  function classifier(meta) {
    return root.S7VersusBalanceFormat?.telemetryClass?.(meta)
      || (meta?.bpEnabled ? "bp_resilience" : "excluded_other_format");
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function configSnapshot() {
    const p = profile();
    const cards = (table) => Object.fromEntries(Object.entries(table || {}).map(([id,v]) => [id, {
      resourceCost: Number(v.resourceCost) || 0,
      resourceType: v.resourceType || "",
      cooldownSeconds: Number(v.cooldownSeconds) || 0,
      openingCooldownSeconds: Number(v.openingCooldownSeconds) || 0,
      cooldownGroup: v.cooldownGroup || "normal"
    }]));
    return {
      profileVersion: p?.version || "unknown",
      plantEconomyCore: clone(p?.economy?.plantCore || { id:"twinSunflower" }),
      zombieEconomyCore: clone(p?.economy?.zombieCore || { id:"zombieGravestone" }),
      plants: cards(p?.cardCooldown?.plants),
      zombies: cards(p?.cardCooldown?.zombies)
    };
  }

  function normalizeFormat(meta = {}) {
    const canonical = root.S7VersusBalanceFormat?.FORMAT_ID;
    const out = {
      formatId: String(meta.formatId || ""),
      bpEnabled: meta.bpEnabled === true,
      totalSlots: Number(meta.totalSlots) || 6,
      combatSlots: Number(meta.combatSlots ?? meta.draftedCombatSlots) || 5,
      firstPicker: String(meta.firstPicker || "zombie"),
      alternating: meta.alternating !== false,
      extraSlot: meta.extraSlot === true
    };
    if (!out.bpEnabled && !out.extraSlot && out.totalSlots === 6 && out.combatSlots === 5 && out.firstPicker === "zombie" && out.alternating && !out.formatId) {
      out.formatId = canonical || "versus-nobp-6slot-zfirst-v1";
    }
    out.telemetryClass = classifier(out);
    return out;
  }

  function emptyCardStat() {
    return { uses:0, resourceSpent:0, damage:0, damageTaken:0, controlSeconds:0, objectiveDamage:0, housePressure:0, kills:0, deaths:0, xpGenerated:0 };
  }

  function createMatch(options = {}) {
    const meta = normalizeFormat(options.meta || options.format || {});
    const draft = options.draft || {};
    return {
      schemaVersion: 1,
      matchId: String(options.matchId || `vs-${Date.now()}-${Math.random().toString(36).slice(2,9)}`),
      startedAt: nowIso(),
      finishedAt: null,
      meta,
      draft: {
        plantEconomyCore: String(draft.plantEconomyCore || "twinSunflower"),
        zombieEconomyCore: String(draft.zombieEconomyCore || "zombieGravestone"),
        plantCards: [...(draft.plantCards || [])],
        zombieCards: [...(draft.zombieCards || [])],
        plantPickOrder: [...(draft.plantPickOrder || draft.plantCards || [])],
        zombiePickOrder: [...(draft.zombiePickOrder || draft.zombieCards || [])],
        plantBans: [...(draft.plantBans || [])],
        zombieBans: [...(draft.zombieBans || [])]
      },
      config: configSnapshot(),
      cardStats: { plant:{}, zombie:{} },
      economy: { plant:{generated:0,spent:0,peak:0}, zombie:{generated:0,spent:0,peak:0} },
      events: [],
      result: null
    };
  }

  function cardStat(match, side, cardId) {
    const table = match.cardStats[side] || (match.cardStats[side] = {});
    return table[cardId] || (table[cardId] = emptyCardStat());
  }

  function recordCardUse(match, side, cardId, data = {}) {
    const s = cardStat(match, side, cardId);
    s.uses += 1;
    s.resourceSpent += Math.max(0, Number(data.resourceCost) || 0);
    if (data.time != null) match.events.push({ type:"use", time:Number(data.time)||0, side, cardId, lane:data.lane ?? null });
    return s;
  }

  function recordCardEffect(match, side, cardId, delta = {}) {
    const s = cardStat(match, side, cardId);
    for (const k of ["damage","damageTaken","controlSeconds","objectiveDamage","housePressure","kills","deaths","xpGenerated"]) {
      s[k] += Number(delta[k]) || 0;
    }
    return s;
  }

  function recordEconomy(match, side, data = {}) {
    const e = match.economy[side];
    if (!e) return;
    e.generated += Number(data.generated) || 0;
    e.spent += Number(data.spent) || 0;
    if (data.current != null) e.peak = Math.max(e.peak, Number(data.current) || 0);
  }

  function finishMatch(match, result = {}) {
    match.finishedAt = nowIso();
    match.result = {
      winner: result.winner === "plant" ? "plant" : "zombie",
      reason: String(result.reason || "unknown"),
      durationSeconds: Math.max(0, Number(result.durationSeconds) || 0),
      targetsKilled: Math.max(0, Number(result.targetsKilled) || 0),
      houseBreaches: Math.max(0, Number(result.houseBreaches) || 0)
    };
    return match;
  }

  function loadLocal() {
    try { const x = JSON.parse(root.localStorage?.getItem?.(STORAGE_KEY) || "[]"); return Array.isArray(x) ? x : []; } catch (_) { return []; }
  }
  function saveLocal(match) {
    try {
      const rows = loadLocal();
      rows.push(clone(match));
      if (rows.length > MAX_LOCAL_MATCHES) rows.splice(0, rows.length - MAX_LOCAL_MATCHES);
      root.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(rows));
      return true;
    } catch (_) { return false; }
  }
  function clearLocal() { try { root.localStorage?.removeItem?.(STORAGE_KEY); } catch (_) {} }
  function exportJsonl(rows = loadLocal()) { return rows.map(x => JSON.stringify(x)).join("\n"); }

  root.S7VersusBalanceTelemetry = Object.freeze({
    STORAGE_KEY, createMatch, recordCardUse, recordCardEffect, recordEconomy, finishMatch,
    configSnapshot, normalizeFormat, loadLocal, saveLocal, clearLocal, exportJsonl
  });
})(typeof window !== "undefined" ? window : globalThis);
