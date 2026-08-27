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
    wallnut: [12, 3, "defense"], tallnut: [18, 5, "defense"], cactus: [8, 2, "normal"], explodenut: [32, 12, "burst"],
    chomper: [18, 5, "control"], garlic: [18, 5, "control"], spikerock: [16, 4, "defense"], snowpea: [10, 3, "normal"],
    repeater: [10, 3, "normal"], puff: [5, 0, "normal"], scaredy: [8, 2, "normal"], squash: [30, 10, "burst"],
    threepeater: [14, 4, "normal"], seashroom: [8, 2, "normal"], splitpea: [10, 3, "normal"], cabbage: [9, 2, "normal"],
    cattail: [24, 8, "global"], firelotus: [22, 7, "control"], reverseRepeater: [10, 3, "normal"], ghost: [18, 5, "control"],
    sniper: [20, 7, "global"], sunflower: [12, 0, "economy"], sunshroom: [10, 0, "economy"], hypno: [26, 8, "control"],
    iceshroom: [42, 20, "burst"], kelp: [26, 8, "control"], torchwood: [18, 5, "support"], plantern: [15, 4, "support"],
    blover: [24, 7, "control"], magnet: [18, 5, "support"], kernel: [12, 3, "normal"], umbrella: [18, 5, "support"],
    marigold: [15, 4, "support"], goldmagnet: [22, 6, "support"], timegrass: [32, 12, "control"], barley: [20, 6, "support"],
    starfruit: [16, 5, "global"], fume: [10, 3, "normal"], gloom: [22, 7, "control"], potato: [30, 10, "burst"],
    melon: [16, 5, "normal"], gatling: [24, 8, "carry"], winter: [28, 10, "carry"],
    twinSunflower: [24, 6, "economy"], cherrybomb: [45, 30, "ash"], jalapeno: [55, 35, "ash"], doomshroom: [75, 45, "ash"]
  };


  const PLANT_RESOURCE_COSTS = Object.freeze({
    wallnut:150, tallnut:175, cactus:100, explodenut:225, chomper:175, garlic:125, spikerock:150, snowpea:175,
    repeater:150, puff:50, scaredy:75, squash:175, threepeater:250, seashroom:100, splitpea:125, cabbage:150,
    cattail:250, firelotus:250, reverseRepeater:150, ghost:225, sniper:225, sunflower:150, sunshroom:150, hypno:250,
    iceshroom:350, kelp:250, torchwood:150, plantern:125, blover:125, magnet:175, kernel:225, umbrella:150,
    marigold:125, goldmagnet:200, timegrass:225, barley:300, starfruit:225, fume:175, gloom:275, potato:250,
    melon:300, gatling:300, winter:325, twinSunflower:250, cherrybomb:275, jalapeno:300, doomshroom:375
  });

  const ZOMBIE_RESOURCE_COSTS = Object.freeze({
    blind:100, normal:25, flag:50, cone:50, peaz:75, snorkel:100, pole:100,
    bucket:125, balloon:125, dolphin:125, squashz:125, yeti:125, newspaper:150, screen:150, digger:150, pogo:150,
    jack:150, bungee:150, jalapenoz:150, wallz:150, football:175, ladder:175, gatlingz:175,
    dancing:200, zomboni:200, catapult:200, immortal:200, bobsledSled:225, tallz:225, garg:300, giga:500
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
    blind: [10, 2, "normal"], normal: [5, 0, "normal"], flag: [8, 0, "support"], cone: [8, 1, "armor"],
    bucket: [13, 3, "armor"], newspaper: [12, 2, "normal"], screen: [14, 3, "armor"], football: [18, 5, "rush"],
    pole: [14, 3, "rush"], snorkel: [15, 4, "infiltration"], dolphin: [16, 4, "infiltration"], balloon: [18, 6, "infiltration"],
    miner: [20, 7, "infiltration"], pogo: [18, 5, "infiltration"], ladder: [18, 5, "support"], bungee: [28, 10, "infiltration"],
    dancing: [24, 8, "summon"], bobsledSled: [28, 10, "heavy"], zomboni: [28, 10, "heavy"], catapult: [28, 10, "heavy"],
    peaz: [14, 3, "ranged"], gatlingz: [24, 8, "ranged"], squashz: [20, 6, "rush"], jalapenoz: [30, 12, "burst"],
    immortal: [26, 9, "heavy"], garg: [40, 18, "heavy"], giga: [60, 30, "heavy"]
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
      startingSun: 150,
      startingBrain: 150,
      plantCore: { id: "twinSunflower", resourceCost: 250, hp: 500, productionAmount: 25, productionPeriodSeconds: 10, pureEconomy: true },
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
})(typeof window !== "undefined" ? window : globalThis);
