const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const rulesToggle = document.getElementById("rulesToggle");
    const rulesClose = document.getElementById("rulesClose");
    const rulesDrawer = document.getElementById("rulesDrawer");
    const drawerScrim = document.getElementById("drawerScrim");
    const Core = window.PipjackCore;
    const {
      BOARD_SIZE,
      PIPS_PER_ROW,
      TurnPhase,
      CheckerType,
      RelicLibrary,
      TileModifierLibrary,
      LevelConfig
    } = Core;

    const Theme = Object.freeze({
      paper: "#160817",
      panel: "#25102d",
      panelSoft: "rgba(255,248,231,0.78)",
      ink: "#fff8e7",
      darkInk: "#1b1020",
      muted: "#d9c8e8",
      faint: "rgba(255,255,255,0.12)",
      line: "rgba(255,255,255,0.24)",
      player: "#fff8e7",
      playerEdge: "#1a1021",
      enemy: "#ff3f72",
      enemyEdge: "#5b0c37",
      pipA: "#ffcf48",
      pipB: "#27d7ff",
      accent: "#35f2a4",
      gold: "#ffe15c",
      blue: "#28d4ff",
      danger: "#ff3f72",
      valid: "#a6ff43",
      purple: "#8d4dff"
    });

    const layout = {
      leftMenuWidth: 286,
      boardPaddingX: 34,
      boardPaddingY: 34,
      pipGap: 6,
      checkerRadius: 26
    };

    let nextCheckerId = 1;
    let autoRollTimer = null;

    const GameState = {
      board: [],
      bar: { player: [], enemy: [] },
      borneOff: [],
      destroyed: [],
      score: {
        current: 0,
        target: LevelConfig[0].target,
        chips: 0,
        mult: 1,
        lastMove: 0
      },
      money: 0,
      dice: [],
      rolledDice: [],
      turn: 1,
      rollsRemaining: LevelConfig[0].rolls,
      turnPhase: TurnPhase.ROLLING,
      selected: null,
      validTargets: [],
      relics: [],
      runUpgrades: {
        tileModifiers: [],
        checkerTypes: []
      },
      levelIndex: 0,
      levelConfig: LevelConfig,
      floatingTexts: [],
      moveAnimations: [],
      scoreBursts: [],
      diceBodies: [],
      hiddenCheckerIds: new Set(),
      buttons: [],
      shopOffers: [],
      storePurchases: 0,
      roundPayout: null,
      payoutStartedAt: 0,
      enemyPendingReentry: [],
      enemyEscaped: false,
      pipHitAreas: [],
      checkerHitAreas: [],
      hover: {
        x: 0,
        y: 0,
        active: false,
        tooltip: null
      },
      barHitArea: null,
      bearOffArea: null,
      message: "Roll dice to begin.",
      runWon: false,
      debugOpen: false
    };

    function createChecker(owner, type = CheckerType.STANDARD) {
      return Core.createChecker(`checker-${nextCheckerId++}`, owner, type);
    }

    function createPip(index) {
      return Core.createPip(index);
    }

    function createStartingBoard(levelIndex) {
      return Core.createStartingBoard(levelIndex, createChecker);
    }

    function spawnHazards(board, hazardCount) {
      Core.spawnHazards(board, hazardCount);
    }

    function resetLevel(levelIndex, preserveRelics = true) {
      if (autoRollTimer) {
        clearTimeout(autoRollTimer);
        autoRollTimer = null;
      }
      const keptRelics = preserveRelics ? GameState.relics : [];
      const keptUpgrades = preserveRelics ? GameState.runUpgrades : { tileModifiers: [], checkerTypes: [] };
      const keptMoney = preserveRelics ? GameState.money : 0;
      const level = LevelConfig[levelIndex];

      GameState.board = createStartingBoard(levelIndex);
      GameState.runUpgrades = keptUpgrades;
      applyRunUpgrades();
      GameState.bar = { player: [], enemy: [] };
      GameState.borneOff = [];
      GameState.destroyed = [];
      GameState.score = {
        current: 0,
        target: level.target,
        chips: 0,
        mult: 1,
        lastMove: 0
      };
      GameState.money = keptMoney;
      GameState.dice = [];
      GameState.rolledDice = [];
      GameState.turn = 1;
      GameState.rollsRemaining = level.rolls;
      GameState.turnPhase = TurnPhase.ROLLING;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.relics = keptRelics;
      GameState.levelIndex = levelIndex;
      GameState.floatingTexts = [];
      GameState.moveAnimations = [];
      GameState.scoreBursts = [];
      GameState.diceBodies = [];
      GameState.hiddenCheckerIds = new Set();
      GameState.shopOffers = [];
      GameState.storePurchases = 0;
      GameState.roundPayout = null;
      GameState.payoutStartedAt = 0;
      GameState.enemyPendingReentry = [];
      GameState.enemyEscaped = false;
      GameState.runWon = false;
      GameState.message = `${level.name}: dice are rolling.`;
      queueAutoRoll();
    }

    function hasRelic(relicId) {
      return GameState.relics.some((relic) => relic.id === relicId);
    }

    function addRelic(relic) {
      if (!hasRelic(relic.id)) {
        GameState.relics.push(relic);
        GameState.message = `${relic.name} added.`;
        addFloatingText(canvas.clientWidth - 190, canvas.clientHeight - 104, `+ ${relic.shortName}`, Theme.accent, 1.1);
      }
    }

    function enterShop() {
      GameState.turnPhase = TurnPhase.SHOP;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.dice = [];
      GameState.rolledDice = [];
      GameState.diceBodies = [];
      GameState.storePurchases = 0;
      GameState.shopOffers = generateShopOffers();
      GameState.message = "Shop open. Buy relics or upgrade checkers, then start the next blind.";
    }

    function generateShopOffers() {
      const relicPool = [
        {
          kind: "relic",
          title: "Iron Bar",
          detail: "Breaks add +2 global Mult for the rest of a round.",
          price: 5,
          relic: RelicLibrary.IRON_BAR
        },
        {
          kind: "relic",
          title: "Haste Boots",
          detail: "Using a 5 or 6 adds +20 Chips.",
          price: 4,
          relic: RelicLibrary.HASTE_BOOTS
        },
        {
          kind: "relic",
          title: "Ssneaky Die",
          detail: "Roll 3 dice instead of 2.",
          price: 6,
          relic: RelicLibrary.SNEAKY_DIE
        },
        {
          kind: "relic",
          title: "Loaded Ledger",
          detail: "Breaking a red checker pays +1 Akçe immediately.",
          price: 5,
          relic: RelicLibrary.LOADED_LEDGER
        },
        {
          kind: "relic",
          title: "Doubles Dealer",
          detail: "Rolling doubles gives +1 global Mult this round.",
          price: 4,
          relic: RelicLibrary.DOUBLES_DEALER
        },
        {
          kind: "relic",
          title: "Moon Coupon",
          detail: "Piece upgrades in the shop cost 1 Akçe less.",
          price: 3,
          relic: RelicLibrary.MOON_COUPON
        }
      ];

      const upgradePool = [
        {
          kind: "upgrade",
          title: "Golden Top",
          detail: "Upgrade a top white checker to +50 Chips.",
          price: 3,
          checkerType: CheckerType.GOLDEN
        },
        {
          kind: "upgrade",
          title: "Glass Top",
          detail: "Upgrade a top white checker to x3 Mult.",
          price: 4,
          checkerType: CheckerType.GLASS
        },
        {
          kind: "upgrade",
          title: "Anchor Top",
          detail: "Upgrade a top white checker so hazards ignore it.",
          price: 3,
          checkerType: CheckerType.ANCHOR
        },
        {
          kind: "upgrade",
          title: "Ruby Top",
          detail: "Upgrade a top white checker to +100 Chips.",
          price: 5,
          checkerType: CheckerType.RUBY
        },
        {
          kind: "upgrade",
          title: "Prism Top",
          detail: "Upgrade a top white checker to +25 Chips and x2 Mult.",
          price: 5,
          checkerType: CheckerType.PRISM
        },
        {
          kind: "upgrade",
          title: "Sprinter Top",
          detail: "Upgrade a top white checker to +120 Chips on die 5 or 6.",
          price: 4,
          checkerType: CheckerType.SPRINTER
        }
      ];

      const relicOffers = shuffle(relicPool.filter((offer) => !hasRelic(offer.relic.id))).slice(0, 2);
      const upgradeOffers = shuffle(upgradePool).slice(0, 3);
      return [...relicOffers, ...upgradeOffers].map((offer, index) => ({
        ...offer,
        id: `${offer.kind}-${index}-${offer.title.toLowerCase().replace(/\s+/g, "-")}`,
        bought: false
      }));
    }

    function chooseShopOffer(offer) {
      if (GameState.turnPhase !== TurnPhase.SHOP) return;
      if (offer.bought) return;

      const price = getOfferPrice(offer);
      if (GameState.money < price) {
        GameState.message = `Need ${price} Akçe for ${offer.title}.`;
        return;
      }

      GameState.money -= price;
      offer.bought = true;
      GameState.storePurchases += 1;
      if (offer.kind === "relic") addRelic(offer.relic);
      if (offer.kind === "upgrade") addCheckerUpgrade(offer.checkerType);
      GameState.message = `${offer.title} purchased for ${price} Akçe.`;
    }

    function getOfferPrice(offer) {
      const discount = offer.kind === "upgrade" && hasRelic(RelicLibrary.MOON_COUPON.id) ? 1 : 0;
      return Math.max(1, offer.price - discount);
    }

    function addTileUpgrade(modifier) {
      GameState.runUpgrades.tileModifiers.push(modifier.id);
      installTileModifier(modifier);
    }

    function addCheckerUpgrade(type) {
      GameState.runUpgrades.checkerTypes.push(type);
      upgradeTopPlayerChecker(type);
    }

    function installTileModifier(modifier) {
      const candidates = GameState.board.filter((pip) => !pip.locked && !pip.modifier);
      const pip = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pip) return;
      pip.modifier = modifier;
      GameState.message = `${modifier.name} installed on Pip ${pip.index + 1}.`;
    }

    function applyRunUpgrades() {
      for (const modifierId of GameState.runUpgrades.tileModifiers) {
        const modifier = modifierId === TileModifierLibrary.FORGE.id ? TileModifierLibrary.FORGE : TileModifierLibrary.MARKET;
        installTileModifier(modifier);
      }

      for (const checkerType of GameState.runUpgrades.checkerTypes) {
        upgradeTopPlayerChecker(checkerType);
      }
    }

    function rollDice() {
      if (GameState.turnPhase !== TurnPhase.ROLLING || GameState.rollsRemaining <= 0) return;

      const diceCount = hasRelic(RelicLibrary.SNEAKY_DIE.id) ? 3 : 2;
      const rolledDice = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1);
      GameState.rolledDice = rolledDice;
      GameState.dice = expandRolledDice(rolledDice);
      GameState.rollsRemaining -= 1;
      GameState.turnPhase = TurnPhase.MOVING;
      if (rolledDice[0] === rolledDice[1] && hasRelic(RelicLibrary.DOUBLES_DEALER.id)) {
        GameState.score.mult += 1;
        addFloatingText(layout.leftMenuWidth + 190, 96, "+1 Mult Dealer", Theme.accent, 0.9);
      }
      spawnDiceBodies(GameState.dice);
      const extraSneakyDie = rolledDice.length > 2 && rolledDice[0] === rolledDice[1] ? ` plus ${rolledDice.slice(2).join(", ")}` : "";
      GameState.message = rolledDice[0] === rolledDice[1]
        ? `Rolled double ${rolledDice[0]}${extraSneakyDie}. Four matched moves unlocked.`
        : `Rolled ${rolledDice.join(", ")}. Choose a checker.`;
      GameState.selected = null;
      GameState.validTargets = [];

      if (GameState.bar.player.length > 0) {
        selectStack("bar");
        GameState.message = GameState.validTargets.length
          ? "A checker is on the bar. Choose a highlighted re-entry pip."
          : "A checker is on the bar, but there is no legal re-entry.";
      }

      if (!hasAnyLegalMove()) {
        GameState.message = "No legal moves. Turn skipped.";
        setTimeout(endTurn, 700);
      }
    }

    function queueAutoRoll(delay = 520) {
      if (autoRollTimer) clearTimeout(autoRollTimer);
      autoRollTimer = setTimeout(() => {
        autoRollTimer = null;
        if (GameState.turnPhase === TurnPhase.ROLLING) rollDice();
      }, delay);
    }

    function expandRolledDice(rolledDice) {
      return Core.expandRolledDice(rolledDice);
    }

    function resolveEnemyTurn() {
      const pendingAtStart = GameState.enemyPendingReentry;
      GameState.enemyPendingReentry = [];
      const moves = [];

      for (const pip of GameState.board) {
        const mover = pip.enemyPieces.find((checker) => checker.ability === "mover");
        if (!mover) continue;
        moves.push({ source: pip.index, checker: mover });
      }

      let movedCount = 0;
      for (const move of moves.sort((a, b) => a.source - b.source)) {
        const sourcePip = GameState.board[move.source];
        const currentIndex = sourcePip.enemyPieces.findIndex((checker) => checker.id === move.checker.id);
        if (currentIndex === -1) continue;

        const destination = move.source - 2;
        const [checker] = sourcePip.enemyPieces.splice(currentIndex, 1);
        if (destination < 0) {
          GameState.enemyPendingReentry.push(checker);
          GameState.enemyEscaped = true;
          addFloatingText(getPipCenter(move.source).x, getPipCenter(move.source).y, "Enemy scored", Theme.danger, 0.9);
          movedCount += 1;
          continue;
        }

        const targetPip = GameState.board[destination];
        if (!targetPip || targetPip.playerPieces.length >= 2) {
          sourcePip.enemyPieces.push(checker);
          continue;
        }

        if (targetPip.playerPieces.length === 1) {
          const victim = targetPip.playerPieces.pop();
          if (victim.type === CheckerType.ANCHOR) {
            sourcePip.enemyPieces.push(checker);
            targetPip.playerPieces.push(victim);
            continue;
          }
          if (victim.type === CheckerType.GLASS) {
            victim.destroyed = true;
            GameState.destroyed.push(victim);
            addFloatingText(getPipCenter(destination).x, getPipCenter(destination).y, "Glass shattered", Theme.blue, 0.9);
          } else {
            GameState.bar.player.push(victim);
            addFloatingText(getPipCenter(destination).x, getPipCenter(destination).y, "Hit to bar", Theme.danger, 0.9);
          }
        }

        targetPip.enemyPieces.push(checker);
        addMoveAnimation(checker, [getPipCenter(move.source), getPipCenter(destination)], "enemy");
        movedCount += 1;
      }

      if (movedCount > 0) {
        GameState.message = `${movedCount} enemy mover${movedCount === 1 ? "" : "s"} advanced.`;
      }

      reenterPendingEnemies(pendingAtStart);
      checkRoundLoss();
    }

    function reenterPendingEnemies(pendingEnemies) {
      if (!pendingEnemies.length) return;
      const gates = [23, 22, 21, 20, 19, 18];
      const stillPending = [];

      for (const checker of pendingEnemies) {
        const gateIndex = gates.find((pipIndex) => {
          const pip = GameState.board[pipIndex];
          return pip && !pip.locked && pip.playerPieces.length < 2;
        });

        if (gateIndex === undefined) {
          stillPending.push(checker);
          continue;
        }

        GameState.board[gateIndex].enemyPieces.push(checker);
        addFloatingText(getPipCenter(gateIndex).x, getPipCenter(gateIndex).y, "Re-enter", Theme.danger, 0.75);
      }

      GameState.enemyPendingReentry = [...stillPending, ...GameState.enemyPendingReentry];
    }

    function selectStack(source) {
      if (GameState.turnPhase !== TurnPhase.MOVING) return;

      let checker = null;
      if (source === "bar") {
        checker = GameState.bar.player[GameState.bar.player.length - 1];
      } else {
        const pip = GameState.board[source];
        checker = pip.playerPieces[pip.playerPieces.length - 1];
      }

      if (!checker) return;

      GameState.selected = {
        source,
        checkerId: checker.id
      };
      GameState.validTargets = getValidTargets(source);
      GameState.message = GameState.validTargets.length
        ? "Choose a highlighted destination."
        : "That checker has no legal moves for these dice.";
    }

    function getValidTargets(source) {
      return Core.getValidTargets({
        board: GameState.board,
        dice: GameState.dice,
        source
      });
    }

    function hasAnyLegalMove() {
      return Core.hasAnyLegalMove({
        board: GameState.board,
        dice: GameState.dice,
        bar: GameState.bar
      });
    }

    function moveSelectedTo(target) {
      if (!GameState.selected || GameState.turnPhase !== TurnPhase.MOVING) return;

      const targetData = typeof target === "number"
        ? GameState.validTargets.find((validTarget) => validTarget.type === "pip" && validTarget.index === target)
        : GameState.validTargets.find((validTarget) => validTarget.type === "bearOff");

      if (!targetData) return;

      const movePath = buildMovePath(GameState.selected.source, targetData);
      const passedPips = getPassedPips(GameState.selected.source, targetData);

      let checker = null;
      if (GameState.selected.source === "bar") {
        checker = GameState.bar.player.pop();
      } else {
        checker = GameState.board[GameState.selected.source].playerPieces.pop();
      }

      if (!checker) return;

      let brokenEnemy = null;
      let existingAlliedCount = 0;
      if (targetData.type === "pip") {
        const destinationPip = GameState.board[targetData.index];
        existingAlliedCount = destinationPip.playerPieces.length;
        if (destinationPip.enemyPieces.length === 1) {
          brokenEnemy = destinationPip.enemyPieces.pop();
          brokenEnemy.destroyed = true;
          GameState.destroyed.push(brokenEnemy);
        }
        destinationPip.playerPieces.push(checker);
      } else {
        GameState.borneOff.push(checker);
      }

      addMoveAnimation(checker, movePath, "player");
      consumeDie(targetData.die);
      evaluateMove({
        checker,
        die: targetData.die,
        destination: targetData.index,
        borneOff: targetData.type === "bearOff",
        brokeEnemy: Boolean(brokenEnemy),
        alliedCount: existingAlliedCount,
        passedPips
      });

      GameState.selected = null;
      GameState.validTargets = [];

      if (GameState.dice.length === 0) {
        GameState.message = GameState.score.current >= GameState.score.target
          ? `Target beaten. End turn to collect.`
          : `Move scored ${GameState.score.lastMove.toLocaleString()}. End turn to roll again.`;
      } else if (!hasAnyLegalMove()) {
        GameState.message = GameState.score.current >= GameState.score.target
          ? "No legal moves left. End turn to collect."
          : "No legal moves left. End turn to roll again.";
      } else {
        GameState.message = GameState.score.current >= GameState.score.target
          ? `Target beaten. You can keep scoring or end turn to collect.`
          : `Move scored ${GameState.score.lastMove.toLocaleString()}. ${GameState.dice.length} dice left.`;
      }
    }

    function consumeDie(value) {
      const dieIndex = GameState.dice.indexOf(value);
      if (dieIndex !== -1) GameState.dice.splice(dieIndex, 1);
      const bodyIndex = GameState.diceBodies.findIndex((die) => die.value === value);
      if (bodyIndex !== -1) GameState.diceBodies.splice(bodyIndex, 1);
    }

    function evaluateMove({ checker, die, destination, borneOff, brokeEnemy, alliedCount = 0, passedPips = [] }) {
      GameState.turnPhase = TurnPhase.EVALUATING;

      const scoreResult = Core.calculateMoveScore({
        checker,
        die,
        destination,
        borneOff,
        brokeEnemy,
        alliedCount,
        passedPips,
        board: GameState.board,
        globalMult: GameState.score.mult,
        hasRelic
      });

      for (const event of scoreResult.passOver.events) {
        const center = getPipCenter(event.pipIndex);
        addFloatingText(center.x, center.y, event.label, event.type === "chips" ? Theme.gold : Theme.accent, 0.72);
      }

      if (scoreResult.globalMultDelta) GameState.score.mult += scoreResult.globalMultDelta;
      if (scoreResult.checkerMultDelta) checker.mult += scoreResult.checkerMultDelta;
      const { chips, mult, gained, notes } = scoreResult;
      if (brokeEnemy && hasRelic(RelicLibrary.LOADED_LEDGER.id)) {
        GameState.money += 1;
        notes.push("+1 Akçe Ledger");
        addFloatingText(layout.leftMenuWidth - 44, 214, "+1 Akçe", Theme.gold, 0.9);
      }

      GameState.score.current += gained;
      GameState.score.chips = chips;
      GameState.score.lastMove = gained;

      const textPosition = destination === null
        ? getBearOffCenter()
        : getPipCenter(destination);
      addScoreBurst(textPosition.x, textPosition.y, gained);
      addFloatingText(textPosition.x, textPosition.y, `+${gained.toLocaleString()}`, Theme.gold, 1.32);
      addFloatingText(textPosition.x, textPosition.y + 28, `${chips} chips x ${formatNumber(mult)}`, Theme.accent, 0.85);

      GameState.message = notes.join(" | ");
      setTimeout(() => {
        if (GameState.turnPhase === TurnPhase.EVALUATING) {
          GameState.turnPhase = TurnPhase.MOVING;
        }
      }, Math.max(520, (passedPips.length + 1) * 170));
    }

    function evaluatePassOverEffects(passedPips) {
      const result = Core.calculatePassOverEffects({
        board: GameState.board,
        passedPips
      });

      for (const event of result.events) {
        const center = getPipCenter(event.pipIndex);
        addFloatingText(center.x, center.y, event.label, event.type === "chips" ? Theme.gold : Theme.accent, 0.72);
      }

      return result;
    }

    function endTurn() {
      GameState.dice = [];
      GameState.rolledDice = [];
      GameState.diceBodies = [];
      GameState.selected = null;
      GameState.validTargets = [];

      if (GameState.score.current >= GameState.score.target) {
        winRound();
        return;
      }

      if (GameState.rollsRemaining <= 0) {
        loseRound();
        return;
      }

      resolveEnemyTurn();
      if (GameState.turnPhase === TurnPhase.ROUND_OVER) return;

      GameState.turn += 1;
      GameState.turnPhase = TurnPhase.ROLLING;
      GameState.message = "End turn. Dice are rolling again.";
      queueAutoRoll();
    }

    function winRound() {
      GameState.turnPhase = TurnPhase.ROUND_OVER;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.dice = [];
      GameState.rolledDice = [];
      GameState.diceBodies = [];
      GameState.roundPayout = calculateRoundPayout();
      GameState.payoutStartedAt = performance.now();
      GameState.money += GameState.roundPayout.total;

      if (GameState.levelIndex >= LevelConfig.length - 1) {
        GameState.runWon = true;
        GameState.message = "Run complete. The Boss Blind is beaten.";
      } else {
        GameState.message = "Blind cleared. Count the Akçe, then continue to the shop.";
      }
    }

    function calculateRoundPayout() {
      const level = LevelConfig[GameState.levelIndex];
      const remainingRolls = GameState.rollsRemaining;
      const blindReward = level.bossRule ? 5 : 3;
      const mars = !GameState.enemyEscaped;
      const subtotal = remainingRolls + blindReward;
      const multiplier = mars ? 2 : 1;

      return {
        remainingRolls,
        blindReward,
        mars,
        multiplier,
        subtotal,
        startingMoney: GameState.money,
        total: subtotal * multiplier
      };
    }

    function continueAfterRoundClear() {
      if (GameState.turnPhase !== TurnPhase.ROUND_OVER || !GameState.roundPayout) return;
      if (GameState.runWon) {
        restartRun();
        return;
      }
      enterShop();
    }

    function loseRound() {
      GameState.turnPhase = TurnPhase.ROUND_OVER;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.message = "Blind failed. Restart the run and rebuild the economy.";
    }

    function checkRoundLoss() {
      const livePlayerPieces = GameState.board.reduce((sum, pip) => sum + pip.playerPieces.length, 0) + GameState.bar.player.length;
      if (livePlayerPieces === 0 && GameState.score.current < GameState.score.target) {
        loseRound();
      }
    }

    function advanceLevel() {
      if (GameState.levelIndex >= LevelConfig.length - 1) {
        resetLevel(0, false);
        return;
      }
      resetLevel(GameState.levelIndex + 1, true);
    }

    function restartRun() {
      resetLevel(0, false);
    }

    function clearSelection() {
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.message = "Selection cleared.";
    }

    function handleCanvasClick(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const button = GameState.buttons.find((candidate) => pointInRect(x, y, candidate));
      if (button) {
        button.action();
        return;
      }

      const clickedPip = GameState.pipHitAreas.find((area) => pointInRect(x, y, area));
      if (clickedPip) {
        handlePipClick(clickedPip.pipIndex);
        return;
      }

      if (GameState.barHitArea && pointInRect(x, y, GameState.barHitArea)) {
        selectStack("bar");
        return;
      }

      if (GameState.bearOffArea && pointInRect(x, y, GameState.bearOffArea)) {
        moveSelectedTo("bearOff");
      }
    }

    function handlePipClick(pipIndex) {
      if (GameState.turnPhase !== TurnPhase.MOVING) return;

      if (GameState.bar.player.length > 0 && !GameState.selected) {
        selectStack("bar");
      }

      if (GameState.selected) {
        const isValidDestination = GameState.validTargets.some((target) => target.type === "pip" && target.index === pipIndex);
        if (isValidDestination) {
          moveSelectedTo(pipIndex);
          return;
        }
      }

      if (GameState.bar.player.length > 0) {
        GameState.message = "A checker is on the bar. Click one of the highlighted re-entry pips.";
        return;
      }

      if (GameState.board[pipIndex].playerPieces.length > 0) {
        selectStack(pipIndex);
      }
    }

    function upgradeTopPlayerChecker(type) {
      for (const pip of GameState.board) {
        if (pip.playerPieces.length === 0) continue;
        const checker = pip.playerPieces[pip.playerPieces.length - 1];
        Core.applyCheckerType(checker, type);
        GameState.message = `Top checker on Pip ${pip.index + 1} is now ${type}.`;
        return;
      }
    }

    function resizeCanvasForDisplay() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function getCanvasSize() {
      const rect = canvas.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }

    function draw() {
      resizeCanvasForDisplay();
      updateMoveAnimations();
      updateDiceBodies();
      updateFloatingTexts();
      updateScoreBursts();

      const { width, height } = getCanvasSize();
      GameState.buttons = [];
      GameState.pipHitAreas = [];
      GameState.checkerHitAreas = [];
      GameState.barHitArea = null;
      GameState.bearOffArea = null;

      ctx.clearRect(0, 0, width, height);
      drawBackground(width, height);
      drawBoard(width, height);
      drawDiceBodies();
      drawLeftMenu(width, height);
      drawMoveAnimations();
      drawScoreBursts();
      drawFloatingTexts();
      if (GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.roundPayout) drawRoundClearOverlay(width, height);
      if (GameState.turnPhase === TurnPhase.SHOP) drawStoreOverlay(width, height);
      drawDebugUI(width, height);
      updateHoverTooltip();
      drawTooltip(width, height);

      requestAnimationFrame(draw);
    }

    function drawBackground(width, height) {
      const time = performance.now() / 1000;
      const gradient = ctx.createConicGradient(time * 0.12, width * 0.52, height * 0.45);
      gradient.addColorStop(0, "#31063f");
      gradient.addColorStop(0.18, "#0c5f82");
      gradient.addColorStop(0.35, "#ff2a83");
      gradient.addColorStop(0.52, "#ffe15c");
      gradient.addColorStop(0.68, "#35f2a4");
      gradient.addColorStop(0.84, "#7c3dff");
      gradient.addColorStop(1, "#31063f");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.34;
      for (let i = 0; i < 7; i++) {
        const cx = width * (0.1 + i * 0.15);
        const cy = height * (0.18 + ((i * 37) % 60) / 100);
        const rings = ctx.createRadialGradient(cx, cy, 4, cx, cy, 260 + i * 18);
        rings.addColorStop(0, "rgba(255,255,255,0.35)");
        rings.addColorStop(0.18, "rgba(255,255,255,0.03)");
        rings.addColorStop(0.19, "rgba(0,0,0,0.18)");
        rings.addColorStop(0.36, "rgba(255,255,255,0.04)");
        rings.addColorStop(0.37, "rgba(0,0,0,0.15)");
        rings.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = rings;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();

      ctx.fillStyle = "rgba(22, 8, 23, 0.34)";
      ctx.fillRect(0, 0, width, height);
    }

    function drawTopUi(width) {
      const level = LevelConfig[GameState.levelIndex];
      const progress = clamp(GameState.score.current / GameState.score.target, 0, 1);

      const topGradient = ctx.createLinearGradient(0, 0, width, layout.topUiHeight);
      topGradient.addColorStop(0, "rgba(255,248,231,0.92)");
      topGradient.addColorStop(1, "rgba(255,248,231,0.74)");
      ctx.fillStyle = topGradient;
      ctx.fillRect(0, 0, width, layout.topUiHeight);

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = Theme.darkInk;
      ctx.font = "800 28px Inter, sans-serif";
      ctx.fillText("Pipjack", 126, 35);

      ctx.font = "650 13px Inter, sans-serif";
      ctx.fillStyle = "#67416c";
      ctx.fillText(`${level.name} / 24 pips`, 126, 68);

      const barX = 126;
      const barY = 92;
      const barW = Math.min(312, width * 0.28);
      drawProgressBar(barX, barY, barW, 10, progress);

      drawMetric(width * 0.40, 26, "Score", GameState.score.current.toLocaleString(), Theme.gold);
      drawMetric(width * 0.54, 26, "Target", GameState.score.target.toLocaleString(), Theme.darkInk);
      drawMetric(width * 0.68, 26, "Global Mult", `x${formatNumber(GameState.score.mult)}`, Theme.accent);
      drawMetric(width * 0.82, 26, "Rolls", `${GameState.rollsRemaining}`, Theme.blue);

      ctx.fillStyle = "#67416c";
      ctx.font = "650 13px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(GameState.turnPhase, width - 30, 92);
      ctx.textAlign = "left";
    }

    function drawMetric(x, y, label, value, color) {
      ctx.fillStyle = "#67416c";
      ctx.font = "700 11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label.toUpperCase(), x, y);

      ctx.fillStyle = color;
      ctx.font = "850 23px Inter, sans-serif";
      ctx.fillText(value, x, y + 33);

      GameState.buttons.push({
        x: x - 6,
        y: y - 14,
        width: 118,
        height: 58,
        action: () => {},
        tooltip: getMetricTooltip(label)
      });
    }

    function drawProgressBar(x, y, width, height, progress) {
      ctx.fillStyle = "rgba(27,16,32,0.14)";
      roundRect(x, y, width, height, height / 2);
      ctx.fill();

      ctx.fillStyle = Theme.gold;
      roundRect(x, y, width * progress, height, height / 2);
      ctx.fill();
    }

    function drawBoard(width, height) {
      const boardTop = layout.boardPaddingY;
      const boardHeight = height - layout.boardPaddingY * 2;
      const boardLeft = layout.leftMenuWidth + layout.boardPaddingX;
      const boardWidth = width - boardLeft - layout.boardPaddingX;
      const innerTop = boardTop + layout.boardPaddingY;
      const innerHeight = boardHeight - layout.boardPaddingY * 2;
      const barWidth = Math.max(62, boardWidth * 0.07);
      const halfGap = 14;
      const tableWidth = (boardWidth - barWidth - halfGap * 2) / 2;
      const pipWidth = (tableWidth - layout.pipGap * 5) / 6;
      const pipHeight = Math.min(305, innerHeight * 0.62);
      const leftTableX = boardLeft;
      const barX = boardLeft + tableWidth + halfGap;
      const rightTableX = barX + barWidth + halfGap;
      layout.boardBounds = {
        x: boardLeft - 10,
        y: boardTop + 24,
        width: boardWidth + 20,
        height: boardHeight - 48
      };

      ctx.fillStyle = "rgba(0,0,0,0.22)";
      roundRect(boardLeft - 18, boardTop + 16, boardWidth + 36, boardHeight - 32, 12);
      ctx.fill();
      const boardGradient = ctx.createLinearGradient(boardLeft, boardTop, boardLeft + boardWidth, boardTop + boardHeight);
      boardGradient.addColorStop(0, "#4f155f");
      boardGradient.addColorStop(0.28, "#ffcc46");
      boardGradient.addColorStop(0.52, "#21102d");
      boardGradient.addColorStop(0.74, "#12b4d8");
      boardGradient.addColorStop(1, "#ff3f72");
      ctx.fillStyle = boardGradient;
      roundRect(boardLeft - 10, boardTop + 24, boardWidth + 20, boardHeight - 48, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,248,231,0.66)";
      ctx.lineWidth = 2;
      ctx.stroke();

      drawTableField(leftTableX, innerTop, tableWidth, innerHeight, "rgba(10, 3, 16, 0.92)");
      drawTableField(rightTableX, innerTop, tableWidth, innerHeight, "rgba(10, 3, 16, 0.89)");
      drawBoardFractal(leftTableX - 4, innerTop - 10, tableWidth + 8, innerHeight + 20);
      drawBoardFractal(rightTableX - 4, innerTop - 10, tableWidth + 8, innerHeight + 20);
      drawCenterRail(boardLeft, innerTop, boardWidth, innerHeight);

      const topRow = Array.from({ length: 12 }, (_, i) => 12 + i);
      const bottomRow = Array.from({ length: 12 }, (_, i) => 11 - i);

      drawPipRow(topRow, leftTableX, rightTableX, innerTop, pipWidth, pipHeight, "down");
      drawPipRow(bottomRow, leftTableX, rightTableX, innerTop + innerHeight - pipHeight, pipWidth, pipHeight, "up");

      drawBar(barX, innerTop, barWidth, innerHeight);
      drawBearOff(boardLeft + boardWidth - 58, innerTop, innerHeight);
    }

    function drawTableField(x, y, width, height, fill) {
      ctx.fillStyle = fill;
      roundRect(x - 4, y - 10, width + 8, height + 20, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,248,231,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function drawBoardFractal(x, y, w, h) {
      const t = performance.now() / 1000;
      const cx = x + w * 0.5;
      const cy = y + h * 0.5;
      const S = Math.min(w, h);

      ctx.save();
      ctx.beginPath();
      roundRect(x, y, w, h, 7);
      ctx.clip();

      // Base: slow-rotating conic gradient (deep purples/teals/crimsons)
      const baseGrad = ctx.createConicGradient(t * 0.06, cx, cy);
      baseGrad.addColorStop(0,    "#180328");
      baseGrad.addColorStop(0.2,  "#081832");
      baseGrad.addColorStop(0.45, "#22080c");
      baseGrad.addColorStop(0.65, "#061c14");
      baseGrad.addColorStop(0.85, "#1a0430");
      baseGrad.addColorStop(1,    "#180328");
      ctx.fillStyle = baseGrad;
      ctx.fillRect(x, y, w, h);

      // Drifting colour pools — screen blend makes them glow into each other
      ctx.globalCompositeOperation = "screen";
      const pools = [
        [0.25 + Math.sin(t * 0.13) * 0.10, 0.40 + Math.cos(t * 0.09) * 0.15, "rgba(180,0,255,0.34)"],
        [0.72 + Math.cos(t * 0.11) * 0.09, 0.60 + Math.sin(t * 0.08) * 0.12, "rgba(255,20,90,0.30)"],
        [0.50 + Math.sin(t * 0.15) * 0.08, 0.22 + Math.cos(t * 0.12) * 0.10, "rgba(0,200,255,0.26)"],
        [0.14 + Math.cos(t * 0.17) * 0.06, 0.76 + Math.sin(t * 0.14) * 0.10, "rgba(40,255,130,0.22)"],
        [0.85 + Math.sin(t * 0.10) * 0.05, 0.30 + Math.cos(t * 0.16) * 0.12, "rgba(255,180,0,0.20)"],
      ];
      for (const [rx, ry, color] of pools) {
        const px = x + w * rx;
        const py = y + h * ry;
        const pr = S * 0.60;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pg.addColorStop(0, color);
        pg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = pg;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalCompositeOperation = "source-over";

      // Spirograph / hypotrochoid curves — these are the "fractal" weirdness
      const spirogs = [
        { col: "#ff2b86", a: 0.18, R: 0.38, r: 0.13, d: 0.11, spd: 0.10, ph: 0.0 },
        { col: "#35f2a4", a: 0.13, R: 0.30, r: 0.10, d: 0.09, spd: 0.07, ph: 2.0 },
        { col: "#7c3dff", a: 0.15, R: 0.34, r: 0.15, d: 0.14, spd: 0.13, ph: 1.1 },
        { col: "#ffe15c", a: 0.10, R: 0.22, r: 0.08, d: 0.07, spd: 0.18, ph: 3.5 },
      ];
      for (const sg of spirogs) {
        const R = S * sg.R, r = S * sg.r, d = S * sg.d;
        ctx.strokeStyle = sg.col;
        ctx.globalAlpha = sg.a;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        const steps = 800;
        const loops = 28;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2 * loops;
          const phase = t * sg.spd + sg.ph;
          const px = cx + (R - r) * Math.cos(theta + phase) + d * Math.cos(((R - r) / r) * theta + phase);
          const py = cy + (R - r) * Math.sin(theta + phase) - d * Math.sin(((R - r) / r) * theta + phase);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Coloured hex grid — rows cycle through pink / purple / cyan
      const cell = 50;
      const fx = (t * 7) % cell;
      const fy = (t * 3.5) % (cell * 0.866);
      const gcols = Math.ceil(w / cell) + 3;
      const grows = Math.ceil(h / (cell * 0.866)) + 3;
      ctx.lineWidth = 0.75;
      for (let row = -1; row < grows; row++) {
        ctx.globalAlpha = 0.09;
        ctx.strokeStyle = row % 3 === 0 ? "#ff2b86" : row % 3 === 1 ? "#7c3dff" : "#28d4ff";
        for (let col = -1; col < gcols; col++) {
          const hx = x - fx + col * cell + (row % 2 === 0 ? 0 : cell * 0.5);
          const hy = y - fy + row * cell * 0.866;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
            if (i === 0) ctx.moveTo(hx + Math.cos(a) * cell * 0.5, hy + Math.sin(a) * cell * 0.5);
            else ctx.lineTo(hx + Math.cos(a) * cell * 0.5, hy + Math.sin(a) * cell * 0.5);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawPipRow(row, leftTableX, rightTableX, y, pipWidth, pipHeight, direction) {
      for (let visualIndex = 0; visualIndex < row.length; visualIndex++) {
        const pipIndex = row[visualIndex];
        const tableX = visualIndex < 6 ? leftTableX : rightTableX;
        const tableIndex = visualIndex % 6;
        const x = tableX + tableIndex * (pipWidth + layout.pipGap);
        drawPip(pipIndex, x, y, pipWidth, pipHeight, direction);
      }
    }

    function drawCenterRail(boardLeft, innerTop, boardWidth, innerHeight) {
      const railY = innerTop + innerHeight / 2 - 13;
      ctx.fillStyle = "rgba(27,16,32,0.28)";
      roundRect(boardLeft - 10, railY, boardWidth + 20, 26, 4);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,248,231,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boardLeft, railY + 13);
      ctx.lineTo(boardLeft + boardWidth, railY + 13);
      ctx.stroke();
    }

    function drawPip(pipIndex, x, y, width, height, direction) {
      const pip = GameState.board[pipIndex];
      const isEven = pipIndex % 2 === 0;
      const isValid = GameState.validTargets.some((target) => target.type === "pip" && target.index === pipIndex);
      const isSelected = GameState.selected?.source === pipIndex;
      const tipY = direction === "down" ? y + height : y;
      const baseY = direction === "down" ? y : y + height;

      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + width, baseY);
      ctx.lineTo(x + width / 2, tipY);
      ctx.closePath();
      const pipGradient = ctx.createLinearGradient(x, y, x + width, y + height);
      const baseColor = pip.locked ? "#6d6172" : isEven ? Theme.pipA : Theme.pipB;
      pipGradient.addColorStop(0, baseColor);
      pipGradient.addColorStop(0.52, isEven ? "#ff5aa5" : "#8d4dff");
      pipGradient.addColorStop(1, baseColor);
      ctx.fillStyle = pipGradient;
      ctx.globalAlpha = pip.locked ? 0.62 : 0.95;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = isValid ? Theme.valid : "rgba(27,16,32,0.22)";
      ctx.lineWidth = isValid ? 3 : 1;
      ctx.stroke();

      if (isValid) {
        const pulse = 0.13 + Math.sin(performance.now() / 220) * 0.04;
        ctx.fillStyle = `rgba(92, 143, 63, ${pulse + 0.04})`;
        roundRect(x + 5, y + 5, width - 10, height - 10, 5);
        ctx.fill();
      }

      if (isSelected) {
        ctx.strokeStyle = Theme.gold;
        ctx.lineWidth = 3;
        roundRect(x + 4, y + 4, width - 8, height - 8, 5);
        ctx.stroke();
      }

      if (GameState.hover.tooltip?.kind === "pip" && GameState.hover.tooltip.pipIndex === pipIndex) {
        ctx.strokeStyle = "#fff8e7";
        ctx.lineWidth = 2;
        roundRect(x + 3, y + 3, width - 6, height - 6, 5);
        ctx.stroke();
      }

      if (pip.locked) {
        drawLockedMarker(x + width / 2, y + height / 2);
      }

      GameState.pipHitAreas.push({
        pipIndex,
        x,
        y,
        width,
        height,
        tooltip: getPipTooltip(pipIndex)
      });

      if (pip.modifier) {
        drawTileModifier(pip.modifier, x + width / 2, direction === "down" ? y + 27 : y + height - 27);
      }

      if (pip.intent) {
        drawIntentIcon(pip.intent, x + width / 2, direction === "down" ? y - 13 : y + height + 13);
      }

      drawCheckers(pip, x + width / 2, y, height, direction);
      drawPipNumber(pipIndex, x + width / 2, direction === "down" ? y + 14 : y + height - 14);
    }

    function drawLockedMarker(cx, cy) {
      ctx.save();
      ctx.fillStyle = "rgba(251,250,246,0.78)";
      roundRect(cx - 22, cy - 14, 44, 28, 5);
      ctx.fill();
      ctx.fillStyle = Theme.danger;
      ctx.font = "900 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LOCK", cx, cy + 1);
      ctx.restore();
    }

    function drawTileModifier(modifier, cx, cy) {
      ctx.save();
      ctx.shadowColor = modifier.color;
      ctx.shadowBlur = 5;
      ctx.fillStyle = modifier.color;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(251,250,246,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "900 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(modifier.id === "forge" ? "F" : "M", cx, cy + 1);
      ctx.restore();
    }

    function drawIntentIcon(intent, cx, cy) {
      ctx.save();
      ctx.fillStyle = "rgba(251,250,246,0.9)";
      ctx.strokeStyle = Theme.gold;
      ctx.lineWidth = 1.5;
      roundRect(cx - 24, cy - 13, 48, 26, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "850 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(intent.id === "mover" ? "MOVE 2" : "HAZARD", cx, cy + 1);
      ctx.restore();
    }

    function drawCheckers(pip, cx, pipY, pipHeight, direction) {
      const enemyStack = pip.enemyPieces;
      const playerStack = pip.playerPieces;
      const stackOffset = layout.checkerRadius * 0.55;

      if (enemyStack.length > 0) {
        drawCheckerStack(enemyStack, cx + (playerStack.length ? stackOffset : 0), pipY, pipHeight, direction, "enemy");
      }

      if (playerStack.length > 0) {
        drawCheckerStack(playerStack, cx - (enemyStack.length ? stackOffset : 0), pipY, pipHeight, direction, "player");
      }
    }

    function drawCheckerStack(stack, cx, pipY, pipHeight, direction, owner) {
      const visibleStack = stack.filter((checker) => !GameState.hiddenCheckerIds.has(checker.id));
      const visibleCount = Math.min(visibleStack.length, 5);
      const radius = layout.checkerRadius;
      const step = radius * 1.45;
      const startY = direction === "down" ? pipY + radius + 12 : pipY + pipHeight - radius - 12;

      for (let i = 0; i < visibleCount; i++) {
        const cy = direction === "down" ? startY + i * step : startY - i * step;
        drawChecker(cx, cy, radius, owner, visibleStack[i]);
        GameState.checkerHitAreas.push({
          x: cx - radius,
          y: cy - radius,
          width: radius * 2,
          height: radius * 2,
          checker: visibleStack[i],
          owner,
          tooltip: getCheckerTooltip(visibleStack[i], owner)
        });
      }

      if (visibleStack.length > 5) {
        const textY = direction === "down"
          ? startY + visibleCount * step
          : startY - visibleCount * step;
        ctx.fillStyle = Theme.ink;
        ctx.font = "850 16px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`+${visibleStack.length - 5}`, cx, textY);
      }
    }

    function drawChecker(cx, cy, radius, owner, checker) {
      const palette = getCheckerPalette(owner, checker);
      const depth = radius * 0.32;

      ctx.save();

      // Ground shadow
      ctx.fillStyle = palette.shadow;
      ctx.globalAlpha = 0.42;
      ctx.beginPath();
      ctx.ellipse(cx + radius * 0.16, cy + depth * 1.15, radius * 1.02, radius * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Side cylinder (the chip's "depth")
      const sideGradient = ctx.createLinearGradient(cx, cy, cx, cy + depth);
      sideGradient.addColorStop(0, palette.mid);
      sideGradient.addColorStop(0.55, palette.dark);
      sideGradient.addColorStop(1, palette.edge);
      ctx.fillStyle = sideGradient;
      ctx.beginPath();
      // body footprint: full ellipse at +depth, capped by top circle
      ctx.ellipse(cx, cy + depth, radius, radius * 0.36, 0, 0, Math.PI, false);
      ctx.lineTo(cx - radius, cy);
      ctx.arc(cx, cy, radius, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();

      // Subtle pulse glow for moving enemies (kept — gameplay tell)
      if (owner === "enemy" && checker.ability === "mover") {
        ctx.save();
        ctx.shadowColor = "#ff2b86";
        ctx.shadowBlur = radius * 1.6;
        ctx.globalAlpha = 0.18 + Math.sin(performance.now() / 380) * 0.08;
        ctx.fillStyle = "#ff2b86";
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.02, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Top disc (radial gradient — fake light from upper-left)
      const topGradient = ctx.createRadialGradient(
        cx - radius * 0.38, cy - radius * 0.46, radius * 0.06,
        cx + radius * 0.08, cy + radius * 0.12, radius * 1.05
      );
      topGradient.addColorStop(0, palette.light);
      topGradient.addColorStop(0.45, palette.base);
      topGradient.addColorStop(1, palette.mid);
      ctx.fillStyle = topGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Outer dark edge
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = Math.max(2, radius * 0.10);
      ctx.stroke();

      // Inner recessed ring (chip styling — subtle, vector-clean)
      ctx.strokeStyle = palette.dark;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1.2, radius * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Specular highlight crescent (upper-left)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.93, 0, Math.PI * 2);
      ctx.clip();
      const hl = ctx.createRadialGradient(
        cx - radius * 0.4, cy - radius * 0.5, radius * 0.04,
        cx - radius * 0.4, cy - radius * 0.5, radius * 0.8
      );
      hl.addColorStop(0, "rgba(255,255,255,0.55)");
      hl.addColorStop(0.55, "rgba(255,255,255,0.05)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(cx - radius * 0.32, cy - radius * 0.36, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Tiny bottom-right ambient bounce (very subtle)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.93, 0, Math.PI * 2);
      ctx.clip();
      const bounce = ctx.createRadialGradient(
        cx + radius * 0.45, cy + radius * 0.42, radius * 0.04,
        cx + radius * 0.45, cy + radius * 0.42, radius * 0.7
      );
      bounce.addColorStop(0, "rgba(255,255,255,0.18)");
      bounce.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = bounce;
      ctx.beginPath();
      ctx.arc(cx + radius * 0.35, cy + radius * 0.34, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }

    function drawPipNumber(pipIndex, cx, cy) {
      ctx.fillStyle = "rgba(255,248,231,0.38)";
      ctx.font = "800 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(pipIndex + 1), cx, cy);
    }

    function drawBar(x, innerTop, width, innerHeight) {
      const y = innerTop - 10;
      const height = innerHeight + 20;

      GameState.barHitArea = {
        x,
        y,
        width,
        height,
        tooltip: {
          kind: "bar",
          title: "The Bar",
          body: `White checkers hit by hazards wait here. White on bar: ${GameState.bar.player.length}. White must re-enter before moving other checkers. Broken red checkers are removed.`
        }
      };
      const isSelected = GameState.selected?.source === "bar";

      const barGradient = ctx.createLinearGradient(x, y, x + width, y + height);
      barGradient.addColorStop(0, "#3d1552");
      barGradient.addColorStop(0.5, "#130a1d");
      barGradient.addColorStop(1, "#3d1552");
      ctx.fillStyle = isSelected ? "rgba(255,225,92,0.32)" : barGradient;
      roundRect(x, y, width, height, 7);
      ctx.fill();
      ctx.strokeStyle = isSelected ? Theme.gold : "rgba(255,248,231,0.42)";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      ctx.fillStyle = "#fff8e7";
      ctx.font = "900 14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("BAR", x + width / 2, innerTop + innerHeight / 2 - 20);

      ctx.fillStyle = "#d9c8e8";
      ctx.font = "700 12px Inter, sans-serif";
      ctx.fillText(`W ${GameState.bar.player.length}`, x + width / 2, innerTop + innerHeight / 2 + 8);
      ctx.fillText(`R ${GameState.bar.enemy.length}`, x + width / 2, innerTop + innerHeight / 2 + 30);
    }

    function drawBearOff(x, innerTop, innerHeight) {
      const area = {
        x,
        y: innerTop + innerHeight / 2 - 78,
        width: 54,
        height: 156
      };
      GameState.bearOffArea = area;
      GameState.bearOffArea.tooltip = {
        kind: "bearOff",
        title: "Bear Off",
        body: `Move beyond pip 24 to bear off. Each bear-off adds +250 Chips before Mult. Borne off: ${GameState.borneOff.length}.${getBearOffPreviewText()}`
      };
      const isValid = GameState.validTargets.some((target) => target.type === "bearOff");

      ctx.fillStyle = isValid ? "rgba(166,255,67,0.24)" : "rgba(255,248,231,0.18)";
      roundRect(area.x, area.y, area.width, area.height, 7);
      ctx.fill();
      ctx.strokeStyle = isValid ? Theme.valid : Theme.line;
      ctx.lineWidth = isValid ? 3 : 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(area.x + area.width / 2, area.y + area.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = Theme.ink;
      ctx.font = "850 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`BEAR OFF ${GameState.borneOff.length}`, 0, 0);
      ctx.restore();
    }

    function drawLeftMenu(width, height) {
      const x = 18;
      const y = 72;
      const menuWidth = layout.leftMenuWidth - 36;
      const menuHeight = height - y - 18;
      const level = LevelConfig[GameState.levelIndex];
      const progress = clamp(GameState.score.current / GameState.score.target, 0, 1);

      const panelGradient = ctx.createLinearGradient(x, y, x + menuWidth, y + menuHeight);
      panelGradient.addColorStop(0, "rgba(22,8,23,0.94)");
      panelGradient.addColorStop(0.48, "rgba(52,14,62,0.92)");
      panelGradient.addColorStop(1, "rgba(10,7,19,0.96)");
      ctx.fillStyle = panelGradient;
      roundRect(x, y, menuWidth, menuHeight, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,248,231,0.24)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "900 28px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Pipjack", x + 18, y + 32);

      ctx.fillStyle = Theme.muted;
      ctx.font = "800 12px Inter, sans-serif";
      ctx.fillText(`${level.name} / 24 pips`, x + 18, y + 62);

      drawProgressBar(x + 18, y + 84, menuWidth - 36, 10, progress);

      let cursorY = y + 126;
      drawLeftMetric(x + 18, cursorY, menuWidth - 36, "Score", GameState.score.current.toLocaleString(), Theme.gold);
      cursorY += 56;
      drawLeftMetric(x + 18, cursorY, menuWidth - 36, "Target", GameState.score.target.toLocaleString(), Theme.ink);
      cursorY += 56;
      drawLeftMetric(x + 18, cursorY, menuWidth - 36, "Global Mult", `x${formatNumber(GameState.score.mult)}`, Theme.accent);
      cursorY += 56;
      drawLeftMetric(x + 18, cursorY, menuWidth - 36, "Rolls", String(GameState.rollsRemaining), Theme.blue);
      cursorY += 56;
      drawLeftMetric(x + 18, cursorY, menuWidth - 36, "Akçe", String(GameState.money), Theme.gold, "akce");

      cursorY += 70;
      drawButton(x + 18, cursorY, menuWidth - 36, 54, getPrimaryLabel(), getPrimaryAction(), canUsePrimaryButton());
      cursorY += 60;
      drawButton(
        x + 18,
        cursorY,
        menuWidth - 36,
        42,
        GameState.turnPhase === TurnPhase.MOVING ? "Deselect" : "Restart",
        GameState.turnPhase === TurnPhase.MOVING ? clearSelection : restartRun,
        GameState.turnPhase === TurnPhase.MOVING ? Boolean(GameState.selected) : true,
        "secondary"
      );

      cursorY += 58;
      drawDicePanel(x + 18, cursorY);

      cursorY += 84;
      drawMessagePanel(x + 18, cursorY, menuWidth - 36, Math.max(74, y + menuHeight - cursorY - 18));
    }

    function drawLeftMetric(x, y, width, label, value, color, iconKind) {
      ctx.fillStyle = "rgba(255,248,231,0.10)";
      roundRect(x, y, width, 48, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,248,231,0.12)";
      ctx.stroke();

      ctx.fillStyle = Theme.muted;
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label.toUpperCase(), x + 12, y + 15);

      ctx.fillStyle = color;
      ctx.font = "900 22px Inter, sans-serif";
      ctx.fillText(value, x + 12, y + 33);

      if (iconKind === "akce") {
        const valueWidth = ctx.measureText(value).width;
        drawAkceIcon(x + 12 + valueWidth + 14, y + 32, 10);
      }

      GameState.buttons.push({
        x,
        y,
        width,
        height: 48,
        action: () => {},
        tooltip: getMetricTooltip(label)
      });
    }

    function getPrimaryLabel() {
      const roundCanAdvance = GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.levelIndex < LevelConfig.length - 1 && !GameState.runWon;
      if (GameState.runWon) return "New Run";
      if (GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.roundPayout) return "Continue";
      if (GameState.turnPhase === TurnPhase.SHOP) return "Next Blind";
      if (GameState.turnPhase === TurnPhase.MOVING || GameState.turnPhase === TurnPhase.EVALUATING) return "End Turn";
      if (GameState.turnPhase === TurnPhase.ROLLING) return "Rolling...";
      if (roundCanAdvance) return "Next Blind";
      if (GameState.turnPhase === TurnPhase.ROUND_OVER) return "Restart Run";
      return "End Turn";
    }

    function getPrimaryAction() {
      const roundCanAdvance = GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.levelIndex < LevelConfig.length - 1 && !GameState.runWon;
      if (GameState.runWon) return restartRun;
      if (GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.roundPayout) return continueAfterRoundClear;
      if (GameState.turnPhase === TurnPhase.SHOP) return advanceLevel;
      if (GameState.turnPhase === TurnPhase.MOVING) return endTurn;
      if (roundCanAdvance) return advanceLevel;
      if (GameState.turnPhase === TurnPhase.ROUND_OVER) return restartRun;
      return () => {};
    }

    function drawBottomUi(width, height) {
      const y = height - layout.bottomUiHeight;

      const bottomGradient = ctx.createLinearGradient(0, y, width, height);
      bottomGradient.addColorStop(0, "rgba(27,16,32,0.92)");
      bottomGradient.addColorStop(1, "rgba(10,7,19,0.96)");
      ctx.fillStyle = bottomGradient;
      ctx.fillRect(0, y, width, layout.bottomUiHeight);
      ctx.strokeStyle = Theme.line;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      const roundCanAdvance = GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.levelIndex < LevelConfig.length - 1 && !GameState.runWon;
      const primaryLabel = GameState.runWon
        ? "New Run"
        : GameState.turnPhase === TurnPhase.SHOP
          ? "Skip Shop"
        : roundCanAdvance
          ? "Next Blind"
          : GameState.turnPhase === TurnPhase.ROUND_OVER
            ? "Restart Run"
            : "Roll Dice";
      const primaryAction = GameState.runWon
        ? restartRun
        : GameState.turnPhase === TurnPhase.SHOP
          ? advanceLevel
        : roundCanAdvance
          ? advanceLevel
          : GameState.turnPhase === TurnPhase.ROUND_OVER
            ? restartRun
            : rollDice;

      drawButton(30, y + 28, 150, 54, primaryLabel, primaryAction, canUsePrimaryButton());

      if (GameState.turnPhase === TurnPhase.MOVING) {
        drawButton(30, y + 94, 150, 42, "Deselect", clearSelection, Boolean(GameState.selected), "secondary");
      } else {
        drawButton(30, y + 94, 150, 42, "Restart", restartRun, true, "secondary");
      }

      drawDicePanel(210, y + 30);
      const diceSlots = Math.max(2, GameState.dice.length);
      const panelX = 210 + diceSlots * 58 + 74;
      if (GameState.turnPhase === TurnPhase.SHOP) {
        drawShopPanel(panelX, y + 22, Math.max(520, width - panelX - 30));
      } else {
        drawMessagePanel(panelX, y + 28, Math.max(360, width - panelX - 30));
      }
    }

    function canUsePrimaryButton() {
      if (GameState.turnPhase === TurnPhase.ROUND_OVER || GameState.turnPhase === TurnPhase.SHOP) return true;
      return GameState.turnPhase === TurnPhase.MOVING;
    }

    function drawDicePanel(x, y) {
      ctx.fillStyle = Theme.muted;
      ctx.font = "750 12px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("DICE", x, y);

      if (!GameState.dice.length) {
        ctx.fillStyle = "rgba(255,248,231,0.52)";
        ctx.font = "750 12px Inter, sans-serif";
        ctx.fillText(GameState.turnPhase === TurnPhase.ROLLING ? "rolling" : "none", x, y + 32);
        return;
      }

      const diceGap = 52;
      const dicePerRow = 4;
      for (let i = 0; i < GameState.dice.length; i++) {
        const row = Math.floor(i / dicePerRow);
        const column = i % dicePerRow;
        drawDie(x + column * diceGap, y + 20 + row * 52, GameState.dice[i]);
      }
    }

    function drawMessagePanel(x, y, width, height = 112) {
      ctx.fillStyle = "rgba(255,248,231,0.10)";
      roundRect(x, y, width, height, 7);
      ctx.fill();
      ctx.strokeStyle = Theme.line;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "800 14px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Move Log", x + 16, y + 24);

      ctx.fillStyle = Theme.muted;
      ctx.font = "650 13px Inter, sans-serif";
      wrapText(GameState.message, x + 16, y + 50, width - 32, 18);

      const bossRule = LevelConfig[GameState.levelIndex].bossRule;
      if (bossRule && height > 96) {
        ctx.fillStyle = Theme.danger;
        ctx.font = "750 12px Inter, sans-serif";
        wrapText(`${bossRule.name}: ${bossRule.description}`, x + 16, y + Math.min(height - 28, 96), width - 32, 15);
      }
    }

    function drawShopPanelVertical(x, y, width, height) {
      ctx.fillStyle = "rgba(255,248,231,0.10)";
      roundRect(x, y, width, height, 7);
      ctx.fill();
      ctx.strokeStyle = Theme.line;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "800 14px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Shop", x + 14, y + 20);

      const cardHeight = Math.max(64, Math.min(82, (height - 52) / 3 - 8));
      GameState.shopOffers.forEach((offer, index) => {
        const cardY = y + 40 + index * (cardHeight + 10);
        drawShopCard(x + 12, cardY, width - 24, cardHeight, offer);
      });
    }

    function drawShopPanel(x, y, width) {
      ctx.fillStyle = "rgba(255,248,231,0.10)";
      roundRect(x, y, width, 132, 7);
      ctx.fill();
      ctx.strokeStyle = Theme.line;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "800 14px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Shop", x + 16, y + 20);

      const gap = 14;
      const cardWidth = (width - 32 - gap * 2) / 3;
      GameState.shopOffers.forEach((offer, index) => {
        const cardX = x + 16 + index * (cardWidth + gap);
        drawShopCard(cardX, y + 42, cardWidth, 72, offer);
      });
    }

    function drawRoundClearOverlay(width, height) {
      const payout = GameState.roundPayout;
      if (!payout) return;

      const t = performance.now() / 1000;
      const payoutProgress = clamp((performance.now() - GameState.payoutStartedAt) / 1300, 0, 1);
      const easedPayout = easeOutCubic(payoutProgress);
      const countedTotal = Math.round(payout.total * easedPayout);
      const countedCash = payout.startingMoney + countedTotal;
      ctx.save();
      ctx.fillStyle = "rgba(12,4,18,0.62)";
      ctx.fillRect(0, 0, width, height);

      const cardW = Math.min(560, width - 80);
      const cardH = 440;
      const x = width / 2 - cardW / 2;
      const y = height / 2 - cardH / 2 + Math.sin(t * 2.4) * 4;
      const glow = ctx.createRadialGradient(width / 2, y + 90, 20, width / 2, y + 90, 360);
      glow.addColorStop(0, "rgba(255,225,92,0.32)");
      glow.addColorStop(0.5, "rgba(255,43,134,0.16)");
      glow.addColorStop(1, "rgba(255,43,134,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
      gradient.addColorStop(0, "#fff8e7");
      gradient.addColorStop(0.48, "#ffe15c");
      gradient.addColorStop(1, "#ff5aa5");
      ctx.fillStyle = gradient;
      roundRect(x, y, cardW, cardH, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = Theme.darkInk;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "950 54px Inter, sans-serif";
      ctx.fillText(GameState.runWon ? "RUN WON" : "BLIND CLEAR", width / 2, y + 74);
      ctx.font = "850 14px Inter, sans-serif";
      ctx.fillStyle = "#6e2458";
      ctx.fillText("PAYOUT", width / 2, y + 122);

      const rows = [
        [`Remaining rolls`, `${payout.remainingRolls} Akçe`],
        [`${LevelConfig[GameState.levelIndex].bossRule ? "Boss" : "Normal"} blind`, `${payout.blindReward} Akçe`],
        ["Mars", payout.mars ? "x2" : "x1"]
      ];

      let rowY = y + 174;
      ctx.textAlign = "left";
      ctx.font = "850 20px Inter, sans-serif";
      for (const [label, value] of rows) {
        ctx.fillStyle = "rgba(27,16,32,0.12)";
        roundRect(x + 62, rowY - 24, cardW - 124, 48, 8);
        ctx.fill();
        ctx.fillStyle = Theme.darkInk;
        ctx.fillText(label, x + 86, rowY);
        ctx.textAlign = "right";
        ctx.fillText(value, x + cardW - 86, rowY);
        ctx.textAlign = "left";
        rowY += 58;
      }

      ctx.textAlign = "center";
      ctx.fillStyle = Theme.darkInk;
      ctx.font = "950 34px Inter, sans-serif";
      const totalLabel = `+${countedTotal} Akçe`;
      ctx.fillText(totalLabel, width / 2, y + 346);
      const totalW = ctx.measureText(totalLabel).width;
      drawAkceIcon(width / 2 + totalW / 2 + 22, y + 346, 14);
      ctx.font = "750 13px Inter, sans-serif";
      ctx.fillStyle = "#6e2458";
      ctx.fillText(`Akçe now: ${countedCash}`, width / 2, y + 380);

      drawButton(width / 2 - 92, y + cardH - 58, 184, 42, GameState.runWon ? "New Run" : "Continue", continueAfterRoundClear, true, "primary");
      ctx.restore();
    }

    function drawStoreOverlay(width, height) {
      const x = layout.leftMenuWidth + 48;
      const y = 54;
      const panelW = width - x - 48;
      const panelH = height - 108;
      if (panelW < 560 || panelH < 420) return;

      ctx.save();
      ctx.fillStyle = "rgba(12,4,18,0.52)";
      ctx.fillRect(layout.leftMenuWidth, 0, width - layout.leftMenuWidth, height);

      const gradient = ctx.createLinearGradient(x, y, x + panelW, y + panelH);
      gradient.addColorStop(0, "rgba(22,8,23,0.96)");
      gradient.addColorStop(0.5, "rgba(77,21,95,0.94)");
      gradient.addColorStop(1, "rgba(12,9,24,0.98)");
      ctx.fillStyle = gradient;
      roundRect(x, y, panelW, panelH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,248,231,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "950 38px Inter, sans-serif";
      ctx.fillText("Shop", x + 34, y + 48);
      ctx.font = "850 16px Inter, sans-serif";
      ctx.fillStyle = Theme.gold;
      const cashLabel = `${GameState.money} Akçe`;
      ctx.fillText(cashLabel, x + 34, y + 82);
      const cashW = ctx.measureText(cashLabel).width;
      drawAkceIcon(x + 34 + cashW + 16, y + 82, 9);
      ctx.fillStyle = Theme.muted;
      ctx.font = "750 13px Inter, sans-serif";
      wrapText("Buy any cards you can afford. Relics are global; piece upgrades hit the top white checker.", x + 34, y + 106, panelW - 68, 16);

      const relics = GameState.shopOffers.filter((offer) => offer.kind === "relic");
      const upgrades = GameState.shopOffers.filter((offer) => offer.kind === "upgrade");
      const gap = 18;
      const relicCardW = (panelW - 68 - gap) / 2;
      const upgradeCardW = (panelW - 68 - gap * 2) / 3;

      ctx.fillStyle = Theme.muted;
      ctx.font = "900 13px Inter, sans-serif";
      ctx.fillText("RELICS", x + 34, y + 150);
      relics.forEach((offer, index) => {
        drawShopCard(x + 34 + index * (relicCardW + gap), y + 170, relicCardW, 112, offer);
      });

      ctx.fillStyle = Theme.muted;
      ctx.font = "900 13px Inter, sans-serif";
      ctx.fillText("PIECE UPGRADES", x + 34, y + 324);
      upgrades.forEach((offer, index) => {
        drawShopCard(x + 34 + index * (upgradeCardW + gap), y + 344, upgradeCardW, 122, offer);
      });

      drawButton(x + panelW - 214, y + panelH - 70, 180, 46, "Next Blind", advanceLevel, true, "primary");
      ctx.restore();
    }

    function drawShopCard(x, y, width, height, offer) {
      const price = getOfferPrice(offer);
      const affordable = GameState.money >= price;
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, offer.bought ? "#d5d0db" : "#fff8e7");
      gradient.addColorStop(0.55, offer.kind === "relic" ? "#ffe15c" : "#8fffe0");
      gradient.addColorStop(1, offer.kind === "relic" ? "#ff8bd0" : "#8d4dff");
      ctx.fillStyle = gradient;
      roundRect(x, y, width, height, 8);
      ctx.fill();
      ctx.globalAlpha = affordable || offer.bought ? 1 : 0.58;
      ctx.strokeStyle = offer.bought ? Theme.accent : "rgba(255,255,255,0.58)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = Theme.darkInk;
      ctx.font = `${width < 260 ? "850 12px" : "900 14px"} Inter, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      truncateText(offer.title, x + 12, y + 22, width - 70);
      ctx.textAlign = "right";
      const priceLabel = offer.bought ? "SOLD" : `${price} Akçe`;
      ctx.fillText(priceLabel, x + width - 12, y + 22);
      if (!offer.bought) {
        const pW = ctx.measureText(priceLabel).width;
        drawAkceIcon(x + width - 12 - pW - 10, y + 22, 7);
      }
      ctx.textAlign = "left";
      ctx.fillStyle = "#5c2352";
      ctx.font = `${width < 260 ? "700 10px" : "700 11px"} Inter, sans-serif`;
      wrapText(offer.detail, x + 12, y + 43, width - 24, 14);

      if (!offer.bought) {
        GameState.buttons.push({
          x,
          y,
          width,
          height,
          action: () => chooseShopOffer(offer),
          tooltip: {
            kind: "shop",
            title: `${offer.title} - ${price} Akçe`,
            body: `${offer.detail} ${affordable ? "Click to buy." : "Not enough Akçe yet."}`
          }
        });
      }
    }

    function drawButton(x, y, width, height, label, action, enabled = true, variant = "primary") {
      const palette = {
        primary: enabled ? ["#ff2b86", "#7c3dff", "#fff8e7"] : ["#4c3d55", "#2e2338", "#bdaec8"],
        secondary: ["#fff8e7", "#ffd857", "#1b1020"],
        tiny: ["#fff8e7", "#ffcf48", "#1b1020"],
        tinyActive: ["#35f2a4", "#28d4ff", "#1b1020"]
      };
      const colors = palette[variant] || palette.primary;
      const gradient = ctx.createLinearGradient(x, y, x, y + height);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1]);

      ctx.fillStyle = gradient;
      roundRect(x, y, width, height, 6);
      ctx.fill();
      ctx.strokeStyle = enabled ? Theme.line : "rgba(25,24,22,0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = colors[2];
      ctx.font = `${height <= 30 ? "800 11px" : "850 16px"} Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + width / 2, y + height / 2 + 1);

      if (enabled) {
        GameState.buttons.push({ x, y, width, height, action, tooltip: getButtonTooltip(label) });
      }
    }

    function spawnDiceBodies(values) {
      const bounds = layout.boardBounds || {
        x: layout.leftMenuWidth + 60,
        y: 70,
        width: Math.max(420, canvas.clientWidth - layout.leftMenuWidth - 110),
        height: Math.max(320, canvas.clientHeight - 140)
      };
      const size = 44;
      const now = performance.now();
      GameState.diceBodies = values.map((value, index) => ({
        value,
        displayValue: value,
        topValue: ((value + 1) % 6) + 1,
        sideValue: ((value + 3) % 6) + 1,
        x: bounds.x + bounds.width * (0.25 + Math.random() * 0.5),
        y: bounds.y + bounds.height * (0.35 + Math.random() * 0.3),
        vx: (Math.random() > 0.5 ? 1 : -1) * (3.4 + Math.random() * 2.6),
        vy: (Math.random() > 0.5 ? 1 : -1) * (2.8 + Math.random() * 2.2),
        rotation: (Math.random() - 0.5) * 1.2,
        spin: (Math.random() > 0.5 ? 1 : -1) * (0.075 + Math.random() * 0.055),
        size,
        z: 0,
        startedAt: now,
        rollDuration: 1150 + index * 140 + Math.random() * 260,
        stopped: false
      }));
    }

    function updateDiceBodies() {
      if (!GameState.diceBodies.length) return;
      const bounds = layout.boardBounds;
      if (!bounds) return;

      for (const die of GameState.diceBodies) {
        if (die.stopped) continue;
        const now = performance.now();
        const age = now - die.startedAt;
        const rolling = age < die.rollDuration;

        die.x += die.vx;
        die.y += die.vy;
        die.rotation += die.spin;
        die.z = rolling ? Math.abs(Math.sin(age / 92)) * die.size * 0.42 : die.z * 0.72;

        if (rolling) {
          const tumbleFrame = Math.floor(age / 92);
          die.displayValue = ((die.value + tumbleFrame) % 6) + 1;
          die.topValue = ((die.value + tumbleFrame + 2) % 6) + 1;
          die.sideValue = ((die.value + tumbleFrame + 4) % 6) + 1;
        } else {
          die.displayValue = die.value;
          die.topValue = ((die.value + 1) % 6) + 1;
          die.sideValue = ((die.value + 3) % 6) + 1;
          die.vx *= 0.84;
          die.vy *= 0.84;
          die.spin *= 0.80;
          if (age > die.rollDuration + 650 || (Math.abs(die.vx) + Math.abs(die.vy) < 0.035 && Math.abs(die.spin) < 0.0015 && die.z < 0.4)) {
            die.vx = 0;
            die.vy = 0;
            die.spin = 0;
            die.z = 0;
            die.stopped = true;
          }
        }

        const half = die.size / 2;
        if (die.x - half < bounds.x || die.x + half > bounds.x + bounds.width) {
          die.vx *= rolling ? -0.82 : -0.42;
          die.x = clamp(die.x, bounds.x + half, bounds.x + bounds.width - half);
        }
        if (die.y - half < bounds.y || die.y + half > bounds.y + bounds.height) {
          die.vy *= rolling ? -0.82 : -0.42;
          die.y = clamp(die.y, bounds.y + half, bounds.y + bounds.height - half);
        }

        if (rolling) {
          die.vx *= 0.988;
          die.vy *= 0.988;
          die.vx += Math.sin(now / 180 + die.value) * 0.018;
          die.vy += Math.cos(now / 210 + die.value) * 0.018;
        }
      }
    }

    function drawDiceBodies() {
      for (const die of GameState.diceBodies) {
        drawDie3D(die.x, die.y - die.z, die.size, die.displayValue, die.rotation, {
          animated: !die.stopped,
          z: die.z,
          topValue: die.topValue,
          sideValue: die.sideValue
        });
      }
    }

    function drawDie(x, y, value) {
      drawDie3D(x + 23, y + 23, 42, value, -0.08, {
        animated: false,
        topValue: value ? ((value + 1) % 6) + 1 : null,
        sideValue: value ? ((value + 3) % 6) + 1 : null
      });
      GameState.buttons.push({
        x,
        y,
        width: 46,
        height: 46,
        action: () => {},
        tooltip: {
          kind: "die",
          title: value ? `Die ${value}` : "Dice",
          body: value
            ? `This die can move one selected checker ${value} pips. Using 5 or 6 triggers Haste Boots if you have it.`
            : "Roll dice to generate move values. Each die is consumed after one move."
        }
      });
    }

    function drawDie3D(cx, cy, size, value, rotation = 0, options = {}) {
      const animated = Boolean(options.animated);
      const z = options.z || 0;
      const topValue = options.topValue;
      const sideValue = options.sideValue;
      const depthX = size * (animated ? 0.28 + Math.sin(performance.now() / 150) * 0.04 : 0.24);
      const depthY = size * (animated ? 0.18 + Math.cos(performance.now() / 170) * 0.03 : 0.16);
      const radius = size * 0.16;
      const half = size / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      ctx.globalAlpha = animated ? 0.32 : 0.18;
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.ellipse(depthX * 0.45, half + depthY + z * 0.45, size * 0.62, size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const front = {
        tl: { x: -half, y: -half },
        tr: { x: half, y: -half },
        br: { x: half, y: half },
        bl: { x: -half, y: half }
      };
      const top = {
        tl: { x: -half, y: -half },
        tr: { x: half, y: -half },
        br: { x: half + depthX, y: -half - depthY },
        bl: { x: -half + depthX, y: -half - depthY }
      };
      const side = {
        tl: { x: half, y: -half },
        tr: { x: half + depthX, y: -half - depthY },
        br: { x: half + depthX, y: half - depthY },
        bl: { x: half, y: half }
      };

      ctx.fillStyle = "#d7c8ef";
      drawFace(side);
      ctx.fill();
      ctx.fillStyle = "#fff4c9";
      drawFace(top);
      ctx.fill();

      ctx.strokeStyle = "rgba(27,16,32,0.22)";
      ctx.lineWidth = 1;
      drawFace(side);
      ctx.stroke();
      drawFace(top);
      ctx.stroke();

      if (sideValue) drawFacePips(side, size, sideValue, 0.048, "rgba(27,16,32,0.62)");
      if (topValue) drawFacePips(top, size, topValue, 0.046, "rgba(27,16,32,0.54)");

      const faceGradient = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
      faceGradient.addColorStop(0, "#ffffff");
      faceGradient.addColorStop(0.55, "#fff8e7");
      faceGradient.addColorStop(1, "#f0d0ff");
      ctx.fillStyle = faceGradient;
      roundRect(-half, -half, size, size, radius);
      ctx.fill();
      ctx.strokeStyle = animated ? Theme.gold : Theme.line;
      ctx.lineWidth = animated ? 2.2 : 1.4;
      ctx.stroke();

      drawDiePips(0, 0, size, value);
      ctx.restore();
    }

    function drawFace(face) {
      ctx.beginPath();
      ctx.moveTo(face.tl.x, face.tl.y);
      ctx.lineTo(face.tr.x, face.tr.y);
      ctx.lineTo(face.br.x, face.br.y);
      ctx.lineTo(face.bl.x, face.bl.y);
      ctx.closePath();
    }

    function drawFacePips(face, size, value, radiusScale, color) {
      const offset = 0.26;
      const pipMap = {
        1: [[0.5, 0.5]],
        2: [[0.5 - offset, 0.5 - offset], [0.5 + offset, 0.5 + offset]],
        3: [[0.5 - offset, 0.5 - offset], [0.5, 0.5], [0.5 + offset, 0.5 + offset]],
        4: [[0.5 - offset, 0.5 - offset], [0.5 + offset, 0.5 - offset], [0.5 - offset, 0.5 + offset], [0.5 + offset, 0.5 + offset]],
        5: [[0.5 - offset, 0.5 - offset], [0.5 + offset, 0.5 - offset], [0.5, 0.5], [0.5 - offset, 0.5 + offset], [0.5 + offset, 0.5 + offset]],
        6: [[0.5 - offset, 0.5 - offset], [0.5 + offset, 0.5 - offset], [0.5 - offset, 0.5], [0.5 + offset, 0.5], [0.5 - offset, 0.5 + offset], [0.5 + offset, 0.5 + offset]]
      };

      ctx.fillStyle = color;
      for (const [u, v] of pipMap[value] || []) {
        const point = pointOnFace(face, u, v);
        ctx.beginPath();
        ctx.arc(point.x, point.y, size * radiusScale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function pointOnFace(face, u, v) {
      return {
        x: face.tl.x + (face.tr.x - face.tl.x) * u + (face.bl.x - face.tl.x) * v,
        y: face.tl.y + (face.tr.y - face.tl.y) * u + (face.bl.y - face.tl.y) * v
      };
    }

    function drawDiePips(cx, cy, size, value) {
      if (!value) {
        ctx.fillStyle = Theme.darkInk;
        ctx.font = `900 ${Math.round(size * 0.44)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("-", cx, cy + 1);
        return;
      }

      const offset = size * 0.22;
      const pipRadius = size * 0.055;
      const pipMap = {
        1: [[0, 0]],
        2: [[-offset, -offset], [offset, offset]],
        3: [[-offset, -offset], [0, 0], [offset, offset]],
        4: [[-offset, -offset], [offset, -offset], [-offset, offset], [offset, offset]],
        5: [[-offset, -offset], [offset, -offset], [0, 0], [-offset, offset], [offset, offset]],
        6: [[-offset, -offset], [offset, -offset], [-offset, 0], [offset, 0], [-offset, offset], [offset, offset]]
      };

      ctx.fillStyle = Theme.darkInk;
      for (const [px, py] of pipMap[value] || []) {
        ctx.beginPath();
        ctx.arc(cx + px, cy + py, pipRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function updateHoverTooltip() {
      if (!GameState.hover.active) {
        GameState.hover.tooltip = null;
        canvas.style.cursor = "default";
        return;
      }

      const { x, y } = GameState.hover;
      const checkerHit = [...GameState.checkerHitAreas].reverse().find((area) => pointInRect(x, y, area));
      if (checkerHit) {
        GameState.hover.tooltip = checkerHit.tooltip;
        canvas.style.cursor = "help";
        return;
      }

      const pipHit = GameState.pipHitAreas.find((area) => pointInRect(x, y, area));
      if (pipHit) {
        GameState.hover.tooltip = pipHit.tooltip;
        canvas.style.cursor = GameState.turnPhase === TurnPhase.MOVING ? "pointer" : "help";
        return;
      }

      if (GameState.barHitArea && pointInRect(x, y, GameState.barHitArea)) {
        GameState.hover.tooltip = GameState.barHitArea.tooltip;
        canvas.style.cursor = GameState.bar.player.length ? "pointer" : "help";
        return;
      }

      if (GameState.bearOffArea && pointInRect(x, y, GameState.bearOffArea)) {
        GameState.hover.tooltip = GameState.bearOffArea.tooltip;
        canvas.style.cursor = "help";
        return;
      }

      const buttonHit = [...GameState.buttons].reverse().find((area) => area.tooltip && pointInRect(x, y, area));
      if (buttonHit) {
        GameState.hover.tooltip = buttonHit.tooltip;
        canvas.style.cursor = buttonHit.action ? "pointer" : "help";
        return;
      }

      GameState.hover.tooltip = null;
      canvas.style.cursor = "default";
    }

    function drawTooltip(width, height) {
      const tooltip = GameState.hover.tooltip;
      if (!tooltip) return;

      const maxWidth = 292;
      const padding = 14;
      const titleLines = wrapToLines(tooltip.title, maxWidth - padding * 2, "900 15px Inter, sans-serif");
      const bodyLines = wrapToLines(tooltip.body, maxWidth - padding * 2, "700 12px Inter, sans-serif");
      const boxWidth = maxWidth;
      const boxHeight = padding * 2 + titleLines.length * 18 + 8 + bodyLines.length * 16;
      let x = GameState.hover.x + 18;
      let y = GameState.hover.y + 18;

      if (x + boxWidth > width - 12) x = GameState.hover.x - boxWidth - 18;
      if (y + boxHeight > height - 12) y = height - boxHeight - 12;
      if (x < 12) x = 12;
      if (y < 12) y = 12;

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.42)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "rgba(255,248,231,0.96)";
      roundRect(x, y, boxWidth, boxHeight, 10);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = tooltip.kind === "pip" ? Theme.purple : Theme.danger;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = Theme.darkInk;
      ctx.font = "900 15px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      let textY = y + padding;
      for (const line of titleLines) {
        ctx.fillText(line, x + padding, textY);
        textY += 18;
      }

      textY += 6;
      ctx.fillStyle = "#5c3a5f";
      ctx.font = "700 12px Inter, sans-serif";
      for (const line of bodyLines) {
        ctx.fillText(line, x + padding, textY);
        textY += 16;
      }
      ctx.restore();
    }

    function getPipTooltip(pipIndex) {
      const pip = GameState.board[pipIndex];
      const validTarget = GameState.validTargets.find((target) => target.type === "pip" && target.index === pipIndex);
      const parts = [
        `${pip.playerPieces.length} white checker${pip.playerPieces.length === 1 ? "" : "s"}, ${pip.enemyPieces.length} red checker${pip.enemyPieces.length === 1 ? "" : "s"}.`
      ];

      if (pip.modifier) {
        const passText = pip.modifier.id === TileModifierLibrary.FORGE.id
          ? "Passing over it adds +5 Chips."
          : "Passing over it adds x0.25 Mult.";
        parts.push(`${pip.modifier.name}: ${pip.modifier.description} ${passText}`);
      }
      if (pip.intent) parts.push(`${pip.intent.name}: special hazard tile.`);
      if (pip.locked) parts.push("Boss rule: locked. White cannot land here.");
      if (validTarget) {
        const alliedText = pip.playerPieces.length > 0 ? `; allied landing bonus +${pip.playerPieces.length * 50} Chips` : "";
        const breakText = validTarget.willBump ? "; breaks a red blot for +200 Chips" : "";
        parts.push(`Legal destination using die ${validTarget.die}${breakText}${alliedText}.`);
        const preview = getMovePreviewBreakdown(validTarget);
        if (preview) parts.push(preview);
      }
      if (!pip.modifier && !pip.intent && !pip.locked && !validTarget) parts.push("Empty pips are safe landing spaces unless blocked by two or more red checkers.");

      return {
        kind: "pip",
        pipIndex,
        title: `Pip ${pipIndex + 1}`,
        body: parts.join(" ")
      };
    }

    function getCheckerTooltip(checker, owner) {
      if (owner === "enemy") {
        const moverText = checker.ability === "mover"
          ? "Darker red mover: advances 2 pips at end of turn, unless blocked by two or more white checkers. If it reaches the end it re-enters next turn and breaks Mars."
          : "Basic red checker: static hazard. A single red checker is a blot; two or more red checkers block the pip.";
        return {
          kind: "checker",
          title: checker.ability === "mover" ? "Mover Hazard Checker" : "Red Hazard Checker",
          body: `${moverText} Land on one red checker to break it for +200 Chips.`
        };
      }

      const typeText = {
        [CheckerType.STANDARD]: "Standard checker: no bonus stats.",
        [CheckerType.GOLDEN]: "Golden checker: +50 flat Chips whenever moved.",
        [CheckerType.GLASS]: "Glass checker: x3 Mult when moved, but shatters if destroyed by a hazard.",
        [CheckerType.ANCHOR]: "Anchor checker: cannot be targeted or destroyed by enemy intents.",
        [CheckerType.RUBY]: "Ruby checker: +100 flat Chips whenever moved.",
        [CheckerType.PRISM]: "Prism checker: +25 Chips and x2 Mult whenever moved.",
        [CheckerType.SPRINTER]: "Sprinter checker: +120 Chips when moved with a die value of 5 or 6."
      };

      return {
        kind: "checker",
        title: `${capitalize(checker.type)} White Checker`,
        body: `${typeText[checker.type]} Current stats: +${checker.chips} Chips, x${formatNumber(checker.mult)} Mult.`
      };
    }

    function getSelectedChecker() {
      if (!GameState.selected) return null;
      if (GameState.selected.source === "bar") {
        return GameState.bar.player[GameState.bar.player.length - 1] || null;
      }

      const pip = GameState.board[GameState.selected.source];
      return pip?.playerPieces[pip.playerPieces.length - 1] || null;
    }

    function getBearOffPreviewText() {
      const targetData = GameState.validTargets.find((target) => target.type === "bearOff");
      const preview = targetData ? getMovePreviewBreakdown(targetData) : null;
      return preview ? ` ${preview}` : "";
    }

    function getMovePreviewBreakdown(targetData) {
      const checker = getSelectedChecker();
      if (!checker || !GameState.selected) return null;

      const destination = targetData.type === "bearOff" ? null : targetData.index;
      const destinationPip = destination === null ? null : GameState.board[destination];
      const passedPips = getPassedPips(GameState.selected.source, targetData);
      const brokeEnemy = Boolean(destinationPip && destinationPip.enemyPieces.length === 1);
      const alliedCount = destinationPip ? destinationPip.playerPieces.length : 0;
      const preview = calculateMoveScorePreview({
        checker,
        die: targetData.die,
        destination,
        borneOff: targetData.type === "bearOff",
        brokeEnemy,
        alliedCount,
        passedPips
      });

      return `Preview: ${preview.gained.toLocaleString()} pts (${preview.parts.join(" + ")}; x${formatNumber(preview.mult)} Mult).`;
    }

    function calculateMoveScorePreview({ checker, die, destination, borneOff, brokeEnemy, alliedCount, passedPips }) {
      return Core.calculateMoveScore({
        checker,
        die,
        destination,
        borneOff,
        brokeEnemy,
        alliedCount,
        passedPips,
        board: GameState.board,
        globalMult: GameState.score.mult,
        hasRelic
      });
    }

    function getMetricTooltip(label) {
      const copy = {
        Score: "Your current round total. Reach the Target before rolls run out to clear the blind.",
        Target: "The blind requirement. Small Blind is 750, Big Blind is 1,400, Boss Blind is 2,600.",
        "Global Mult": "The round-wide Mult starts at x1. Base movement scores 10 Chips x die value x global Mult.",
        Rolls: "Rolls left in this blind. Each unused roll pays 1 Akçe when the blind is cleared.",
        Akçe: "Money to spend in the shop. Normal blinds pay 3 Akçe, boss blinds pay 5 Akçe, and Mars doubles the payout."
      };
      return {
        kind: "metric",
        title: label,
        body: copy[label] || "A scoring value."
      };
    }

    function getButtonTooltip(label) {
      const copy = {
        "Rolling...": "Dice roll automatically at the start of each turn.",
        "End Turn": "End this turn. If your score beats the target, collect the blind; otherwise the next dice roll starts automatically.",
        "Next Blind": "Advance to the next blind, keeping drafted relics.",
        Continue: "Continue from the payout screen to the shop.",
        "New Run": "Start a fresh run from Small Blind.",
        "Restart Run": "Restart the run from Small Blind.",
        Restart: "Restart the run from Small Blind.",
        Deselect: "Cancel the current checker selection.",
        "Iron Bar": "Shop relic: breaks add +2 global Mult for the rest of the round.",
        Haste: "Shop relic: using a 5 or 6 adds +20 Chips.",
        Ssneaky: "Shop relic: roll three dice instead of two.",
        "Skip Shop": "Leave without taking a reward and start the next blind.",
        "Golden Top": "Shop upgrade: convert a top white checker to Golden for +50 Chips.",
        "Glass Top": "Shop upgrade: convert a top white checker to Glass for x3 Mult.",
        "Anchor Top": "Shop upgrade: convert a top white checker to Anchor so hazards ignore it."
      };
      return {
        kind: "button",
        title: label,
        body: copy[label] || "Button control."
      };
    }

    function buildMovePath(source, targetData) {
      const path = [getSourcePoint(source)];
      const destination = targetData.type === "bearOff" ? BOARD_SIZE : targetData.index;
      const start = source === "bar" ? -1 : source;

      for (let pipIndex = start + 1; pipIndex <= Math.min(destination, BOARD_SIZE - 1); pipIndex++) {
        path.push(getPipCenter(pipIndex));
      }

      if (targetData.type === "bearOff") path.push(getBearOffCenter());
      return path.length > 1 ? path : [getSourcePoint(source), getSourcePoint(source)];
    }

    function getPassedPips(source, targetData) {
      return Core.getPassedPips({ source, targetData });
    }

    function addMoveAnimation(checker, path, owner) {
      const now = performance.now();
      GameState.hiddenCheckerIds.add(checker.id);
      GameState.moveAnimations.push({
        checker,
        owner,
        path,
        startedAt: now,
        duration: Math.max(260, (path.length - 1) * 170)
      });
    }

    function updateMoveAnimations() {
      const now = performance.now();
      GameState.moveAnimations = GameState.moveAnimations.filter((animation) => {
        const done = now - animation.startedAt >= animation.duration;
        if (done) GameState.hiddenCheckerIds.delete(animation.checker.id);
        return !done;
      });
    }

    function drawMoveAnimations() {
      const now = performance.now();
      for (const animation of GameState.moveAnimations) {
        const progress = clamp((now - animation.startedAt) / animation.duration, 0, 1);
        const segmentCount = Math.max(1, animation.path.length - 1);
        const rawSegment = Math.min(segmentCount - 1, Math.floor(progress * segmentCount));
        const segmentProgress = progress >= 1 ? 1 : (progress * segmentCount) - rawSegment;
        const eased = easeOutCubic(segmentProgress);
        const from = animation.path[rawSegment];
        const to = animation.path[rawSegment + 1] || from;
        const arc = Math.sin(segmentProgress * Math.PI) * 30;
        const x = lerp(from.x, to.x, eased);
        const y = lerp(from.y, to.y, eased) - arc;

        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = Theme.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        animation.path.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        drawChecker(x, y, layout.checkerRadius + 2, animation.owner, animation.checker);
        ctx.restore();
      }
    }

    function addScoreBurst(x, y, amount) {
      GameState.scoreBursts.push({
        x,
        y,
        amount,
        life: 1,
        radius: 20
      });
    }

    function updateScoreBursts() {
      for (const burst of GameState.scoreBursts) {
        burst.life -= 0.035;
        burst.radius += 3.2;
      }
      GameState.scoreBursts = GameState.scoreBursts.filter((burst) => burst.life > 0);
    }

    function drawScoreBursts() {
      for (const burst of GameState.scoreBursts) {
        ctx.save();
        ctx.globalAlpha = clamp(burst.life, 0, 1) * 0.34;
        ctx.strokeStyle = burst.amount >= 500 ? Theme.gold : Theme.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, burst.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha *= 0.42;
        ctx.fillStyle = burst.amount >= 500 ? Theme.gold : Theme.accent;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, burst.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function addFloatingText(x, y, text, color, scale = 1) {
      GameState.floatingTexts.push({
        x,
        y,
        text,
        color,
        scale,
        life: 1,
        velocityY: -0.75
      });
    }

    function updateFloatingTexts() {
      for (const item of GameState.floatingTexts) {
        item.y += item.velocityY;
        item.life -= 0.012;
      }
      GameState.floatingTexts = GameState.floatingTexts.filter((item) => item.life > 0);
    }

    function drawFloatingTexts() {
      for (const item of GameState.floatingTexts) {
        ctx.save();
        ctx.globalAlpha = clamp(item.life, 0, 1);
        ctx.fillStyle = item.color;
        ctx.font = `900 ${Math.round(21 * item.scale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.75)";
        ctx.shadowBlur = 8;
        ctx.fillText(item.text, item.x, item.y);
        ctx.restore();
      }
    }

    function getPipCenter(pipIndex) {
      const area = GameState.pipHitAreas.find((hitArea) => hitArea.pipIndex === pipIndex);
      if (!area) return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
      return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    }

    function getSourcePoint(source) {
      if (source === "bar" && GameState.barHitArea) {
        return {
          x: GameState.barHitArea.x + GameState.barHitArea.width / 2,
          y: GameState.barHitArea.y + GameState.barHitArea.height / 2
        };
      }
      return getPipCenter(source);
    }

    function getBearOffCenter() {
      if (!GameState.bearOffArea) {
        return { x: canvas.clientWidth - 80, y: canvas.clientHeight / 2 };
      }
      return {
        x: GameState.bearOffArea.x + GameState.bearOffArea.width / 2,
        y: GameState.bearOffArea.y + GameState.bearOffArea.height / 2
      };
    }

    function pointInRect(x, y, rect) {
      return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    }

    function roundRect(x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }

    function wrapText(text, x, y, maxWidth, lineHeight) {
      const words = text.split(" ");
      let line = "";
      let lineCount = 0;

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
          ctx.fillText(line, x, y + lineCount * lineHeight);
          line = word;
          lineCount += 1;
          if (lineCount >= 2) break;
        } else {
          line = testLine;
        }
      }

      if (line && lineCount < 3) {
        ctx.fillText(line, x, y + lineCount * lineHeight);
      }
    }

    function wrapToLines(text, maxWidth, font) {
      ctx.save();
      ctx.font = font;
      const words = text.split(" ");
      const lines = [];
      let line = "";

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) lines.push(line);
      ctx.restore();
      return lines.slice(0, 7);
    }

    function truncateText(text, x, y, maxWidth) {
      let value = text;
      while (ctx.measureText(value).width > maxWidth && value.length > 4) {
        value = `${value.slice(0, -4)}...`;
      }
      ctx.fillText(value, x, y);
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function lerp(start, end, progress) {
      return start + (end - start) * progress;
    }

    function easeOutCubic(value) {
      return 1 - Math.pow(1 - value, 3);
    }

    function capitalize(value) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function getCheckerAccent(type) {
      const colors = {
        [CheckerType.GOLDEN]: Theme.gold,
        [CheckerType.GLASS]: Theme.blue,
        [CheckerType.ANCHOR]: Theme.muted,
        [CheckerType.RUBY]: Theme.danger,
        [CheckerType.PRISM]: Theme.purple,
        [CheckerType.SPRINTER]: Theme.accent
      };
      return colors[type] || Theme.muted;
    }

    function getCheckerPalette(owner, checker) {
      if (owner === "enemy") {
        const mover = checker.ability === "mover";
        return {
          light: mover ? "#ff7a92" : "#ff97a8",
          base: mover ? "#b71943" : Theme.enemy,
          mid: mover ? "#8e1235" : "#d72b5e",
          dark: mover ? "#4f0922" : Theme.enemyEdge,
          edge: mover ? "#390719" : Theme.enemyEdge,
          rim: mover ? "#ffcf48" : "#ffe15c",
          shadow: "#16040d"
        };
      }

      const palettes = {
        [CheckerType.STANDARD]: {
          light: "#ffffff",
          base: Theme.player,
          mid: "#eadfd2",
          dark: "#a99ba9",
          edge: Theme.playerEdge,
          rim: "#ff2b86",
          shadow: "#120817"
        },
        [CheckerType.GOLDEN]: {
          light: "#fff9bd",
          base: Theme.gold,
          mid: "#dca92d",
          dark: "#8a5d13",
          edge: "#53380b",
          rim: "#fff8e7",
          shadow: "#241603"
        },
        [CheckerType.GLASS]: {
          light: "#ffffff",
          base: "#58ecff",
          mid: "#27a9d9",
          dark: "#126078",
          edge: "#083744",
          rim: "#fff8e7",
          shadow: "#052934"
        },
        [CheckerType.ANCHOR]: {
          light: "#f0edf6",
          base: "#b8aeca",
          mid: "#7f748f",
          dark: "#43394e",
          edge: "#1d1626",
          rim: "#fff8e7",
          shadow: "#0b0810"
        },
        [CheckerType.RUBY]: {
          light: "#ffb1c5",
          base: "#e21655",
          mid: "#9e0d3b",
          dark: "#4e061f",
          edge: "#2c0311",
          rim: "#ffe15c",
          shadow: "#140208"
        },
        [CheckerType.PRISM]: {
          light: "#ffffff",
          base: "#9d73ff",
          mid: "#6f3ddb",
          dark: "#301b72",
          edge: "#170c3e",
          rim: "#35f2a4",
          shadow: "#0e0923"
        },
        [CheckerType.SPRINTER]: {
          light: "#dbfff1",
          base: Theme.accent,
          mid: "#18b978",
          dark: "#0a6442",
          edge: "#053826",
          rim: "#28d4ff",
          shadow: "#032017"
        }
      };

      return palettes[checker.type] || palettes[CheckerType.STANDARD];
    }

    function drawSwordIcon(cx, cy, radius) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#fff8e7";
      ctx.lineWidth = Math.max(3, radius * 0.14);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.35, radius * 0.25);
      ctx.lineTo(radius * 0.34, -radius * 0.38);
      ctx.stroke();

      ctx.strokeStyle = "#ffe15c";
      ctx.lineWidth = Math.max(2, radius * 0.10);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.18, radius * 0.38);
      ctx.lineTo(-radius * 0.42, radius * 0.14);
      ctx.stroke();

      ctx.fillStyle = "#fff8e7";
      ctx.beginPath();
      ctx.moveTo(radius * 0.42, -radius * 0.45);
      ctx.lineTo(radius * 0.25, -radius * 0.34);
      ctx.lineTo(radius * 0.36, -radius * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawAkceIcon(cx, cy, radius) {
      ctx.save();
      // Outer rim shadow
      ctx.beginPath();
      ctx.arc(cx, cy + radius * 0.18, radius * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fill();

      // Coin body — silver gradient
      const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.1, cx, cy, radius * 1.1);
      grad.addColorStop(0, "#f5f1de");
      grad.addColorStop(0.45, "#c9c2a5");
      grad.addColorStop(1, "#766b4e");
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Dark rim
      ctx.lineWidth = Math.max(1, radius * 0.12);
      ctx.strokeStyle = "rgba(50,40,16,0.9)";
      ctx.stroke();

      // Inner decorative ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.8, radius * 0.06);
      ctx.strokeStyle = "rgba(70,55,20,0.65)";
      ctx.stroke();

      // Crescent moon
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "#3e2e0d";
      ctx.beginPath();
      ctx.arc(-radius * 0.05, 0, radius * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(radius * 0.12, -radius * 0.05, radius * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Star (if big enough)
      if (radius >= 9) {
        ctx.save();
        ctx.translate(cx + radius * 0.38, cy + radius * 0.04);
        ctx.fillStyle = "#3e2e0d";
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const r1 = radius * 0.18;
          const r2 = radius * 0.08;
          ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
          ctx.lineTo(Math.cos(ang + Math.PI / 5) * r2, Math.sin(ang + Math.PI / 5) * r2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Highlight
      ctx.beginPath();
      ctx.arc(cx - radius * 0.35, cy - radius * 0.4, radius * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,240,0.55)";
      ctx.fill();
      ctx.restore();
    }

    function drawDebugUI(width, height) {
      const toggleW = 78;
      const toggleH = 26;
      const toggleX = width - toggleW - 14;
      const toggleY = 14;
      const open = GameState.debugOpen;

      ctx.save();
      // Toggle pill
      ctx.beginPath();
      roundRect(toggleX, toggleY, toggleW, toggleH, 8);
      ctx.fillStyle = open ? "rgba(255,225,92,0.92)" : "rgba(22,8,23,0.78)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = open ? "#5b3c00" : "rgba(255,225,92,0.55)";
      ctx.stroke();

      ctx.fillStyle = open ? "#1b1020" : Theme.gold;
      ctx.font = "900 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DEBUG", toggleX + toggleW / 2, toggleY + toggleH / 2);
      ctx.restore();

      GameState.buttons.push({
        x: toggleX,
        y: toggleY,
        width: toggleW,
        height: toggleH,
        action: () => { GameState.debugOpen = !GameState.debugOpen; },
        tooltip: { kind: "debug", title: "Debug Menu", body: "Toggle the debug cheats panel." }
      });

      if (!open) return;

      const actions = [
        {
          label: "+5 Mult",
          color: Theme.accent,
          fn: () => {
            GameState.score.mult += 5;
            addFloatingText(width - 120, 80, "+5 Mult", Theme.accent, 1.0);
          }
        },
        {
          label: "+5 Rolls",
          color: Theme.blue,
          fn: () => {
            GameState.rollsRemaining += 5;
            addFloatingText(width - 120, 80, "+5 Rolls", Theme.blue, 1.0);
          }
        },
        {
          label: "Score: hit target",
          color: Theme.gold,
          fn: () => {
            const need = Math.max(0, GameState.score.target - GameState.score.current);
            const bump = need > 0 ? need : Math.max(200, Math.ceil(GameState.score.target * 0.25));
            GameState.score.current += bump;
            addFloatingText(width - 120, 80, `+${bump.toLocaleString()}`, Theme.gold, 1.0);
          }
        },
        {
          label: "+50 Akçe",
          color: Theme.gold,
          fn: () => {
            GameState.money += 50;
            addFloatingText(width - 120, 80, "+50 Akçe", Theme.gold, 1.0);
          }
        }
      ];

      const panelW = 168;
      const panelPad = 8;
      const btnH = 30;
      const btnGap = 6;
      const panelH = panelPad * 2 + actions.length * btnH + (actions.length - 1) * btnGap;
      const panelX = width - panelW - 14;
      const panelY = toggleY + toggleH + 8;

      ctx.save();
      ctx.beginPath();
      roundRect(panelX, panelY, panelW, panelH, 10);
      ctx.fillStyle = "rgba(22,8,23,0.92)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,225,92,0.45)";
      ctx.stroke();
      ctx.restore();

      let by = panelY + panelPad;
      for (const action of actions) {
        const bx = panelX + panelPad;
        const bw = panelW - panelPad * 2;
        ctx.save();
        ctx.beginPath();
        roundRect(bx, by, bw, btnH, 7);
        ctx.fillStyle = action.color;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = Theme.darkInk;
        ctx.font = "900 12px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(action.label, bx + bw / 2, by + btnH / 2);
        ctx.restore();

        GameState.buttons.push({
          x: bx,
          y: by,
          width: bw,
          height: btnH,
          action: action.fn,
          tooltip: { kind: "debug", title: action.label, body: "Debug cheat." }
        });

        by += btnH + btnGap;
      }
    }

    function drawCheckerGlyph(cx, cy, radius, type, palette) {
      const g = radius * 0.34;
      ctx.save();
      ctx.strokeStyle = palette.edge;
      ctx.fillStyle = palette.light;
      ctx.lineWidth = Math.max(1.5, radius * 0.07);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.78;

      if (type === CheckerType.GOLDEN) {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const outer = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const inner = outer + Math.PI / 5;
          const ox = cx + Math.cos(outer) * g;
          const oy = cy + Math.sin(outer) * g;
          const ix = cx + Math.cos(inner) * g * 0.42;
          const iy = cy + Math.sin(inner) * g * 0.42;
          if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
          ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

      } else if (type === CheckerType.GLASS) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - g);
        ctx.lineTo(cx + g * 0.72, cy);
        ctx.lineTo(cx, cy + g);
        ctx.lineTo(cx - g * 0.72, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

      } else if (type === CheckerType.ANCHOR) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - g * 0.9);
        ctx.lineTo(cx, cy + g * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - g * 0.6, cy - g * 0.25);
        ctx.lineTo(cx + g * 0.6, cy - g * 0.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + g * 0.3, g * 0.52, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy - g * 0.9, g * 0.2, 0, Math.PI * 2);
        ctx.fill();

      } else if (type === CheckerType.RUBY) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          const px = cx + Math.cos(a) * g * 0.82;
          const py = cy + Math.sin(a) * g * 0.82;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

      } else if (type === CheckerType.PRISM) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - g);
        ctx.lineTo(cx + g * 0.88, cy + g * 0.5);
        ctx.lineTo(cx - g * 0.88, cy + g * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

      } else if (type === CheckerType.SPRINTER) {
        ctx.beginPath();
        ctx.moveTo(cx + g * 0.22, cy - g);
        ctx.lineTo(cx - g * 0.08, cy - g * 0.05);
        ctx.lineTo(cx + g * 0.3, cy - g * 0.05);
        ctx.lineTo(cx - g * 0.22, cy + g);
        ctx.lineTo(cx + g * 0.06, cy + g * 0.08);
        ctx.lineTo(cx - g * 0.3, cy + g * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    function shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    function formatNumber(value) {
      return Core.formatNumber(value);
    }

    function setRulesDrawer(open) {
      rulesDrawer.classList.toggle("is-open", open);
      rulesDrawer.setAttribute("aria-hidden", String(!open));
      rulesToggle.setAttribute("aria-expanded", String(open));
      drawerScrim.hidden = !open;
    }

    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      GameState.hover.x = event.clientX - rect.left;
      GameState.hover.y = event.clientY - rect.top;
      GameState.hover.active = true;
    });
    canvas.addEventListener("mouseleave", () => {
      GameState.hover.active = false;
      GameState.hover.tooltip = null;
      canvas.style.cursor = "default";
    });
    window.addEventListener("resize", resizeCanvasForDisplay);
    rulesToggle.addEventListener("click", () => setRulesDrawer(true));
    rulesClose.addEventListener("click", () => setRulesDrawer(false));
    drawerScrim.addEventListener("click", () => setRulesDrawer(false));
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setRulesDrawer(false);
    });

    window.PipjackDebug = {
      shop(cash = GameState.money || 20) {
        GameState.money = cash;
        enterShop();
        return "Opened shop.";
      },
      payout(totalScore = GameState.score.target) {
        GameState.score.current = totalScore;
        winRound();
        return "Opened payout screen.";
      },
      level(levelNumber = 1) {
        const index = clamp(Math.round(levelNumber) - 1, 0, LevelConfig.length - 1);
        resetLevel(index, true);
        return `Loaded ${LevelConfig[index].name}.`;
      },
      cash(amount = 20) {
        GameState.money = amount;
        return `Akçe set to ${amount}.`;
      },
      akce(amount = 20) {
        GameState.money = amount;
        return `Akçe set to ${amount}.`;
      },
      score(amount = GameState.score.target) {
        GameState.score.current = amount;
        return `Score set to ${amount}.`;
      },
      movers() {
        return GameState.board
          .filter((pip) => pip.enemyPieces.some((checker) => checker.ability === "mover"))
          .map((pip) => pip.index + 1);
      }
    };

    resetLevel(0, false);
    requestAnimationFrame(draw);
