"use strict";

// -----------------------------------------------------------------------------
// Versus Feature Profiles
// Same entity id, isolated mode-specific traits. This module MUST NOT mutate
// PLANT_RULES / PLANTS / ZOMBIES. The normal S7 rules remain the base source.
// -----------------------------------------------------------------------------

(function initS7VersusFeatureProfiles(root) {
  const freezeTree = value => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(freezeTree);
    return value;
  };

  const PLANT_COOLDOWNS = {
    wallnut: [12, 3, "defense"], tallnut: [15, 5, "defense"], cactus: [9.5, 2, "normal"], explodenut: [25.5, 12, "burst"],
    chomper: [15, 5, "control"], garlic: [14, 5, "control"], spikerock: [16.5, 4, "defense"], snowpea: [11, 3, "normal"],
    repeater: [10.5, 3, "normal"], puff: [8.5, 0, "normal"], scaredy: [11.5, 2, "normal"], squash: [33, 10, "burst"],
    threepeater: [18.5, 4, "normal"], seashroom: [9, 2, "normal"], splitpea: [10, 3, "normal"], cabbage: [10, 2, "normal"],
    cattail: [28.5, 8, "global"], firelotus: [24, 7, "control"], reverseRepeater: [9, 3, "normal"], ghost: [16, 5, "control"],
    sniper: [23.5, 7, "global"], sunflower: [13, 0, "economy"], sunshroom: [11, 0, "economy"], hypno: [22, 8, "control"],
    iceshroom: [25.5, 20, "burst"], kelp: [22, 8, "control"], torchwood: [16.5, 5, "support"], plantern: [14, 4, "support"],
    blover: [16, 7, "control"], magnet: [15.5, 5, "support"], kernel: [11, 3, "normal"], umbrella: [16, 5, "support"],
    marigold: [14, 4, "support"], goldmagnet: [19.5, 6, "support"], timegrass: [27.5, 12, "control"], barley: [18.5, 6, "support"],
    starfruit: [19.5, 5, "global"], fume: [9, 3, "normal"], gloom: [19, 7, "control"], potato: [33, 10, "burst"],
    melon: [17.5, 5, "normal"], gatling: [29.5, 8, "carry"], winter: [23.5, 10, "carry"],
    twinSunflower: [24, 6, "economy"], cherrybomb: [50, 30, "ash"], jalapeno: [50, 35, "ash"], doomshroom: [50, 45, "ash"]
  };


  const PLANT_RESOURCE_COSTS = Object.freeze({
    wallnut:25, tallnut:25, cactus:180, explodenut:150, chomper:100, garlic:90, spikerock:125, snowpea:200,
    repeater:200, puff:195, scaredy:135, squash:285, threepeater:645, seashroom:165, splitpea:105, cabbage:210,
    cattail:400, firelotus:345, reverseRepeater:125, ghost:200, sniper:360, sunflower:135, sunshroom:135, hypno:210,
    iceshroom:200, kelp:180, torchwood:105, plantern:75, blover:45, magnet:120, kernel:200, umbrella:75,
    marigold:75, goldmagnet:150, timegrass:175, barley:285, starfruit:350, fume:200, gloom:200, potato:405,
    melon:375, gatling:450, winter:200, twinSunflower:250, cherrybomb:150, jalapeno:125, doomshroom:200
  });

  const ZOMBIE_RESOURCE_COSTS = Object.freeze({
    blind:135, normal:55, flag:45, cone:100, peaz:100, snorkel:50, pole:100,
    bucket:120, balloon:100, dolphin:100, squashz:150, yeti:125, newspaper:165, screen:165, digger:100, pogo:75,
    jack:165, bungee:150, jalapenoz:165, wallz:165, football:165, ladder:180, gatlingz:210,
    dancing:200, zomboni:315, catapult:210, immortal:285, bobsledSled:360, tallz:250, garg:300, giga:550
  });

  const plantCards = {};
  Object.entries(PLANT_COOLDOWNS).forEach(([id, v]) => {
    plantCards[id] = {
      resourceCost: PLANT_RESOURCE_COSTS[id] ?? 100,
      resourceType: "sun",
      cooldownSeconds: v[0],
      openingCooldownSeconds: v[1],
      cooldownGroup: v[2]
    };
  });

  // Zombie cooldowns are resolved from actual S7 zombie metadata, then these
  // explicit overrides pin the exceptional cards. This keeps future zombie
  // additions safe without silently giving them zero cooldown.
  const zombieOverrides = {
    blind: [10.5, 2, "normal"], normal: [5, 0, "normal"], flag: [8.5, 0, "support"], cone: [8.5, 1, "armor"],
    bucket: [14, 3, "armor"], newspaper: [12, 2, "normal"], screen: [15, 3, "armor"], football: [18, 5, "rush"],
    pole: [15, 3, "rush"], snorkel: [15, 4, "infiltration"], dolphin: [15.5, 4, "infiltration"], balloon: [17, 6, "infiltration"],
    miner: [20, 7, "infiltration"], pogo: [14.5, 5, "infiltration"], ladder: [18, 5, "support"], bungee: [26.5, 10, "infiltration"],
    dancing: [24, 8, "summon"], bobsledSled: [32, 10, "heavy"], zomboni: [31.5, 10, "heavy"], catapult: [28, 10, "heavy"],
    peaz: [16, 3, "ranged"], gatlingz: [24, 8, "ranged"], squashz: [20, 6, "rush"], jalapenoz: [30, 12, "burst"],
    immortal: [29.5, 9, "heavy"], garg: [50, 18, "heavy"], giga: [50, 30, "heavy"]
  };

  function derivedZombieCooldown(type) {
    const zombieRegistry = typeof ZOMBIES !== "undefined" ? ZOMBIES : (root.ZOMBIES || {});
    const z = zombieRegistry[type] || zombieRegistry.normal || {};
    const threat = Math.max(1, Number(z.threat) || 1);
    let cd = 5 + Math.sqrt(threat) * 3;
    let group = "normal";
    if (z.vehicle) { cd += 8; group = "heavy"; }
    if (z.shooter) { cd += Math.min(8, Number(z.shooter) * 1.5); group = "ranged"; }
    if (z.submerge) { cd += 3; group = "infiltration"; }
    if (type === "garg" || type === "giga") group = "heavy";
    cd = Math.max(5, Math.min(60, Math.round(cd)));
    return { cooldownSeconds: cd, openingCooldownSeconds: Math.max(0, Math.round((cd - 5) * .35)), cooldownGroup: group };
  }

  const zombieCards = {};
  const zombieRegistry = typeof ZOMBIES !== "undefined" ? ZOMBIES : (root.ZOMBIES || {});
  const zombieKeySource = typeof ZOMBIE_KEYS !== "undefined" ? ZOMBIE_KEYS : root.ZOMBIE_KEYS;
  const zombieKeys = Array.isArray(zombieKeySource) ? zombieKeySource : Object.keys(zombieRegistry);
  ["blind", ...zombieKeys].forEach(id => {
    const tuple = zombieOverrides[id];
    const cd = tuple ? {
      cooldownSeconds: tuple[0], openingCooldownSeconds: tuple[1], cooldownGroup: tuple[2]
    } : derivedZombieCooldown(id);
    zombieCards[id] = {
      resourceCost: ZOMBIE_RESOURCE_COSTS[id] ?? Math.max(25, Math.round(((Number(zombieRegistry[id]?.threat) || 1) * 35) / 25) * 25),
      resourceType: "brain",
      ...cd
    };
  });

  // Single source of truth for Versus rules. All modules MUST reference this.
  const VERSUS_RULES = Object.freeze({
    startResource: 75,
    drawAtSeconds: 2400,
    suddenDeathAtSeconds: 300,
    skySupplyIntervalSeconds: 12,
    skySupplyAmount: 25,
    blindBoxSummonInterval: 30,
    targetCount: 5,
    targetKillsToWin: 3,
    targetX: 9.0,
    targetHp: 200,
    targetDamageStageThresholds: Object.freeze([60, 100, 160]),
    plantColumns: Object.freeze([0, 5]),
    zombieColumns: Object.freeze([6, 8]),
    freePlantCores: Object.freeze([{row:1,col:0},{row:3,col:0}]),
    freeZombieCores: Object.freeze([{row:1,x:8.5},{row:3,x:8.5}]),
    gravestoneHp: 800,
    gravestoneCost: 50,
    gravestoneCooldownSeconds: 12,
    twinCost: 100,
    twinCooldownSeconds: 8,
    twinProductionAmount: 50,
    twinProductionPeriodSeconds: 15,
    twinBrightenSeconds: 1.0,
    mowerHomeX: -0.5,
    mowerTriggerX: -0.35,
    houseEntryX: -0.5,
    bp6: "B2-P3-B2-P2",
    bp7: "B2-P3-B2-P3"
  });

  const versus = freezeTree({
    id: "versus",
    version: "0.1.0-balance-lab",
    baseProfile: "s7@1.7.8",
    isolated: true,
    draft: {
      sequenceVersion: "s7-versus-bp-b2p3b2p23-v2",
      defaultCardSlots: 6,
      extraCardSlots: 7,
      reservedEconomySlots: 1,
      // The BP sequence selects 5 combat cards by default (6 with the extra
      // slot). One fixed economy core is outside BP on each side. Sunflower
      // and Sun-shroom remain ordinary combat/support cards and ARE draftable.
      plantEconomyCoreId: "twinSunflower",
      zombieEconomyCoreId: "zombieGravestone",
      zombieNonDraftableIds: [
        "imp", "backup", "bobsled", "ducky",
        "bombdoor", "blackolive", "polecmd", "warflag", "tacticflag"
      ]
    },
    economy: {
      startingSun: 75,
      startingBrain: 75,
      plantCore: { id: "twinSunflower", resourceCost: 250, hp: 500, productionAmount: 50, productionPeriodSeconds: 15, pureEconomy: true },
      zombieCore: { id: "zombieGravestone", resourceCost: 50, hp: 400, productionAmount: 25, productionPeriodSeconds: 10, pureEconomy: true }
    },
    cardCooldown: {
      plants: plantCards,
      zombies: zombieCards,
      groups: {
        // Shared lockouts are deliberately short. They stop instant chain-spam
        // without replacing each card's own cooldown.
        plant: {
          economy: 3.0,
          ash: 8.0,
          burst: 3.0,
          global: 2.0,
          carry: 2.0,
          defense: 1.0,
          control: 1.0,
          support: 0.5,
          normal: 0
        },
        zombie: {
          heavy: 7.5,
          infiltration: 2.0,
          summon: 3.0,
          burst: 4.0,
          rush: 1.0,
          armor: 0.5,
          ranged: 1.0,
          support: 0.5,
          normal: 0
        }
      },
      suddenDeath: {
        startsAtSeconds: 300,
        // Plants receive only a modest late-game acceleration. Zombies receive
        // more acceleration because the Versus design intentionally uses time
        // as the zombie side's vertical growth resource.
        plantFloorMultiplier: 0.85,
        zombieFloorMultiplier: 0.70,
        rampSeconds: 300
      }
    }
  });

  const profiles = freezeTree({
    "base:s7@1.7.8": { id: "s7", version: "1.7.8", isolated: true },
    // Historical alias retained so older Versus telemetry/replays can still be inspected.
    "base:s7@1.7.6": { id: "s7", version: "1.7.6", isolated: true, legacy: true },
    "profile:versus@0.1.0-balance-lab": versus
  });

  function getProfile(id = "versus") {
    if (id === "versus" || id === "profile:versus@0.1.0-balance-lab") return versus;
    if (id === "s7" || id === "base:s7@1.7.8") return profiles["base:s7@1.7.8"];
    if (id === "base:s7@1.7.6") return profiles["base:s7@1.7.6"];
    return null;
  }

  function assertIsolation() {
    // The profile contains only deltas/metadata. It must never point at or
    // mutate the canonical S7 registries.
    if (versus.plantRules || versus.zombieRules || versus.PLANTS || versus.ZOMBIES) {
      throw new Error("Versus profile illegally owns canonical S7 registries");
    }
    return true;
  }

  const api = Object.freeze({ profiles, getProfile, assertIsolation });
  root.S7FeatureProfiles = api;
  root.S7_VERSUS_PROFILE = versus;
  root.S7_VERSUS_RULES = VERSUS_RULES;
})(typeof window !== "undefined" ? window : globalThis);
