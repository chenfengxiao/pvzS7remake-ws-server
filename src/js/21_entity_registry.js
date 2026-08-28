"use strict";

    // -----------------------------------------------------------------------------

    // 工厂/僵尸注册表 / armor

    // [原源码行 2193] FACTORIES: armor, zombies, plants, game state

    // -----------------------------------------------------------------------------

    // 所有原本具有临界段的僵尸统一按本体总血量重新划分：
    // 临界值 = floor(本体总血量 / 3)，非临界段 = 本体总血量 - 临界值。
    // 冰车与投篮车是明确例外：正常本体总血量下固定199点临界值，
    // 本体总血量保持不变，非临界段 = 本体总血量 - 199。
    const S7_FIXED_CRITICAL_HP_BY_TYPE = Object.freeze({ zomboni: 199, catapult: 199 });

    function s7CriticalHpForBody(totalBodyHp) {
      const total = Math.max(1, Math.floor(finiteNumber(totalBodyHp, 1)));
      return Math.max(1, Math.floor(total / 3))
    }

    function s7CriticalHpForZombie(z, totalBodyHp) {
      const total = Math.max(1, Math.floor(finiteNumber(totalBodyHp, 1)));
      const fixed = finiteNumber(S7_FIXED_CRITICAL_HP_BY_TYPE[z?.type], 0);
      // 随机血量档可能把极低血量投篮车压到200以下；临界值绝不能超过当前总血量，
      // 因此只在这种异常低总量边界下收敛到 total-1，正常实例始终严格为199。
      if (fixed > 0) return Math.max(1, Math.min(fixed, total - 1));
      return s7CriticalHpForBody(total)
    }

    function s7RefreshZombieCriticalSplit(z) {
      if (!z || z.noCrit) return 0;
      const usesSplit = z.s7UsesCriticalSplit != null ? !!z.s7UsesCriticalSplit : finiteNumber(z.crit, 0) > 0;
      if (!usesSplit) return 0;
      z.s7UsesCriticalSplit = true;
      z.crit = s7CriticalHpForZombie(z, finiteNumber(z.maxHp, z.hp || 1));
      return z.crit
    }

    function armor(name, hp, cls, metal = false) {
      return {
        name: name,
        hp: hp,
        max: hp,
        cls: cls,
        metal: metal
      }
    }
    const ZOMBIES = {
      normal: {
        name: "普通僵尸",
        emoji: "🧟",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 1
      },
      flag: {
        name: "旗帜僵尸",
        emoji: "🚩",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 1.1
      },
      ducky: {
        name: "鸭子僵尸",
        emoji: "🦆",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 1,
        shooter: 1
      },
      snorkel: {
        name: "潜水僵尸",
        emoji: "🤿",
        hp: 270,
        crit: 90,
        speed: SPEEDS.snorkel,
        threat: 2,
        submerge: true
      },
      bobsled: {
        name: "雪橇小队单体",
        emoji: "🛷",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 1
      },
      bobsledSled: {
        name: "雪橇",
        emoji: "🛷🛷🛷🛷",
        hp: 400,
        crit: 133,
        speed: SPEEDS.football,
        threat: 8,
        vehicle: true,
        sled: true,
        riders: 4
      },
      imp: {
        name: "小鬼僵尸",
        emoji: "👹",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 2
      },
      backup: {
        name: "伴舞僵尸",
        emoji: "💃",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 1
      },
      peaz: {
        name: "豌豆射手僵尸",
        emoji: "🌱🧟",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 2,
        shooter: 1
      },
      gatlingz: {
        name: "机枪射手僵尸",
        emoji: "🔫🧟",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 4,
        shooter: 4
      },
      squashz: {
        name: "窝瓜僵尸",
        emoji: "🟩🧟",
        hp: 405,
        crit: 135,
        speed: SPEEDS.football,
        threat: 3,
        squash: true
      },
      jalapenoz: {
        name: "火爆辣椒僵尸",
        emoji: "🌶️🧟",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 5,
        jalapeno: true,
        desc: "爆炸范围固定为本行1×4（所在格及左侧3格）。"
      },
      cone: {
        name: "路障僵尸",
        emoji: "🚧",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 2,
        armors: [armor("路障", 300, 1, false)]
      },
      bucket: {
        name: "铁桶僵尸",
        emoji: "🪣",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 4,
        armors: [armor("铁桶", 1100, 1, true)]
      },
      newspaper: {
        name: "读报僵尸",
        emoji: "📰",
        hp: 600,
        crit: 200,
        speed: SPEEDS.ordinary,
        threat: 3,
        armors: [armor("报纸", 1200, 1, false)],
        enrage: true
      },
      screen: {
        name: "铁门僵尸",
        emoji: "🚪",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary,
        threat: 4,
        armors: [armor("铁门", 1320, 2, true)]
      },
      football: {
        name: "橄榄球僵尸",
        emoji: "🏈",
        hp: 340,
        crit: 113,
        speed: SPEEDS.football,
        threat: 5,
        armors: [armor("橄榄球帽", 1400, 1, true)]
      },
      digger: {
        name: "矿工僵尸",
        emoji: "⛏️",
        hp: 270,
        crit: 90,
        speed: SPEEDS.diggerUnder,
        threat: 5,
        armors: [],
        digger: true,
        hasPick: true
      },
      pogo: {
        name: "跳跳僵尸",
        emoji: "🦘",
        hp: 720,
        crit: 240,
        speed: SPEEDS.pogo,
        threat: 3,
        armors: [armor("跳跳杆", 70, 1, true)],
        jump: true
      },
      pole: {
        name: "撑杆僵尸",
        emoji: "🏃",
        hp: 340,
        crit: 113,
        speed: SPEEDS.pole,
        threat: 3,
        pole: true,
        jump: true
      },
      jack: {
        name: "小丑僵尸",
        emoji: "🤡",
        hp: 340,
        crit: 113,
        speed: SPEEDS.jack,
        threat: 4,
        jack: true
      },
      ladder: {
        name: "梯子僵尸",
        emoji: "🪜",
        hp: 340,
        crit: 113,
        speed: SPEEDS.ladder,
        threat: 4,
        armors: [armor("扶梯", 1100, 2, true)],
        ladder: true
      },
      dolphin: {
        name: "海豚僵尸",
        emoji: "🐬",
        hp: 340,
        crit: 113,
        speed: SPEEDS.dolphin,
        threat: 3,
        dolphin: true,
        jump: true
      },
      dancer: {
        name: "舞王僵尸",
        emoji: "🕺",
        hp: 340,
        crit: 113,
        speed: SPEEDS.dancer,
        threat: 5,
        dancer: true
      },
      balloon: {
        name: "气球僵尸",
        emoji: "🎈",
        hp: 270,
        crit: 90,
        speed: SPEEDS.balloon,
        threat: 3,
        air: true
      },
      wallz: {
        name: "坚果僵尸",
        emoji: "🥜🧟",
        hp: 200,
        crit: 66,
        speed: SPEEDS.ordinary,
        threat: 5,
        armors: [armor("坚果", 1200, 1, false)]
      },
      tallz: {
        name: "高坚果僵尸",
        emoji: "🧱🧟",
        hp: 200,
        crit: 66,
        speed: SPEEDS.ordinary,
        threat: 8,
        armors: [armor("高坚果", 2200, 1, false)]
      },
      zomboni: {
        name: "冰车僵尸",
        emoji: "🧊🚗",
        hp: 1350,
        crit: 199,
        speed: SPEEDS.zomboni1,
        threat: 7,
        vehicle: true
      },
      yeti: {
        name: "雪人僵尸",
        emoji: "❄️🧟",
        hp: 570,
        crit: 190,
        speed: SPEEDS.ordinary,
        threat: 6,
        flee: true,
        s7Desc: "380非临界本体+190临界（本体总血量570）；免疫寒意；受直接植物攻击时令伤害来源减速1.5秒并掉头逃跑；宝藏雪人出场减速本行随机主植物7.5秒；推进指令使每次受击额外减速本行另一主植物1.5秒。"
      },
      catapult: {
        name: "投篮车僵尸",
        emoji: "🏀🚗",
        hp: 650,
        crit: 199,
        speed: 0,
        threat: 6,
        catapult: true,
        vehicle: true
      },
      bungee: {
        name: "蹦极僵尸",
        emoji: "🪂",
        hp: 450,
        crit: 0,
        noCrit: true,
        speed: 0,
        threat: 5,
        air: true,
        bungee: true
      },
      garg: {
        name: "巨人僵尸",
        emoji: "🦍",
        hp: 3e3,
        crit: 0,
        noCrit: true,
        speed: SPEEDS.garg,
        threat: 10,
        garg: true
      },
      giga: {
        name: "红眼巨人",
        emoji: "🔴🦍",
        hp: 6e3,
        crit: 0,
        noCrit: true,
        speed: SPEEDS.gargSlow,
        threat: 18,
        garg: true,
        giga: true
      },
      immortal: {
        name: "不朽僵尸",
        emoji: "🪦🧟",
        hp: 600,
        crit: 200,
        speed: SPEEDS.ordinary,
        threat: 3,
        immortal: true
      },
      bombdoor: {
        name: "防爆门",
        emoji: "🛡️🚪",
        hp: 270,
        crit: 90,
        speed: SPEEDS.ordinary * 1.5,
        threat: 8,
        command: true,
        category: "push",
        armors: [armor("防爆铁门", 1100, 2, true), armor("防爆头盔", 1100, 1, true)]
      },
      blackolive: {
        name: "黑橄榄",
        emoji: "⚫🏈",
        hp: 1600,
        crit: 0,
        noCrit: true,
        speed: SPEEDS.football,
        threat: 9,
        command: true,
        category: "break",
        // v10.3：黑大爷只有一个1600HP生命池。头盔只保留在emoji造型中，
        // 不再额外生成一层1600HP防具，否则血条掉到一半后会像“第二条命”。
        armors: [],
        football: true
      },
      polecmd: {
        name: "撑杆司令",
        emoji: "🏃📣",
        hp: 1e3,
        crit: 333,
        speed: SPEEDS.pole,
        threat: 8,
        command: true,
        category: "raid",
        pole: true,
        jump: true,
        desc: "固定从底线入场；原地踱步4秒后冲刺。冲刺初速先减半，随后速度每秒×1.1并封顶；跳跃距离由160px递增至最多200px。"
      },
      warflag: {
        name: "战术旗僵尸",
        emoji: "🏳️🪂",
        hp: 800,
        crit: 266,
        speed: SPEEDS.ordinary / 5,
        threat: 7,
        command: true,
        category: "ranged",
        air: true
      },
      tacticflag: {
        name: "督战旗僵尸",
        emoji: "🚩📦",
        hp: 800,
        crit: 266,
        speed: SPEEDS.ordinary,
        threat: 9,
        command: true,
        category: "summon",
        summoner: true
      }
    };
    const S7_YETI_RULE = Object.freeze({
      bodyHp: 380,
      criticalHp: 190,
      hitSlowSeconds: 1.5,
      treasureSpawnSlowSeconds: 7.5,
      pushCommandVariantChancePerUnit: .08,
      fleeSpeed: SPEEDS.flee,
      fleeExitX: COLS + 1
    });
    const S7_COMMAND_ZOMBIES = ["bombdoor", "blackolive", "polecmd", "warflag", "tacticflag"];
    const PLANT_SHORT_NAMES = Object.freeze({
      wallnut: "坚",
      tallnut: "高",
      cactus: "仙",
      explodenut: "爆",
      chomper: "嘴",
      garlic: "蒜",
      spikerock: "刺",
      snowpea: "寒",
      repeater: "双",
      puff: "小",
      scaredy: "胆",
      squash: "窝",
      threepeater: "三",
      seashroom: "海",
      splitpea: "裂",
      cabbage: "卷",
      cattail: "猫",
      firelotus: "飘",
      reverseRepeater: "反",
      ghost: "幽",
      sniper: "狙",
      sunflower: "葵",
      sunshroom: "阳",
      hypno: "魅",
      iceshroom: "川",
      kelp: "缠",
      torchwood: "火",
      plantern: "灯",
      blover: "叶",
      magnet: "磁",
      kernel: "玉",
      umbrella: "伞",
      marigold: "花",
      goldmagnet: "吸",
      timegrass: "逆",
      barley: "仿",
      starfruit: "星",
      fume: "喷",
      gloom: "忧",
      potato: "雷",
      melon: "瓜",
      gatling: "机",
      winter: "冰"
    });
    const ZOMBIE_SHORT_NAMES = Object.freeze({
      blind: "盲",
      normal: "普",
      flag: "旗",
      ducky: "鸭",
      snorkel: "潜",
      bobsled: "橇",
      bobsledSled: "橇",
      imp: "鬼",
      backup: "伴",
      peaz: "豌",
      gatlingz: "机",
      squashz: "窝",
      jalapenoz: "辣",
      cone: "路",
      bucket: "桶",
      newspaper: "报",
      screen: "门",
      football: "橄",
      digger: "矿",
      pogo: "跳",
      pole: "杆",
      jack: "丑",
      ladder: "梯",
      dolphin: "豚",
      dancer: "舞",
      balloon: "气",
      wallz: "坚",
      tallz: "高",
      zomboni: "车",
      yeti: "雪",
      catapult: "投",
      bungee: "偷",
      garg: "白",
      giga: "红",
      immortal: "墓"
    });
    const COMMAND_ZOMBIE_TEXT_NAMES = Object.freeze({
      bombdoor: "防爆门",
      blackolive: "黑橄榄",
      polecmd: "司令",
      warflag: "战术旗",
      tacticflag: "督战旗"
    });

    // -----------------------------------------------------------------------------

    // 工厂/僵尸注册表 / plantShortName

    // [原源码行 2197] CONFIG: zombie registry

    // [原源码行 2511] S7 扩展与五类指令僵尸同样属于唯一僵尸注册表。

    // [原源码行 2600] “文字”显示使用的唯一简称表。该功能只参与 Canvas 绘制，

    // [原源码行 2601] 不写入战斗状态，也不改变索敌、伤害、速度、CD 或随机数。

    // -----------------------------------------------------------------------------

    function plantShortName(p) {
      if (p?.versusCore === "twin") return "向";
      return PLANT_SHORT_NAMES[p?.key] || PLANTS[p?.key]?.name?.slice(0, 1) || "植"
    }

    function zombieShortName(z) {
      if (!z) return "僵";
      if (z.versusStatic === "grave") return "碑";
      if (z.versusObjective) return "靶";
      if (z.s7?.command || S7_COMMAND_ZOMBIES.includes(z.type)) return COMMAND_ZOMBIE_TEXT_NAMES[z.type] || z.name ||
        "指令";
      const base = ZOMBIE_SHORT_NAMES[z.type] || ZOMBIES[z.type]?.name?.slice(0, 1) || "僵";
      if (z.s7?.variant && z.type === "immortal") return "亡墓";
      if (z.s7?.variant && z.type === "bucket") return "疯桶";
      return z.s7?.variant ? "变" + base : base
    }

    const _entityBadgeCanvasCache = new Map();
    const _entityBadgeMetricsCache = new Map();
    let _entityBadgeMeasureContext = null;
    let _entityBadgeBuildFrame = -1;
    let _entityBadgeBuildCount = 0;

    function s7EntityBadgeMetrics(label, cell) {
      const cellKey = Math.round(cell * 4) / 4;
      const key = `${label}|${cellKey}`;
      const cached = _entityBadgeMetricsCache.get(key);
      if (cached) return cached;
      const n = Array.from(label).length;
      const scale = n >= 4 ? .105 : n === 3 ? .125 : n === 2 ? .15 : .19;
      const fontSize = Math.max(9, cell * scale);
      const font = `900 ${fontSize}px "Microsoft YaHei", sans-serif`;
      if (!_entityBadgeMeasureContext && typeof document !== "undefined") {
        _entityBadgeMeasureContext = document.createElement("canvas").getContext("2d")
      }
      if (_entityBadgeMeasureContext) _entityBadgeMeasureContext.font = font;
      const measuredWidth = _entityBadgeMeasureContext ? _entityBadgeMeasureContext.measureText(label).width : cell * .2 * n;
      const lineWidth = Math.max(2, cell * .035);
      const metrics = {
        cellKey,
        scale,
        font,
        lineWidth,
        width: Math.max(cell * .25, measuredWidth + cell * .12),
        height: Math.max(cell * .19, cell * (scale + .08))
      };
      if (_entityBadgeMetricsCache.size >= 256) _entityBadgeMetricsCache.clear();
      _entityBadgeMetricsCache.set(key, metrics);
      return metrics
    }

    function s7EntityBadgeCanvas(label, cell, color) {
      const metrics = s7EntityBadgeMetrics(label, cell);
      const pixelRatio = Math.max(1, Math.min(2, finitePositive(typeof DPR === "number" ? DPR : 1, 1)));
      const key = `${label}|${color}|${metrics.cellKey}|${pixelRatio}`;
      const cached = _entityBadgeCanvasCache.get(key);
      if (cached) return cached;
      const buildFrame = Math.floor(finiteNumber(state?.frame, -1));
      if (buildFrame !== _entityBadgeBuildFrame) {
        _entityBadgeBuildFrame = buildFrame;
        _entityBadgeBuildCount = 0
      }
      // In dense battles a low build budget causes hundreds of repeated strokeText
      // fallbacks for the same few labels. Prewarm the small unique label set faster;
      // ordinary battles still keep a conservative budget.
      const badgeBuildBudget = finiteArray(state?.zombies).length >= 180 ? 12 : 2;
      if (_entityBadgeBuildCount >= badgeBuildBudget || typeof document === "undefined") return null;
      _entityBadgeBuildCount++;
      const canvas = document.createElement("canvas");
      const { font, lineWidth, width, height } = metrics;
      const pad = Math.ceil(lineWidth + 2);
      const logicalWidth = Math.ceil(width + pad * 2);
      const logicalHeight = Math.ceil(height + pad * 2);
      canvas.width = Math.max(1, Math.ceil(logicalWidth * pixelRatio));
      canvas.height = Math.max(1, Math.ceil(logicalHeight * pixelRatio));
      const g = canvas.getContext("2d");
      g.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = font;
      g.fillStyle = "rgba(0,0,0,0.74)";
      g.fillRect((logicalWidth - width) / 2, (logicalHeight - height) / 2, width, height);
      g.lineWidth = lineWidth;
      g.strokeStyle = "rgba(0,0,0,0.96)";
      g.strokeText(label, logicalWidth / 2, logicalHeight / 2 + cell * .005);
      g.fillStyle = color;
      g.fillText(label, logicalWidth / 2, logicalHeight / 2 + cell * .005);
      const entry = { canvas, width:logicalWidth, height:logicalHeight };
      if (_entityBadgeCanvasCache.size >= 256) _entityBadgeCanvasCache.clear();
      _entityBadgeCanvasCache.set(key, entry);
      return entry
    }

    function drawEntityTextBadge(label, x, y, cell, color = "#ffffff") {
      if (!entityTextVisible || !label) return;
      label = String(label);
      const badge = s7EntityBadgeCanvas(label, cell, color);
      if (badge) {
        ctx.drawImage(badge.canvas, x - badge.width / 2, y - badge.height / 2, badge.width, badge.height);
        return
      }
      // Cache miss fallback preserves the exact old rendering while cache creation is
      // spread across subsequent frames instead of blocking one frame.
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const metrics = s7EntityBadgeMetrics(label, cell);
      const { scale, font, width, height } = metrics;
      ctx.font = font;
      ctx.fillStyle = "rgba(0,0,0,0.74)";
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
      ctx.lineWidth = Math.max(2, cell * .035);
      ctx.strokeStyle = "rgba(0,0,0,0.96)";
      ctx.strokeText(label, x, y + cell * .005);
      ctx.fillStyle = color;
      ctx.fillText(label, x, y + cell * .005);
      ctx.restore()
    }

    function updateTextButtonLabel() {
      const label = `文字：${entityTextVisible?"开":"关"} B`;
      const button = document.getElementById("textBtn");
      if (button) button.textContent = label;
      const battleButton = document.getElementById("battleTextBtn");
      if (battleButton) { battleButton.textContent = label; battleButton.classList.toggle("primary", entityTextVisible) }
    }

    function toggleEntityText() {
      entityTextVisible = !entityTextVisible;
      updateTextButtonLabel()
    }
    const S7_ZOMBIE_CATS = {
      push: ["immortal", "bucket", "screen", "wallz", "tallz", "yeti", "backup"],
      break: ["newspaper", "football", "ladder", "zomboni", "squashz", "garg", "giga"],
      raid: ["pole", "pogo", "dolphin", "balloon", "digger", "snorkel"],
      ranged: ["catapult", "peaz", "gatlingz", "jalapenoz", "ducky"],
      summon: ["bobsledSled", "dancer", "jack", "bungee"]
    };
    const S7_COMMAND_BY_CAT = {
      push: "bombdoor",
      break: "blackolive",
      raid: "polecmd",
      ranged: "warflag",
      summon: "tacticflag"
    };

    function s7CategoryForType(type) {
      for (const [category, list] of Object.entries(S7_ZOMBIE_CATS))
        if (list.includes(type)) return category;
      return ZOMBIES[type]?.category || null
    }

    const S7_COMMAND_CATEGORIES = Object.freeze(Object.keys(S7_ZOMBIE_CATS));

    function s7EmptyCommandCounts() {
      const counts = {};
      for (const cat of S7_COMMAND_CATEGORIES) counts[cat] = 0;
      return counts
    }

    let _s7CommandStateOwner = null;
    let _s7CommandCountsRef = null;
    let _s7CommandRowsRef = null;
    function s7EnsureCommandState() {
      const s = state?.s7;
      if (!s) return null;
      // Command counts are mutated only through the command-state helpers or replaced as
      // complete objects during state restore. Avoid normalising 36 counters for every
      // zombie speed/behaviour query; repair only when the owning objects change.
      if (s === _s7CommandStateOwner && s.commands === _s7CommandCountsRef &&
        s.commandsByRow === _s7CommandRowsRef) return s;
      if (!s.commands || typeof s.commands !== "object") s.commands = s7EmptyCommandCounts();
      if (!Array.isArray(s.commandsByRow) || s.commandsByRow.length !== ROWS) {
        s.commandsByRow = Array.from({ length: ROWS }, () => s7EmptyCommandCounts())
      }
      for (let r = 0; r < ROWS; r++) {
        if (!s.commandsByRow[r] || typeof s.commandsByRow[r] !== "object") s.commandsByRow[r] = s7EmptyCommandCounts()
      }
      for (const cat of S7_COMMAND_CATEGORIES) {
        s.commands[cat] = Math.max(0, finiteNumber(s.commands[cat], 0));
        for (let r = 0; r < ROWS; r++) s.commandsByRow[r][cat] = Math.max(0, finiteNumber(s.commandsByRow[r][cat], 0))
      }
      _s7CommandStateOwner = s;
      _s7CommandCountsRef = s.commands;
      _s7CommandRowsRef = s.commandsByRow;
      return s
    }

    function s7CommandCount(category, row = null) {
      if (!category) return 0;
      const s = s7EnsureCommandState();
      if (!s) return 0;
      if (Number.isInteger(row) && row >= 0 && row < ROWS) return Math.max(0, s.commandsByRow[row]?.[category] || 0);
      return Math.max(0, s.commands?.[category] || 0)
    }

    function s7HasCommand(category, row = null) {
      return s7CommandCount(category, row) > 0
    }

    function s7SetCommandStateForZombie(z, delta) {
      if (!z?.s7?.command) return;
      const cat = z.s7.category || z.s7.commandCategory;
      if (!cat || !S7_ZOMBIE_CATS[cat]) return;
      const s = s7EnsureCommandState();
      if (!s) return;
      const row = Number.isInteger(z.row) ? z.row : null;
      s.commands[cat] = Math.max(0, (s.commands[cat] || 0) + delta);
      if (row !== null && row >= 0 && row < ROWS) {
        s.commandsByRow[row][cat] = Math.max(0, (s.commandsByRow[row][cat] || 0) + delta)
      }
      if (delta > 0) z.s7.commandRow = row;
      if (delta < 0) z.s7.commandRow = null
    }

    function s7SyncCommandRowForZombie(z) {
      if (!z?.s7?.command || z.dead) return;
      const cat = z.s7.category || z.s7.commandCategory;
      if (!cat || !S7_ZOMBIE_CATS[cat]) return;
      const s = s7EnsureCommandState();
      if (!s) return;
      const newRow = Number.isInteger(z.row) && z.row >= 0 && z.row < ROWS ? z.row : null;
      const oldRow = Number.isInteger(z.s7.commandRow) && z.s7.commandRow >= 0 && z.s7.commandRow < ROWS ? z.s7.commandRow : null;
      if (newRow === oldRow) return;
      if (oldRow !== null) s.commandsByRow[oldRow][cat] = Math.max(0, (s.commandsByRow[oldRow][cat] || 0) - 1);
      if (newRow !== null) s.commandsByRow[newRow][cat] = Math.max(0, (s.commandsByRow[newRow][cat] || 0) + 1);
      z.s7.commandRow = newRow
    }

    const ZOMBIE_KEYS = Object.keys(ZOMBIES);
    const S7_NORMAL_ZOMBIES = ZOMBIE_KEYS.filter(k => !S7_COMMAND_ZOMBIES.includes(k) && k !== "imp");
    const BUNGEE_DROP_POOL = Object.freeze(ZOMBIE_KEYS.filter(k => !S7_COMMAND_ZOMBIES.includes(k) && !["blind", "garg",
      "giga", "imp", "bungee"
    ].includes(k)));
    const BLIND_POOL = ["blind", ...S7_NORMAL_ZOMBIES];
    const S7_BOBSLED_SLED_DECAY_PER_SECOND = 60;
    const S7_BOBSLED_COMMAND_EXTRA_WALKERS = 2;
    const S7_BOBSLED_COMMAND_EXTRA_WALKER_GAP = .35;
    const S7_HEAVY_IMPACT_RULES = Object.freeze({
      wallnut: Object.freeze({
        smash: 2e3,
        crush: 2e3,
        name: "坚果"
      }),
      tallnut: Object.freeze({
        smash: 1e3,
        crush: 1e3,
        name: "高坚果"
      }),
      chomper: Object.freeze({
        smash: 500,
        crush: 300,
        name: "大嘴"
      }),
      spikerock: Object.freeze({
        smash: 250,
        crush: 250,
        name: "地刺王"
      }),
      gloom: Object.freeze({
        smash: 500,
        crush: 500,
        name: "忧郁菇"
      })
    });
    const PLANT_ZOMBIE_TYPES = new Set(["peaz", "gatlingz", "squashz", "jalapenoz", "wallz", "tallz"]);
    const MAGNET_ARMOR_TABLE = {
      cone: [
        ["cone", "路障", 300]
      ],
      bucket: [
        ["bucket", "铁桶", 600]
      ],
      football: [
        ["helmet", "橄榄球头盔", 900]
      ],
      screen: [
        ["door", "铁门", 1120]
      ],
      pogo: [
        ["pole", "跳跳杆", 70]
      ],
      ladder: [
        ["ladder", "扶梯", 1100]
      ],
      armorGarg: [
        ["armor", "巨人铁桶铁门装甲", 1400]
      ],
      garg: [
        ["bucketDoor", "巨人铁桶铁门", 900]
      ],
      giga: [
        ["bucketDoor", "红眼铁桶铁门", 1100]
      ],
      hugeGarg: [
        ["bucketDoor", "白眼铁桶铁门", 1e3]
      ],
      superGiga: [
        ["bucketDoor", "红眼铁桶铁门", 1600]
      ],
      catapult: [
        ["armor", "投篮车外壳", 700]
      ],
      zomboni: [
        ["armor", "冰车外壳", 900]
      ]
    };

    // -----------------------------------------------------------------------------

    // 工厂/僵尸注册表 / totalHp

    // [原源码行 2769] 蹦极空投唯一候选池：允许所有非指令普通种，仅排除盲盒与两种巨人。

    // [原源码行 2770] 普通蹦极从该池生成普通种；变种蹦极从同一池生成对应变种。

    // [原源码行 2771] 空投位置由蹦极本体统一限定在本行第8～9列。

    // [原源码行 2781] 文档中明确具备“防碾压”或单独规定砸压伤害的植物，统一由这一张表维护。

    // [原源码行 2782] 用户口径：文档中的“防碾压”同时覆盖巨人/红眼砸击与冰车/投篮车碾压，

    // [原源码行 2783] 即两类重击都不再走默认秒杀伤害；未列入本表的植物仍按默认重击处理。

    // -----------------------------------------------------------------------------

    function totalHp(z) {
      return z.hp + z.armors.reduce((s, a) => s + Math.max(0, a.hp), 0)
    }

    function killIfBodyHpDepleted(z, opt = {}) {
      if (!z || z.dead || z.hp > 0) return false;
      z.armors = [];
      return !!killZombie(z, {
        source: opt.source || null,
        noSource: !!opt.noSource,
        noCritical: true,
        noTransform: !!opt.noTransform || !!opt.ash,
        system: !!opt.system,
        poisonTick: !!opt.poisonTick,
        undergroundBypass: !!opt.undergroundBypass,
        balloonAirBypass: !!opt.balloonAirBypass,
        balloonAirKill: !!opt.balloonAirKill,
        zombieAttacker: opt.zombieAttacker || null
      })
    }

    // -----------------------------------------------------------------------------

    // 工厂/僵尸注册表 / catapultKeepsOpeningWindup

    // [原源码行 2825] 灰烬、吞噬、亡语砸等明确“不开发盲盒”的调用会传

    // [原源码行 2826] ash/noTransform；普通穿甲伤害把盲盒本体打空时仍必须开盒。

    // -----------------------------------------------------------------------------

    function catapultKeepsOpeningWindup(x) {
      const px = finiteNumber(x, DAMAGE_BOUNDARY_X + .5);
      const columnNumber = Math.floor(px) + 1;
      return columnNumber >= 8
    }

    // -----------------------------------------------------------------------------

    // 工厂/僵尸注册表 / makeZombie

    // [原源码行 2832] 按棋盘列号判断：第8列及其右侧（含第9/10列与场外出生区）保留原4.74秒前摇。

    // [原源码行 2833] 第1~7列开出的投篮车不设前摇，生成后的第一次更新就直接投篮，然后进入正常CD。

    // -----------------------------------------------------------------------------

    function makeZombie(type, row, x, opt = {}) {
      if (x == null) x = spawnXFor(type);
      if (type === "blind") return makeBlind(row, x, opt);
      const d = ZOMBIES[type] || ZOMBIES.normal;
      const z = {
        id: uid++,
        type: type,
        row: row,
        x: x,
        dir: -1,
        name: d.name,
        emoji: d.emoji,
        hp: d.hp,
        maxHp: d.hp,
        crit: d.crit || 0,
        noCrit: !!d.noCrit,
        s7UsesCriticalSplit: !d.noCrit && finiteNumber(d.crit, 0) > 0,
        armors: (d.armors || []).map(a => ({
          ...a
        })),
        speed: d.speed,
        baseSpeed: d.speed,
        threat: d.threat || 1,
        dead: false,
        dying: false,
        slow: 0,
        freeze: 0,
        stun: 0,
        hitFlashUntil: 0,
        age: 0,
        attackCd: 0,
        air: !!d.air,
        vehicle: !!d.vehicle,
        friendly: false,
        flags: {
          ...d
        }
      };
      if (type === "newspaper") {
        z.s7 = z.s7 || {}; z.s7.newsHeadVisible = true; z.s7.newsArmVisible = true
      }
      if (d.digger) {
        z.underground = true;
        z.dir = -1;
        z.x = x;
        z.hasPick = true;
        z.diggerSurfaceX = opt.variant ? 1.5 : null;
        z.diggerRootHitIds = new Set
      }
      if (d.bungee) {
        const bungeeColumn = s7BattleIrnd(8, 9);
        z.x = bungeeColumn - .5;
        z.speed = 0;
        z.baseSpeed = 0;
        z.air = true;
        z.bungeeTimer = 0;
        z.s7 = z.s7 || {};
        z.s7.bungeeColumn = bungeeColumn;
        z.s7.bungeeWaiting = true;
        z.s7.bungeeDropped = false;
        z.s7.bungeeDropCount = 0
      }
      if (d.catapult) {
        z.balls = 6;
        // 所有投篮车统一走到第8格再投，统一0.6秒前摇
        z.ready = .6;
        z.throwCd = 0;
        z.drive = true;
        z.s7 = z.s7 || {};
        z.s7.catapultOpeningColumn = Math.floor(finiteNumber(x, 0)) + 1;
        z.s7.catapultHadOpeningWindup = true
      }
      if (d.jack) {
        z.jackEarly = s7BattleRandom() < .05;
        z.jackCd = z.jackEarly ? s7BattleRnd(4.4, 7.5) : s7BattleRnd(13.6, 20)
      }
      if (d.jalapeno) {
        z.jalapenoCd = 10
      }
      if (d.garg) {
        z.attackCd = TIMES.gargHammer
      }
      if (d.submerge) {
        z.diving = true;
        z.surfaced = false
      }
      if (d.shooter) {
        z.shooterReady = 1;
        z.shootCd = 0;
        z.shots = d.shooter;
        if (z.type === "peaz") {
          if (s7BattleRandom() < .5) {
            const ice = s7BattleRandom() < .5;
            z.shooterMode = ice ? "ice" : "twin"
          } else {
            z.shooterMode = "normal"
          }
        }
      }
      if (type === "polecmd") {
        z.s7 = z.s7 || {};
        z.s7.poleCommandPhase = "pacing";
        z.s7.poleCommandPaceElapsed = 0;
        z.s7.poleCommandRunTime = 0;
        z.s7.poleCommandSpeedTime = 0;
        z.s7.poleCommandNextPaceEffect = 1
      }
      setSpeedProfile(z, speedProfileForZombie(z), true);
      // 指令类型本身永久具有 command 身份，不能依赖调用者是否恰好传入 opt.command。
      // 这保证手动放置、盲盒开出和其他生成入口都建立同行指令计数并触发出场召唤。
      const isCommandType = !!d.command || S7_COMMAND_ZOMBIES.includes(type);
      const commandCategory = opt.category || d.category || s7CategoryForType(type);
      s7ApplyZombieVariant(z, !!opt.variant, !!opt.command || isCommandType, commandCategory, opt);
      return z
    }
    const S7_BLIND_BOX_ARMOR_HP = 370;
    const S7_COMMAND_BLIND_BOX_ARMOR_HP = 1; // 仅用于指令僵尸召唤的同类特殊盲盒；自然出怪盲盒始终为370。

    // -----------------------------------------------------------------------------

    // 工厂/僵尸注册表 / makeBlind

    // [原源码行 2879] 文档规则：蹦极固定在本行第8～9列随机格心出现。

    // -----------------------------------------------------------------------------

    function makeBlind(row, x, opt = {}) {
      if (x == null) x = spawnXFor("blind");
      const armorHp = Math.max(1, finiteNumber(opt.armorHp, S7_BLIND_BOX_ARMOR_HP));
      const z = {
        id: uid++,
        type: "blind",
        row: row,
        x: x,
        dir: -1,
        name: opt.name || "盲盒路障僵尸",
        emoji: opt.emoji || "🎁",
        hp: 270,
        maxHp: 270,
        crit: s7CriticalHpForBody(270),
        noCrit: false,
        s7UsesCriticalSplit: true,
        armors: [armor("盲盒路障", armorHp, 1, false)],
        speed: SPEEDS.ordinary,
        baseSpeed: SPEEDS.ordinary,
        threat: 2,
        dead: false,
        dying: false,
        slow: 0,
        freeze: 0,
        stun: 0,
        hitFlashUntil: 0,
        age: 0,
        attackCd: 0,
        air: false,
        vehicle: false,
        friendly: false,
        blind: true,
        flags: {},
        s7: {
          variant: false,
          command: false,
          category: opt.category || "box"
        }
      };
      if (opt.s7Box) z.s7Box = {
        ...opt.s7Box
      };
      if (opt.forcedCategory) z.s7ForcedCategory = opt.forcedCategory;
      if (opt.forcedType) z.s7ForcedType = opt.forcedType;
      z.s7Xp = z.maxHp + z.armors.reduce((sum, a) => sum + a.max, 0);
      z.s7Elem = s7Elem(z);
      setSpeedProfile(z, "ordinary", true);
      return z
    }

    function makePlant(key, row, col) {
      const d = PLANTS[key] || PLANTS.peashooter;
      const initCd = key === "cob" ? d.firstCd || 7 : key === "hypno" ? Math.max(30, finiteNumber((Array.isArray(d.cd) ? d.cd[0] : d.cd), 30)) : s7BattleRnd(0, .25);
      const p = {
        id: uid++,
        order: uid,
        key: key,
        row: row,
        col: col,
        hp: d.hp,
        maxHp: d.hp,
        cd: initCd,
        age: 0,
        dead: false,
        armed: false,
        asleep: !!d.mushroom,
        wake: false,
        phase: 0,
        chew: 0,
        used: false,
        kind: d.kind,
        laddered: false,
        shield: 0,
        buff: 0,
        crater: 0,
        squashRecover: 0
      };
      if (PLANT_RULES[key]) {
        p.kind = "s7";
        p.hp = p.maxHp = PLANT_RULES[key].hp[0];
        p.cd = s7BattleRnd(0, .25);
        s7InitPlant(p);
        if (key === "sunflower") p.cd = PLANT_RULES.sunflower.cd[0]
      }
      return p
    }

    function s7PlantMaxExpByRule(key) {
      const group = PLANT_RULES[key]?.group || "def";
      const th = EXP_GROUPS[group] || EXP_GROUPS.def;
      return finiteNumber(th[th.length - 1], 0)
    }

    function s7RandomIsOutputKey(key) {
      return s7PlantMaxExpByRule(key) >= 45e3
    }

    function s7RandomIsPeaKey(key) {
      return ["snowpea", "repeater", "splitpea", "threepeater", "gatling", "sniper", "reverseRepeater"].includes(key)
    }

    function s7RandomCanPlaceKey(key, row, col, plannedPlants = finiteArray(state?.plants)) {
      if (!PLANTS[key] || col < 0 || col >= PLANT_COLS) return false;
      const frontOnly = ["gloom", "squash", "kernel", "puff", "hypno"];
      const defKeys = Object.keys(PLANT_RULES).filter(k => PLANT_RULES[k].group === "def");
      const restricted345 = new Set([...frontOnly, ...defKeys]);
      if (restricted345.has(key) && (col < 2 || col > 4)) return false;
      if (key === "torchwood") {
        return finiteArray(plannedPlants).some(p => p && !p.dead && p.row === row && p.col < col && s7RandomIsPeaKey(p.key))
      }
      return true
    }

    function s7RandomFilterForCell(col, rowPlants) {
      if (col >= 7) {
        const lastTwo = rowPlants.filter(p => p.col >= 7);
        if (!lastTwo.some(p => s7RandomIsOutputKey(p.key))) return s7RandomIsOutputKey;
        if (!lastTwo.some(p => p.key === "sunshroom")) return k => k === "sunshroom";
      }
      if (col === 1) {
        const firstTwo = rowPlants.filter(p => p.col <= 1);
        if (!firstTwo.some(p => s7RandomIsOutputKey(p.key) || p.key === "sunshroom"))
          return k => s7RandomIsOutputKey(k) || k === "sunshroom";
      }
      return null
    }

    function s7RandomChooseFromCandidates(row, col, options = {}) {
      if (!options.autoValid) return s7BattleChoose(PLANT_KEYS);
      const plannedPlants = finiteArray(options.basePlants);
      let candidates = PLANT_KEYS.filter(key => s7RandomCanPlaceKey(key, row, col, plannedPlants));
      if (options.filter) {
        const filtered = candidates.filter(options.filter);
        if (filtered.length) candidates = filtered
      }
      return candidates.length ? s7BattleChoose(candidates) : s7BattleChoose(PLANT_KEYS)
    }

    function s7RandomRowKeys(row, startCol, endCol, options = {}) {
      const autoValid = !!options.autoValid;
      const plannedPlants = finiteArray(options.basePlants).slice();
      const result = [];
      for (let col = startCol; col < endCol; col++) {
        const rowPlants = plannedPlants.filter(p => p && !p.dead && p.row === row);
        const filter = autoValid ? s7RandomFilterForCell(col, rowPlants) : null;
        const key = s7RandomChooseFromCandidates(row, col, {
          autoValid, basePlants: plannedPlants, filter
        });
        result.push(key);
        plannedPlants.push({ key, row, col, dead: false })
      }
      return result
    }

    function s7RandomPlantKeyForCell(row, col, options = {}) {
      const autoValid = !!options.autoValid;
      const basePlants = finiteArray(options.basePlants);
      const rowPlants = basePlants.filter(p => p && !p.dead && p.row === row && p.col !== col);
      const filter = autoValid ? s7RandomFilterForCell(col, rowPlants) : null;
      return s7RandomChooseFromCandidates(row, col, {
        autoValid, basePlants, filter
      })
    }

    function s7SetRandomAutoValid(next, announce = true) {
      randomAutoValid = !!next;
      try {
        localStorage.setItem("pvz_s7_random_auto_valid", randomAutoValid ? "1" : "0")
      } catch (_) {}
      updateRandomValidButtons();
      if (cardMode === "plant") renderCards();
      if (announce) {
        const msg = randomAutoValid ? "随机合规：开" : "随机合规：关";
        if (state) {
          addEffect(0, .5, msg, randomAutoValid ? "#86efac" : "#fca5a5", .9);
          log(msg + "；影响随机植物卡牌、Y/J 随机填充、首页随机开赛和多宫格随机动作。")
        }
      }
    }

    function toggleRandomAutoValid() {
      s7SetRandomAutoValid(!randomAutoValid)
    }

    function updateRandomValidButtons() {
      const label = randomAutoValid ? "随机合规：开 G" : "随机合规：关 G";
      const home = document.getElementById("randomValidHomeBtn");
      const game = document.getElementById("randomValidBtn");
      if (home) home.textContent = label;
      if (game) game.textContent = label;
      if (game) game.classList.toggle("primary", randomAutoValid);
      if (home) home.classList.toggle("primary", randomAutoValid)
    }

    function s7CleanupAfterRandomPlantReplacement(removed = []) {
      const removedSet = new Set(removed);
      state.bullets = [];
      if (state.s7) {
        state.s7.turrets = finiteArray(state.s7.turrets).filter(t => !removedSet.has(t.source));
        state.s7.summons = finiteArray(state.s7.summons).filter(s => !removedSet.has(s.source));
        state.s7.sunflowerSuns = finiteArray(state.s7.sunflowerSuns).filter(s => !removedSet.has(s.owner))
      }
      glove = null
    }

    function randomizePlantColumns(startCol, endCol) {
      if (!state) return;
      startCol = Math.max(0, Math.min(PLANT_COLS, Math.floor(startCol)));
      endCol = Math.max(startCol, Math.min(PLANT_COLS, Math.floor(endCol)));
      const removed = finiteArray(state.plants).filter(p => !p.dead && p.col >= startCol && p.col < endCol);
      for (const p of removed) p.dead = true;
      state.plants = finiteArray(state.plants).filter(p => !p.dead);
      s7CleanupAfterRandomPlantReplacement(removed);
      const additions = [];
      for (let row = 0; row < ROWS; row++) {
        const keys = s7RandomRowKeys(row, startCol, endCol, {
          autoValid: randomAutoValid,
          basePlants: state.plants.concat(additions)
        });
        keys.forEach((key, offset) => additions.push(makePlant(key, row, startCol + offset)))
      }
      for (const plant of additions) state.plants.push(plant);
      if (state.s7) state.s7.validated = false;
      const label = `${startCol+1}-${endCol}列随机植物${randomAutoValid?"（合规）":""}`;
      addEffect(2, (startCol + endCol) / 2, label, "#fde68a", 1.1);
      log(label + `：已替换 ${ROWS*(endCol-startCol)} 个格。`);
      redrawUi()
    }

