"use strict";

    // -----------------------------------------------------------------------------

    // 速度与时间配置 / spawnDistanceFor

    // [原源码行 1518] CONFIG: zombie speed/timing data

    // [原源码行 1524] 橄榄球僵尸速度调整为原 0.4167 的 3/4。

    // [原源码行 1526] 扶梯僵尸携带梯子时速度调整为原 0.5076 的 2/3。

    // [原源码行 1565] 原规则以80px为1格：240px/s = 3格/s。currentSpeed末尾统一乘0.9，

    // [原源码行 1566] 因此在乘统一速度系数前使用 3 / 0.9 作为内部封顶。

    // [原源码行 1573] 单位：格/秒；由文档中的格/厘秒乘以100得到。

    // -----------------------------------------------------------------------------

    function spawnDistanceFor(type) {
      const v = SPAWN_DIST[type] ?? 1.141;
      return Array.isArray(v) ? s7BattleChoose(v) : v
    }

    function spawnXFor(type) {
      return DAMAGE_BOUNDARY_X + spawnDistanceFor(type)
    }

    function isDamageableZombie(z) {
      return !!z && !z.s7?.immortalGraveActive && (z.friendly || z.x <= DAMAGE_BOUNDARY_X)
    }

    function speedProfileForZombie(z) {
      if (!z) return "ordinary";
      // 指令僵尸速度倍率：推进类防爆门×1.5、远攻类战术旗×0.2（注册表 speed 字段会被档位覆盖，需在此显式落地）。
      if (z.type === "bombdoor") return "bombdoor";
      if (z.type === "warflag") return "warflag";
      if (z.flags?.digger) return z.underground ? "diggerUnder" : "diggerUp";
      if (z.flags?.garg) return "garg";
      if (z.flags?.pole && !z.jumped) return "pole";
      if (z.flags?.dolphin && !z.jumped) return "dolphin";
      if (z.flags?.dancer && !z.summoned) return "dancer";
      if (z.type === "balloon" || z.flags?.air) return z.air ? "balloon" : "ordinary";
      if (z.flags?.football || z.type === "football") return "football";
      if (z.flags?.jack || z.type === "jack") return "jack";
      if (z.flags?.ladder || z.type === "ladder") return z.armors?.some(a => a.name === "扶梯" && a.hp > 0) ? "ladder" : "ordinary";
      if (z.type === "pogo" && hasPogo(z)) return "pogo";
      if (z.type === "snorkel" || z.flags?.submerge) return "snorkel";
      return "ordinary"
    }

    // -----------------------------------------------------------------------------

    // 速度与时间配置 / setSpeedProfile

    // [原源码行 1615] 速度口径来自《PVZ1 植物僵尸数据总整理》：单位为格/秒。

    // [原源码行 1616] 特别修正：舞王召唤后转普通速度；气球落地/爆球后转普通速度；矿工按地下/出土后分段。

    // -----------------------------------------------------------------------------

    function setSpeedProfile(z, key, reset = false) {
      const r = SPEED_PROFILES[key] || SPEED_PROFILES.ordinary;
      if (reset || z.speedProfile !== key) {
        z.speedProfile = key;
        z.speedMin = r.min;
        z.speedMax = r.max;
        z.speedNow = r.min === r.max ? r.max : s7BattleRnd(r.min, r.max);
        z.speedTarget = r.min === r.max ? r.max : s7BattleRnd(r.min, r.max);
        z.speedTimer = s7BattleRnd(.35, 1.15)
      }
    }

    function tickSpeed(z, dt) {
      const key = speedProfileForZombie(z);
      setSpeedProfile(z, key, false);
      if ((z.speedMax || 0) > (z.speedMin || 0)) {
        z.speedTimer -= dt;
        if (z.speedTimer <= 0) {
          z.speedTarget = s7BattleRnd(z.speedMin, z.speedMax);
          z.speedTimer = s7BattleRnd(.35, 1.2)
        }
        z.speedNow += ((z.speedTarget || z.speedMax) - z.speedNow) * clamp(dt * 2.2, 0, 1);
        z.speedNow = clamp(z.speedNow, z.speedMin, z.speedMax)
      } else z.speedNow = z.speedMax
    }
    const PLANT_ORDER = ["wallnut", "tallnut", "cactus", "explodenut", "chomper", "garlic", "spikerock", "snowpea",
      "repeater", "puff", "scaredy", "squash", "threepeater", "seashroom", "splitpea", "cabbage", "cattail",
      "firelotus", "reverseRepeater", "ghost", "sniper", "sunflower", "sunshroom", "hypno", "iceshroom", "kelp",
      "torchwood", "plantern", "blover", "magnet", "kernel", "umbrella", "marigold", "goldmagnet", "timegrass",
      "barley", "starfruit", "fume", "gloom", "potato", "melon", "gatling", "winter"
    ];
    const EXP_GROUPS = {
      def: [0, 200, 600, 1e3, 1600, 3e3],
      main: [0, 3e3, 9e3, 15e3, 24e3, 45e3],
      alt: [0, 3e3, 9e3, 15e3, 24e3, 45e3],
      mid: [0, 750, 2250, 3750, 6e3, 11250],
      spec: [0, 1e3, 3e3, 5e3, 8e3, 15e3],
      sun: [0, 2e3, 6e3, 1e4, 16e3, 3e4],
      star: [0, 750, 2250, 7500, 5e4, 1e5],
      chomp: [0, 1500, 4500, 7500, 12e3, 22500]
    };
    const S7_RULES = Object.freeze({
      experience: Object.freeze({
        sameLaneKillerShare: .6,
        crossLaneKillerShare: .3,
        crossLaneKillerLaneOtherShare: .2,
        crossLaneVictimLaneShare: .5,
        plantDeathSharePerReceiver: .25
      }),
      elements: Object.freeze({
        poisonTick: .17,
        coldDecay: 5,
        coldSlowPerLayer: .03,
        coldSlowCap: .66,
        freezeSeconds: 2,
        iceBoundSeconds: 4,
        lumenDecay: 5,
        lumenVulnerabilityPerLayer: .15,
        maxLumen: 4,
        maxDark: 5
      }),
      spawnIntervalsByMinute: Object.freeze([9, 9, 9, 8, 8, 8, 7.5, 7.5, 7, 7, 6, 5, 4, 3.5, 3.5, 3.5, 3.5, 3, 2.5,
        2, 1.9, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1, 1, 1, 1, 1, .5, .5, .5, .5, .5
      ])
    });
    const PLANT_RULES = {
      wallnut: {
        name: "坚果",
        emoji: "🥜",
        group: "def",
        hp: [6500, 7e3, 7500, 7500, 8e3, 8e3],
        cd: [999, 999, 999, 999, 999, 999],
        tag: "抗砸压/自回复/全队护盾",
        block: true,
        desc: "0阶6500血，车辆碾压和巨人砸击均固定掉2000血；1阶7000血；2阶7500血；3阶自回最大生命2%/s，低于30%时回复速度翻倍；4阶8000血；5阶升阶时立即、此后每120秒给本路全体植物补至200护盾，护盾不叠加且可完整挡下1次致命伤害。"
      },
      tallnut: {
        name: "高坚果",
        emoji: "🧱",
        group: "def",
        hp: [4e3, 5e3, 6e3, 7e3, 8e3, 8e3],
        cd: [999, 999, 999, 999, 999, 999],
        tag: "S7高墙/击退",
        block: true,
        tall: true,
        desc: "4000血；阻拦飞行僵尸（投掷小鬼除外）；巨人砸击、冰车或投篮车碾压每次均只损失1000血，冰车与投篮车都会被击退1.25格；1/2/3/4阶血量提升至5000/6000/7000/8000；5阶自回50/s，每累计损失1000血，击退前方1.25格内地面僵尸并震落梯子。"
      },
      cactus: {
        name: "仙人掌",
        emoji: "🌵",
        group: "def",
        hp: [600, 1e3, 1e3, 1200, 1200, 1200],
        cd: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
        tag: "穿刺/易伤9-15%",
        desc: "每1.5秒发射20伤尖刺并叠3%易伤；3阶起有3%概率发射可穿透3个目标的红色长刺；濒临死亡时触发不屈：无敌5秒，结束后变为100生命并暂停自回复5秒，随后发射一枚无限穿透金刺，将本行命中的地面僵尸推至9/10列交界且不造成伤害和易伤；冷却180秒。"
      },
      explodenut: {
        name: "爆炸坚果",
        emoji: "💣🥜",
        group: "def",
        hp: [600, 700, 800, 800, 1e3, 1e3],
        cd: [999, 999, 999, 999, 999, 12],
        tag: "死亡爆炸/保龄300",
        block: true,
        desc: "死亡时造成3×3范围1800灰烬伤害；3阶起爆炸后降一级复活并获得10/s自回；5阶每12秒生成小型爆炸坚果保龄球，命中后在半径1.5格内造成300非灰烬伤害。"
      },
      chomper: {
        name: "大嘴花",
        emoji: "👄",
        group: "chomp",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [3.37, 3.37, 3.37, 3.37, 3.37, 3.37],
        tag: "即时咬合/后摇3.37s",
        block: true,
        desc: "取消咬合前摇，命中时立即吞噬或撕咬，之后统一进入3.37秒后摇；吞咽后的纯消化CD仍为40秒且每吞1只缩短2秒，最低0秒。每吞1只升1级（血量+150、射程+0.5）；撕咬无法吞噬且仍存活的僵尸时额外击退0.2格并回血150，消化回血300；巨人/红眼砸击固定扣500血，冰车/投篮车碾压固定扣300血，并击退冰车。"
      },
      garlic: {
        name: "大蒜",
        emoji: "🧄",
        group: "def",
        hp: [450, 500, 550, 550, 600, 600],
        cd: [30, 30, 30, 30, 30, 30],
        tag: "熏跑/剧毒",
        block: true,
        desc: "被僵尸啃咬时立即熏跑该僵尸，使其掉头走到底线后返回；每30秒驱赶本路总血量最高的僵尸并附加10层剧毒；自回血2/秒。5阶死亡毒爆后假死60秒并复活，冷却180秒。"
      },
      spikerock: {
        name: "地刺王",
        emoji: "🪨",
        group: "def",
        hp: [800, 1e3, 1e3, 1200, 1200, 1200],
        cd: [1, 1, 1, 1, 1, 1],
        tag: "暗影地刺/暗熠",
        ground: true,
        desc: "本体每秒攻击两次，单次20/40/50；每12秒从自身格召唤向右移动的暗影地刺，暗刺每秒造成100伤害；5阶本体每轮叠1层暗熠并按目标暗熠层数追加伤害，自回20/s；巨人/红眼砸击与冰车/投篮车碾压均固定扣250血。"
      },
      snowpea: {
        name: "寒冰射手",
        emoji: "❄️🫛",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [2, 1.9, 1.8, 1.7, 1.6, 1.5],
        tag: "双冰豆/冰锥",
        desc: "每2.0/1.9/1.8/1.7/1.6/1.5秒发射2枚冰豆，每枚叠2层寒意；冰锥概率10%/25%，固定冰冻0.5秒并叠5层寒意，3阶最多穿透5个、5阶最多穿透10个。"
      },
      repeater: {
        name: "双发射手",
        emoji: "🫛🫛",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.35, 1.35, 1.35, 1.35, 1.35, 1.35],
        tag: "随机豆池/火毒冰",
        desc: "随机发射普通/火/冰/毒/红炎豆。"
      },
      puff: {
        name: "小喷菇",
        emoji: "🍄",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
        tag: "暗熠/近距加速",
        mushroom: true,
        desc: "射程8格，基础伤害50/60/80，20%/30%暗熠；越近越快(最快0.5s)；3阶最高射速每7次发暗影飞弹(100伤+穿甲)，5阶无需最高射速。"
      },
      scaredy: {
        name: "胆小菇",
        emoji: "😨🍄",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
        tag: "缩头/暗熠/击杀成长",
        mushroom: true,
        desc: "初始1.5秒一发；每次射击缩短0.05秒，最低0.4秒。以自身为中心的完整3×3内有可判定敌方僵尸时缩头并把间隔直接变为2秒；只有真正达到满攻速（0.4秒一发）时不会缩头；空闲每满1秒增加0.1秒，最高2秒。伤害20/25/30/70；3阶起每次击杀使附暗熠概率+2%；5阶累计击杀40个满5层暗熠的僵尸后，后续每次此类击杀仅令子弹伤害+1。胆小菇没有斩杀能力。"
      },
      squash: {
        name: "窝瓜",
        emoji: "🟩",
        group: "main",
        hp: [1e3, 1e3, 1e3, 1e3, 1e3, 1e3],
        cd: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
        tag: "连砸/群伤",
        block: true,
        desc: "前2后1索敌，200/250群伤，概率连砸。"
      },
      threepeater: {
        name: "三线射手",
        emoji: "🌿3️⃣",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.8, 1.8, 1.8, 1.8, 1.8, 1.8],
        tag: "6豆/概率大招",
        desc: "每1.8s三行各2豆；概率90/120豆大招，5阶僵尸越远开大率越高。"
      },
      seashroom: {
        name: "海蘑菇",
        emoji: "🪼",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [2, 2, 2, 2, 2, 2],
        tag: "分身/毒孢子",
        mushroom: true,
        desc: "双发毒孢子(75%带毒)；每150s长300HP分身(单发)。1阶120s；2阶100s且伤害15；3阶3分身；4阶80s；5阶3分身。"
      },
      splitpea: {
        name: "裂荚射手",
        emoji: "🫛↔️",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.65, 1.6, 1.6, 1.6, 1.6, 1.6],
        tag: "前爆裂/后双发",
        desc: "向前爆裂豆，向后双发；概率专注。"
      },
      cabbage: {
        name: "卷心菜投手",
        emoji: "🥬",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [2.6, 2.6, 2.5, 2.5, 2.5, 2.5],
        tag: "前三散射/弹射",
        desc: "对前三名僵尸散射卷心菜。"
      },
      cattail: {
        name: "猫尾草",
        emoji: "🐱",
        group: "alt",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.5, 1.4, 1.35, 1.3, 1.3, 1.3],
        tag: "追踪/浮游炮",
        desc: "每轮发射2枚20伤全屏追踪大刺；大刺无论在哪一行击杀，浮游炮都生成在猫尾草本格。每座浮游炮只攻击所在行，生成后不检查当前是否有僵尸，固定每轮发射3枚12伤小刺、共发射20轮；有目标时追踪，无目标时沿本行直飞；3/4/5阶小刺击杀后以90%/95%/100%概率再生成浮游炮。猫尾草死亡后，大刺和小刺均不能再召唤浮游炮。"
      },
      firelotus: {
        name: "火红莲",
        emoji: "🪷🔥",
        group: "alt",
        hp: [500, 500, 500, 500, 500, 500],
        cd: [4.3, 4.3, 4.3, 4.3, 4.3, 4.3],
        tag: "3莲弹/燃焰15-20",
        desc: "每4.3秒投掷3颗红莲弹，间隔0.4秒；命中后对本行击中点左右各1.25格内目标先附15/20层燃焰，再造成60/80/100点无衰减范围伤害，并触发燃焰溅射。3阶起每击杀3只僵尸回复50血并获得100%攻速肥料3秒，5阶延长至4秒，肥料不叠加。"
      },
      reverseRepeater: {
        name: "反向双发",
        emoji: "↩️🔥",
        group: "alt",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.6, 1.55, 1.5, 1.5, 1.45, 1.45],
        tag: "反向豆/黑炎",
        desc: "随机普/火/炎/红炎/黑炎，触底反弹。"
      },
      ghost: {
        name: "幽冥菇",
        emoji: "👻🍄",
        group: "alt",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.2, 1.2, 1.2, 1.2, 1.2, 1.2],
        tag: "连射/大星星寒意",
        mushroom: true,
        desc: "每轮固定三连射；0~3阶每个基础攻击轮仅进行1次7%大星判定，4~5阶为10%，同一组三颗子弹至多替换出1颗大星。大星只附加10层寒意；3阶起可继续连射，5阶连续成功2次后的后续连射每轮各替换1颗大星。"
      },
      sniper: {
        name: "狙击豌豆",
        emoji: "🎯🫛",
        group: "mid",
        hp: [300, 550, 550, 550, 550, 550],
        cd: [7.5, 7.5, 7.5, 7.5, 5.5, 5.5],
        tag: "储弹480狙击/威胁索敌",
        desc: "子弹可无限存储。基础每7.5秒装填1发、每7.5秒消耗1发狙击本行威胁最高僵尸，伤害480；前方1/2个火炬使命中点左右50px额外造成120/240无衰减群伤。3阶起按本行最高威胁度动态调整开火间隔，最多±7秒；4阶基础开火与装填间隔均降至5.5秒；5阶装填间隔再按威胁度动态调整，最多±1秒。"
      },
      sunflower: {
        name: "向日葵",
        emoji: "🌻",
        group: "mid",
        hp: [800, 800, 800, 800, 800, 800],
        cd: [6, 5, 5, 5, 4, 4],
        tag: "阳光/光标/照耀",
        desc: "800血；每6/5/5/5/4/4秒生成1个大阳光，大阳光上升至最高点并消失时，给本行全部敌方僵尸叠1/1/2/2/2/2层光标。生产动作不治疗任何植物。"
      },
      sunshroom: {
        name: "阳光菇",
        emoji: "🌤️🍄",
        group: "sun",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [8, 8, 8, 8, 8, 8],
        tag: "阳光炮/光标传导",
        mushroom: true,
        desc: "范围阳光炮，100/200/300/400伤；附加1/2/2/3/4层光标，5阶可参与流明传导。"
      },
      hypno: {
        name: "魅惑菇",
        emoji: "🍄✨",
        group: "main",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [60, 60, 45, 45, 30, 30],
        tag: "召唤魅惑盲盒",
        mushroom: true,
        block: true,
        desc: "每60/45/30秒召唤1个不含变种与指令的魅惑盲盒；本体可魅惑5/10次，升级重置次数。3阶本体魅惑僵尸被敌人啃咬或碾压至死时策反击杀者，5阶本体召唤的魅惑盲盒被敌人开盒时策反开盒者。"
      },
      iceshroom: {
        name: "寒冰菇",
        emoji: "🧊🍄",
        group: "spec",
        hp: [2500, 2750, 3750, 4e3, 5e3, 6e3],
        cd: [7, 7, 7, 7, 7, 7],
        tag: "周期寒意",
        mushroom: true,
        desc: "每7秒给本行僵尸3层寒意；3阶把本行寒意自然衰减延长至7秒；5阶每损失1血缩短0.01秒技能间隔，最低2秒，并把寒意衰减延长至10秒。"
      },
      kelp: {
        name: "缠绕海草",
        emoji: "🪢🌿",
        group: "spec",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [10, 10, 10, 6, 6, 6],
        tag: "绝对无敌/僵尸无视",
        zombieIgnore: true,
        invincible: true,
        desc: "彻底无敌，所有僵尸均不会索敌、啃咬、砸击、碾压、挖根或以远程攻击命中；2.5-7.5格范围捆住目标并每秒附毒，可索敌并缠住任何状态下的潜水僵尸。0-4阶有1个独立缠绕槽位，5阶有2个独立槽位和2条蓝色CD条；每个槽位缠住目标时对应蓝条保持0，目标死亡后该槽位才独立恢复，任意槽位满条即可再次缠绕。"
      },
      torchwood: {
        name: "火炬树桩",
        emoji: "🔥🪵",
        group: "sun",
        hp: [800, 950, 1100, 1100, 1100, 1300],
        cd: [999, 999, 999, 999, 999, 999],
        tag: "过火等级/燃焰溅射",
        block: true,
        desc: "给豌豆提升一次过火等级；1阶950血，2阶1100血，3阶过火额外附10层燃焰并把冰豆转冰火，4阶燃焰15层，5阶1300血/燃焰20层。"
      },
      plantern: {
        name: "路灯花",
        emoji: "🏮",
        group: "mid",
        hp: [600, 1e3, 1e3, 1500, 1500, 1500],
        cd: [15, 15, 15, 15, 10, 10],
        tag: "本行治疗/光标/输血",
        desc: "每15/15/15/15/10/10秒恢复本行所有植物30/30/60/60/60/60点生命值并额外恢复3%最大生命值，同时给本行全部敌方僵尸叠1层光标；5阶使相邻植物免疫减速、本行光标每8秒消散1层，并在相邻植物生命低于150时以100生命/秒持续输血，自身可因此死亡。"
      },
      blover: {
        name: "三叶草",
        emoji: "🍀",
        group: "mid",
        hp: [300, 300, 600, 600, 600, 600],
        cd: [8, 6, 6, 6, 4, 4],
        tag: "本行凛风/寒意/顺风",
        desc: "每8秒释放凛风：吹飞本行飞行僵尸；地下矿工完全不受三叶草影响，既不位移也不叠加寒意；本行其他敌方僵尸均击退0.2格。黑橄榄（黑大爷）虽然免疫通常控制，仍明确承受该0.2格击退，但不叠加寒意；其余本行敌方僵尸叠加2层寒意。1阶间隔6秒，2阶血量600，3阶给本路队友施加3秒顺风（攻速提高25%），4阶间隔4秒，5阶顺风永久常驻。"
      },
      magnet: {
        name: "磁力菇",
        emoji: "🧲🍄",
        group: "spec",
        hp: [500, 1e3, 1e3, 1e3, 1500, 1500],
        cd: [1.5, 1.5, 1.2, 1.2, 1.2, 1.2],
        tag: "铁器砸击",
        mushroom: true,
        desc: "吸取半径10格内的铁器并每1.5/1.2秒砸击本行最左僵尸，造成75伤害；每次砸击40%概率进入下一损坏阶段，5阶降至30%；3阶起击退，5阶击退翻倍。"
      },
      kernel: {
        name: "玉米投手",
        emoji: "🌽",
        group: "spec",
        hp: [300, 600, 600, 1e3, 1e3, 1e3],
        cd: [3, 3, 3, 3, 3, 3],
        tag: "近距黄油/玉米炮/弹射/加速",
        desc: "每3秒投掷玉米粒/黄油/玉米炮，僵尸越近黄油率越高，最高30%，玉米炮概率0.5%并造成1×3范围1800灰烬；2/4阶非玉米炮子弹弹射1/2次且最高黄油率40%/50%；3阶按距离将间隔最低降至1秒，15%大黄油造成80伤并控制直接目标与同格最多2个其他目标；5阶前方2格有敌时持续加速至0.5秒，被啃立即达到0.5秒，大黄油控制整格。"
      },
      umbrella: {
        name: "叶子保护伞",
        emoji: "☂️",
        group: "mid",
        hp: [300, 600, 600, 600, 600, 600],
        cd: [60, 60, 45, 45, 30, 30],
        tag: "20HP小伞/篮球保护/浮空弹飞",
        desc: "本体保护伞仍按自身规则保护本行相邻3列免疫篮球、弹飞1×3浮空僵尸，并在3阶起原样反弹豌豆。周期给本行其他植物生成不可叠加的小伞。每把小伞固定锚定在生成时所在格，拥有20HP：篮球只保护本格且可无限拦截、不耗HP；第一次豌豆命中或第一次普通啃咬由小伞优先完整承受并使小伞消失；只有5阶保护伞生成或升级的小伞可额外在自身1×3范围内弹飞一次浮空僵尸，随后消失。小伞不阻挡其他伤害，也不会跟随离开原格的窝瓜。"
      },
      marigold: {
        name: "金盏花",
        emoji: "🌼",
        group: "mid",
        hp: [800, 800, 800, 800, 800, 800],
        cd: [30, 30, 25, 25, 20, 20],
        tag: "水壶/肥料/推车",
        desc: "每30/25/20秒按60%水壶、20%肥料、15%推车、5%空礼盒生产物品；全队总缺血超过250时必出水壶。水壶只治疗本路2株非满血植物且可包含自身，肥料只加速本路左右相邻植物15秒，推车和空礼盒也只作用于本路；推车以普通伤害打破盲盒时会正常开盒；3/5阶会在1.5秒后额外生产。"
      },
      goldmagnet: {
        name: "吸金磁",
        emoji: "🧲💰",
        group: "mid",
        hp: [600, 800, 800, 1e3, 1e3, 1e3],
        cd: [30, 30, 25, 25, 20, 20],
        tag: "附金/钱币经验/满阶发射",
        desc: "每30/25/20秒使本行每只敌方僵尸各有60%概率附金；附金僵尸死亡时掉落相当于自身经验8倍的银币，由本路吸金磁吸取并均分给本行可分配经验植物；3阶起本行获取经验×1.25；5阶且本行植物全部满阶时，银币改为发射并造成400单体伤害。"
      },
      timegrass: {
        name: "逆时草",
        emoji: "⏳🌿",
        group: "spec",
        hp: [800, 800, 800, 800, 800, 800],
        cd: [15, 15, 15, 15, 15, 15],
        tag: "传送门",
        desc: "每15秒在本行最左侧有效僵尸处生成传送门，将接触者送至最右列；植物僵尸、鸭子救生圈僵尸和投篮车无效。传送门持续5/5.5/6.5/7.5秒或传送4只后消失，5阶不限制传送数量；没有有效目标时本轮不空放。"
      },
      barley: {
        name: "模仿者",
        emoji: "🌾",
        group: "mid",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [999, 999, 999, 999, 999, 999],
        expEligible: false,
        tag: "5秒前摇/每30秒随机变身",
        desc: "种下后固定5秒前摇，随后随机变成任意非大麦植物的0-5阶形态；此后无论变成什么植物，都严格每30秒继续变身且永不获取经验。随机池另含火爆辣椒形态：立即清除本行全部盲盒且不开盒，对本行其他僵尸造成1800灰烬伤害；30秒后恢复大麦本体，再前摇5秒进入下一次随机变身。"
      },
      starfruit: {
        name: "杨桃",
        emoji: "⭐",
        group: "star",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [2.5, 2.45, 2.4, 2.35, 1, 1],
        tag: "五向/光标/大星",
        desc: "仅当本行存在可索敌敌方僵尸时，每轮五向各发1颗星星，伤害20/25/30，5%叠1层光标；星星先固定飞行一段距离，再按本行最靠左僵尸索敌。发射后目标死亡则改锁下一只；目标暂时不可命中则停在转向点等待。3阶每100个有效攻击轮召唤范围1格大星；5阶继续分经验，溢出经验达到1437时只储存1次大星，最快1秒释放1次；释放后经验回到5阶最低值并清空全部溢出经验，同时维持最多5颗环绕小星。"
      },
      fume: {
        name: "大喷菇",
        emoji: "💨🍄",
        group: "star",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [1.2, 1.15, 1.1, 1.1, 1, 1],
        tag: "群伤/灵魂孢子",
        mushroom: true,
        desc: "本行前方群伤20，距离每增加1格伤害-1；3阶按本轮命中数提取灵魂孢子并于下轮一并发射（22伤，上限20）；5阶每轮汲取数量×2（总库存上限仍为20），且灵魂孢子附0.0625格击退，且每颗孢子只命中一次，本体伤害不再衰减。"
      },
      gloom: {
        name: "忧郁菇",
        emoji: "🟣🍄",
        group: "star",
        hp: [1e3, 1e3, 2500, 2500, 4e3, 4e3],
        cd: [2.5, 2.5, 2.5, 2.5, 2, 2],
        tag: "20×4范围/暗熠",
        mushroom: true,
        block: true,
        desc: "生命1000，攻击间隔2.5秒，每轮以0.2秒间隔造成4次20范围伤害；0阶范围3×3，1阶扩大为3×4。巨人/红眼砸击与冰车/投篮车碾压均固定造成500伤害，冰车碾压后会被击退。每轮攻击给本路实际命中的僵尸叠1层暗熠；4阶改为2层。2阶生命2500；3阶每次攻击按目标暗熠层数回血；4阶生命4000、自回10/秒且该回血变为6倍；5阶攻击可斩杀暗熠达到5层且总血量低于30%的目标，并回复800生命。暗熠满5层后再次尝试叠加时，按本次尝试层数造成10倍穿甲伤害。"
      },
      potato: {
        name: "土豆地雷",
        emoji: "🥔",
        group: "star",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [12, 12, 12, 12, 10, 10],
        tag: "瞬爆雷/毒马铃薯",
        lowProfile: true,
        desc: "低矮植物，不会被僵尸豌豆类子弹索敌或命中。每12秒在本行最左僵尸处释放瞬爆雷，对整个本行造成100/150/200伤害。3阶变为毒马铃薯：先给整行敌人各加10层剧毒，再按300+40×目标当前剧毒层数结算伤害，不清除剧毒；4阶间隔10秒；5阶每轮生成3个小毒马铃薯，每个对整行造成120伤害。土豆地雷被啃食至0血时出土并对整行造成1800爆炸，可复活一次。"
      },
      melon: {
        name: "西瓜投手",
        emoji: "🍉",
        group: "star",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [3, 2.6, 2.6, 2.6, 2.6, 2.6],
        tag: "连射30-60%/增大/金瓜",
        desc: "每轮投出原版80伤西瓜；连射率30%/45%/60%，连射间隔0.6秒且可递归继续连射；0.5%金瓜改为2格80伤无衰减AOE。3阶起每次以75%概率连续增大，直击每次+40、溅射每次+10；5阶至少增大1次，单瓜增大达到3次即变为2格西瓜大炮。"
      },
      gatling: {
        name: "机枪射手",
        emoji: "🔫🌿",
        group: "star",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [2, 1.9, 1.8, 1.8, 1.3, 1.1],
        tag: "3豌豆+1冰豆/80豌豆大招",
        desc: "每轮3颗豌豆+1颗冰豆（3层寒意）；3阶2.5%开大，4阶3%，5阶10%。大招在3秒内发射80豌豆+15冰豆并自身回血100；每次开大升星，星级提高开大率，前两星各增加15冰豆。击杀冰冻或冰封目标触发1.25格破冰。"
      },
      winter: {
        name: "冰瓜",
        emoji: "🧊🍉",
        group: "star",
        hp: [300, 300, 300, 300, 300, 300],
        cd: [3, 3, 3, 3, 2.8, 2.8],
        tag: "寒意/凝华/极寒/小瓜散射",
        desc: "每3秒投掷冰瓜；普通冰瓜80伤并有40%/60%/80%概率叠3层寒意，目标无寒意时必定叠加。3阶起30%将本轮替换为3个凝华冰瓜（80伤完整AOE+10层寒意），4阶替换为极寒冰瓜（120伤完整AOE+20层寒意），5阶另有30%将本轮替换为10个小冰瓜（25伤完整AOE+1层寒意）。"
      }
    };

    // -----------------------------------------------------------------------------

    // 植物注册表 / buildPlantRegistry

    // [原源码行 1659] Canonical S7 plant registry

    // [原源码行 1660] 本版本只保留 S7 规则所需的植物表；不再先声明旧 PVZ1 植物再二次覆写。

    // [原源码行 1661] 植物/飞升/元素配置：唯一数据源。

    // -----------------------------------------------------------------------------

    function buildPlantRegistry(rules) {
      const registry = {};
      for (const key of PLANT_ORDER) {
        const c = rules[key];
        if (!c) throw new Error(`缺少植物规则：${key}`);
        registry[key] = Object.freeze({
          name: c.name,
          emoji: c.emoji,
          hp: c.hp[0],
          cd: c.cd[0],
          kind: "s7",
          tag: c.tag,
          desc: c.desc || "",
          mushroom: !!c.mushroom,
          block: !!c.block,
          tall: !!c.tall,
          ground: !!c.ground,
          lowProfile: !!c.lowProfile,
          zombieIgnore: !!c.zombieIgnore,
          invincible: !!c.invincible,
          expEligible: c.expEligible !== false,
          s7: true
        })
      }
      return Object.freeze(registry)
    }
    const PLANTS = buildPlantRegistry(PLANT_RULES);
    const PLANT_KEYS = Object.freeze(PLANT_ORDER.slice());
    const RANDOM_PLANT_CARD_KEY = "__random_plant__";
    let randomAutoValid = (() => {
      try {
        return localStorage.getItem("pvz_s7_random_auto_valid") === "1"
      } catch (_) {
        return false
      }
    })();
    const DEFAULT_TEAMS = [
      ["snowpea", "wallnut", "cactus", "torchwood", "gatling"],
      ["scaredy", "puff", "fume", "gloom", "ghost"],
      ["cabbage", "melon", "kernel", "winter", "sniper"],
      ["snowpea", "garlic", "kelp", "hypno", "magnet"],
      ["starfruit", "cattail", "sunflower", "sunshroom", "firelotus"]
    ];

