"use strict";

    // -----------------------------------------------------------------------------

    // UI/多宫格 / zombieCardInfo

    // [原源码行 8635] UI: cards, controls, persistence

    // -----------------------------------------------------------------------------

    function zombieCardInfo(id) {
      if (id === "blind") return {
        id: id,
        type: "blind",
        name: "盲盒路障",
        emoji: "🎁",
        tag: "开盒"
      };
      let mode = "normal",
        type = id;
      if (id.startsWith("var:")) {
        mode = "variant";
        type = id.slice(4)
      }
      if (id.startsWith("cmd:")) {
        mode = "command";
        type = id.slice(4)
      }
      const z = ZOMBIES[type] || ZOMBIES.normal;
      const specialVariantName = type === "immortal" ? "亡唤不朽僵尸" : type === "bucket" ? "疯狗铁桶僵尸" : null;
      const specialVariantEmoji = type === "immortal" ? "✨🧟" : type === "bucket" ? "🐕🪣🧟" : null;
      return {
        id: id,
        type: type,
        mode: mode,
        name: mode === "variant" ? specialVariantName || "变种" + z.name : mode === "command" ? "指令" + z.name : z.name,
        emoji: mode === "variant" ? specialVariantEmoji || "✨" + z.emoji : z.emoji,
        tag: mode === "variant" ? "变种" : mode === "command" ? "指令" : "普通"
      }
    }

    function zombieCardEntries() {
      const base = [{
        id: "blind",
        name: "盲盒路障",
        emoji: "🎁",
        tag: "开盒"
      }];
      for (const k of ZOMBIE_KEYS.filter(k => !S7_COMMAND_ZOMBIES.includes(k))) base.push({
        id: k,
        ...zombieCardInfo(k)
      });
      for (const k of S7_NORMAL_ZOMBIES.filter(k => ZOMBIES[k])) base.push({
        id: "var:" + k,
        ...zombieCardInfo("var:" + k)
      });
      for (const k of S7_COMMAND_ZOMBIES) base.push({
        id: "cmd:" + k,
        ...zombieCardInfo("cmd:" + k)
      });
      return base
    }

    function normalizeCommonSlot(value) {
      const slot = String(value || "");
      if (!slot) return null;
      if (slot.startsWith("p:")) {
        const key = slot.slice(2);
        return key === RANDOM_PLANT_CARD_KEY || PLANTS[key] ? slot : null
      }
      if (slot.startsWith("z:")) return slot;
      if (PLANTS[slot]) return "p:" + slot;
      return "z:" + slot
    }

    function commonSlotInfo(value) {
      const slot = normalizeCommonSlot(value);
      if (!slot) return null;
      if (slot.startsWith("p:")) {
        const key = slot.slice(2);
        if (key === RANDOM_PLANT_CARD_KEY) return {slot,mode:"plant",id:key,name:"随机植物",tag:randomAutoValid?"随机0阶·合规":"随机0阶"};
        const plant = PLANTS[key];
        if (!plant) return null;
        return {slot,mode:"plant",id:key,name:plant.name,tag:plant.tag}
      }
      const id = slot.slice(2);
      const zombie = zombieCardInfo(id);
      return zombie ? {slot,mode:"zombie",id,name:zombie.name,tag:zombie.tag,zMode:zombie.mode} : null
    }

    function isCommonSlotSelected(index, info) {
      if (selectedCommonSlot !== index || !info) return false;
      return info.mode === "plant" ? tool === "plant" && selected === info.id : tool === "zombie" && selectedZombie === info.id
    }

    function renderMobileCommonSlots() {
      const cards = document.getElementById("cards");
      if (!cards) return;
      while (commonSlots.length < COMMON_SLOT_COUNT) commonSlots.push(null);
      if (commonSlots.length > COMMON_SLOT_COUNT) commonSlots.length = COMMON_SLOT_COUNT;
      cards.innerHTML = commonSlots.map((slot,index) => {
        const info = commonSlotInfo(slot);
        if (!info) return `<div class="card quickCard empty" data-slot="${index}"><div class="name">${index+1}.空槽</div><div class="tag">点总卡槽加入</div></div>`;
        const typeClass = info.mode === "zombie" ? `zombie ${info.zMode==="variant"?"variant":""} ${info.zMode==="command"?"command":""}` : "";
        const selectedClass = isCommonSlotSelected(index,info) ? " selected" : "";
        return `<div class="card quickCard ${typeClass}${selectedClass}" data-slot="${index}" data-mode="${info.mode}" data-k="${info.id}"><div class="name">${index+1}.${info.name}</div><div class="tag">${info.mode==="plant"?"植物":"僵尸"}</div></div>`
      }).join("")
    }

    function mobilePoolCardHtml(info,slot) {
      const cls = info.mode === "zombie" ? `zombie ${info.zMode==="variant"?"variant":""} ${info.zMode==="command"?"command":""}` : "";
      return `<div class="poolCard ${cls}" data-add="${slot}"><div class="name">${info.name}</div><div class="tag">${info.tag||""}</div></div>`
    }

    function renderMobileTotalPool() {
      if (!MOBILE_DEVICE) return;
      const plantBox = document.getElementById("mobilePlantCards");
      const zombieBoxA = document.getElementById("mobileZombieCardsA");
      const zombieBoxB = document.getElementById("mobileZombieCardsB");
      if (plantBox) {
        const plantEntries = [{mode:"plant",id:RANDOM_PLANT_CARD_KEY,name:"随机植物",tag:randomAutoValid?"随机0阶·合规":"随机0阶"}, ...PLANT_KEYS.map(key => ({mode:"plant",id:key,name:PLANTS[key].name,tag:PLANTS[key].tag}))];
        plantBox.innerHTML = plantEntries.map(info => mobilePoolCardHtml(info,"p:"+info.id)).join("")
      }
      const zombies = zombieCardEntries().map(zombie => ({mode:"zombie",id:zombie.id,name:zombie.name,tag:zombie.tag,zMode:zombie.mode}));
      const split = Math.ceil(zombies.length / 2);
      if (zombieBoxA) zombieBoxA.innerHTML = zombies.slice(0,split).map(info => mobilePoolCardHtml(info,"z:"+info.id)).join("");
      if (zombieBoxB) zombieBoxB.innerHTML = zombies.slice(split).map(info => mobilePoolCardHtml(info,"z:"+info.id)).join("")
    }

    function selectCommonSlot(index) {
      selectedCommonSlot = clamp(Number(index) || 0, 0, COMMON_SLOT_COUNT - 1);
      const info = commonSlotInfo(commonSlots[selectedCommonSlot]);
      if (!info) {
        openMobileCardPool();
        renderCards();
        return
      }
      if (info.mode === "plant") {
        selected = info.id;
        cardMode = "plant";
        tool = "plant"
      } else {
        selectedZombie = info.id;
        cardMode = "zombie";
        tool = "zombie"
      }
      closeMobileCardPool(false);
      renderCards();
      redrawUi()
    }

    function addToCommonSlot(value) {
      const slot = normalizeCommonSlot(value);
      if (!slot) return;
      let index = selectedCommonSlot;
      if (!Number.isInteger(index) || index < 0 || index >= COMMON_SLOT_COUNT) index = commonSlots.findIndex(entry => !entry);
      if (index < 0) index = commonInsertCursor % COMMON_SLOT_COUNT;
      commonSlots[index] = slot;
      selectedCommonSlot = index;
      commonInsertCursor = (index + 1) % COMMON_SLOT_COUNT;
      const info = commonSlotInfo(slot);
      if (info?.mode === "plant") {
        selected = info.id;
        cardMode = "plant";
        tool = "plant"
      } else if (info?.mode === "zombie") {
        selectedZombie = info.id;
        cardMode = "zombie";
        tool = "zombie"
      }
      renderCards();
      closeMobileCardPool();
      redrawUi()
    }

    function openMobileCardPool() {
      if (!MOBILE_DEVICE) return;
      renderMobileTotalPool();
      document.getElementById("mobileCardPool")?.classList.remove("hidden")
    }

    function closeMobileCardPool(redraw = true) {
      document.getElementById("mobileCardPool")?.classList.add("hidden");
      if (redraw) redrawUi()
    }

    function toggleMobileCardPool() {
      const pool = document.getElementById("mobileCardPool");
      if (!pool) return;
      if (pool.classList.contains("hidden")) openMobileCardPool();
      else closeMobileCardPool()
    }

    function s7VersusCardCooldownStatus(side, id) {
      const api = window.S7VersusCooldowns;
      if (!api || !api.isActive(state)) return null;
      return api.status(state, side, id, finiteNumber(state?.time, 0))
    }

    function s7VersusCooldownText(status) {
      if (!status || status.ready) return "";
      const t = Math.max(0, finiteNumber(status.remainingSeconds, 0));
      return t < 10 ? t.toFixed(1) + "s" : Math.ceil(t) + "s"
    }

    function s7VersusDecorateCooldownCards(cards) {
      if (!cards) return;
      const api = window.S7VersusCooldowns;
      const active = !!api?.isActive(state);
      cards.querySelectorAll(".card").forEach(card => {
        card.classList.remove("vsCooldownLocked", "vsCooldownReady");
        card.removeAttribute("data-vs-cd");
        if (!active) return;
        const side = card.dataset.mode;
        const id = card.dataset.k;
        if ((side !== "plant" && side !== "zombie") || !id) return;
        const st = api.status(state, side, id, finiteNumber(state?.time, 0));
        if (!st.known) return;
        if (st.ready) card.classList.add("vsCooldownReady");
        else {
          card.classList.add("vsCooldownLocked");
          card.dataset.vsCd = s7VersusCooldownText(st)
        }
      })
    }

    function s7VersusRejectCooldown(side, id, row, x) {
      const st = s7VersusCardCooldownStatus(side, id);
      if (!st || st.ready) return false;
      addEffect(row, x, `卡牌冷却 ${s7VersusCooldownText(st)}`, "#fca5a5", .8);
      return true
    }

    function s7VersusCommitCooldown(side, id) {
      const api = window.S7VersusCooldowns;
      if (!api?.isActive(state)) return;
      api.commitUse(state, side, id, finiteNumber(state?.time, 0));
      renderCards()
    }

    function renderCards() {
      const cards = document.getElementById("cards");
      if (!cards) return;
      if (MOBILE_DEVICE) {
        renderMobileCommonSlots();
        return
      }
      if (cardMode === "plant") {
        const plantCards = [{
          key: RANDOM_PLANT_CARD_KEY,
          emoji: "🎲",
          name: "随机植物",
          tag: randomAutoValid ? "随机0阶·合规" : "随机0阶"
        }, ...PLANT_KEYS.map(k => ({
          key: k,
          emoji: PLANTS[k].emoji,
          name: PLANTS[k].name,
          tag: PLANTS[k].tag
        }))];
        cards.innerHTML = plantCards.map(p =>
          `<div class="card" data-mode="plant" data-k="${p.key}"><div class="emoji">${p.emoji}</div><div class="name">${p.name}</div><div class="tag">${p.tag}</div></div>`
        ).join("")
      } else {
        cards.innerHTML = zombieCardEntries().map(z =>
          `<div class="card zombie ${z.mode==="variant"?"variant":""} ${z.mode==="command"?"command":""}" data-mode="zombie" data-k="${z.id}"><div class="emoji">${z.emoji}</div><div class="name">${z.name}</div><div class="tag">${z.tag}</div></div>`
          ).join("")
      }
      document.querySelectorAll(".card").forEach(x => x.classList.toggle("selected", cardMode === "plant" ? x.dataset
        .k === selected : x.dataset.k === selectedZombie));
      s7VersusDecorateCooldownCards(cards)
    }

    function initCards() {
      const cards = document.getElementById("cards");
      renderCards();
      cards.addEventListener("click", e => {
        const c = e.target.closest(".card");
        if (!c) return;
        if (MOBILE_DEVICE) {
          selectCommonSlot(Number(c.dataset.slot || 0));
          return
        }
        if (c.dataset.mode === "plant") {
          selected = c.dataset.k;
          cardMode = "plant";
          tool = "plant"
        } else {
          selectedZombie = c.dataset.k;
          cardMode = "zombie";
          tool = "zombie"
        }
        renderCards();
        document.body.classList.remove("cardsOpen");
        redrawUi()
      });
      const pool = document.getElementById("mobileCardPool");
      pool?.addEventListener("click", e => {
        if (e.target.closest("#mobilePoolCloseBtn")) {
          closeMobileCardPool();
          return
        }
        const card = e.target.closest(".poolCard");
        if (card) addToCommonSlot(card.dataset.add)
      })
    }

    function selectedToolLabel() {
      if (tool === "plant") return selected === RANDOM_PLANT_CARD_KEY ? "植物：随机植物" : "植物：" + (PLANTS[selected]?.name || selected);
      if (tool === "zombie") return "僵尸：" + zombieCardInfo(selectedZombie).name;
      if (tool === "upgrade") return "升级 W：点植物升一阶";
      if (tool === "shovel") return "铲子 Q";
      if (tool === "glove") return glove ? "手套 E：选择目标格" : "手套 E：点植物拿起";
      return tool
    }

    function makeZombieFromCard(id, row, x) {
      const info = zombieCardInfo(id);
      if (info.type === "blind") return makeBlind(row, x);
      const opt = {
        variant: info.mode === "variant",
        command: info.mode === "command",
        category: ZOMBIES[info.type]?.category
      };
      if (info.type === "bobsled" || info.type === "bobsledSled") {
        const sled = makeZombie("bobsledSled", row, x, opt);
        addEffect(row, x, "手动雪橇入场", "#c7d2fe");
        return sled
      }
      const z = makeZombie(info.type, row, x, opt);
      if (info.mode === "command") addEffect(row, x, "手动指令", "#f87171");
      else if (info.mode === "variant") addEffect(row, x, "手动变种", "#fef08a");
      else addEffect(row, x, "手动僵尸", "#fecaca");
      return z
    }

    function upgradePlantOneLevel(p) {
      if (p?.s7?.barleyOriginal) {
        addEffect(p.row, p.col + .5, "大麦变身不获取经验", "#fde68a");
        return
      }
      if (!p || !PLANT_RULES[p.key]) {
        if (p) addEffect(p.row, p.col + .5, "非S7植物", "#fca5a5");
        return
      }
      s7RefreshPlant(p);
      const lv = p.s7.level || 0;
      if (lv >= 5) {
        addEffect(p.row, p.col + .5, "已飞升", "#fef08a");
        return
      }
      const th = s7Thresholds(p.key);
      const need = th[lv + 1];
      s7GrantPlantExp(p, Math.max(0, need - (p.s7.exp || 0)));
      addEffect(p.row, p.col + .5, "升级到" + (lv + 1) + "阶", "#fef08a")
    }

    function canvasClick(ev) {
      if (!state) return;
      // 联机/Versus 对战模式由各自专用输入路由接管。
      // 必须在这里阻断旧单机 canvasClick，否则同一次点击会先被旧工具种下一株植物，
      // 再让 Versus 输入因为格子已占用而失败。
      if (window._mpBattleActive || state.versus?.active) return;
      const rect = canvas.getBoundingClientRect();
      const cell = boardToCell(ev.clientX - rect.left, ev.clientY - rect.top);
      if (!cell) return;
      if (tool === "upgrade") {
        const s = plantStack(cell.row, cell.col);
        if (s.length) upgradePlantOneLevel(s[0]);
        else addEffect(cell.row, cell.col + .5, "无植物", "#fca5a5");
        return
      }
      if (tool === "zombie") {
        if (s7VersusRejectCooldown("zombie", selectedZombie, cell.row, cell.col + .5)) return;
        const z = makeZombieFromCard(selectedZombie, cell.row, cell.col + .5);
        safePushZombie(z, "manual-card");
        s7VersusCommitCooldown("zombie", selectedZombie);
        return
      }
      if (tool === "shovel") {
        const s = plantStack(cell.row, cell.col);
        if (s.length) removePlant(s[0]);
        return
      }
      if (tool === "glove") {
        if (!glove) {
          const s = plantStack(cell.row, cell.col);
          if (s.length) {
            glove = s[0];
            addEffect(cell.row, cell.col + .5, "拿起", "#bae6fd")
          }
        } else {
          if (cell.col >= PLANT_COLS) {
            addEffect(cell.row, DAMAGE_BOUNDARY_X + .5, "第10列不可放", "#fca5a5");
            return
          }
          if (!state.allowStack && plantStack(cell.row, cell.col).length) {
            addEffect(cell.row, cell.col + .5, "叠种关闭", "#fca5a5");
            return
          }
          glove.row = cell.row;
          glove.col = cell.col;
          addEffect(cell.row, cell.col + .5, "放下", "#bae6fd");
          glove = null;
          tool = "plant"
        }
        return
      }
      if (tool === "plant") {
        if (cell.col >= PLANT_COLS) {
          addEffect(cell.row, DAMAGE_BOUNDARY_X + .5, "第10列不可种", "#fca5a5");
          return
        }
        if (finiteArray(state.iceTrails).some(t => t.row === cell.row && t.col === cell.col)) {
          addEffect(cell.row, cell.col + .5, "冰道不可种", "#bae6fd");
          return
        }
        if (!state.allowStack && plantStack(cell.row, cell.col).length) {
          addEffect(cell.row, cell.col + .5, "叠种关闭", "#fca5a5");
          return
        }
        const plantKey = selected === RANDOM_PLANT_CARD_KEY ? s7RandomPlantKeyForCell(cell.row, cell.col, {
          autoValid: randomAutoValid,
          basePlants: state.plants
        }) : selected;
        if (s7VersusRejectCooldown("plant", plantKey, cell.row, cell.col + .5)) return;
        state.plants.push(makePlant(plantKey, cell.row, cell.col));
        s7VersusCommitCooldown("plant", plantKey);
        if (state.s7) state.s7.validated = false;
        if (selected === RANDOM_PLANT_CARD_KEY) addEffect(cell.row, cell.col + .5, `随机→${PLANTS[plantKey].name}`, "#fde68a", .9)
      }
    }
    const SPEED_LEVELS = [.25, .5, 1, 2, 4];

    function s7SetSpeed(v) {
      if (!state || state.versus?.active) return; // 对战中禁止调速（防开挂/防两端不同步）
      state.speed = SPEED_LEVELS.includes(v) ? v : 1;
      const b = document.getElementById("btnSpeed");
      if (b) b.textContent = state.speed + "×";
      const rs = document.getElementById("resetSpeedBtn");
      if (rs) rs.textContent = "1× C"
    }

    function s7AdjustSpeed(dir) {
      if (!state) return;
      let i = SPEED_LEVELS.indexOf(state.speed || 1);
      if (i < 0) i = 2;
      i = clamp(i + dir, 0, SPEED_LEVELS.length - 1);
      s7SetSpeed(SPEED_LEVELS[i]);
      addEffect(0, .5, "速度" + state.speed + "×", "#bae6fd")
    }

    function cycleSpeed() {
      s7AdjustSpeed(1)
    }

    function setTool(t) {
      tool = t;
      if (t !== "glove") glove = null;
      redrawUi()
    }

    function toggleCardMode() {
      if (MOBILE_DEVICE) {
        toggleMobileCardPool();
        return
      }
      cardMode = cardMode === "plant" ? "zombie" : "plant";
      tool = cardMode === "plant" ? "plant" : "zombie";
      renderCards();
      document.body.classList.add("cardsOpen");
      document.body.classList.remove("opsOpen", "rankOpen");
      const b = document.getElementById("toggleCardsBtn");
      if (b) b.textContent = MOBILE_DEVICE ? "总卡槽 H" : cardMode === "plant" ? "僵尸卡槽 H" : "植物卡槽 H";
      redrawUi()
    }

    function recountActiveCommands() {
      if (!state?.s7) return;
      state.s7.commands = s7EmptyCommandCounts();
      state.s7.commandsByRow = Array.from({
        length: ROWS
      }, () => s7EmptyCommandCounts());
      for (const z of state.zombies || []) {
        if (z.dead || !z.s7?.command) continue;
        const cat = z.s7.category || z.s7.commandCategory;
        if (!S7_ZOMBIE_CATS[cat]) continue;
        state.s7.commands[cat] = (state.s7.commands[cat] || 0) + 1;
        if (Number.isInteger(z.row) && z.row >= 0 && z.row < ROWS) {
          state.s7.commandsByRow[z.row][cat] = (state.s7.commandsByRow[z.row][cat] || 0) + 1;
          z.s7.commandRow = z.row
        } else z.s7.commandRow = null
      }
    }

    function clearAllZombiesAndProjectiles() {
      if (!state) return;
      state.zombies = [];
      state.bullets = [];
      state.gridEffects = [];
      state.iceTrails = [];
      state.rakes = [];
      if (state.s7) {
        state.s7.turrets = [];
        state.s7.summons = [];
        recountActiveCommands()
      }
    }

    function startOrResetBattle() {
      if (!state || state.versus?.active) return; // 对战中禁止重开战斗
      if (state.battle) {
        state.battle = false;
        state.preRun = false;
        state.paused = false;
        frameAcc = 0;
        clearAllZombiesAndProjectiles();
        for (const t of state.teams) {
          if (t.alive) t.spawn = .2
        }
        addEffect(0, DAMAGE_BOUNDARY_X / 2, "停止出怪", "#fca5a5", 1);
        log("S7停止：自动出怪关闭，并已清除全场僵尸/子弹/浮游炮；再次按 P 继续从当前布局开怪。");
        redrawUi();
        return
      }
      state.running = true;
      state.battle = true;
      state.preRun = false;
      state.paused = false;
      frameAcc = 0;
      state.teams.forEach(t => {
        if (t.alive) t.spawn = .2
      });
      if (state.s7) {
        state.s7.validated = false;
        state.s7.commands = s7EmptyCommandCounts();
        state.s7.commandsByRow = Array.from({
          length: ROWS
        }, () => s7EmptyCommandCounts())
      }
      log("S7开战：自动出怪开启；再次按 P 将停止出怪并清空全场僵尸。")
    }

    function clearAllPlants() {
      if (!state || state.versus?.active) return; // 对战中禁止清植物
      state.plants = [];
      state.bullets = [];
      glove = null;
      tool = "plant";
      if (state.s7) {
        state.s7.turrets = [];
        state.s7.summons = []
      }
      redrawUi()
    }

    function killAllZombies() {
      if (!state || state.versus?.active) return; // 对战中禁止秒杀僵尸
      clearAllZombiesAndProjectiles();
      redrawUi()
    }

    function reviveLane(row) {
      if (!state || state.versus?.active || row < 0 || row >= ROWS) return; // 对战中禁止复活本行
      const t = state.teams[row];
      if (!t) return;
      if (!t.alive) {
        state.zombies = state.zombies.filter(z => z.row !== row);
        state.bullets = state.bullets.filter(b => b.row !== row);
        if (state.s7?.turrets) state.s7.turrets = state.s7.turrets.filter(x => x.row !== row);
        recountActiveCommands();
        t.alive = true;
        t.defeatAt = null;
        t.spawn = .2;
        addEffect(row, DAMAGE_BOUNDARY_X / 2, "本行复活", "#86efac", 1.2);
        log(`${TEAM_NAMES[row]}：按键复活，清除本行僵尸并取消淘汰。`)
      } else addEffect(row, DAMAGE_BOUNDARY_X / 2, "本行未淘汰", "#bae6fd", .8);
      redrawUi()
    }
    let savedLayout = (() => {
      try {
        return JSON.parse(localStorage.getItem("pvz_ts_s7_layout"))
      } catch (e) {
        return null
      }
    })();

    function savePlantLayout() {
      if (!state) return;
      savedLayout = state.plants.filter(p => !p.dead).map(p => ({
        key: p.s7?.barleyOriginal ? "barley" : p.key,
        row: p.row,
        col: p.col
      }));
      try {
        localStorage.setItem("pvz_ts_s7_layout", JSON.stringify(savedLayout))
      } catch (e) {}
      log(`存储阵容：${savedLayout.length} 株植物（不含阶数），已永久保存。`);
      addEffect(2, 4.5, "阵容已存储", "#86efac", 1.2)
    }

    function loadPlantLayout() {
      if (state?.versus?.active) return; // 对战中禁止读阵容（防开挂刷植物）
      if (!state || !savedLayout || !savedLayout.length) {
        log("无可加载的存储阵容。");
        return
      }
      for (const p of [...state.plants]) {
        p.dead = true;
        if (p.s7?.binds) p.s7.binds = []
      }
      state.plants = [];
      state.bullets = [];
      if (state.s7) {
        state.s7.turrets = [];
        state.s7.summons = [];
        state.s7.sunflowerSuns = []
      }
      for (const s of savedLayout) {
        const p = makePlant(s.key, s.row, s.col);
        if (p.s7) {
          p.s7.exp = 0;
          p.s7.level = 0;
          p.s7.upgradeHealedThrough = 0;
          p.maxHp = s7MaxHp(p);
          p.hp = p.maxHp
        }
        state.plants.push(p)
      }
      log(`加载阵容：${savedLayout.length} 株植物（全0阶）。`);
      addEffect(2, 4.5, "阵容已加载", "#67e8f9", 1.2);
      redrawUi()
    }
    let quadChildLayoutOverride = Array.isArray(QUAD_BOOT_LAYOUT) ? QUAD_BOOT_LAYOUT : null;
    let quadChildInitStamp = QUAD_BOOT_STAMP;

    function loadQuadChildLayout(layoutOverride = quadChildLayoutOverride) {
      if (!state) return;
      const source = Array.isArray(layoutOverride) && layoutOverride.length ? layoutOverride : Array.isArray(
        savedLayout) && savedLayout.length ? savedLayout : state.plants.map(p => ({
        key: p.key,
        row: p.row,
        col: p.col
      }));
      const compact = source.filter(s => s && PLANTS[s.key] && Number.isFinite(s.row) && Number.isFinite(s.col) && s
        .row >= 0 && s.row < ROWS && s.col >= 0 && s.col < PLANT_COLS);
      state.plants = [];
      state.bullets = [];
      if (state.s7) {
        state.s7.turrets = [];
        state.s7.summons = [];
        state.s7.sunflowerSuns = []
      }
      for (const s of compact) {
        const p = makePlant(s.key, Math.round(s.row), Math.round(s.col));
        if (p.s7) {
          p.s7.exp = 0;
          p.s7.level = 0;
          p.s7.upgradeHealedThrough = 0;
          p.maxHp = s7MaxHp(p);
          p.hp = p.maxHp
        }
        state.plants.push(p)
      }
      log(`多宫格测试${QUAD_CHILD_SLOT}：载入完整5×9阵容 ${compact.length} 株植物。`)
    }

    function quadFrames() {
      return [...document.querySelectorAll("#quadStrip iframe")]
    }
    let quadResizeTimer = 0;
    let quadGridSide = QUAD_MIN_SIDE;
    let quadPlaneCount = quadGridSide * quadGridSide;
    let quadSelectedTarget = "1";
    let quadFocused = false;
    let quadBuildGeneration = 0;
    let quadChildBlobUrl = "";
    let quadRefreshWorkers = [];
    let quadRefreshWorkerUrl = "";
    let quadRefreshWorkerCount = 0;
    let quadRefreshSchedulerGeneration = 0;

    function quadRefreshIntervalMs() {
      if (quadPlaneCount <= 4) return 20;
      if (quadPlaneCount <= 16) return 24;
      if (quadPlaneCount <= 36) return 30;
      if (quadPlaneCount <= 64) return 36;
      return 40
    }

    function desiredQuadRefreshWorkerCount() {
      const cores = Math.max(2, Math.floor(finiteNumber(navigator.hardwareConcurrency, 4)));
      const useful = Math.max(2, cores - 1);
      return Math.max(1, Math.min(8, useful, quadPlaneCount))
    }

    function stopQuadRefreshScheduler() {
      quadRefreshSchedulerGeneration++;
      for (const worker of quadRefreshWorkers) {
        try {
          worker.postMessage({
            type: "stop"
          })
        } catch (_) {}
        try {
          worker.terminate()
        } catch (_) {}
      }
      quadRefreshWorkers = [];
      quadRefreshWorkerCount = 0;
      if (quadRefreshWorkerUrl) {
        try {
          URL.revokeObjectURL(quadRefreshWorkerUrl)
        } catch (_) {}
        quadRefreshWorkerUrl = ""
      }
    }

    function startQuadRefreshScheduler() {
      stopQuadRefreshScheduler();
      // iPadOS Safari and file:// have historically been less reliable with Blob Worker + transferred MessagePort.
      // The 2x2 mobile mode is light enough to use each child frame's RAF watchdog instead.
      if (IOS_DEVICE || location.protocol === "file:") return false;
      if (QUAD_CHILD_MODE || typeof Worker !== "function" || typeof Blob !== "function" || typeof MessageChannel !==
        "function" || !URL?.createObjectURL) return false;
      const workerSource =
        `\n            "use strict";\n            const jobs = new Map();\n            let timer = 0;\n            function ensureTimer() { if (!timer) timer = setInterval(pump, 8); }\n            function closeJob(job) { try { job && job.port && job.port.close(); } catch (_) {} }\n            function pump() {\n              const now = performance.now();\n              for (const job of jobs.values()) {\n                if (now + 0.25 < job.nextAt) continue;\n                try { job.port.postMessage({ type: "quadRefreshTick" }); }\n                catch (_) { closeJob(job); jobs.delete(job.slot); continue; }\n                const missed = Math.max(1, Math.floor((now - job.nextAt) / job.interval) + 1);\n                job.nextAt += missed * job.interval;\n              }\n              if (!jobs.size && timer) { clearInterval(timer); timer = 0; }\n            }\n            self.onmessage = (event) => {\n              const data = event.data || {};\n              if (data.type === "attach" && event.ports && event.ports[0]) {\n                const slot = Number(data.slot) || 0;\n                const old = jobs.get(slot);\n                if (old) closeJob(old);\n                const interval = Math.max(12, Number(data.interval) || 40);\n                const port = event.ports[0];\n                try { port.start && port.start(); } catch (_) {}\n                jobs.set(slot, { slot, port, interval, nextAt: performance.now() + Math.max(0, Number(data.phase) || 0) });\n                ensureTimer();\n              } else if (data.type === "detach") {\n                const slot = Number(data.slot) || 0;\n                closeJob(jobs.get(slot));\n                jobs.delete(slot);\n              } else if (data.type === "stop") {\n                for (const job of jobs.values()) closeJob(job);\n                jobs.clear();\n                if (timer) clearInterval(timer);\n                timer = 0;\n                self.close();\n              }\n            };\n          `;
      try {
        quadRefreshWorkerUrl = URL.createObjectURL(new Blob([workerSource], {
          type: "text/javascript;charset=utf-8"
        }));
        quadRefreshWorkerCount = desiredQuadRefreshWorkerCount();
        for (let index = 0; index < quadRefreshWorkerCount; index++) quadRefreshWorkers.push(new Worker(
          quadRefreshWorkerUrl));
        return quadRefreshWorkers.length > 0
      } catch (err) {
        console.warn("多宫格 Worker 刷新调度不可用，已自动回退到 requestAnimationFrame。", err);
        stopQuadRefreshScheduler();
        return false
      }
    }

    function attachQuadFrameRefreshScheduler(frame, slot) {
      if (!frame?.contentWindow || !quadRefreshWorkers.length) return false;
      const workerIndex = (Math.max(1, Number(slot) || 1) - 1) % quadRefreshWorkers.length;
      const channel = new MessageChannel;
      const interval = quadRefreshIntervalMs();
      const phase = ((Number(slot) || 1) - 1) % Math.max(1, Math.round(interval / 4)) * 4;
      try {
        quadRefreshWorkers[workerIndex].postMessage({
          type: "attach",
          slot: Number(slot) || 1,
          interval: interval,
          phase: phase
        }, [channel.port1]);
        frame.contentWindow.postMessage({
          type: "quadSchedulerPort",
          slot: Number(slot) || 1
        }, "*", [channel.port2]);
        return true
      } catch (err) {
        try {
          channel.port1.close()
        } catch (_) {}
        try {
          channel.port2.close()
        } catch (_) {}
        console.warn(`测试图${slot}无法接入 Worker 刷新调度，使用本地 RAF 回退。`, err);
        return false
      }
    }

    function activateQuadChildFrame(frame, payload, onLoaded) {
      try {
        frame.contentWindow?.postMessage({
          type: "quadInit",
          ...payload
        }, "*");
        frame.contentWindow?.postMessage({
          type: "quadResize"
        }, "*");
        attachQuadFrameRefreshScheduler(frame, payload.slot)
      } catch (_) {}
      onLoaded?.()
    }

    function makeQuadLayoutSnapshot() {
      return finiteArray(savedLayout).filter(item => item && PLANTS[item.key] && Number.isFinite(Number(item.row)) &&
        Number.isFinite(Number(item.col)) && Number(item.row) >= 0 && Number(item.row) < ROWS && Number(item.col) >=
        0 && Number(item.col) < PLANT_COLS).map(item => ({
        key: item.key,
        row: Math.round(Number(item.row)),
        col: Math.round(Number(item.col))
      }))
    }

    function clampQuadSide(value) {
      return Math.max(QUAD_MIN_SIDE, Math.min(QUAD_MAX_SIDE, Math.round(Number(value) || QUAD_MIN_SIDE)))
    }

    function readSavedQuadSide() {
      try {
        return clampQuadSide(localStorage.getItem("pvzS7QuadGridSide"))
      } catch (_) {
        return QUAD_MIN_SIDE
      }
    }

    function persistQuadSide(side) {
      try {
        localStorage.setItem("pvzS7QuadGridSide", String(side))
      } catch (_) {}
    }

    function updateQuadLauncher(side = quadGridSide) {
      quadGridSide = MOBILE_FIXED_QUAD_HOST ? QUAD_MIN_SIDE : clampQuadSide(side);
      quadPlaneCount = quadGridSide * quadGridSide;
      const lanes = quadPlaneCount * ROWS;
      const range = document.getElementById("quadSizeRange");
      const output = document.getElementById("quadSizeValue");
      const button = document.getElementById("quadTestBtn");
      if (range) range.value = String(quadGridSide);
      if (output) output.textContent = `${quadGridSide}×${quadGridSide} · ${quadPlaneCount}平面 · ${lanes}路`;
      if (button) {
        button.textContent = MOBILE_FIXED_QUAD_HOST ? "进入手机版四宫格（4平面 / 20路）" :
          `进入 ${quadGridSide}×${quadGridSide} 宫格（${quadPlaneCount}平面 / ${lanes}路）`
      }
      if (!MOBILE_FIXED_QUAD_HOST) persistQuadSide(quadGridSide)
    }

    function updateQuadHeader(loaded = null) {
      const title = document.getElementById("quadTitleText");
      const note = document.getElementById("quadSummaryText");
      if (MOBILE_FIXED_QUAD_HOST) {
        if (title) title.textContent = "手机版四宫格四阵并行测试";
        if (note) note.textContent = "使用已验证的4个完整5×9平面，共20路；手机端不启用可变宫格加载器。";
        return
      }
      if (title) title.textContent = `${quadGridSide}×${quadGridSide} 宫格并行测试`;
      if (note) {
        const lanes = quadPlaneCount * ROWS;
        const loadText = Number.isFinite(Number(loaded)) ?
          ` · 已加载 ${Math.max(0,Math.min(quadPlaneCount,Number(loaded)))} / ${quadPlaneCount}` : "";
        const perfText = quadGridSide >= 7 ? " · 高密度模式已自动降低缩略图刷新频率" : quadGridSide >= 5 ? " · 可用“聚焦选中”操作单个平面" : "";
        const workerText = quadRefreshWorkerCount > 0 ? ` · ${quadRefreshWorkerCount}个Worker线程错峰管理刷新` : " · 兼容模式刷新";
        note.textContent = `${quadPlaneCount} 个完整5×9平面独立运行，共${lanes}路${loadText}${perfText}${workerText}。`
      }
    }

    function populateQuadTargetSelect() {
      const select = document.getElementById("quadTargetSelect");
      if (!select) return;
      select.innerHTML = "";
      const all = document.createElement("option");
      all.value = "all";
      all.textContent = `全部 ${quadPlaneCount} 个平面`;
      select.appendChild(all);
      for (let i = 1; i <= quadPlaneCount; i++) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `测试图 ${i}`;
        select.appendChild(option)
      }
      if (quadSelectedTarget !== "all") {
        quadSelectedTarget = String(Math.max(1, Math.min(quadPlaneCount, Number(quadSelectedTarget) || 1)))
      }
      select.value = quadSelectedTarget
    }

    function resizeQuadChildren() {
      for (const frame of quadFrames()) {
        try {
          frame.contentWindow?.postMessage({
            type: "quadResize"
          }, "*")
        } catch (_) {}
      }
    }

    function queueQuadResize() {
      if (quadResizeTimer) clearTimeout(quadResizeTimer);
      requestAnimationFrame(() => {
        resizeQuadChildren();
        quadResizeTimer = setTimeout(resizeQuadChildren, 180)
      })
    }

    function sendQuadCommand(type) {
      for (const frame of quadFrames()) {
        try {
          frame.contentWindow?.postMessage({
            type: type
          }, "*")
        } catch (_) {}
      }
    }

    function sendQuadAction(action, target = quadSelectedTarget) {
      const targets = target === "all" ? quadFrames() : quadFrames().filter(frame => frame.closest(".quadBoard")
        ?.dataset.slot === String(target));
      for (const frame of targets) {
        try {
          frame.contentWindow?.postMessage({
            type: "quadAction",
            action: action
          }, "*")
        } catch (_) {}
      }
    }

    function setQuadFocused(next) {
      const strip = document.getElementById("quadStrip");
      const button = document.getElementById("quadFocusBtn");
      quadFocused = !!next && quadSelectedTarget !== "all";
      strip?.classList.toggle("focused", quadFocused);
      if (button) {
        button.classList.toggle("active", quadFocused);
        button.textContent = quadFocused ? "返回全景" : "聚焦选中";
        button.disabled = quadSelectedTarget === "all"
      }
      queueQuadResize()
    }

    function setQuadSelectedTarget(target) {
      quadSelectedTarget = target === "all" ? "all" : String(Math.max(1, Math.min(quadPlaneCount, Number(target) ||
      1)));
      if (quadSelectedTarget === "all" && quadFocused) setQuadFocused(false);
      const select = document.getElementById("quadTargetSelect");
      if (select) select.value = quadSelectedTarget;
      document.querySelectorAll(".quadMapSelect").forEach(button => {
        button.classList.toggle("selected", button.dataset.quadTarget === quadSelectedTarget)
      });
      document.querySelectorAll(".quadBoard").forEach(board => {
        board.classList.toggle("selected", MOBILE_FIXED_QUAD_HOST ? quadSelectedTarget === "all" || board.dataset
          .slot === quadSelectedTarget : board.dataset.slot === quadSelectedTarget)
      });
      const label = document.getElementById("quadTargetText");
      if (label) label.textContent = quadSelectedTarget === "all" ? `当前：全部 ${quadPlaneCount} 个平面` :
        `当前：测试图${quadSelectedTarget}`;
      const focusButton = document.getElementById("quadFocusBtn");
      if (focusButton) focusButton.disabled = quadSelectedTarget === "all";
      if (quadFocused) queueQuadResize()
    }

    function stepQuadSelectedTarget(delta) {
      const current = quadSelectedTarget === "all" ? delta >= 0 ? 0 : quadPlaneCount + 1 : Number(quadSelectedTarget) ||
        1;
      const next = (current - 1 + delta + quadPlaneCount) % quadPlaneCount + 1;
      setQuadSelectedTarget(String(next))
    }

    function quadBoardBySlot(slot) {
      return document.querySelector(`.quadBoard[data-slot="${Number(slot)}"]`)
    }

    function updateQuadBoardDisplay(data) {
      if (!data || !Number.isFinite(Number(data.slot))) return;
      const board = quadBoardBySlot(data.slot);
      if (!board) return;
      if (data.stamp && board.dataset.stamp && data.stamp !== board.dataset.stamp) return;
      const status = board.querySelector(".quadBoardStatus");
      const result = board.querySelector(".quadBoardResult");
      if (data.type === "quadReady") {
        if (status) status.textContent = "已就绪";
        if (result) result.classList.remove("show");
        const frame = board.querySelector("iframe");
        try { frame?.contentWindow?.postMessage({ type:"quadAnimMode", mode:s7AnimationRenderMode }, "*") } catch (_) {}
        return
      }
      if (data.type === "quadProgress") {
        const alive = Math.max(0, Math.min(ROWS, Number(data.aliveLanes) || 0));
        if (status) status.textContent = `${data.formatted||fmt(data.time||0)} · ${alive}路存活`;
        return
      }
      if (data.type === "quadFinished") {
        const shown = data.formatted || fmt(data.time || 0);
        const dense = document.getElementById("quadStrip")?.classList.contains("dense");
        if (status) status.textContent = dense ? "已结束" : `已结束 ${shown}`;
        if (result) {
          const lanes = Array.isArray(data.laneTimes) ? data.laneTimes : [];
          const laneHtml = lanes.slice(0, ROWS).map((lane, index) => {
            const row = Number(lane?.row) || index + 1;
            const time = lane?.formatted || fmt(lane?.time || 0);
            return `<div>第${row}行：${time}</div>`
          }).join("");
          result.innerHTML = dense ?
            `<strong>各路生存时间</strong>${laneHtml?`<div class="quadLaneTimes">${laneHtml}</div>`:""}` :
            `<strong>总存活时间 ${shown}</strong><span>全部5路均已死亡</span>${laneHtml?`<div class="quadLaneTimes">${laneHtml}</div>`:""}`;
          result.classList.add("show")
        }
      }
    }

    function releaseQuadChildBlobUrl() {
      if (!quadChildBlobUrl) return;
      try {
        URL.revokeObjectURL(quadChildBlobUrl)
      } catch (_) {}
      quadChildBlobUrl = ""
    }

    function createQuadChildBlobUrl() {
      releaseQuadChildBlobUrl();
      if (!QUAD_INLINE_SOURCE || typeof Blob !== "function" || !URL?.createObjectURL) return "";
      try {
        quadChildBlobUrl = URL.createObjectURL(new Blob([QUAD_INLINE_SOURCE], {
          type: "text/html;charset=utf-8"
        }))
      } catch (_) {
        quadChildBlobUrl = ""
      }
      return quadChildBlobUrl
    }

    function makeQuadInlineSource(payload) {
      if (!QUAD_INLINE_SOURCE) return "";
      // Safari may clear iframe window.name during blob/srcdoc navigation. Inject the child boot payload
      // into the srcdoc itself before the main script executes, so QUAD_CHILD_MODE is deterministic.
      const bootName = QUAD_WINDOW_NAME_PREFIX + encodeURIComponent(JSON.stringify(payload || {}));
      const bootScript = "<script>try{window.name=" + JSON.stringify(bootName) + ";}catch(_){}</scr" + "ipt>";
      const marker = "<script>";
      const index = QUAD_INLINE_SOURCE.indexOf(marker);
      if (index < 0) return bootScript + QUAD_INLINE_SOURCE;
      return QUAD_INLINE_SOURCE.slice(0, index) + bootScript + QUAD_INLINE_SOURCE.slice(index)
    }

    function createQuadBoard(slot, stamp, layoutSnapshot, childUrl, onLoaded, inlineOnly = false) {
      const board = document.createElement("div");
      board.className = "quadBoard";
      board.dataset.slot = String(slot);
      board.dataset.stamp = String(stamp);
      const label = document.createElement("div");
      label.className = "quadBoardLabel";
      const title = document.createElement("span");
      title.textContent = `图 ${slot}`;
      const status = document.createElement("span");
      status.className = "quadBoardStatus";
      status.textContent = "加载中";
      label.append(title, status);
      label.title = `选择测试图${slot}作为底部按钮的操作目标`;
      label.addEventListener("click", () => setQuadSelectedTarget(String(slot)));
      const result = document.createElement("div");
      result.className = "quadBoardResult";
      const frame = document.createElement("iframe");
      frame.title = `5行9列独立斗蛐蛐地图${slot}`;
      frame.loading = "eager";
      const payload = {
        slot: slot,
        stamp: stamp,
        layout: layoutSnapshot,
        gridSide: quadGridSide,
        planeCount: quadPlaneCount
      };
      frame.name = QUAD_WINDOW_NAME_PREFIX + encodeURIComponent(JSON.stringify(payload));
      let needsFallback = false;
      let activated = false;
      frame.addEventListener("load", () => {
        if (activated) return;
        if (inlineOnly || needsFallback) {
          activated = true;
          activateQuadChildFrame(frame, payload, onLoaded);
          return
        }
        let fallbackTimer = null;
        let gotPong = false;
        const onPong = ev => {
          if (ev?.data?.type === "quadPong" && ev.data.slot === slot) {
            gotPong = true;
            window.removeEventListener("message", onPong);
            if (fallbackTimer != null) clearTimeout(fallbackTimer);
            activated = true;
            activateQuadChildFrame(frame, payload, onLoaded)
          }
        };
        window.addEventListener("message", onPong);
        try {
          frame.contentWindow?.postMessage({
            type: "quadPing",
            slot: slot
          }, "*")
        } catch (_) {}
        fallbackTimer = setTimeout(() => {
          window.removeEventListener("message", onPong);
          if (!gotPong) {
            needsFallback = true;
            const base = location.href.split("#")[0];
            frame.src = `${base}#quadChild=1&slot=${slot}&gridSide=${quadGridSide}&stamp=${stamp}`
          }
        }, 800)
      });
      if (inlineOnly && QUAD_INLINE_SOURCE && "srcdoc" in frame) {
        frame.srcdoc = makeQuadInlineSource(payload)
      } else if (childUrl) {
        frame.src = childUrl
      } else if (QUAD_INLINE_SOURCE && "srcdoc" in frame) {
        frame.srcdoc = makeQuadInlineSource(payload)
      } else {
        const base = location.href.split("#")[0];
        frame.src = `${base}#quadChild=1&slot=${slot}&gridSide=${quadGridSide}&stamp=${stamp}`
      }
      board.append(label, result, frame);
      return board
    }

    // -----------------------------------------------------------------------------

    // UI/多宫格 / buildDesktopVariableQuadFrames

    // [原源码行 9473] Safari（特别是 iOS）在 blob URL 导航时会重置 window.name，

    // [原源码行 9474] 导致子页面无法检测 QUAD_CHILD_MODE。通过 ping-pong 检测：

    // [原源码行 9475] 如果子页面未进入 child mode，用 hash URL 重新加载。

    // [原源码行 9499] 子页面未响应 → window.name 丢失，用 hash URL 重载

    // [原源码行 9506] 使用同一个 Blob URL 作为所有子平面的源码，避免 10×10 时把整份 HTML

    // [原源码行 9507] 重复塞入 100 个 srcdoc 属性；仍保持每个 iframe 拥有完全独立的战斗状态。

    // -----------------------------------------------------------------------------

    function buildDesktopVariableQuadFrames() {
      const strip = document.getElementById("quadStrip");
      if (!strip) return;
      const buildGeneration = ++quadBuildGeneration;
      sendQuadCommand("quadStop");
      strip.innerHTML = "";
      strip.style.setProperty("--quad-side", String(quadGridSide));
      strip.style.setProperty("--quad-gap", quadGridSide >= 8 ? "1px" : quadGridSide >= 5 ? "2px" : "3px");
      strip.classList.toggle("dense", quadGridSide >= 5);
      strip.classList.toggle("ultraDense", quadGridSide >= 8);
      strip.classList.remove("focused");
      quadFocused = false;
      const focusButton = document.getElementById("quadFocusBtn");
      if (focusButton) {
        focusButton.classList.remove("active");
        focusButton.textContent = "聚焦选中"
      }
      quadPlaneCount = quadGridSide * quadGridSide;
      startQuadRefreshScheduler();
      populateQuadTargetSelect();
      setQuadSelectedTarget(quadSelectedTarget);
      updateQuadHeader(0);
      const stamp = String(Date.now());
      const layoutSnapshot = makeQuadLayoutSnapshot();
      const childUrl = createQuadChildBlobUrl();
      const batchSize = quadPlaneCount <= 16 ? quadPlaneCount : quadPlaneCount <= 49 ? 8 : 5;
      let nextSlot = 1;
      let loaded = 0;
      const onLoaded = () => {
        if (buildGeneration !== quadBuildGeneration) return;
        loaded++;
        updateQuadHeader(loaded)
      };
      const appendBatch = () => {
        if (buildGeneration !== quadBuildGeneration || !quadTestIsVisible()) return;
        const fragment = document.createDocumentFragment();
        const stopAt = Math.min(quadPlaneCount, nextSlot + batchSize - 1);
        for (; nextSlot <= stopAt; nextSlot++) {
          fragment.appendChild(createQuadBoard(nextSlot, stamp, layoutSnapshot, childUrl, onLoaded))
        }
        strip.appendChild(fragment);
        setQuadSelectedTarget(quadSelectedTarget);
        if (nextSlot <= quadPlaneCount) {
          requestAnimationFrame(appendBatch)
        } else {
          queueQuadResize()
        }
      };
      appendBatch()
    }

    function buildMobileFixedQuad20Frames() {
      const strip = document.getElementById("quadStrip");
      if (!strip) return;
      const buildGeneration = ++quadBuildGeneration;
      sendQuadCommand("quadStop");
      releaseQuadChildBlobUrl();
      quadGridSide = 2;
      quadPlaneCount = 4;
      startQuadRefreshScheduler();
      quadSelectedTarget = "1";
      quadFocused = false;
      strip.innerHTML = "";
      strip.style.setProperty("--quad-side", "2");
      strip.style.setProperty("--quad-gap", "3px");
      strip.classList.remove("focused", "dense", "ultraDense");
      const focusButton = document.getElementById("quadFocusBtn");
      if (focusButton) {
        focusButton.classList.remove("active");
        focusButton.textContent = "聚焦选中"
      }
      updateQuadHeader();
      const stamp = String(Date.now());
      const layoutSnapshot = makeQuadLayoutSnapshot();
      let slot = 1;
      const appendNextMobileFrame = () => {
        if (buildGeneration !== quadBuildGeneration || !quadTestIsVisible()) return;
        strip.appendChild(createQuadBoard(slot, stamp, layoutSnapshot, "", null, true));
        slot += 1;
        setQuadSelectedTarget("1");
        if (slot <= 4) setTimeout(appendNextMobileFrame, IOS_DEVICE ? 70 : 0);
        else queueQuadResize()
      };
      appendNextMobileFrame()
    }

    function buildQuadTestFrames() {
      if (MOBILE_FIXED_QUAD_HOST) buildMobileFixedQuad20Frames();
      else buildDesktopVariableQuadFrames()
    }

    function openQuadTest() {
      if (!savedLayout || !savedLayout.length) {
        alert("还没有保存阵容。请先进入普通地图布阵并点击“存阵容 S”，再使用多宫格测阵。");
        return
      }
      const usable = savedLayout.filter(item => item && item.col >= 0 && item.col < PLANT_COLS);
      if (!usable.length) {
        alert("已保存阵容中没有可用植物，无法生成独立测试平面。");
        return
      }
      const range = document.getElementById("quadSizeRange");
      updateQuadLauncher(MOBILE_FIXED_QUAD_HOST ? 2 : range?.value ?? quadGridSide);
      quadSelectedTarget = "1";
      document.getElementById("startScreen").style.display = "none";
      document.getElementById("game").style.display = "none";
      const quadPanel = document.getElementById("quadTest");
      quadPanel.classList.remove("hidden");
      buildQuadTestFrames();
      quadPanel.tabIndex = -1;
      try {
        quadPanel.focus({
          preventScroll: true
        })
      } catch (_) {
        quadPanel.focus()
      }
    }

    function closeQuadTest() {
      ++quadBuildGeneration;
      sendQuadCommand("quadStop");
      const strip = document.getElementById("quadStrip");
      if (strip) {
        strip.innerHTML = "";
        strip.classList.remove("focused", "dense", "ultraDense")
      }
      releaseQuadChildBlobUrl();
      stopQuadRefreshScheduler();
      quadFocused = false;
      document.getElementById("quadTest").classList.add("hidden");
      document.getElementById("startScreen").style.display = "flex"
    }

    function quadLaneSurvivalSnapshot() {
      const now = finiteNumber(state?.time, 0);
      return finiteArray(state?.teams).map((team, index) => {
        const time = team?.alive ? now : finiteNumber(team?.defeatAt, now);
        return {
          row: index + 1,
          name: team?.name || TEAM_NAMES[index] || `第${index+1}行`,
          time: time,
          formatted: fmt(time)
        }
      })
    }

    function reportQuadChild(type, extra = {}) {
      if (!QUAD_CHILD_MODE || !window.parent || window.parent === window) return;
      try {
        window.parent.postMessage({
          type: type,
          slot: QUAD_CHILD_SLOT,
          stamp: QUAD_BOOT_STAMP,
          time: state?.time || 0,
          formatted: fmt(state?.time || 0),
          aliveLanes: state?.teams?.filter(t => t?.alive).length || 0,
          laneTimes: quadLaneSurvivalSnapshot(),
          ...extra
        }, "*")
      } catch (_) {}
    }

    function reportQuadProgress(force = false) {
      if (!QUAD_CHILD_MODE || !state) return;
      state.s7 = state.s7 || {};
      const now = state.time || 0;
      if (!force && now - (state.s7.lastQuadProgressAt || -999) < QUAD_PROGRESS_INTERVAL) return;
      state.s7.lastQuadProgressAt = now;
      reportQuadChild("quadProgress")
    }

    function runBeforeBattle() {
      if (!state || state.battle) return;
      state.running = true;
      state.paused = false;
      state.preRun = true;
      frameAcc = 0;
      log("运行：进入无自动出怪战斗态；时间、植物、手动僵尸和子弹照常推进。");
      redrawUi()
    }

    function reportS7Validation() {
      const result = s7ValidateBoard(true);
      log(result ? "铲种检测：全部路线符合。" : "铲种检测：存在不符合路线，已在棋盘格提示。")
    }

    function handleQuadChildAction(action) {
      if (!state) return;
      let reportAfterAction = true;
      switch (action) {
        case "startWave":
          startOrResetBattle();
          break;
        case "pause":
          state.paused = !state.paused;
          break;
        case "run":
          runBeforeBattle();
          break;
        case "restart":
          newState(false);
          state.running = true;
          s7SetSpeed(1);
          resize();
          break;
        case "clearPlants":
          clearAllPlants();
          break;
        case "killZombies":
          killAllZombies();
          break;
        case "validate":
          reportS7Validation();
          break;
        case "toggleRandomValid":
          toggleRandomAutoValid();
          break;
        case "randomFront":
          randomizePlantColumns(0, 5);
          break;
        case "randomBack":
          randomizePlantColumns(5, 9);
          break;
        case "toggleCards":
          toggleCardMode();
          break;
        case "shovel":
          setTool("shovel");
          break;
        case "glove":
          setTool("glove");
          break;
        case "upgrade":
          setTool("upgrade");
          break;
        case "slow":
          s7AdjustSpeed(-1);
          break;
        case "resetSpeed":
          s7SetSpeed(1);
          break;
        case "saveLayout":
          savePlantLayout();
          break;
        case "loadLayout":
          loadPlantLayout();
          break;
        case "fast":
          s7AdjustSpeed(1);
          break;
        case "normal":
          cardMode = "plant";
          renderCards();
          setTool("plant");
          break;
        case "toggleText":
          toggleEntityText();
          break;
        case "finish":
          finish();
          reportAfterAction = false;
          break;
        case "revive1":
          reviveLane(0);
          break;
        case "revive2":
          reviveLane(1);
          break;
        case "revive3":
          reviveLane(2);
          break;
        case "revive4":
          reviveLane(3);
          break;
        case "revive5":
          reviveLane(4);
          break;
        case "stack":
          state.allowStack = !state.allowStack;
          updateModePill();
          redrawUi();
          break;
        case "toggleAnimMode":
          toggleS7AnimationRenderMode();
          break;
        case "toggleEndMode":
          state.endMode = state.endMode === "allDead" ? "lastLane" : "allDead";
          log(state.endMode === "allDead" ? "结束条件：全部路死亡才结束" : "结束条件：仅剩一路存活即结束");
          redrawUi();
          break
      }
      if (reportAfterAction) reportQuadProgress(true)
    }

    function normalizedHotkey(e) {
      if (!e) return "";
      const code = String(e.code || "");
      const codeMap = {
        Space:"space", Digit1:"1", Digit2:"2", Digit3:"3", Digit4:"4", Digit5:"5",
        KeyQ:"q", KeyE:"e", KeyW:"w", KeyP:"p", KeyX:"x", KeyZ:"z", KeyR:"r",
        KeyT:"t", KeyH:"h", KeyB:"b", KeyA:"a", KeyC:"c", KeyS:"s", KeyL:"l",
        KeyD:"d", KeyG:"g", KeyY:"y", KeyJ:"j", KeyU:"u", Escape:"escape"
      };
      if (codeMap[code]) return codeMap[code];
      const key = String(e.key || "").toLowerCase();
      if (key === " " || key === "spacebar") return "space";
      return key
    }

    function quadActionFromKeyEvent(e) {
      const k = normalizedHotkey(e);
      if (!k) return "";
      if (k === "space") return "pause";
      if (["1", "2", "3", "4", "5"].includes(k)) return `revive${k}`;
      if (k === "q") return "shovel";
      if (k === "e") return "glove";
      if (k === "w") return "upgrade";
      if (k === "p") return "startWave";
      if (k === "x") return "clearPlants";
      if (k === "z") return "killZombies";
      if (k === "r") return "run";
      if (k === "t") return "validate";
      if (k === "h") return "toggleCards";
      if (k === "b") return "toggleText";
      if (k === "a") return "slow";
      if (k === "c") return "resetSpeed";
      if (k === "s") return "saveLayout";
      if (k === "l") return "loadLayout";
      if (k === "d") return "fast";
      if (k === "g") return "toggleRandomValid";
      if (k === "v") return "toggleAnimMode";
      if (k === "u") return "toggleEndMode";
      if (k === "y") return "randomFront";
      if (k === "j") return "randomBack";
      if (k === "escape") return "normal";
      return ""
    }

    function handleQuadKeyboardEvent(e, directChild = false) {
      const action = quadActionFromKeyEvent(e);
      if (!action) return false;
      if (state?.versus?.active) return false; // 双人对战中禁用全部调试快捷键
      e.preventDefault();
      e.stopPropagation();
      if (directChild) {
        handleQuadChildAction(action);
        reportQuadChild("quadFocus")
      } else {
        sendQuadAction(action)
      }
      return true
    }

    // -----------------------------------------------------------------------------

    // UI/多宫格 / quadTestIsVisible

    // [原源码行 9809] Prevent browser scrolling/search shortcuts and make the first press effective.

    // -----------------------------------------------------------------------------

    function quadTestIsVisible() {
      const panel = document.getElementById("quadTest");
      return !!panel && !panel.classList.contains("hidden")
    }

    function requestMobileRuntimeMode() {
      if (!MOBILE_DEVICE) return;
      document.body.classList.remove("cardsOpen", "rankOpen");
      document.body.classList.add("opsOpen");
      // iPadOS Safari may reject arbitrary-element fullscreen/orientation locking. Layout does not need either.
      if (IOS_DEVICE) {
        queueRuntimeResize(60);
        return
      }
      try {
        const fullscreen = document.documentElement.requestFullscreen?.({navigationUI:"hide"});
        fullscreen?.catch?.(() => {})
      } catch (_) {}
      try {
        const lock = screen.orientation?.lock?.("landscape");
        lock?.catch?.(() => {})
      } catch (_) {}
    }

    function suspendForPageLifecycle() {
      if (window._mpBattleActive) return;
      frameAcc = 0;
      last = performance.now();
      if (!QUAD_CHILD_MODE || !quadRefreshPort) stopBrowserAnimationLoop()
    }

    function resumeFromPageLifecycle() {
      frameAcc = 0;
      last = performance.now();
      queueRuntimeResize(0);
      if (!QUAD_CHILD_MODE || !quadRefreshPort) startBrowserAnimationLoop()
    }

    function wireCanvasInput() {
      let lastAt = -1e9, lastX = -1e9, lastY = -1e9;
      const forward = (clientX, clientY, event) => {
        const now = performance.now();
        const x = Number(clientX) || 0, y = Number(clientY) || 0;
        if (now - lastAt < 90 && Math.abs(x - lastX) < 3 && Math.abs(y - lastY) < 3) return;
        lastAt = now; lastX = x; lastY = y;
        if (event?.cancelable && event.type === "touchstart") event.preventDefault();
        canvasClick({clientX:x, clientY:y, pointerType:event?.pointerType || (event?.touches ? "touch" : "mouse")})
      };
      canvas.addEventListener("pointerdown", event => forward(event.clientX, event.clientY, event), {passive:false});
      canvas.addEventListener("touchstart", event => {
        const touch = event.changedTouches?.[0] || event.touches?.[0];
        if (touch) forward(touch.clientX, touch.clientY, event)
      }, {passive:false});
      canvas.addEventListener("mousedown", event => forward(event.clientX, event.clientY, event), {passive:true})
    }

    function wire() {
      initCards();
      updateRandomValidButtons();
      updateS7AnimationModeButton();
      const s7AnimBootTest = S7_ANIM.selfTest();
      if (!s7AnimBootTest.ok) console.warn("S7 B01 animation self-test failed", s7AnimBootTest);
      resize();
      addEventListener("resize", () => {
        queueRuntimeResize();
        if (!QUAD_CHILD_MODE && quadTestIsVisible()) queueQuadResize()
      }, {passive:true});
      window.visualViewport?.addEventListener("resize", () => {
        queueRuntimeResize();
        if (!QUAD_CHILD_MODE && quadTestIsVisible()) queueQuadResize()
      }, {passive:true});
      window.visualViewport?.addEventListener("scroll", () => queueRuntimeResize(), {passive:true});
      addEventListener("orientationchange", () => {
        applyRuntimeDeviceClasses();
        queueRuntimeResize(120);
        if (!QUAD_CHILD_MODE && quadTestIsVisible()) setTimeout(queueQuadResize, 140)
      }, {passive:true});
      if (MOBILE_DEVICE) {
        document.addEventListener("touchmove", event => {
          const target = event.target;
          // Let controls and scrollable panels complete their normal tap/scroll sequence.
          const interactive = target?.closest?.("button,input,select,.panelBody,#quadControls,.quadToolbar,#mobileCardPool");
          if (!interactive && target === canvas && event.cancelable) event.preventDefault()
        }, {passive:false});
        document.addEventListener("gesturestart", event => {
          if (event.cancelable) event.preventDefault()
        }, {passive:false});
        document.addEventListener("gesturechange", event => {
          if (event.cancelable) event.preventDefault()
        }, {passive:false})
      }
      addEventListener("pagehide", suspendForPageLifecycle, {passive:true});
      addEventListener("pageshow", resumeFromPageLifecycle, {passive:true});
      document.addEventListener("visibilitychange", () => document.hidden ? suspendForPageLifecycle() : resumeFromPageLifecycle());
      wireCanvasInput();
      if (QUAD_CHILD_MODE) {
        document.body.classList.add("quadChild");
        document.getElementById("startScreen").style.display = "none";
        document.getElementById("game").style.display = "block";
        newState(false);
        loadQuadChildLayout();
        state.running = true;
        s7SetSpeed(1);
        startOrResetBattle();
        resize();
        reportQuadChild("quadReady");
        reportQuadProgress(true);
        addEventListener("message", ev => {
          const type = ev?.data?.type;
          if (type === "quadPing") {
            try {
              window.parent?.postMessage({
                type: "quadPong",
                slot: QUAD_CHILD_SLOT
              }, "*")
            } catch (_) {}
            return
          }
          if (type === "quadSchedulerPort") {
            attachQuadRefreshPort(ev.ports?.[0]);
            return
          }
          if (!state) return;
          if (type === "quadPause") state.paused = true;
          else if (type === "quadResume") state.paused = false;
          else if (type === "quadAnimMode") s7SetAnimationRenderMode(ev?.data?.mode, { silent:true, noBroadcast:true });
          else if (type === "quadResize") resize();
          else if (type === "quadInit") {
            const incomingStamp = String(ev?.data?.stamp || "");
            if (Array.isArray(ev?.data?.layout)) quadChildLayoutOverride = ev.data.layout;
            if (incomingStamp && incomingStamp === quadChildInitStamp) {
              resize();
              reportQuadChild("quadReady");
              reportQuadProgress(true)
            } else {
              quadChildInitStamp = incomingStamp;
              newState(false);
              loadQuadChildLayout(quadChildLayoutOverride);
              state.running = true;
              startOrResetBattle();
              resize();
              reportQuadChild("quadReady");
              reportQuadProgress(true)
            }
          } else if (type === "quadRestart") {
            newState(false);
            loadQuadChildLayout(quadChildLayoutOverride);
            state.running = true;
            startOrResetBattle();
            resize();
            reportQuadChild("quadReady");
            reportQuadProgress(true)
          } else if (type === "quadStop") {
            state.running = false;
            try {
              quadRefreshPort?.close?.()
            } catch (_) {}
            quadRefreshPort = null;
            startBrowserAnimationLoop()
          } else if (type === "quadAction") handleQuadChildAction(ev?.data?.action)
        });
        addEventListener("keydown", e => handleQuadKeyboardEvent(e, true), true);
        const reportFocus = () => reportQuadChild("quadFocus");
        addEventListener("pointerdown", reportFocus, true);
        addEventListener("touchstart", reportFocus, {capture:true,passive:true});
        addEventListener("mousedown", reportFocus, true);
        if (typeof ResizeObserver === "function") {
          const quadChildResizeObserver = new ResizeObserver(() => resize());
          quadChildResizeObserver.observe(document.documentElement)
        }
        window.visualViewport?.addEventListener("resize", () => queueRuntimeResize(), {passive:true});
        addEventListener("orientationchange", () => queueRuntimeResize(120), {passive:true});
        return
      }
      addEventListener("message", ev => {
        const type = ev?.data?.type;
        if (type === "quadReady" || type === "quadProgress" || type === "quadFinished") updateQuadBoardDisplay(ev
          .data);
        else if (type === "quadFocus" && Number.isFinite(Number(ev?.data?.slot))) setQuadSelectedTarget(String(ev
          .data.slot))
      });
      document.getElementById("startBtn").onclick = () => {
        document.body.classList.remove("mp-locked");
        window._mpBattleActive = false;
        requestMobileRuntimeMode();
        newState(false);
        document.getElementById("startScreen").style.display = "none";
        document.getElementById("game").style.display = "block";
        state.running = true;
        s7SetSpeed(1);
        resize()
      };
      document.getElementById("randomBtn").onclick = () => {
        document.body.classList.remove("mp-locked");
        window._mpBattleActive = false;
        requestMobileRuntimeMode();
        newState(true);
        document.getElementById("startScreen").style.display = "none";
        document.getElementById("game").style.display = "block";
        state.running = true;
        startOrResetBattle();
        resize()
      };
      document.getElementById("randomValidHomeBtn").onclick = toggleRandomAutoValid;
      if (MOBILE_DEVICE) {
        const subtitle = document.querySelector("#startScreen h2");
        if (subtitle) subtitle.textContent = IOS_DEVICE ? "已自动识别 iPhone / iPad · iOS 横屏触控与安全区适配" : "已自动识别移动设备 · 横屏触控与安全区适配";
        const closePool = document.getElementById("mobilePoolCloseBtn");
        if (closePool) closePool.onclick = () => closeMobileCardPool()
      }
      quadGridSide = MOBILE_FIXED_QUAD_HOST ? 2 : readSavedQuadSide();
      updateQuadLauncher(quadGridSide);
      const quadSizeRange = document.getElementById("quadSizeRange");
      if (quadSizeRange) {
        quadSizeRange.oninput = () => updateQuadLauncher(quadSizeRange.value);
        quadSizeRange.onchange = () => updateQuadLauncher(quadSizeRange.value)
      }
      document.getElementById("quadTestBtn").onclick = openQuadTest;
      const quadGameBtn = document.getElementById("quadGameBtn");
      if (quadGameBtn) quadGameBtn.onclick = openQuadTest;
      document.getElementById("quadRestartBtn").onclick = buildQuadTestFrames;
      document.getElementById("quadRestartBtn").textContent = MOBILE_FIXED_QUAD_HOST ? "重新开始四图" : "重新开始全部";
      document.getElementById("quadPauseBtn").onclick = () => sendQuadCommand("quadPause");
      document.getElementById("quadResumeBtn").onclick = () => sendQuadCommand("quadResume");
      document.getElementById("quadExitBtn").onclick = closeQuadTest;
      const quadTargetSelect = document.getElementById("quadTargetSelect");
      if (quadTargetSelect) quadTargetSelect.onchange = event => setQuadSelectedTarget(event.target.value || "1");
      const quadPrevTargetBtn = document.getElementById("quadPrevTargetBtn");
      const quadNextTargetBtn = document.getElementById("quadNextTargetBtn");
      const quadFocusBtn = document.getElementById("quadFocusBtn");
      if (quadPrevTargetBtn) quadPrevTargetBtn.onclick = () => stepQuadSelectedTarget(-1);
      if (quadNextTargetBtn) quadNextTargetBtn.onclick = () => stepQuadSelectedTarget(1);
      if (quadFocusBtn) quadFocusBtn.onclick = () => setQuadFocused(!quadFocused);
      document.querySelectorAll(".quadMapSelect").forEach(button => {
        button.onclick = () => setQuadSelectedTarget(button.dataset.quadTarget || "1")
      });
      document.querySelectorAll("[data-quad-action]").forEach(button => {
        button.onclick = () => sendQuadAction(button.dataset.quadAction || "")
      });
      document.getElementById("startWave").onclick = startOrResetBattle;
      document.getElementById("pauseBtn").onclick = () => {
        state.paused = !state.paused;
        document.getElementById("pauseBtn").textContent = (state.paused ? "继续" : "暂停") + " Space"
      };
      document.getElementById("runBtn").onclick = runBeforeBattle;
      document.getElementById("restartBtn").onclick = () => {
        newState(false);
        state.running = true;
        s7SetSpeed(1)
      };
      document.getElementById("clearBtn").onclick = clearAllPlants;
      document.getElementById("killZombiesBtn").onclick = killAllZombies;
      document.getElementById("validateBtn").onclick = reportS7Validation;
      document.getElementById("randomValidBtn").onclick = toggleRandomAutoValid;
      document.getElementById("randomFrontBtn").onclick = () => randomizePlantColumns(0, 5);
      document.getElementById("randomBackBtn").onclick = () => randomizePlantColumns(5, 9);
      document.getElementById("toggleCardsBtn").onclick = toggleCardMode;
      document.getElementById("shovelBtn").onclick = () => setTool("shovel");
      document.getElementById("gloveBtn").onclick = () => setTool("glove");
      document.getElementById("upgradeBtn").onclick = () => setTool("upgrade");
      document.getElementById("slowBtn").onclick = () => s7AdjustSpeed(-1);
      document.getElementById("resetSpeedBtn").onclick = () => s7SetSpeed(1);
      document.getElementById("saveLayoutBtn").onclick = () => savePlantLayout();
      document.getElementById("loadLayoutBtn").onclick = () => loadPlantLayout();
      document.getElementById("fastBtn").onclick = () => s7AdjustSpeed(1);
      document.getElementById("normalBtn").onclick = () => {
        cardMode = "plant";
        renderCards();
        setTool("plant")
      };
      document.getElementById("textBtn").onclick = toggleEntityText;
      document.getElementById("animModeBtn").onclick = toggleS7AnimationRenderMode;
      const battleTextBtn = document.getElementById("battleTextBtn");
      if (battleTextBtn) battleTextBtn.onclick = toggleEntityText;
      const battleAnimBtn = document.getElementById("battleAnimBtn");
      if (battleAnimBtn) battleAnimBtn.onclick = toggleS7AnimationRenderMode;
      document.getElementById("endModeBtn").onclick = () => {
        state.endMode = state.endMode === "allDead" ? "lastLane" : "allDead";
        updateEndModeButton();
        log(state.endMode === "allDead" ? "结束条件：全部路死亡才结束" : "结束条件：仅剩一路存活即结束")
      };
      updateEndModeButton();
      updateTextButtonLabel();
      updateS7AnimationModeButton();
      document.getElementById("stackBtn").onclick = () => {
        state.allowStack = !state.allowStack;
        updateModePill();
        redrawUi()
      };
      (() => {
        const _reverseMap = {};
        for (const [key, name] of Object.entries(PLANT_SHORT_NAMES)) {
          _reverseMap[name] = key
        }
        _reverseMap["缠"] = "kelp";
        _reverseMap["草"] = "kelp";
        _reverseMap["仿"] = "barley";
        _reverseMap["麦"] = "barley";
        _reverseMap["金"] = "marigold";
        _reverseMap["盏"] = "marigold";
        _reverseMap["曾"] = "gloom";
        const BATCH_PLANT_NAMES = Object.freeze(_reverseMap);
        const ROW_NAMES = ["一路", "二路", "三路", "四路", "五路"];
        function s7BatchPlantFromInputs() {
          if (!state || state.versus?.active) return 0; // 对战中禁止批量种植（防开挂）
          let count = 0;
          for (let row = 0; row < ROWS; row++) {
            const input = document.getElementById("batchRow" + row);
            if (!input) continue;
            const chars = [...input.value.trim()];
            for (let i = 0; i < chars.length && i < PLANT_COLS; i++) {
              const key = BATCH_PLANT_NAMES[chars[i]];
              if (key && PLANTS[key]) {
                state.plants.push(makePlant(key, row, i));
                count++
              }
            }
          }
          if (count) {
            for (const p of state.plants) if (!p.s7) s7InitPlant(p, true);
            redrawUi()
          }
          return count
        }
        document.getElementById("batchPlantBtn").onclick = () => {
          const titleEl = document.getElementById("modalTitle");
          const bodyEl = document.getElementById("modalBody");
          if (titleEl) titleEl.textContent = "批量种植";
          if (bodyEl) {
            let html = '<p style="color:#9fb7c6;margin:0 0 10px">每行输入植物简称，从左到右种植。别名：缠/草=水草，金/盏=金盏花，曾=忧郁菇</p>';
            for (let row = 0; row < ROWS; row++) {
              html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
                '<span style="color:#7dd3fc;font-weight:800;min-width:40px">' + ROW_NAMES[row] + '</span>' +
                '<input id="batchRow' + row + '" type="text" style="flex:1;background:#07141d;color:#ecfeff;border:1px solid #335267;border-radius:8px;padding:6px 8px;font-family:monospace;font-size:14px" placeholder="例如：喷伞曾草草">' +
                '</div>'
            }
            bodyEl.innerHTML = html
          }
          const closeBtn = document.getElementById("modalClose");
          if (closeBtn) {
            const origText = closeBtn.textContent;
            closeBtn.textContent = "种植";
            closeBtn.onclick = () => {
              const n = s7BatchPlantFromInputs();
              document.getElementById("modal").classList.add("hidden");
              closeBtn.textContent = origText;
              closeBtn.onclick = () => document.getElementById("modal").classList.add("hidden");
              if (n) log("批量种植：" + n + " 株")
            }
          }
          document.getElementById("modal").classList.remove("hidden");
          const first = document.getElementById("batchRow0");
          if (first) setTimeout(() => first.focus(), 50)
        }
      })();
      document.getElementById("endBtn").onclick = finish;
      for (let i = 1; i <= 5; i++) {
        const b = document.getElementById("reviveRow" + i + "Btn");
        if (b) b.onclick = () => reviveLane(i - 1)
      }
      document.getElementById("btnCards").onclick = () => {
        document.body.classList.add("cardsOpen");
        document.body.classList.remove("opsOpen", "rankOpen")
      };
      document.getElementById("btnOps").onclick = () => {
        document.body.classList.add("opsOpen");
        document.body.classList.remove("cardsOpen", "rankOpen")
      };
      document.getElementById("btnRank").onclick = () => {
        document.body.classList.add("rankOpen");
        document.body.classList.remove("cardsOpen", "opsOpen")
      };
      document.getElementById("btnSpeed").onclick = cycleSpeed;
      document.getElementById("againBtn").onclick = () => {
        document.getElementById("resultModal").classList.add("hidden");
        newState(false);
        state.running = true;
        startOrResetBattle()
      };
      document.getElementById("backBtn").onclick = () => location.reload();
      addEventListener("keydown", e => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
        if (quadTestIsVisible() && handleQuadKeyboardEvent(e, false)) return;
        const k = normalizedHotkey(e);
        if (!state) return;
        if (state.versus?.active) return; // 双人对战期间禁用全部调试快捷键（防开挂）
        if (k === "g") {
          toggleRandomAutoValid();
          e.preventDefault();
          return
        }
        if (k === "space") {
          state.paused = !state.paused;
          e.preventDefault()
        } else if (["1", "2", "3", "4", "5"].includes(k)) {
          reviveLane(Number(k) - 1);
          e.preventDefault()
        } else if (k === "q") setTool("shovel");
        else if (k === "e") setTool("glove");
        else if (k === "w") setTool("upgrade");
        else if (k === "p") startOrResetBattle();
        else if (k === "x") clearAllPlants();
        else if (k === "z") killAllZombies();
        else if (k === "r") runBeforeBattle();
        else if (k === "t") reportS7Validation();
        else if (k === "h") toggleCardMode();
        else if (k === "b") toggleEntityText();
        else if (k === "v") toggleS7AnimationRenderMode();
        else if (k === "a") s7AdjustSpeed(-1);
        else if (k === "c") s7SetSpeed(1);
        else if (k === "s") savePlantLayout();
        else if (k === "l") loadPlantLayout();
        else if (k === "d") s7AdjustSpeed(1);
        else if (k === "n") document.getElementById("batchPlantBtn").click();
        else if (k === "y") {
          randomizePlantColumns(0, 5);
          e.preventDefault()
        } else if (k === "j") {
          randomizePlantColumns(5, 9);
          e.preventDefault()
        } else if (k === "escape") {
          document.getElementById("endBtn").click()
        }
      })
    }
    selected = selected === RANDOM_PLANT_CARD_KEY || PLANT_ORDER.includes(selected) ? selected : "wallnut";
    const S7_COLOR = {
      cold: "#93c5fd",
      fire: "#fb923c",
      poison: "#a3e635",
      lumen: "#fde047",
      dark: "#c084fc"
    };

