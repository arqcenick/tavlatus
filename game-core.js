(function exposePipjackCore(global) {
  "use strict";

  const BOARD_SIZE = 24;
  const PIPS_PER_ROW = 12;

  const TurnPhase = Object.freeze({
    ROLLING: "ROLLING",
    MOVING: "MOVING",
    EVALUATING: "EVALUATING",
    SHOP: "SHOP",
    ROUND_OVER: "ROUND_OVER"
  });

  const CheckerType = Object.freeze({
    STANDARD: "standard",
    GOLDEN: "golden",
    GLASS: "glass",
    ANCHOR: "anchor",
    RUBY: "ruby",
    PRISM: "prism",
    SPRINTER: "sprinter"
  });

  const EnemyAbility = Object.freeze({
    PAWN: "pawn",
    RAM: "ram"
  });

  const TileModifierLibrary = Object.freeze({
    FORGE: {
      id: "forge",
      name: "The Forge",
      shortName: "Forge",
      color: "#c98242",
      description: "Landing here permanently gives the checker +1 Mult."
    },
    MARKET: {
      id: "market",
      name: "The Market",
      shortName: "Market",
      color: "#6aa58c",
      description: "Landing here doubles Chips for this move calculation."
    },
    IRON: {
      id: "iron",
      name: "Iron Gate",
      shortName: "Iron",
      color: "#d9b86d",
      description: "Breaking a red checker here grants +2 global Mult for the round."
    },
    HASTE: {
      id: "haste",
      name: "Haste Line",
      shortName: "Haste",
      color: "#70e35f",
      description: "Landing here with a die value of 5 or 6 adds +20 Chips."
    },
    LEDGER: {
      id: "ledger",
      name: "Ledger Pip",
      shortName: "Ledger",
      color: "#25b9c9",
      description: "Breaking a red checker here pays +1 Akçe immediately."
    },
    DEALER: {
      id: "dealer",
      name: "Dealer Pip",
      shortName: "Dealer",
      color: "#c26db8",
      description: "Landing here grants +1 global Mult for the round."
    }
  });

  const LevelConfig = Object.freeze([
    {
      level: 1,
      name: "Small Blind",
      target: 750,
      rolls: 8,
      enemyMoves: 2,
      enemyRams: 1,
      enemyTokens: [3, 3, 3, 3],
      bossRule: null
    },
    {
      level: 2,
      name: "Big Blind",
      target: 1400,
      rolls: 8,
      enemyMoves: 2,
      enemyRams: 2,
      enemyTokens: [3, 3, 3, 3],
      bossRule: null
    },
    {
      level: 3,
      name: "Boss Blind",
      target: 2600,
      rolls: 9,
      enemyMoves: 2,
      enemyRams: 3,
      enemyTokens: [3, 3, 3, 3],
      bossRule: {
        id: "the_wall",
        name: "The Wall",
        payout: 5,
        lockedPips: [12, 13],
        description: "Pips 13 and 14 are locked on the enemy half. Player checkers cannot land there."
      }
    },
    {
      level: 4,
      name: "Boss Blind",
      target: 4000,
      rolls: 9,
      enemyMoves: 2,
      enemyRams: 3,
      enemyTokens: [3, 3, 3, 3],
      bossRule: {
        id: "the_prime",
        name: "The Prime",
        payout: 6,
        prime: { start: 12, length: 6, shift: 1 },
        description: "A 6-pip prime locks the enemy half and creeps +1 pip toward your deck each enemy phase."
      }
    },
    {
      level: 5,
      name: "Boss Blind",
      target: 5800,
      rolls: 10,
      enemyMoves: 2,
      enemyRams: 4,
      enemyTokens: [3, 3, 3, 3, 3, 3],
      bossRule: {
        id: "the_backgame",
        name: "The Backgame",
        payout: 7,
        allRams: true,
        instantReentry: true,
        extraEnemies: [[15, 1], [17, 1]],
        description: "Every enemy is a Ram. Captured enemies re-enter the same turn. Deep anchors everywhere."
      }
    },
    {
      level: 6,
      name: "Boss Blind",
      target: 6500,
      rolls: 10,
      enemyMoves: 2,
      enemyRams: 4,
      enemyTokens: [3, 3, 3, 3, 3, 3],
      bossRule: {
        id: "the_cube",
        name: "The Cube",
        payout: 8,
        targetEscalation: 150,
        multDecay: 0.5,
        suppressRelic: true,
        description: "The doubling cube raises the target and taxes your Mult each enemy phase. Your strongest relic-pip is suppressed."
      }
    }
  ]);

  const checkerBaseStats = Object.freeze({
    [CheckerType.STANDARD]: Object.freeze({ chips: 0, mult: 1 }),
    [CheckerType.GOLDEN]: Object.freeze({ chips: 50, mult: 1 }),
    [CheckerType.GLASS]: Object.freeze({ chips: 0, mult: 3 }),
    [CheckerType.ANCHOR]: Object.freeze({ chips: 0, mult: 1 }),
    [CheckerType.RUBY]: Object.freeze({ chips: 100, mult: 1 }),
    [CheckerType.PRISM]: Object.freeze({ chips: 25, mult: 2 }),
    [CheckerType.SPRINTER]: Object.freeze({ chips: 0, mult: 1 })
  });

  function getCoreChips(core) {
    if (core === "gold") return 50;
    if (core === "platinum") return 100;
    return 10; // basic, anchor
  }

  function getRimMult(rim) {
    if (rim === "glass") return 2;
    if (rim === "ruby") return 3;
    if (rim === "prism") return 5;
    return 1; // basic
  }

  function getNextRimTier(rim) {
    if (!rim || rim === "basic") return "glass";
    if (rim === "glass") return "ruby";
    if (rim === "ruby" || rim === "prism") return "prism";
    return "glass";
  }

  function recalculateCheckerStats(checker) {
    if (checker.owner !== "player") return;
    checker.chips = getCoreChips(checker.core);
    checker.mult = getRimMult(checker.rim);
  }

  function createChecker(id, owner, type = CheckerType.STANDARD) {
    const stats = checkerBaseStats[type] || checkerBaseStats[CheckerType.STANDARD];
    const checker = {
      id,
      owner,
      type,
      chips: stats.chips,
      mult: stats.mult,
      ability: null,
      destroyed: false
    };
    if (owner === "player") {
      if (type === CheckerType.GOLDEN) {
        checker.core = "gold";
        checker.rim = "basic";
      } else if (type === CheckerType.GLASS) {
        checker.core = "basic";
        checker.rim = "glass";
      } else if (type === CheckerType.ANCHOR) {
        checker.core = "anchor";
        checker.rim = "basic";
      } else if (type === CheckerType.RUBY) {
        checker.core = "basic";
        checker.rim = "ruby";
      } else if (type === CheckerType.PRISM) {
        checker.core = "basic";
        checker.rim = "prism";
      } else {
        checker.core = "basic";
        checker.rim = "basic";
      }
      recalculateCheckerStats(checker);
    }
    return checker;
  }

  function createPip(index) {
    return {
      index,
      playerPieces: [],
      enemyPieces: [],
      modifier: null,
      intent: null,
      locked: false
    };
  }

  function createStartingBoard(levelIndex, makeChecker) {
    const board = Array.from({ length: BOARD_SIZE }, (_, index) => createPip(index));
    const level = LevelConfig[levelIndex];
    const checker = typeof makeChecker === "function"
      ? makeChecker
      : (owner, type) => createChecker(`${owner}-${Math.random().toString(36).slice(2)}`, owner, type);

    board[0].playerPieces = Array.from({ length: 2 }, () => checker("player"));
    board[3].playerPieces = [
      checker("player", CheckerType.GOLDEN),
      checker("player"),
      checker("player")
    ];
    board[7].playerPieces = Array.from({ length: 2 }, () => checker("player"));
    board[10].playerPieces = [
      checker("player", CheckerType.GLASS),
      checker("player", CheckerType.ANCHOR)
    ];
    board[9].playerPieces = [checker("player")];

    board[23].enemyPieces = Array.from({ length: 3 }, () => checker("enemy"));
    board[20].enemyPieces = Array.from({ length: 2 }, () => checker("enemy"));
    board[18].enemyPieces = Array.from({ length: 2 }, () => checker("enemy"));
    board[16].enemyPieces = [checker("enemy")];
    board[14].enemyPieces = [checker("enemy")];
    board[12].enemyPieces = [checker("enemy")];

    if (level?.bossRule) {
      const rule = level.bossRule;
      if (rule.lockedPips) {
        for (const pipIndex of rule.lockedPips) {
          if (board[pipIndex]) board[pipIndex].locked = true;
        }
      }
      if (rule.prime) {
        for (let i = 0; i < rule.prime.length; i++) {
          const idx = rule.prime.start + i;
          if (board[idx]) board[idx].locked = true;
        }
      }
      if (rule.extraEnemies) {
        for (const [pipIndex, count] of rule.extraEnemies) {
          if (board[pipIndex]) {
            for (let i = 0; i < count; i++) board[pipIndex].enemyPieces.push(checker("enemy"));
          }
        }
      }
    }

    spawnHazards(board, level?.enemyRams || 0, level?.bossRule);
    return board;
  }

  function spawnHazards(board, ramCount, bossRule) {
    for (const pip of board) {
      for (const checker of pip.enemyPieces) {
        checker.ability = EnemyAbility.PAWN;
      }
    }

    if (bossRule && bossRule.allRams) {
      for (const pip of board) {
        for (const checker of pip.enemyPieces) {
          checker.ability = EnemyAbility.RAM;
        }
      }
      return;
    }

    const candidates = [12, 14, 16, 18, 20, 23].filter((pipIndex) => board[pipIndex].enemyPieces.length > 0);
    for (let i = 0; i < ramCount && i < candidates.length; i++) {
      const ram = board[candidates[i]].enemyPieces[board[candidates[i]].enemyPieces.length - 1];
      if (ram) ram.ability = EnemyAbility.RAM;
    }
  }

  function expandRolledDice(rolledDice) {
    if (rolledDice.length >= 2 && rolledDice[0] === rolledDice[1]) {
      const expanded = [rolledDice[0], rolledDice[0], rolledDice[0], rolledDice[0]];
      return rolledDice.length > 2 ? [...expanded, ...rolledDice.slice(2)] : expanded;
    }

    return [...rolledDice];
  }

  function getValidTargets({ board, dice, source }) {
    const targets = [];
    const seen = new Set();

    for (const die of dice) {
      const destination = source === "bar" ? die - 1 : source + die;
      const key = destination >= BOARD_SIZE ? `off-${die}` : `${destination}-${die}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (destination >= BOARD_SIZE) {
        targets.push({ type: "bearOff", index: null, die });
        continue;
      }

      const pip = board[destination];
      if (!pip || pip.locked) continue;
      if (pip.enemyPieces.length > 1) continue;

      targets.push({
        type: "pip",
        index: destination,
        die,
        willBump: pip.enemyPieces.length === 1
      });
    }

    return targets;
  }

  function hasAnyLegalMove({ board, dice, bar }) {
    if (dice.length === 0) return false;
    if (bar.player.length > 0) return getValidTargets({ board, dice, source: "bar" }).length > 0;

    return board.some((pip) => pip.playerPieces.length > 0 && getValidTargets({ board, dice, source: pip.index }).length > 0);
  }

  function getPassedPips({ source, targetData }) {
    const destination = targetData.type === "bearOff" ? BOARD_SIZE : targetData.index;
    const start = source === "bar" ? -1 : source;
    const passed = [];

    for (let pipIndex = start + 1; pipIndex < Math.min(destination, BOARD_SIZE); pipIndex++) {
      if (pipIndex !== destination) passed.push(pipIndex);
    }

    return passed.filter((pipIndex) => pipIndex >= 0 && pipIndex < BOARD_SIZE);
  }

  function calculatePassOverEffects({ board, passedPips }) {
    let chips = 0;
    let mult = 1;
    const events = [];

    for (const pipIndex of passedPips) {
      const modifier = board[pipIndex]?.modifier;
      if (modifier?._suppressed) continue;
      if (modifier?.id === TileModifierLibrary.FORGE.id) {
        chips += 5;
        events.push({ pipIndex, type: "chips", amount: 5, label: "+5 pass" });
      }
      if (modifier?.id === TileModifierLibrary.MARKET.id) {
        mult += 0.25;
        events.push({ pipIndex, type: "mult", amount: 0.25, label: "x+0.25 pass" });
      }
    }

    return { chips, mult, events };
  }

  function calculateMoveScore({
    checker,
    die,
    destination,
    borneOff,
    brokeEnemy,
    alliedCount = 0,
    passedPips = [],
    board,
    globalMult = 1
  }) {
    let chips = 10 * die;
    let mult = globalMult;
    let globalMultDelta = 0;
    let checkerMultDelta = 0;
    const destMod = destination !== null ? board[destination]?.modifier : null;
    const activeDestMod = destMod && !destMod._suppressed ? destMod : null;
    const parts = [`${10 * die} move`];
    const notes = [`+${chips} move (${die} x 10)`];

    if (borneOff) {
      chips += 250;
      parts.push("250 exit");
      notes.push("+250 attack");
    }

    if (brokeEnemy) {
      chips += 200;
      parts.push("200 break");
      notes.push("+200 break");

      if (activeDestMod?.id === TileModifierLibrary.IRON.id) {
        globalMultDelta += 2;
        mult += 2;
        parts.push("+2 Iron");
        notes.push("+2 global Mult Iron");
      }
    }

    if (alliedCount > 0) {
      const alliedBonus = 50 * alliedCount;
      chips += alliedBonus;
      parts.push(`${alliedBonus} allies`);
      notes.push(`+${alliedBonus} allied stack`);
    }

    if (checker.owner === "player") {
      if (checker.chips) {
        chips += checker.chips;
        parts.push(`${checker.chips} core`);
        notes.push(`+${checker.chips} ${checker.core} core`);
      }
      if (checker.mult && checker.mult !== 1) {
        mult *= checker.mult;
        parts.push(`x${formatNumber(checker.mult)} rim`);
        notes.push(`x${formatNumber(checker.mult)} ${checker.rim} rim`);
      }
    } else {
      if (checker.chips) {
        chips += checker.chips;
        parts.push(`${checker.chips} enemy`);
        notes.push(`+${checker.chips} enemy`);
      }
      if (checker.mult && checker.mult !== 1) {
        mult *= checker.mult;
        parts.push(`x${formatNumber(checker.mult)} enemy`);
        notes.push(`x${formatNumber(checker.mult)} enemy`);
      }
    }

    const passOver = calculatePassOverEffects({ board, passedPips });
    if (passOver.chips) {
      chips += passOver.chips;
      parts.push(`${passOver.chips} pass`);
      notes.push(`+${passOver.chips} pass-over`);
    }
    if (passOver.mult !== 1) {
      mult *= passOver.mult;
      parts.push(`x${formatNumber(passOver.mult)} pass`);
      notes.push(`x${formatNumber(passOver.mult)} pass-over`);
    }

    if (destination !== null) {
      if (activeDestMod?.id === TileModifierLibrary.FORGE.id) {
        const nextRim = getNextRimTier(checker.rim);
        notes.push(`Forge: upgrade rim to ${nextRim}`);
      }
      if (activeDestMod?.id === TileModifierLibrary.MARKET.id) {
        chips *= 2;
        parts.push("Market doubles Chips");
        notes.push("Market doubles Chips");
      }
      if (activeDestMod?.id === TileModifierLibrary.HASTE.id && die >= 5) {
        chips += 20;
        parts.push("20 haste");
        notes.push("+20 Haste");
      }
      if (activeDestMod?.id === TileModifierLibrary.LEDGER.id && brokeEnemy) {
        notes.push("+1 Akçe Ledger");
      }
      if (activeDestMod?.id === TileModifierLibrary.DEALER.id) {
        globalMultDelta += 1;
        mult += 1;
        parts.push("+1 Dealer");
        notes.push("+1 global Mult Dealer");
      }
    }

    return {
      chips,
      mult,
      parts,
      notes,
      passOver,
      globalMultDelta,
      checkerMultDelta,
      checkerRimUpgrade: activeDestMod?.id === TileModifierLibrary.FORGE.id ? getNextRimTier(checker.rim) : null,
      moneyDelta: activeDestMod?.id === TileModifierLibrary.LEDGER.id && brokeEnemy ? 1 : 0,
      gained: Math.round(chips * mult)
    };
  }

  function applyCheckerUpgrade(checker, upgradeType, upgradeValue) {
    if (upgradeType === "core") {
      checker.core = upgradeValue;
    } else if (upgradeType === "rim") {
      checker.rim = upgradeValue;
    }
    recalculateCheckerStats(checker);
    return checker;
  }

  function applyCheckerType(checker, type) {
    checker.type = type;
    if (checker.owner === "player") {
      if (type === CheckerType.GOLDEN) {
        checker.core = "gold";
        checker.rim = "basic";
      } else if (type === CheckerType.GLASS) {
        checker.core = "basic";
        checker.rim = "glass";
      } else if (type === CheckerType.ANCHOR) {
        checker.core = "anchor";
        checker.rim = "basic";
      } else if (type === CheckerType.RUBY) {
        checker.core = "basic";
        checker.rim = "ruby";
      } else if (type === CheckerType.PRISM) {
        checker.core = "basic";
        checker.rim = "prism";
      } else {
        checker.core = "basic";
        checker.rim = "basic";
      }
      recalculateCheckerStats(checker);
    } else {
      const stats = checkerBaseStats[type] || checkerBaseStats[CheckerType.STANDARD];
      checker.chips = stats.chips;
      checker.mult = stats.mult;
    }
    return checker;
  }

  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const ShopRarityWeights = Object.freeze({ common: 60, rare: 30, legendary: 10 });

  const ShopCatalog = Object.freeze([
    { kind: "pip", title: "Forge Pip", detail: "Land here to temporarily upgrade this checker's rim tier.", price: 3, rarity: "common", modifier: TileModifierLibrary.FORGE },
    { kind: "pip", title: "Dealer Pip", detail: "Land here for +1 global Mult this round.", price: 4, rarity: "common", modifier: TileModifierLibrary.DEALER },
    { kind: "pip", title: "Haste Line", detail: "Land here with die 5 or 6 for +20 Chips.", price: 4, rarity: "common", modifier: TileModifierLibrary.HASTE },
    { kind: "pip", title: "Market Pip", detail: "Land here to double Chips for that move.", price: 4, rarity: "common", modifier: TileModifierLibrary.MARKET },
    { kind: "pip", title: "Iron Gate", detail: "Break a red checker here for +2 global Mult this round.", price: 5, rarity: "rare", modifier: TileModifierLibrary.IRON },
    { kind: "pip", title: "Ledger Pip", detail: "Break a red checker here to gain +1 Akçe immediately.", price: 5, rarity: "rare", modifier: TileModifierLibrary.LEDGER },
    { kind: "checker", title: "Golden Checker", detail: "Replace a starting checker with a Golden Checker (Gold Core).", price: 3, rarity: "common", checkerType: CheckerType.GOLDEN },
    { kind: "checker", title: "Glass Checker", detail: "Replace a starting checker with a Glass Checker (Glass Rim).", price: 3, rarity: "common", checkerType: CheckerType.GLASS },
    { kind: "checker", title: "Sprinter Checker", detail: "Replace a starting checker with a Sprinter Checker.", price: 3, rarity: "common", checkerType: CheckerType.SPRINTER },
    { kind: "checker", title: "Anchor Checker", detail: "Replace a starting checker with an Anchor Checker (Anchor Core).", price: 4, rarity: "rare", checkerType: CheckerType.ANCHOR },
    { kind: "checker", title: "Ruby Checker", detail: "Replace a starting checker with a Ruby Checker (Ruby Rim).", price: 4, rarity: "rare", checkerType: CheckerType.RUBY },
    { kind: "checker", title: "Prism Checker", detail: "Replace a starting checker with a Prism Checker (Prism Rim).", price: 5, rarity: "legendary", checkerType: CheckerType.PRISM },
    { kind: "upgrade", title: "Gold Core", detail: "Upgrade a starting checker's core to Gold (+50 Chips).", price: 3, rarity: "common", upgrade: { type: "core", value: "gold" } },
    { kind: "upgrade", title: "Glass Rim", detail: "Upgrade a starting checker's rim to Glass (x2 Mult, shatters easily).", price: 3, rarity: "common", upgrade: { type: "rim", value: "glass" } },
    { kind: "upgrade", title: "Anchor Core", detail: "Upgrade a starting checker's core to Anchor (invulnerable).", price: 4, rarity: "rare", upgrade: { type: "core", value: "anchor" } },
    { kind: "upgrade", title: "Ruby Rim", detail: "Upgrade a starting checker's rim to Ruby (x3 Mult).", price: 4, rarity: "rare", upgrade: { type: "rim", value: "ruby" } },
    { kind: "upgrade", title: "Platinum Core", detail: "Upgrade a starting checker's core to Platinum (+100 Chips).", price: 5, rarity: "legendary", upgrade: { type: "core", value: "platinum" } },
    { kind: "upgrade", title: "Prism Rim", detail: "Upgrade a starting checker's rim to Prism (x5 Mult).", price: 6, rarity: "legendary", upgrade: { type: "rim", value: "prism" } }
  ]);

  function rollShopOffers(options) {
    const count = (options && options.count) || 4;
    const legendaries = ShopCatalog.filter((entry) => entry.rarity === "legendary");
    const rares = ShopCatalog.filter((entry) => entry.rarity === "rare");
    const commons = ShopCatalog.filter((entry) => entry.rarity === "common");
    const picked = [];
    let legendaryUsed = false;
    let safety = 0;

    while (picked.length < count && safety < 200) {
      safety += 1;
      const roll = Math.random() * 100;
      let pool;
      if (roll < ShopRarityWeights.legendary && !legendaryUsed && legendaries.length) {
        pool = legendaries;
        legendaryUsed = true;
      } else if (roll < ShopRarityWeights.legendary + ShopRarityWeights.rare) {
        pool = rares;
      } else {
        pool = commons;
      }
      if (!pool || !pool.length) continue;
      const entry = pool[Math.floor(Math.random() * pool.length)];
      if (picked.some((existing) => existing.title === entry.title)) continue;
      picked.push(entry);
    }
    return picked;
  }

  function pipCountForRarity(rarity) {
    if (rarity === "legendary") return 18 + Math.floor(Math.random() * 5);
    if (rarity === "rare") return 10 + Math.floor(Math.random() * 4);
    return 4 + Math.floor(Math.random() * 3);
  }

  const PackTypes = Object.freeze({
    BEAR_OFF: { id: "bear_off", name: "Bear-Off Box", detail: "4 relic-pip offers. Race one to bear-off.", price: 2, kinds: ["pip"], rolls: 2, count: 4, rarityFloor: null },
    BLOT: { id: "blot", name: "Blot Barrel", detail: "4 checker drafts. Race one to bear-off.", price: 3, kinds: ["checker"], rolls: 2, count: 4, rarityFloor: null },
    FORGE_FOLIO: { id: "forge_folio", name: "Forge Folio", detail: "4 core/rim upgrades. Race one to bear-off.", price: 3, kinds: ["upgrade"], rolls: 2, count: 4, rarityFloor: null },
    CHOUETTE: { id: "chouette", name: "Chouette Case", detail: "3 mixed Rare+ offers, +1 roll.", price: 5, kinds: ["pip", "checker", "upgrade"], rolls: 3, count: 3, rarityFloor: "rare" }
  });

  function makePack(packType) {
    let pool = ShopCatalog.filter((entry) => packType.kinds.includes(entry.kind));
    if (packType.rarityFloor === "rare") {
      pool = pool.filter((entry) => entry.rarity === "rare" || entry.rarity === "legendary");
    }
    const chosen = shuffleArray(pool).slice(0, packType.count);
    return chosen.map((entry) => {
      const pipCount = pipCountForRarity(entry.rarity);
      return { entry, rarity: entry.rarity, pipCount, remaining: pipCount, borneOff: false };
    });
  }

  function rollShopPacks(options) {
    const count = (options && options.count) || 2;
    return shuffleArray(Object.values(PackTypes)).slice(0, count);
  }

  global.PipjackCore = Object.freeze({
    BOARD_SIZE,
    PIPS_PER_ROW,
    TurnPhase,
    CheckerType,
    EnemyAbility,
    TileModifierLibrary,
    LevelConfig,
    createChecker,
    createPip,
    createStartingBoard,
    spawnHazards,
    expandRolledDice,
    getValidTargets,
    hasAnyLegalMove,
    getPassedPips,
    calculatePassOverEffects,
    calculateMoveScore,
    applyCheckerType,
    applyCheckerUpgrade,
    getNextRimTier,
    recalculateCheckerStats,
    formatNumber,
    ShopCatalog,
    ShopRarityWeights,
    PackTypes,
    rollShopOffers,
    makePack,
    rollShopPacks,
    pipCountForRarity
  });
})(window);
