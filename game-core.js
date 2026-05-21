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

  const RelicLibrary = Object.freeze({
    SNEAKY_DIE: {
      id: "sneaky_die",
      name: "The Sneaky Die",
      shortName: "Sneaky Die",
      description: "Roll 3 dice instead of 2. All dice must be consumed."
    },
    IRON_BAR: {
      id: "iron_bar",
      name: "Iron Bar",
      shortName: "Iron Bar",
      description: "Breaking an enemy checker grants +2 global Mult for the round."
    },
    HASTE_BOOTS: {
      id: "haste_boots",
      name: "Haste Boots",
      shortName: "Haste Boots",
      description: "Using a die value of 5 or 6 grants +20 Chips."
    },
    LOADED_LEDGER: {
      id: "loaded_ledger",
      name: "Loaded Ledger",
      shortName: "Ledger",
      description: "Breaking a red checker pays +$1 immediately."
    },
    DOUBLES_DEALER: {
      id: "doubles_dealer",
      name: "Doubles Dealer",
      shortName: "Dealer",
      description: "Rolling doubles grants +1 global Mult for the round."
    },
    MOON_COUPON: {
      id: "moon_coupon",
      name: "Moon Coupon",
      shortName: "Coupon",
      description: "Piece upgrades in the shop cost $1 less."
    }
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
      bossRule: null
    },
    {
      level: 2,
      name: "Big Blind",
      target: 1400,
      rolls: 8,
      enemyMoves: 2,
      enemyRams: 2,
      bossRule: null
    },
    {
      level: 3,
      name: "Boss Blind",
      target: 2600,
      rolls: 9,
      enemyMoves: 2,
      enemyRams: 3,
      bossRule: {
        id: "the_wall",
        name: "The Wall",
        lockedPips: [11, 12],
        description: "Pips 12 and 13 are locked. Player checkers cannot land there."
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

  function createChecker(id, owner, type = CheckerType.STANDARD) {
    const stats = checkerBaseStats[type] || checkerBaseStats[CheckerType.STANDARD];
    return {
      id,
      owner,
      type,
      chips: stats.chips,
      mult: stats.mult,
      ability: null,
      destroyed: false
    };
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

    board[5].modifier = TileModifierLibrary.FORGE;
    board[19].modifier = TileModifierLibrary.MARKET;

    if (level?.bossRule) {
      for (const pipIndex of level.bossRule.lockedPips) {
        board[pipIndex].locked = true;
      }
    }

    spawnHazards(board, level?.enemyRams || 0);
    return board;
  }

  function spawnHazards(board, ramCount) {
    for (const pip of board) {
      for (const checker of pip.enemyPieces) {
        checker.ability = EnemyAbility.PAWN;
      }
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
    globalMult = 1,
    hasRelic = () => false
  }) {
    let chips = 10 * die;
    let mult = globalMult;
    let globalMultDelta = 0;
    let checkerMultDelta = 0;
    const parts = [`${10 * die} move`];
    const notes = [`+${chips} move (${die} x 10)`];

    if (borneOff) {
      chips += 250;
      parts.push("250 exit");
      notes.push("+250 bear off");
    }

    if (brokeEnemy) {
      chips += 200;
      parts.push("200 break");
      notes.push("+200 break");

      if (hasRelic(RelicLibrary.IRON_BAR.id)) {
        globalMultDelta += 2;
        mult += 2;
        parts.push("+2 global Mult");
        notes.push("+2 global Mult");
      }
    }

    if (alliedCount > 0) {
      const alliedBonus = 50 * alliedCount;
      chips += alliedBonus;
      parts.push(`${alliedBonus} allies`);
      notes.push(`+${alliedBonus} allied stack`);
    }

    if (checker.chips) {
      chips += checker.chips;
      parts.push(`${checker.chips} ${checker.type}`);
      notes.push(`+${checker.chips} ${checker.type}`);
    }

    if (checker.mult && checker.mult !== 1) {
      mult *= checker.mult;
      parts.push(`x${formatNumber(checker.mult)} ${checker.type}`);
      notes.push(`x${formatNumber(checker.mult)} ${checker.type}`);
    }

    if (hasRelic(RelicLibrary.HASTE_BOOTS.id) && die >= 5) {
      chips += 20;
      parts.push("20 haste");
      notes.push("+20 Haste");
    }

    if (checker.type === CheckerType.SPRINTER && die >= 5) {
      chips += 120;
      parts.push("120 sprinter");
      notes.push("+120 sprinter");
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
      const modifier = board[destination]?.modifier;
      if (modifier?.id === TileModifierLibrary.FORGE.id) {
        checkerMultDelta += 1;
        notes.push("+1 checker Mult");
      }
      if (modifier?.id === TileModifierLibrary.MARKET.id) {
        chips *= 2;
        parts.push("Market doubles Chips");
        notes.push("Market doubles Chips");
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
      gained: Math.round(chips * mult)
    };
  }

  function applyCheckerType(checker, type) {
    const stats = checkerBaseStats[type] || checkerBaseStats[CheckerType.STANDARD];
    checker.type = type;
    checker.chips = stats.chips;
    checker.mult = stats.mult;
    return checker;
  }

  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  global.PipjackCore = Object.freeze({
    BOARD_SIZE,
    PIPS_PER_ROW,
    TurnPhase,
    CheckerType,
    EnemyAbility,
    RelicLibrary,
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
    formatNumber
  });
})(window);
