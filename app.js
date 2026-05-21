const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const rulesToggle = document.getElementById("rulesToggle");
    const glossaryToggle = document.getElementById("glossaryToggle");
    const rulesClose = document.getElementById("rulesClose");
    const rulesDrawer = document.getElementById("rulesDrawer");
    const drawerScrim = document.getElementById("drawerScrim");
    const Core = window.PipjackCore;
    const {
      BOARD_SIZE,
      PIPS_PER_ROW,
      TurnPhase,
      CheckerType,
      EnemyAbility,
      TileModifierLibrary,
      LevelConfig
    } = Core;

    const Theme = Object.freeze({
      paper: "#071014",
      panel: "#0b1d22",
      panelSoft: "rgba(223, 192, 130, 0.82)",
      ink: "#f6dfaa",
      darkInk: "#071014",
      muted: "#8fb0a4",
      faint: "rgba(223,192,130,0.10)",
      line: "rgba(191,126,66,0.46)",
      brass: "#c98a43",
      brassDark: "#6b3f20",
      copper: "#a95739",
      player: "#f2dfba",
      playerEdge: "#4c3a26",
      enemy: "#b63135",
      enemyEdge: "#4f1718",
      pipA: "#0aa0a8",
      pipB: "#9e244c",
      accent: "#70e35f",
      gold: "#e4b75a",
      blue: "#25b9c9",
      danger: "#d84a55",
      valid: "#b6f553",
      purple: "#8f5c9c"
    });

    const layout = {
      leftMenuWidth: 272,
      rightMenuWidth: 272,
      boardPaddingX: 30,
      boardPaddingY: 28,
      pipGap: 6,
      checkerRadius: 36
    };

    let nextCheckerId = 1;
    let autoRollTimer = null;
    let bgOffscreen = null;
    let bgCtx = null;

    const GameState = {
      board: [],
      bar: { player: [], enemy: [] },
      borneOff: [],
      destroyed: [],
      enemyMovesConsumed: 0,
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
      runUpgrades: {
        deckPips: {},
        checkerUpgrades: []
      },
      levelIndex: 0,
      levelConfig: LevelConfig,
      floatingTexts: [],
      moveAnimations: [],
      fallingCheckers: [],
      glassShards: [],
      cameraShake: 0,
      scoreBursts: [],
      diceBodies: [],
      hiddenCheckerIds: new Set(),
      buttons: [],
      shopOffers: [],
      storePurchases: 0,
      storeHidden: false,
      deckPlacement: null,
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
      debugOpen: false,
      shopParticles: [],
      akceDisplayScale: 1.0
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

    function spawnHazards(board, ramCount) {
      Core.spawnHazards(board, ramCount);
    }

    function initializeStartingCheckers() {
      return [
        { startingIndex: 0, pip: 0, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 1, pip: 0, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 2, pip: 3, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 3, pip: 3, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 4, pip: 3, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 5, pip: 7, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 6, pip: 7, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 7, pip: 9, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 8, pip: 10, type: CheckerType.STANDARD, core: "basic", rim: "basic" },
        { startingIndex: 9, pip: 10, type: CheckerType.STANDARD, core: "basic", rim: "basic" }
      ];
    }

    function applyStartingCheckers() {
      if (!GameState.board || GameState.board.length === 0) return;
      for (const pip of GameState.board) {
        pip.playerPieces = [];
      }
      if (!GameState.runUpgrades || !GameState.runUpgrades.startingCheckers) return;
      for (const def of GameState.runUpgrades.startingCheckers) {
        const checker = createChecker("player", def.type);
        checker.startingIndex = def.startingIndex;
        checker.core = def.core;
        checker.rim = def.rim;
        Core.recalculateCheckerStats(checker);
        
        const pip = GameState.board[def.pip];
        if (pip) {
          pip.playerPieces.push(checker);
        }
      }
    }

    function resetLevel(levelIndex, preserveRun = true) {
      if (autoRollTimer) {
        clearTimeout(autoRollTimer);
        autoRollTimer = null;
      }
      const keptUpgrades = preserveRun ? GameState.runUpgrades : { deckPips: {}, checkerUpgrades: [] };
      const keptMoney = preserveRun ? GameState.money : 0;
      const level = LevelConfig[levelIndex];

      if (!preserveRun) {
        GameState.runUpgrades = {
          deckPips: {},
          checkerUpgrades: [],
          startingCheckers: initializeStartingCheckers()
        };
      } else {
        GameState.runUpgrades = keptUpgrades;
        if (!GameState.runUpgrades.startingCheckers) {
          GameState.runUpgrades.startingCheckers = initializeStartingCheckers();
        }
      }

      GameState.board = createStartingBoard(levelIndex);
      applyStartingCheckers();
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
      GameState.levelIndex = levelIndex;
      GameState.floatingTexts = [];
      GameState.moveAnimations = [];
      GameState.scoreBursts = [];
      GameState.diceBodies = [];
      GameState.hiddenCheckerIds = new Set();
      GameState.upgradeAnimations = [];
      GameState.pipPlacementAnimations = [];
      GameState.payoutCoins = [];
      GameState.shopOffers = [];
      GameState.storePurchases = 0;
      GameState.storeHidden = false;
      GameState.deckPlacement = null;
      GameState.roundPayout = null;
      GameState.payoutStartedAt = 0;
      GameState.enemyPendingReentry = [];
      GameState.enemyEscaped = false;
      GameState.enemyMovesConsumed = 0;
      GameState.runWon = false;
      GameState.message = `${level.name}: dice are rolling.`;
      queueAutoRoll();
    }

    function enterShop() {
      GameState.turnPhase = TurnPhase.SHOP;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.dice = [];
      GameState.rolledDice = [];
      GameState.diceBodies = [];
      GameState.storePurchases = 0;
      GameState.storeHidden = false;
      GameState.deckPlacement = null;
      GameState.shopOffers = generateShopOffers();
      GameState.shopParticles = Array.from({ length: 45 }, () => ({
        x: Math.random(),
        y: Math.random(),
        size: 0.8 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.2 - Math.random() * 0.5,
        alpha: 0.15 + Math.random() * 0.45,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.04
      }));
      GameState.message = "Shop open. Buy relic-pips, place them in your deck, or upgrade checkers before the next blind.";
    }

    function generateShopOffers() {
      const pipPool = [
        {
          kind: "pip",
          title: "Iron Gate",
          detail: "Break a red checker here for +2 global Mult this round.",
          price: 5,
          modifier: TileModifierLibrary.IRON
        },
        {
          kind: "pip",
          title: "Haste Line",
          detail: "Land here with die 5 or 6 for +20 Chips.",
          price: 4,
          modifier: TileModifierLibrary.HASTE
        },
        {
          kind: "pip",
          title: "Ledger Pip",
          detail: "Break a red checker here to gain +1 Akçe immediately.",
          price: 5,
          modifier: TileModifierLibrary.LEDGER
        },
        {
          kind: "pip",
          title: "Dealer Pip",
          detail: "Land here for +1 global Mult this round.",
          price: 4,
          modifier: TileModifierLibrary.DEALER
        },
        {
          kind: "pip",
          title: "Forge Pip",
          detail: "Land here to temporarily upgrade this checker's rim tier.",
          price: 3,
          modifier: TileModifierLibrary.FORGE
        },
        {
          kind: "pip",
          title: "Market Pip",
          detail: "Land here to double Chips for that move.",
          price: 4,
          modifier: TileModifierLibrary.MARKET
        }
      ];

      const checkerPool = [
        {
          kind: "checker",
          title: "Golden Checker",
          detail: "Replace a starting checker with a Golden Checker (Gold Core).",
          price: 3,
          checkerType: CheckerType.GOLDEN
        },
        {
          kind: "checker",
          title: "Glass Checker",
          detail: "Replace a starting checker with a Glass Checker (Glass Rim).",
          price: 3,
          checkerType: CheckerType.GLASS
        },
        {
          kind: "checker",
          title: "Anchor Checker",
          detail: "Replace a starting checker with an Anchor Checker (Anchor Core).",
          price: 4,
          checkerType: CheckerType.ANCHOR
        },
        {
          kind: "checker",
          title: "Ruby Checker",
          detail: "Replace a starting checker with a Ruby Checker (Ruby Rim).",
          price: 4,
          checkerType: CheckerType.RUBY
        },
        {
          kind: "checker",
          title: "Prism Checker",
          detail: "Replace a starting checker with a Prism Checker (Prism Rim).",
          price: 5,
          checkerType: CheckerType.PRISM
        },
        {
          kind: "checker",
          title: "Sprinter Checker",
          detail: "Replace a starting checker with a Sprinter Checker.",
          price: 3,
          checkerType: CheckerType.SPRINTER
        }
      ];

      const upgradePool = [
        {
          kind: "upgrade",
          title: "Gold Core",
          detail: "Upgrade a starting checker's core to Gold (+50 Chips).",
          price: 3,
          upgrade: { type: "core", value: "gold" }
        },
        {
          kind: "upgrade",
          title: "Platinum Core",
          detail: "Upgrade a starting checker's core to Platinum (+100 Chips).",
          price: 5,
          upgrade: { type: "core", value: "platinum" }
        },
        {
          kind: "upgrade",
          title: "Anchor Core",
          detail: "Upgrade a starting checker's core to Anchor (invulnerable).",
          price: 4,
          upgrade: { type: "core", value: "anchor" }
        },
        {
          kind: "upgrade",
          title: "Glass Rim",
          detail: "Upgrade a starting checker's rim to Glass (x2 Mult, shatters easily).",
          price: 3,
          upgrade: { type: "rim", value: "glass" }
        },
        {
          kind: "upgrade",
          title: "Ruby Rim",
          detail: "Upgrade a starting checker's rim to Ruby (x3 Mult).",
          price: 4,
          upgrade: { type: "rim", value: "ruby" }
        },
        {
          kind: "upgrade",
          title: "Prism Rim",
          detail: "Upgrade a starting checker's rim to Prism (x5 Mult).",
          price: 6,
          upgrade: { type: "rim", value: "prism" }
        }
      ];

      const pipOffers = shuffle(pipPool).slice(0, 3);
      const checkerOffers = shuffle(checkerPool).slice(0, 3);
      const upgradeOffers = shuffle(upgradePool).slice(0, 3);
      return [...pipOffers, ...checkerOffers, ...upgradeOffers].map((offer, index) => ({
        ...offer,
        id: `${offer.kind}-${index}-${offer.title.toLowerCase().replace(/\s+/g, "-")}`,
        bought: false
      }));
    }

    function chooseShopOffer(offer) {
      if (GameState.turnPhase !== TurnPhase.SHOP) return;
      if (offer.bought) return;
      if (GameState.deckPlacement) {
        GameState.message = "Complete or cancel the current placement/upgrade action first.";
        return;
      }

      const price = getOfferPrice(offer);
      if (GameState.money < price) {
        GameState.message = `Need ${price} Akçe for ${offer.title}.`;
        return;
      }

      GameState.money -= price;
      GameState.akceDisplayScale = 1.6;
      offer.bought = true;
      GameState.storePurchases += 1;
      
      if (offer.kind === "pip") {
        startDeckPlacement(offer);
      } else if (offer.kind === "checker") {
        startCheckerReplacement(offer);
      } else if (offer.kind === "upgrade") {
        startUpgradeTargeting(offer);
      }
    }

    function getOfferPrice(offer) {
      return Math.max(1, offer.price);
    }

    function addCheckerUpgrade(upgrade) {
      GameState.runUpgrades.checkerUpgrades.push(upgrade);
      upgradeTopPlayerChecker(upgrade);
    }

    function startDeckPlacement(offer) {
      GameState.deckPlacement = {
        offerId: offer.id,
        kind: "pip",
        modifier: offer.modifier
      };
      GameState.storeHidden = true;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.message = `${offer.title} purchased. Choose a deck pip on your side to place it, or cancel to return to the shop.`;
    }

    function startCheckerReplacement(offer) {
      GameState.deckPlacement = {
        offerId: offer.id,
        kind: "checker",
        checkerType: offer.checkerType,
        title: offer.title
      };
      GameState.storeHidden = true;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.message = `${offer.title} purchased. Select any starting checker on the board to replace it, or cancel.`;
    }

    function startUpgradeTargeting(offer) {
      GameState.deckPlacement = {
        offerId: offer.id,
        kind: "upgrade",
        upgrade: offer.upgrade,
        title: offer.title
      };
      GameState.storeHidden = true;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.message = `${offer.title} purchased. Select any starting checker on the board to apply the upgrade, or cancel.`;
    }

    function applyPlacementAction(startingIndex) {
      const placement = GameState.deckPlacement;
      if (!placement) return;

      const def = GameState.runUpgrades.startingCheckers.find(c => c.startingIndex === startingIndex);
      if (!def) return;

      // 1. Locate the checker visually and save its old state
      let clickedChecker = null;
      let visualPos = null;
      for (const pip of GameState.board) {
        for (const checker of pip.playerPieces) {
          if (checker.startingIndex === startingIndex) {
            clickedChecker = checker;
            // Search hit areas for its visual coordinates
            const area = GameState.checkerHitAreas.find(a => a.checker && a.checker.id === checker.id);
            if (area) {
              visualPos = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
            } else {
              const pc = getPipCenter(pip.index);
              visualPos = { x: pc.x, y: pc.y };
            }
            break;
          }
        }
        if (clickedChecker) break;
      }

      // Deep copy old checker info to draw during transition
      const oldChecker = clickedChecker ? { ...clickedChecker } : {
        type: def.type,
        core: def.core,
        rim: def.rim,
        id: Math.random()
      };

      if (placement.kind === "checker") {
        def.type = placement.checkerType;
        if (def.type === CheckerType.GOLDEN) {
          def.core = "gold";
          def.rim = "basic";
        } else if (def.type === CheckerType.GLASS) {
          def.core = "basic";
          def.rim = "glass";
        } else if (def.type === CheckerType.ANCHOR) {
          def.core = "anchor";
          def.rim = "basic";
        } else if (def.type === CheckerType.RUBY) {
          def.core = "basic";
          def.rim = "ruby";
        } else if (def.type === CheckerType.PRISM) {
          def.core = "basic";
          def.rim = "prism";
        } else {
          def.core = "basic";
          def.rim = "basic";
        }
        GameState.message = `Starting checker replaced with a ${placement.title}.`;
      } else if (placement.kind === "upgrade") {
        if (placement.upgrade.type === "core") {
          def.core = placement.upgrade.value;
        } else if (placement.upgrade.type === "rim") {
          def.rim = placement.upgrade.value;
        }
        GameState.message = `Starting checker upgraded with ${placement.title}.`;
      }

      applyStartingCheckers();

      // Find the new checker object corresponding to this startingIndex
      let newChecker = null;
      for (const pip of GameState.board) {
        for (const checker of pip.playerPieces) {
          if (checker.startingIndex === startingIndex) {
            newChecker = checker;
            break;
          }
        }
        if (newChecker) break;
      }

      // Hide the new checker temporarily
      if (newChecker) {
        GameState.hiddenCheckerIds.add(newChecker.id);
      }

      // 2. Add transition animation
      if (visualPos) {
        const upgradeColor = placement.kind === "checker" ? Theme.gold : Theme.blue;
        GameState.upgradeAnimations.push({
          x: visualPos.x,
          y: visualPos.y,
          oldChecker: oldChecker,
          newChecker: newChecker,
          startedAt: performance.now(),
          duration: 1000,
          particles: Array.from({ length: 24 }, () => ({
            x: 0,
            y: 0,
            angle: Math.random() * Math.PI * 2,
            speed: 1.5 + Math.random() * 3.5,
            size: 1.5 + Math.random() * 3,
            alpha: 1,
            color: upgradeColor,
            drag: 0.96
          }))
        });
      }

      GameState.deckPlacement = null;
      if (!visualPos) {
        GameState.storeHidden = false;
      }
    }

    function cancelDeckPlacement() {
      if (!GameState.deckPlacement) return;
      const offer = GameState.shopOffers.find((candidate) => candidate.id === GameState.deckPlacement.offerId);
      if (offer) offer.bought = false;
      GameState.money += offer ? getOfferPrice(offer) : 0;
      GameState.akceDisplayScale = 1.6;
      GameState.storePurchases = Math.max(0, GameState.storePurchases - 1);
      
      const kind = GameState.deckPlacement.kind || "pip";
      GameState.deckPlacement = null;
      GameState.storeHidden = false;
      GameState.message = `${kind.toUpperCase()} purchase canceled. Akçe refunded.`;
    }

    function toggleStoreVisibility() {
      if (GameState.turnPhase !== TurnPhase.SHOP || GameState.deckPlacement) return;
      GameState.storeHidden = !GameState.storeHidden;
      GameState.message = GameState.storeHidden
        ? "Store hidden. Inspect your deck, then show the store when you are ready."
        : "Store open. Buy relic-pips or piece upgrades before the next blind.";
    }

    function placeDeckPip(pipIndex) {
      const placement = GameState.deckPlacement;
      if (!placement) return;
      if (!isDeckPip(pipIndex)) {
        GameState.message = "Relic-pips can only be placed in your deck on the bottom half.";
        return;
      }

      const oldModifier = GameState.board[pipIndex].modifier ? { ...GameState.board[pipIndex].modifier } : null;
      const newModifier = placement.modifier;

      installTileModifier(placement.modifier, pipIndex);
      GameState.runUpgrades.deckPips[pipIndex] = placement.modifier.id;

      // 1. Locate the pip center and modifier visual coordinates
      const area = GameState.pipHitAreas.find((hitArea) => hitArea.pipIndex === pipIndex);
      if (area) {
        const direction = pipIndex < 12 ? "up" : "down";
        const cx = area.x + area.width / 2;
        const cy = direction === "down" ? area.y + 27 : area.y + area.height - 27;

        GameState.pipPlacementAnimations.push({
          x: cx,
          y: cy,
          oldModifier: oldModifier,
          newModifier: newModifier,
          startedAt: performance.now(),
          duration: 1000,
          pipIndex: pipIndex,
          particles: Array.from({ length: 20 }, () => ({
            x: 0,
            y: 0,
            angle: Math.random() * Math.PI * 2,
            speed: 1.2 + Math.random() * 2.8,
            size: 1 + Math.random() * 2.5,
            alpha: 1,
            color: newModifier.color || Theme.blue,
            drag: 0.95
          }))
        });
      }

      GameState.deckPlacement = null;
      if (!area) {
        GameState.storeHidden = false;
      }
      GameState.message = `${placement.modifier.name} placed on deck Pip ${pipIndex + 1}.`;
    }

    function installTileModifier(modifier, pipIndex) {
      if (!modifier || !Number.isInteger(pipIndex)) return;
      const pip = GameState.board[pipIndex];
      if (!pip || !isDeckPip(pipIndex) || pip.locked) return;
      pip.modifier = modifier;
    }

    function applyRunUpgrades() {
      for (const [pipIndex, modifierId] of Object.entries(GameState.runUpgrades.deckPips || {})) {
        const modifier = getTileModifierById(modifierId);
        if (modifier) installTileModifier(modifier, Number(pipIndex));
      }

      for (const upgrade of GameState.runUpgrades.checkerUpgrades || []) {
        upgradeTopPlayerChecker(upgrade);
      }
    }

    function getTileModifierById(modifierId) {
      return Object.values(TileModifierLibrary).find((modifier) => modifier.id === modifierId) || null;
    }

    function isDeckPip(pipIndex) {
      return pipIndex >= 0 && pipIndex < PIPS_PER_ROW;
    }

    function rollDice() {
      if (GameState.turnPhase !== TurnPhase.ROLLING || GameState.rollsRemaining <= 0) return;

      const diceCount = 2;
      const rolledDice = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1);
      GameState.rolledDice = rolledDice;
      GameState.dice = expandRolledDice(rolledDice);
      GameState.rollsRemaining -= 1;
      GameState.turnPhase = TurnPhase.MOVING;
      spawnDiceBodies(GameState.dice);
      GameState.message = rolledDice[0] === rolledDice[1]
        ? `Rolled double ${rolledDice[0]}. Four matched moves unlocked.`
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
      const pendingAtStart = [...GameState.enemyPendingReentry, ...GameState.bar.enemy];
      GameState.enemyPendingReentry = [];
      GameState.bar.enemy = [];
      const moves = getEnemyMovesForTurn();
      if (!moves.length) {
        finishEnemyTurn(pendingAtStart, 0, 0);
        return;
      }

      GameState.turnPhase = TurnPhase.EVALUATING;
      let movedCount = 0;
      let pushedCount = 0;
      let moveIndex = 0;
      GameState.enemyMovesConsumed = 0;

      const level = LevelConfig[GameState.levelIndex];
      const tokens = level.enemyTokens || [3, 3];

      const resolveNextMove = () => {
        if (moveIndex >= moves.length || GameState.turnPhase === TurnPhase.ROUND_OVER) {
          finishEnemyTurn(pendingAtStart, movedCount, pushedCount);
          return;
        }

        const move = moves[moveIndex];
        const current = findEnemyCheckerPosition(move.checkerId);
        if (!current) {
          moveIndex++;
          GameState.enemyMovesConsumed = moveIndex;
          resolveNextMove();
          return;
        }

        const tokenValue = tokens[moveIndex] || 3;
        const [checker] = current.pip.enemyPieces.splice(current.index, 1);
        const result = advanceEnemyChecker(checker, current.pip.index, tokenValue);
        
        moveIndex++;
        GameState.enemyMovesConsumed = moveIndex;

        if (result.moved) movedCount += 1;
        pushedCount += result.pushed;

        const label = getEnemyAbility(checker) === EnemyAbility.RAM ? "Ram" : "Pawn";
        GameState.message = `${label} ${moveIndex}/${moves.length} advanced.`;
        setTimeout(resolveNextMove, result.duration + 220);
      };

      resolveNextMove();
    }

    function getEnemyMovesForTurn() {
      const moveCount = getEnemyMoveCount();
      const moves = [];

      for (const pip of GameState.board) {
        const mover = chooseEnemyMover(pip.enemyPieces);
        if (mover) moves.push({ source: pip.index, checkerId: mover.id });
      }

      return moves
        .sort((a, b) => b.source - a.source)
        .slice(0, moveCount);
    }

    function getEnemyMoveCount() {
      const level = LevelConfig[GameState.levelIndex];
      return level.enemyTokens ? level.enemyTokens.length : (level.bossRule?.enemyMoves || level.enemyMoves || 2);
    }

    function finishEnemyTurn(pendingAtStart, movedCount, pushedCount) {
      if (movedCount > 0) {
        const pushText = pushedCount ? ` ${pushedCount} ram push${pushedCount === 1 ? "" : "es"}.` : "";
        GameState.message = `${movedCount} enemy ${movedCount === 1 ? "piece" : "pieces"} advanced.${pushText}`;
      }

      reenterPendingEnemies(pendingAtStart);
      checkRoundLoss();
      if (GameState.turnPhase === TurnPhase.ROUND_OVER) return;

      GameState.enemyMovesConsumed = 0;
      GameState.turn += 1;
      GameState.turnPhase = TurnPhase.ROLLING;
      GameState.message = movedCount > 0 ? `${GameState.message} Dice are rolling again.` : "Enemy held position. Dice are rolling again.";
      queueAutoRoll();
    }

    function findEnemyCheckerPosition(checkerId) {
      for (const pip of GameState.board) {
        const index = pip.enemyPieces.findIndex((checker) => checker.id === checkerId);
        if (index !== -1) return { pip, index };
      }
      return null;
    }

    function chooseEnemyMover(enemyPieces) {
      return enemyPieces.find((checker) => getEnemyAbility(checker) === EnemyAbility.RAM)
        || enemyPieces.find((checker) => getEnemyAbility(checker) === EnemyAbility.PAWN);
    }

    function getEnemyAbility(checker) {
      if (checker.ability === "mover") return EnemyAbility.PAWN;
      return checker.ability || EnemyAbility.PAWN;
    }

    function advanceEnemyChecker(checker, source, tokenValue) {
      const path = [getPipCenter(source)];
      let currentSource = source;
      let pushed = 0;
      let moved = false;
      let victim = null;
      let hitText = null;
      let hitTextColor = null;

      const result = resolveEnemyStep(checker, currentSource, tokenValue);
      if (result.type !== "blocked") {
        if (result.type === "score") {
          GameState.enemyPendingReentry.push(checker);
          GameState.enemyEscaped = true;
          addFloatingText(getPipCenter(currentSource).x, getPipCenter(currentSource).y, "Enemy scored", Theme.danger, 0.9);
          path.push(getBearOffCenter());
          moved = true;
          currentSource = null;
        } else {
          // Pass-over shatter detection: check intermediate pips
          const startPip = result.destination + 1;
          const endPip = currentSource - 1;
          for (let intermediatePipIndex = startPip; intermediatePipIndex <= endPip; intermediatePipIndex++) {
            const intermediatePip = GameState.board[intermediatePipIndex];
            if (intermediatePip && intermediatePip.playerPieces.length > 0) {
              for (let i = intermediatePip.playerPieces.length - 1; i >= 0; i--) {
                const pc = intermediatePip.playerPieces[i];
                if (pc.rim === "glass" && pc.core !== "anchor") {
                  intermediatePip.playerPieces.splice(i, 1);
                  pc.destroyed = true;
                  GameState.destroyed.push(pc);
                  addFloatingText(
                    getPipCenter(intermediatePipIndex).x,
                    getPipCenter(intermediatePipIndex).y,
                    "Glass shattered (passed over)",
                    Theme.blue,
                    0.9
                  );
                }
              }
            }
          }

          if (result.victim) {
            victim = result.victim;
            hitText = result.hitText;
            hitTextColor = result.hitTextColor;
          }

          currentSource = result.destination;
          pushed += result.pushed ? 1 : 0;
          path.push(getPipCenter(currentSource));
          moved = true;
        }
      }

      if (currentSource !== null) {
        GameState.board[currentSource].enemyPieces.push(checker);
      }

      const targetData = currentSource !== null ? { type: "pip", index: currentSource } : { type: "bearOff" };
      const duration = moved ? addMoveAnimation(checker, path, "enemy", targetData, victim, hitText, hitTextColor) : 0;
      return { moved, pushed, duration };
    }

    function resolveEnemyStep(checker, source, tokenValue) {
      for (let dist = tokenValue; dist >= 1; dist--) {
        const dest = source - dist;
        const landing = getEnemyLanding(checker, source, dest, dist);
        if (landing.type !== "blocked") return landing;
      }
      return { type: "blocked" };
    }

    function getEnemyLanding(checker, source, destination, distance) {
      if (destination < 0) return { type: "score" };

      const targetPip = GameState.board[destination];
      if (!targetPip) return { type: "blocked" };

      const isGate = targetPip.playerPieces.length >= 2;
      const isRam = getEnemyAbility(checker) === EnemyAbility.RAM;
      if (isGate && !(isRam && distance === 2)) return { type: "blocked" };

      let pushed = false;
      let victim = null;
      let hitText = null;
      let hitTextColor = null;

      if (isGate && isRam) {
        const victimIndex = findRamVictimIndex(targetPip);
        if (victimIndex === -1) return { type: "blocked" };
        [victim] = targetPip.playerPieces.splice(victimIndex, 1);
        if (victim.rim === "glass") {
          victim.destroyed = true;
          GameState.destroyed.push(victim);
          hitText = "Glass shattered (pushed)";
          hitTextColor = Theme.blue;
        } else {
          GameState.bar.player.push(victim);
          pushed = true;
          hitText = "Ram push";
          hitTextColor = Theme.danger;
        }
      } else if (targetPip.playerPieces.length === 1) {
        const checkVictim = targetPip.playerPieces[0];
        if (checkVictim.core === "anchor") {
          return { type: "blocked" };
        }
        victim = targetPip.playerPieces.pop();
        if (victim.rim === "glass") {
          victim.destroyed = true;
          GameState.destroyed.push(victim);
          hitText = "Glass shattered";
          hitTextColor = Theme.blue;
        } else {
          GameState.bar.player.push(victim);
          hitText = "Hit to bar";
          hitTextColor = Theme.danger;
        }
      }

      return { type: "pip", destination, pushed, victim, hitText, hitTextColor };
    }

    function findRamVictimIndex(pip) {
      for (let i = pip.playerPieces.length - 1; i >= 0; i--) {
        if (pip.playerPieces[i].core !== "anchor") return i;
      }
      return -1;
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
      selectChecker(checker.id, source);
    }

    function findCheckerSource(checkerId) {
      if (GameState.bar.player.some((c) => c.id === checkerId)) {
        return "bar";
      }
      for (let i = 0; i < GameState.board.length; i++) {
        if (GameState.board[i].playerPieces.some((c) => c.id === checkerId)) {
          return i;
        }
      }
      return null;
    }

    function selectChecker(checkerId, source) {
      if (GameState.turnPhase !== TurnPhase.MOVING && GameState.turnPhase !== TurnPhase.SHOP) return;

      let checker = null;
      if (source === "bar") {
        checker = GameState.bar.player.find((c) => c.id === checkerId);
      } else {
        const pip = GameState.board[source];
        if (pip) {
          checker = pip.playerPieces.find((c) => c.id === checkerId);
        }
      }

      if (!checker) return;

      GameState.selected = {
        source,
        checkerId: checker.id
      };
      if (GameState.turnPhase === TurnPhase.MOVING) {
        GameState.validTargets = getValidTargets(source);
        GameState.message = GameState.validTargets.length
          ? "Choose a highlighted destination."
          : "That checker has no legal moves for these dice.";
      } else {
        GameState.message = `Selected ${getCheckerName(checker)} checker for inspection/upgrade.`;
      }
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
        const index = GameState.bar.player.findIndex((c) => c.id === GameState.selected.checkerId);
        if (index !== -1) {
          [checker] = GameState.bar.player.splice(index, 1);
        } else {
          checker = GameState.bar.player.pop();
        }
      } else {
        const pip = GameState.board[GameState.selected.source];
        const index = pip.playerPieces.findIndex((c) => c.id === GameState.selected.checkerId);
        if (index !== -1) {
          [checker] = pip.playerPieces.splice(index, 1);
        } else {
          checker = pip.playerPieces.pop();
        }
      }

      if (!checker) return;

      let brokenEnemy = null;
      let existingAlliedCount = 0;
      if (targetData.type === "pip") {
        const destinationPip = GameState.board[targetData.index];
        existingAlliedCount = destinationPip.playerPieces.length;
        if (destinationPip.enemyPieces.length === 1) {
          brokenEnemy = destinationPip.enemyPieces.pop();
          GameState.bar.enemy.push(brokenEnemy);
        }
        destinationPip.playerPieces.push(checker);
      } else {
        GameState.borneOff.push(checker);
      }

      addMoveAnimation(checker, movePath, "player", targetData, brokenEnemy, brokenEnemy ? "Enemy captured" : null, Theme.gold);
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
          ? `Target reached. Press Win to visit the shop.`
          : `Move scored ${GameState.score.lastMove.toLocaleString()}. End turn to roll again.`;
      } else if (!hasAnyLegalMove()) {
        GameState.message = GameState.score.current >= GameState.score.target
          ? "Target reached. Press Win to visit the shop."
          : "No legal moves left. End turn to roll again.";
      } else {
        GameState.message = GameState.score.current >= GameState.score.target
          ? `Target reached. You can keep scoring or press Win to visit the shop.`
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
        globalMult: GameState.score.mult
      });

      for (const event of scoreResult.passOver.events) {
        const center = getPipCenter(event.pipIndex);
        addFloatingText(center.x, center.y, event.label, event.type === "chips" ? Theme.gold : Theme.accent, 0.72);
      }

      if (scoreResult.globalMultDelta) GameState.score.mult += scoreResult.globalMultDelta;
      if (scoreResult.checkerRimUpgrade) {
        checker.rim = scoreResult.checkerRimUpgrade;
        Core.recalculateCheckerStats(checker);
      }
      const { chips, mult, gained, notes } = scoreResult;
      if (scoreResult.moneyDelta) {
        GameState.money += scoreResult.moneyDelta;
        GameState.akceDisplayScale = 1.6;
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
      GameState.akceDisplayScale = 1.6;

      // Initialize coin rain particles!
      GameState.payoutCoins = Array.from({ length: 45 }, () => ({
        x: Math.random(), // percentage of width
        y: 1.1 + Math.random() * 0.5, // start below the screen
        vy: -2 - Math.random() * 4, // moving upward
        vx: (Math.random() - 0.5) * 1.5,
        rotation: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.1,
        size: 8 + Math.random() * 12,
        delay: Math.random() * 800 // staggered launch delay
      }));

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
        startingMoney: GameState.money - (subtotal * multiplier), // starting money before this win
        total: subtotal * multiplier
      };
    }

    function continueAfterRoundClear() {
      if (GameState.turnPhase !== TurnPhase.ROUND_OVER || !GameState.roundPayout) return;
      if (GameState.runWon) {
        restartRun();
        return;
      }
      const earned = GameState.roundPayout.total;
      GameState.levelIndex += 1;
      resetLevel(GameState.levelIndex, true);
      enterShop();
      GameState.message = `Blind cleared. +${earned} Akçe paid out. Buy upgrades, then start the next blind.`;
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

      if (GameState.deckPlacement) {
        if (GameState.deckPlacement.kind === "checker" || GameState.deckPlacement.kind === "upgrade") {
          const clickedCheckerArea = [...GameState.checkerHitAreas]
            .reverse()
            .find((area) => area.owner === "player" && pointInRect(x, y, area));
          if (clickedCheckerArea && clickedCheckerArea.checker.startingIndex !== undefined) {
            applyPlacementAction(clickedCheckerArea.checker.startingIndex);
            return;
          }

          const clickedPip = GameState.pipHitAreas.find((area) => pointInRect(x, y, area));
          if (clickedPip) {
            const pip = GameState.board[clickedPip.pipIndex];
            if (pip && pip.playerPieces.length > 0) {
              const topChecker = pip.playerPieces[pip.playerPieces.length - 1];
              if (topChecker && topChecker.startingIndex !== undefined) {
                applyPlacementAction(topChecker.startingIndex);
                return;
              }
            }
          }
          return; // Block other interactions
        }

        const clickedPip = GameState.pipHitAreas.find((area) => pointInRect(x, y, area));
        if (clickedPip) {
          placeDeckPip(clickedPip.pipIndex);
          return;
        }
        return; // Block other interactions
      }

      // Check if click is on a player checker first (reversed order to check top-most first)
      const clickedCheckerArea = [...GameState.checkerHitAreas]
        .reverse()
        .find((area) => area.owner === "player" && pointInRect(x, y, area));

      if (clickedCheckerArea) {
        const source = findCheckerSource(clickedCheckerArea.checker.id);
        if (source !== null) {
          // If we have a selection and the clicked checker's location is a valid target, we move there!
          if (GameState.selected && typeof source === "number" && GameState.validTargets.some(t => t.type === "pip" && t.index === source)) {
            moveSelectedTo(source);
            return;
          }
          // Otherwise, select this checker
          if (GameState.turnPhase === TurnPhase.MOVING && GameState.bar.player.length > 0 && source !== "bar") {
            GameState.message = "A checker is on the bar. Click one of the highlighted re-enter pips.";
            return;
          }
          selectChecker(clickedCheckerArea.checker.id, source);
          return;
        }
      }

      const clickedPip = GameState.pipHitAreas.find((area) => pointInRect(x, y, area));
      if (clickedPip) {
        handlePipClick(clickedPip.pipIndex);
        return;
      }

      if (GameState.barHitArea && pointInRect(x, y, GameState.barHitArea)) {
        if (GameState.bar.player.length > 0) {
          const topChecker = GameState.bar.player[GameState.bar.player.length - 1];
          selectChecker(topChecker.id, "bar");
        }
        return;
      }

      if (GameState.bearOffArea && pointInRect(x, y, GameState.bearOffArea)) {
        moveSelectedTo("bearOff");
      }
    }

    function handlePipClick(pipIndex) {
      if (GameState.deckPlacement) {
        placeDeckPip(pipIndex);
        return;
      }

      if (GameState.turnPhase !== TurnPhase.MOVING && GameState.turnPhase !== TurnPhase.SHOP) return;

      if (GameState.selected && GameState.turnPhase === TurnPhase.MOVING) {
        const isValidDestination = GameState.validTargets.some((target) => target.type === "pip" && target.index === pipIndex);
        if (isValidDestination) {
          moveSelectedTo(pipIndex);
          return;
        }
      }

      if (GameState.turnPhase === TurnPhase.MOVING && GameState.bar.player.length > 0) {
        GameState.message = "A checker is on the bar. Click one of the highlighted re-entry pips.";
        return;
      }

      if (GameState.board[pipIndex].playerPieces.length > 0) {
        const topChecker = GameState.board[pipIndex].playerPieces[GameState.board[pipIndex].playerPieces.length - 1];
        selectChecker(topChecker.id, pipIndex);
      }
    }

    function upgradeTopPlayerChecker(upgrade) {
      // 1. Prioritize upgrading the currently selected checker
      const selectedChecker = getSelectedChecker();
      if (selectedChecker) {
        Core.applyCheckerUpgrade(selectedChecker, upgrade.type, upgrade.value);
        GameState.message = `Upgraded selected checker: ${upgrade.type} is now ${upgrade.value}.`;
        return;
      }

      // 2. Fallback to upgrading the first available checker on the board
      for (const pip of GameState.board) {
        if (pip.playerPieces.length === 0) continue;
        const checker = pip.playerPieces[pip.playerPieces.length - 1];
        Core.applyCheckerUpgrade(checker, upgrade.type, upgrade.value);
        GameState.message = `Top checker on Pip ${pip.index + 1} upgraded: ${upgrade.type} is now ${upgrade.value}.`;
        return;
      }

      // 3. Fallback to upgrading the checker on the bar if no checkers are on the board
      if (GameState.bar.player.length > 0) {
        const checker = GameState.bar.player[GameState.bar.player.length - 1];
        Core.applyCheckerUpgrade(checker, upgrade.type, upgrade.value);
        GameState.message = `Checker on the Bar upgraded: ${upgrade.type} is now ${upgrade.value}.`;
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
      updateFallingCheckers();
      updateGlassShards();
      if (typeof updateUpgradeAnimations === "function") updateUpgradeAnimations();
      if (typeof updatePipPlacementAnimations === "function") updatePipPlacementAnimations();
      if (GameState.akceDisplayScale > 1.0) {
        GameState.akceDisplayScale = Math.max(1.0, GameState.akceDisplayScale - 0.025);
      }

      const { width, height } = getCanvasSize();
      GameState.buttons = [];
      GameState.pipHitAreas = [];
      GameState.checkerHitAreas = [];
      GameState.barHitArea = null;
      GameState.bearOffArea = null;

      ctx.clearRect(0, 0, width, height);

      ctx.save();
      if (GameState.cameraShake > 0.1) {
        const shakeX = (Math.random() - 0.5) * GameState.cameraShake;
        const shakeY = (Math.random() - 0.5) * GameState.cameraShake;
        ctx.translate(shakeX, shakeY);
        GameState.cameraShake *= 0.88;
      } else {
        GameState.cameraShake = 0;
      }

      drawBackground(width, height);
      drawBoard(width, height);
      drawDiceBodies();
      drawEnemyTurnPreview();
      drawMoveAnimations();
      drawScoreBursts();
      drawFallingCheckers();
      drawGlassShards();
      drawFloatingTexts();
      if (typeof drawUpgradeAnimations === "function") drawUpgradeAnimations();
      if (typeof drawPipPlacementAnimations === "function") drawPipPlacementAnimations();
      ctx.restore();

      drawLeftMenu(width, height);
      drawRightMenu(width, height);

      if (GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.roundPayout) drawRoundClearOverlay(width, height);
      if (GameState.turnPhase === TurnPhase.SHOP && !GameState.storeHidden && !GameState.deckPlacement) drawStoreOverlay(width, height);
      if (GameState.turnPhase === TurnPhase.SHOP) drawStoreControls(width, height);
      if (GameState.deckPlacement) drawDeckPlacementBanner(width, height);
      drawDebugUI(width, height);
      updateHoverTooltip();
      drawTooltip(width, height);

      requestAnimationFrame(draw);
    }

    function drawBackground(width, height) {
      const time = performance.now() / 1000;
      const cx = width / 2;
      const cy = height / 2;

      // Base solid dark background
      ctx.fillStyle = "#04070a";
      ctx.fillRect(0, 0, width, height);

      const multFactor = Math.min(3.5, Math.log2(GameState.score.mult || 1) * 0.25 + 1.0);

      // Smooth flowing vector waves (Balatro-style organic washes but zero pixelation)
      ctx.save();
      
      const drawFlowingWave = (baselineY, amp, freq, speed, color1, color2, alpha, phaseOffset) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, color1);
        grad.addColorStop(1, color2);
        ctx.fillStyle = grad;
        
        ctx.beginPath();
        ctx.moveTo(0, height);
        
        const segments = 100; // Increased from 12 for perfect high-DPI vector curves
        const segmentWidth = width / segments;
        
        // Calculate points
        const points = [];
        for (let i = 0; i <= segments; i++) {
          const x = i * segmentWidth;
          // Zany double-sine wave formula
          const wave1 = Math.sin(x * freq + time * speed + phaseOffset);
          const wave2 = Math.cos(x * freq * 1.7 - time * speed * 0.8 + phaseOffset * 1.5);
          const y = baselineY + (wave1 * 0.7 + wave2 * 0.3) * amp * multFactor;
          points.push({ x, y });
        }
        
        // Draw smooth curves through points
        ctx.lineTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i];
          const p1 = points[i + 1];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }
        ctx.lineTo(width, points[points.length - 1].y);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      const drawVerticalWave = (baselineX, amp, freq, speed, color1, color2, alpha, phaseOffset) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, color1);
        grad.addColorStop(1, color2);
        ctx.fillStyle = grad;
        
        ctx.beginPath();
        ctx.moveTo(width, 0);
        
        const segments = 100; // Increased from 12 for perfect high-DPI vector curves
        const segmentHeight = height / segments;
        
        const points = [];
        for (let i = 0; i <= segments; i++) {
          const y = i * segmentHeight;
          const wave1 = Math.sin(y * freq + time * speed + phaseOffset);
          const wave2 = Math.cos(y * freq * 1.5 - time * speed * 0.75 + phaseOffset * 1.2);
          const x = baselineX + (wave1 * 0.75 + wave2 * 0.25) * amp * multFactor;
          points.push({ x, y });
        }
        
        ctx.lineTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i];
          const p1 = points[i + 1];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }
        ctx.lineTo(points[points.length - 1].x, height);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      // Draw horizontal flowing waves at different baseline positions
      drawFlowingWave(height * 0.65, height * 0.16, 0.002, 0.45, "rgba(37, 185, 201, 0.35)", "rgba(10, 80, 110, 0)", 0.35, 0);
      drawFlowingWave(height * 0.50, height * 0.14, 0.003, -0.35, "rgba(143, 92, 156, 0.40)", "rgba(40, 15, 60, 0)", 0.30, Math.PI * 0.5);
      drawFlowingWave(height * 0.35, height * 0.18, 0.0025, 0.55, "rgba(216, 74, 85, 0.38)", "rgba(80, 10, 20, 0)", 0.28, Math.PI * 1.1);
      drawFlowingWave(height * 0.22, height * 0.12, 0.0035, -0.40, "rgba(228, 183, 90, 0.30)", "rgba(90, 60, 10, 0)", 0.25, Math.PI * 1.6);

      // Draw intersecting vertical flowing waves
      drawVerticalWave(width * 0.35, width * 0.12, 0.003, 0.30, "rgba(37, 185, 201, 0.15)", "rgba(10, 60, 90, 0)", 0.22, Math.PI * 0.2);
      drawVerticalWave(width * 0.70, width * 0.15, 0.002, -0.25, "rgba(216, 74, 85, 0.12)", "rgba(60, 10, 30, 0)", 0.20, Math.PI * 0.8);

      ctx.restore();

      // Layer 2: Smooth Waving rotated grid (Psychedelic warped space - anti-aliased)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.025 * multFactor);
      ctx.translate(-cx, -cy);

      ctx.globalAlpha = 0.08 + (multFactor - 1.0) * 0.03;
      ctx.strokeStyle = "rgba(37, 185, 201, 0.75)";
      ctx.lineWidth = 1.4;

      const bound = Math.max(width, height) * 1.5;
      const startX = cx - bound / 2;
      const endX = cx + bound / 2;
      const startY = cy - bound / 2;
      const endY = cy + bound / 2;
      const gridSize = 45;
      const gridWarpTime = time * 1.8 * multFactor;
      const warpStep = 8; // Small step for high resolution details

      // Horizontal grid lines
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        const points = [];
        for (let x = startX; x <= endX; x += warpStep) {
          const warpY = y + Math.sin(x * 0.005 + gridWarpTime) * 40 * multFactor + Math.cos((x + y) * 0.004 - gridWarpTime) * 20 * multFactor;
          points.push({ x, y: warpY });
        }
        if (points.length > 0) {
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const midX = (p0.x + p1.x) / 2;
            const midY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
          }
          ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
          ctx.stroke();
        }
      }

      // Vertical grid lines
      for (let x = startX; x <= endX; x += gridSize) {
        ctx.beginPath();
        const points = [];
        for (let y = startY; y <= endY; y += warpStep) {
          const warpX = x + Math.cos(y * 0.005 - gridWarpTime) * 40 * multFactor + Math.sin((x + y) * 0.004 + gridWarpTime) * 20 * multFactor;
          points.push({ x: warpX, y });
        }
        if (points.length > 0) {
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const midX = (p0.x + p1.x) / 2;
            const midY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
          }
          ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Layer 3: Spirograph / Sacred Geometry Mandalas behind board tables
      const boardLeft = layout.leftMenuWidth + layout.boardPaddingX;
      const boardWidth = width - boardLeft - layout.rightMenuWidth - layout.boardPaddingX;
      const centerGap = 18;
      const bearOffWidth = 58;
      const utilityGap = 12;
      const tableWidth = (boardWidth - bearOffWidth - centerGap - utilityGap) / 2;
      const leftTableCenterX = boardLeft + tableWidth / 2;
      const rightTableCenterX = boardLeft + tableWidth + centerGap + tableWidth / 2;
      const boardCenterY = height / 2;
      const spiroRadius = tableWidth * 0.45;

      const drawSpirograph = (scx, scy, radius, color, rotSpeed, petals) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.08 * multFactor;
        ctx.beginPath();

        const numPoints = 180;
        const angleOffset = time * rotSpeed * multFactor;
        const r1 = radius * (0.65 + Math.sin(time * 0.5) * 0.1);
        const r2 = radius * (0.35 * Math.sin(time * 0.8));

        for (let i = 0; i <= numPoints; i++) {
          const theta = (i * Math.PI * 2) / numPoints;
          const r = r1 + Math.cos(theta * petals + angleOffset) * r2;
          const px = scx + Math.cos(theta + angleOffset) * r;
          const py = scy + Math.sin(theta + angleOffset) * r;

          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      };

      const goldSpiro = "rgba(228, 183, 90, 0.45)";
      const tealSpiro = "rgba(37, 185, 201, 0.45)";
      const pinkSpiro = "rgba(216, 74, 85, 0.45)";

      // Left Table Spirographs
      drawSpirograph(leftTableCenterX, boardCenterY, spiroRadius, goldSpiro, 0.12, 6);
      drawSpirograph(leftTableCenterX, boardCenterY, spiroRadius * 0.65, tealSpiro, -0.18, 5);
      drawSpirograph(leftTableCenterX, boardCenterY, spiroRadius * 0.35, pinkSpiro, 0.24, 4);

      // Right Table Spirographs
      drawSpirograph(rightTableCenterX, boardCenterY, spiroRadius, goldSpiro, -0.12, 6);
      drawSpirograph(rightTableCenterX, boardCenterY, spiroRadius * 0.65, tealSpiro, 0.18, 5);
      drawSpirograph(rightTableCenterX, boardCenterY, spiroRadius * 0.35, pinkSpiro, -0.24, 4);

      // Deep dark overlay vignette
      const vignette = ctx.createRadialGradient(cx, cy, Math.max(width, height) * 0.3, cx, cy, Math.max(width, height) * 0.85);
      vignette.addColorStop(0, "rgba(3, 8, 11, 0.1)");
      vignette.addColorStop(1, "rgba(3, 8, 11, 0.85)");
      ctx.fillStyle = vignette;
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

      ctx.font = "650 13px Inter, sans-serif";
      ctx.fillStyle = "#67416c";
      ctx.fillText(`${level.name} / 24 pips`, 200, 36);

      const barX = 200;
      const barY = 62;
      const barW = Math.min(240, width * 0.20);
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
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      roundRect(x, y, width, height, 2);
      ctx.fill();

      const progressGradient = ctx.createLinearGradient(x, y, x + width, y);
      progressGradient.addColorStop(0, Theme.copper);
      progressGradient.addColorStop(0.52, Theme.gold);
      progressGradient.addColorStop(1, Theme.accent);
      ctx.fillStyle = progressGradient;
      roundRect(x, y, width * progress, height, 2);
      ctx.fill();
    }

    function drawBoard(width, height) {
      const boardTop = layout.boardPaddingY;
      const boardHeight = height - layout.boardPaddingY * 2;
      const boardLeft = layout.leftMenuWidth + layout.boardPaddingX;
      const boardWidth = width - boardLeft - layout.rightMenuWidth - layout.boardPaddingX;
      const innerTop = boardTop + layout.boardPaddingY;
      const innerHeight = boardHeight - layout.boardPaddingY * 2;
      const utilityGap = 12;
      const centerGap = 18;
      const bearOffWidth = 58;
      const utilityWidth = bearOffWidth;
      const tableWidth = (boardWidth - utilityWidth - centerGap - utilityGap) / 2;
      const pipWidth = (tableWidth - layout.pipGap * 5) / 6;

      layout.checkerRadius = Math.max(16, Math.min(36, Math.round(pipWidth * 0.46)));

      const pipHeight = Math.min(305, innerHeight * 0.62);
      const leftTableX = boardLeft;
      const centerX = boardLeft + tableWidth + centerGap / 2;
      const rightTableX = boardLeft + tableWidth + centerGap;
      const bearOffX = rightTableX + tableWidth + utilityGap;
      layout.boardBounds = {
        x: boardLeft - 10,
        y: boardTop + 24,
        width: boardWidth + 20,
        height: boardHeight - 48
      };

      ctx.fillStyle = "rgba(0,0,0,0.42)";
      roundRect(boardLeft - 18, boardTop + 16, boardWidth + 36, boardHeight - 32, 6);
      ctx.fill();
      const boardGradient = ctx.createLinearGradient(boardLeft, boardTop, boardLeft + boardWidth, boardTop + boardHeight);
      boardGradient.addColorStop(0, "#1c2a27");
      boardGradient.addColorStop(0.12, "#c98a43");
      boardGradient.addColorStop(0.5, "#071014");
      boardGradient.addColorStop(0.88, "#a95739");
      boardGradient.addColorStop(1, "#253333");
      ctx.fillStyle = boardGradient;
      roundRect(boardLeft - 10, boardTop + 24, boardWidth + 20, boardHeight - 48, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(228,183,90,0.78)";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawArtDecoCorners(boardLeft - 10, boardTop + 24, boardWidth + 20, boardHeight - 48, 28);

      drawTableField(leftTableX, innerTop, tableWidth, innerHeight, "rgba(5, 20, 22, 0.94)");
      drawTableField(rightTableX, innerTop, tableWidth, innerHeight, "rgba(5, 20, 22, 0.94)");
      drawBoardFractal(leftTableX - 4, innerTop - 10, tableWidth + 8, innerHeight + 20);
      drawBoardFractal(rightTableX - 4, innerTop - 10, tableWidth + 8, innerHeight + 20);
      drawCenterRail(centerX - centerGap / 2, innerTop - 10, centerGap, innerHeight + 20);

      const topRow = Array.from({ length: 12 }, (_, i) => 12 + i);
      const bottomRow = Array.from({ length: 12 }, (_, i) => 11 - i);

      drawPipRow(topRow, leftTableX, rightTableX, innerTop, pipWidth, pipHeight, "down");
      drawPipRow(bottomRow, leftTableX, rightTableX, innerTop + innerHeight - pipHeight, pipWidth, pipHeight, "up");

      drawBearOff(bearOffX, innerTop, innerHeight, bearOffWidth);

      if (GameState.deckPlacement) {
        ctx.save();
        
        // 1. Dim the enemy's top half of the board
        ctx.fillStyle = "rgba(3, 8, 11, 0.70)";
        // Dim top half of left table
        roundRect(leftTableX - 4, innerTop - 8, tableWidth + 8, innerHeight / 2 + 8, 6);
        ctx.fill();
        // Dim top half of right table
        roundRect(rightTableX - 4, innerTop - 8, tableWidth + 8, innerHeight / 2 + 8, 6);
        ctx.fill();

        // 2. Highlight the bottom 12 deck pips with pulsing bounding borders
        const pulse = 0.52 + Math.sin(performance.now() / 220) * 0.22;
        ctx.strokeStyle = `rgba(228, 183, 90, ${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(228, 183, 90, 0.46)";
        ctx.shadowBlur = 12;
        
        // Bounding border around bottom half of left table
        roundRect(leftTableX - 6, innerTop + innerHeight / 2 - 4, tableWidth + 12, innerHeight / 2 + 10, 6);
        ctx.stroke();
        // Bounding border around bottom half of right table
        roundRect(rightTableX - 6, innerTop + innerHeight / 2 - 4, tableWidth + 12, innerHeight / 2 + 10, 6);
        ctx.stroke();

        ctx.restore();
      }
    }

    function drawArtDecoCorners(x, y, width, height, size) {
      ctx.save();
      ctx.strokeStyle = "rgba(228,183,90,0.58)";
      ctx.lineWidth = 1.5;
      const corners = [
        [x + 12, y + 12, 1, 1],
        [x + width - 12, y + 12, -1, 1],
        [x + width - 12, y + height - 12, -1, -1],
        [x + 12, y + height - 12, 1, -1]
      ];
      for (const [cx, cy, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + sy * size);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + sx * size, cy);
        ctx.moveTo(cx + sx * 8, cy + sy * size);
        ctx.lineTo(cx + sx * size, cy + sy * 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawInsetFrame(x, y, width, height) {
      ctx.save();
      ctx.strokeStyle = "rgba(228,183,90,0.34)";
      ctx.lineWidth = 1;
      roundRect(x, y, width, height, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 18);
      ctx.lineTo(x + width / 2, y + 6);
      ctx.lineTo(x + width - 6, y + 18);
      ctx.moveTo(x + 6, y + height - 18);
      ctx.lineTo(x + width / 2, y + height - 6);
      ctx.lineTo(x + width - 6, y + height - 18);
      ctx.stroke();
      ctx.restore();
    }

    function drawTableField(x, y, width, height, fill) {
      ctx.fillStyle = fill;
      roundRect(x - 4, y - 10, width + 8, height + 20, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.46)";
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

      const baseGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, S * 0.9);
      baseGrad.addColorStop(0, "#123035");
      baseGrad.addColorStop(0.58, "#07171b");
      baseGrad.addColorStop(1, "#040b0e");
      ctx.fillStyle = baseGrad;
      ctx.fillRect(x, y, w, h);

      ctx.globalCompositeOperation = "screen";
      const pools = [
        [0.28 + Math.sin(t * 0.08) * 0.04, 0.52, "rgba(176,28,84,0.24)"],
        [0.70 + Math.cos(t * 0.07) * 0.04, 0.46, "rgba(0,184,190,0.20)"],
        [0.50, 0.30 + Math.cos(t * 0.06) * 0.04, "rgba(219,150,63,0.11)"],
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

      const spirogs = [
        { col: "#9e244c", a: 0.22, R: 0.33, r: 0.13, d: 0.11, spd: 0.035, ph: 0.0 },
        { col: "#0aa0a8", a: 0.18, R: 0.26, r: 0.10, d: 0.09, spd: 0.028, ph: 2.0 },
        { col: "#c98a43", a: 0.12, R: 0.22, r: 0.08, d: 0.07, spd: 0.04, ph: 3.5 },
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

      const cell = 42;
      const fx = 0;
      const fy = 0;
      const gcols = Math.ceil(w / cell) + 3;
      const grows = Math.ceil(h / (cell * 0.866)) + 3;
      ctx.lineWidth = 0.75;
      for (let row = -1; row < grows; row++) {
        ctx.globalAlpha = 0.075;
        ctx.strokeStyle = row % 2 === 0 ? "#4d7d7d" : "#89513f";
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

    function drawCenterRail(x, y, width, height) {
      const railGradient = ctx.createLinearGradient(x, y, x + width, y);
      railGradient.addColorStop(0, "#4b2c18");
      railGradient.addColorStop(0.5, "#d49a51");
      railGradient.addColorStop(1, "#4b2c18");
      ctx.fillStyle = railGradient;
      roundRect(x, y, width, height, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(246,223,170,0.46)";
      ctx.stroke();

      ctx.fillStyle = "#0a1a1d";
      for (let i = 0; i < 3; i++) {
        const cy = y + height * (0.24 + i * 0.26);
        ctx.beginPath();
        ctx.moveTo(x + width / 2, cy - 9);
        ctx.lineTo(x + width - 3, cy);
        ctx.lineTo(x + width / 2, cy + 9);
        ctx.lineTo(x + 3, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(228,183,90,0.78)";
        ctx.stroke();
      }
    }

    function drawPip(pipIndex, x, y, width, height, direction) {
      const pip = GameState.board[pipIndex];
      const isEven = pipIndex % 2 === 0;
      const validTarget = GameState.validTargets.find((target) => target.type === "pip" && target.index === pipIndex);
      const isValid = Boolean(validTarget);
      const isSelected = GameState.selected?.source === pipIndex;
      const placingDeckPip = (GameState.deckPlacement && GameState.deckPlacement.modifier) || (GameState.pipPlacementAnimations && GameState.pipPlacementAnimations.length > 0);
      const isDeckSlot = isDeckPip(pipIndex);
      const isHoveringDeckSlot = placingDeckPip
        && isDeckSlot
        && GameState.hover.active
        && pointInRect(GameState.hover.x, GameState.hover.y, { x, y, width, height });
      const tipY = direction === "down" ? y + height : y;
      const baseY = direction === "down" ? y : y + height;

      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + width, baseY);
      ctx.lineTo(x + width / 2, tipY);
      ctx.closePath();
      const pipGradient = ctx.createLinearGradient(x, y, x + width, y + height);
      const baseColor = pip.locked ? "#536061" : isEven ? "#07858e" : "#8d1f45";
      pipGradient.addColorStop(0, pip.locked ? "#75807b" : isEven ? "#17bec6" : "#bd365e");
      pipGradient.addColorStop(0.56, baseColor);
      pipGradient.addColorStop(1, isEven ? "#063a45" : "#3c1230");
      ctx.fillStyle = pipGradient;
      ctx.globalAlpha = pip.locked ? 0.54 : 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;

      const isCheckerTargetingMode = (GameState.deckPlacement && (GameState.deckPlacement.kind === "checker" || GameState.deckPlacement.kind === "upgrade")) || (GameState.upgradeAnimations && GameState.upgradeAnimations.length > 0);
      const hasPlayerPieces = pip.playerPieces.length > 0;

      if (isCheckerTargetingMode && !hasPlayerPieces) {
        ctx.fillStyle = "rgba(5, 7, 8, 0.76)";
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.lineTo(x + width, baseY);
        ctx.lineTo(x + width / 2, tipY);
        ctx.closePath();
        ctx.fill();
      }

      if (isCheckerTargetingMode && hasPlayerPieces) {
        ctx.save();
        const pulseAlpha = 0.5 + Math.sin(performance.now() / 150) * 0.35;
        ctx.strokeStyle = `rgba(112, 227, 95, ${pulseAlpha + 0.3})`;
        ctx.lineWidth = 2.8;
        ctx.shadowColor = "rgba(112, 227, 95, 0.8)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.lineTo(x + width, baseY);
        ctx.lineTo(x + width / 2, tipY);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = isValid ? Theme.valid : "rgba(228,183,90,0.66)";
        ctx.lineWidth = isValid ? 2.4 : 1.2;
        ctx.stroke();
      }

      if (placingDeckPip) {
        ctx.save();
        if (!isDeckSlot) {
          ctx.beginPath();
          ctx.moveTo(x, baseY);
          ctx.lineTo(x + width, baseY);
          ctx.lineTo(x + width / 2, tipY);
          ctx.closePath();
          ctx.fillStyle = "rgba(7, 9, 10, 0.90)";
          ctx.fill();
          ctx.strokeStyle = "rgba(143,176,164,0.32)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          // Hover glowing preview halo/glow behind the slot
          if (isHoveringDeckSlot) {
            ctx.save();
            ctx.shadowColor = Theme.valid;
            ctx.shadowBlur = 18;
            ctx.fillStyle = "rgba(112, 227, 95, 0.18)";
            ctx.beginPath();
            ctx.moveTo(x - 2, baseY + (direction === "up" ? 2 : -2));
            ctx.lineTo(x + width + 2, baseY + (direction === "up" ? 2 : -2));
            ctx.lineTo(x + width / 2, tipY + (direction === "up" ? -2 : 2));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          // Fill of the active placement slot
          ctx.fillStyle = isHoveringDeckSlot ? "rgba(112,227,95,0.16)" : "rgba(37,185,201,0.08)";
          ctx.beginPath();
          ctx.moveTo(x, baseY);
          ctx.lineTo(x + width, baseY);
          ctx.lineTo(x + width / 2, tipY);
          ctx.closePath();
          ctx.fill();

          // Dashed slot outline border
          ctx.strokeStyle = isHoveringDeckSlot ? Theme.valid : "rgba(112, 227, 95, 0.42)";
          ctx.lineWidth = isHoveringDeckSlot ? 2.5 : 1.4;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = isEven ? "rgba(246,223,170,0.42)" : "rgba(37,185,201,0.34)";
      ctx.lineWidth = 0.8;
      const cx = x + width / 2;
      for (let i = 0; i < 5; i++) {
        const offset = (i - 2) * width * 0.18;
        ctx.beginPath();
        ctx.moveTo(cx + offset, baseY);
        ctx.lineTo(cx, tipY + (direction === "down" ? -height * 0.18 : height * 0.18));
        ctx.stroke();
      }
      ctx.restore();

      if (isValid) {
        const pulse = 0.16 + Math.sin(performance.now() / 260) * 0.035;
        ctx.fillStyle = `rgba(112, 227, 95, ${pulse})`;
        roundRect(x + 5, y + 5, width - 10, height - 10, 5);
        ctx.fill();
        drawTargetPreviewBadge(x + width / 2, direction === "down" ? y + height - 42 : y + 42, validTarget);
      }


      if (GameState.hover.tooltip?.kind === "pip" && GameState.hover.tooltip.pipIndex === pipIndex) {
        ctx.strokeStyle = Theme.ink;
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

      const isAnimatingModifier = GameState.pipPlacementAnimations && GameState.pipPlacementAnimations.some(a => a.pipIndex === pipIndex);
      if (pip.modifier && !isAnimatingModifier) {
        drawTileModifier(pip.modifier, x + width / 2, direction === "down" ? y + 27 : y + height - 27);
      }

      if (isHoveringDeckSlot && GameState.deckPlacement?.modifier) {
        drawTileModifier(
          GameState.deckPlacement.modifier,
          x + width / 2,
          direction === "down" ? y + height - 52 : y + 52,
          1.35,
          true
        );
      }

      if (pip.intent && !placingDeckPip) {
        drawIntentIcon(pip.intent, x + width / 2, direction === "down" ? y - 13 : y + height + 13);
      }

      if (!placingDeckPip) drawCheckers(pip, x + width / 2, y, height, direction);
      drawPipNumber(pipIndex, x + width / 2, direction === "down" ? y + 14 : y + height - 14);
    }

    function drawLockedMarker(cx, cy) {
      ctx.save();
      ctx.fillStyle = "rgba(9, 24, 27, 0.86)";
      roundRect(cx - 22, cy - 14, 44, 28, 5);
      ctx.fill();
      ctx.strokeStyle = Theme.brass;
      ctx.stroke();
      ctx.fillStyle = Theme.ink;
      ctx.font = "900 12px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LOCK", cx, cy + 1);
      ctx.restore();
    }

    function drawTileModifier(modifier, cx, cy, scale = 1, preview = false) {
      const skin = getModifierSkin(modifier);
      const radius = 15 * scale;
      ctx.save();
      ctx.shadowColor = modifier.color;
      ctx.shadowBlur = preview ? 18 : 7;
      ctx.globalAlpha = preview ? 0.88 : 1;
      ctx.fillStyle = skin.fill;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(4,10,12,0.72)";
      ctx.lineWidth = 4 * scale;
      ctx.stroke();
      ctx.strokeStyle = "rgba(246,223,170,0.9)";
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      ctx.strokeStyle = skin.line;
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = `900 ${Math.round(12 * scale)}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(skin.glyph, cx, cy + 1 * scale);
      ctx.restore();
    }

    function getModifierSkin(modifier) {
      const skins = {
        forge: { glyph: "F", fill: "#b77238", line: "#f5d782" },
        market: { glyph: "M", fill: "#0d8078", line: "#8ae1dc" },
        iron: { glyph: "I", fill: "#6f5131", line: "#d9b86d" },
        haste: { glyph: "H", fill: "#2f7d46", line: "#b6f553" },
        ledger: { glyph: "$", fill: "#0e5e74", line: "#25b9c9" },
        dealer: { glyph: "+", fill: "#6d356d", line: "#dda0d5" }
      };
      return skins[modifier.id] || { glyph: "P", fill: modifier.color || Theme.brass, line: Theme.ink };
    }

    function drawIntentIcon(intent, cx, cy) {
      ctx.save();
      ctx.fillStyle = "rgba(9,24,27,0.9)";
      ctx.strokeStyle = Theme.brass;
      ctx.lineWidth = 1.5;
      roundRect(cx - 24, cy - 13, 48, 26, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "850 11px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(intent.id === "ram" ? "RAM" : "PAWN", cx, cy + 1);
      ctx.restore();
    }

    function drawCheckers(pip, cx, pipY, pipHeight, direction) {
      const enemyStack = pip.enemyPieces;
      const playerStack = pip.playerPieces;
      const stackOffset = layout.checkerRadius * 0.62;

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
      const step = radius * 1.34;
      const startY = direction === "down" ? pipY + radius + 12 : pipY + pipHeight - radius - 12;

      const hasEnemyMover = owner === "enemy" && visibleStack.some(isEnemyIntentChecker);

      for (let i = 0; i < visibleCount; i++) {
        const checker = visibleStack[i];
        let hover = 0;
        if (hasEnemyMover && i === visibleCount - 1 && isEnemyPreviewVisible()) {
          hover = Math.sin(performance.now() / 250) * 4 - 2;
        }
        const cy = (direction === "down" ? startY + i * step : startY - i * step) + hover;
        drawChecker(cx, cy, radius, owner, checker);
        GameState.checkerHitAreas.push({
          x: cx - radius,
          y: cy - radius,
          width: radius * 2,
          height: radius * 2,
          checker,
          owner,
          tooltip: getCheckerTooltip(checker, owner)
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

    function isEnemyPreviewVisible() {
      return GameState.turnPhase === TurnPhase.MOVING;
    }

    function isEnemyIntentChecker(checker) {
      return getEnemyMovesForTurn().some((move) => move.checkerId === checker.id);
    }

    function drawEnemyTurnPreview() {
      if (!isEnemyPreviewVisible()) return;

      const intents = getEnemyMovesForTurn()
        .map((move, index) => {
          const current = findEnemyCheckerPosition(move.checkerId);
          if (!current) return null;
          return {
            ...move,
            ability: getEnemyAbility(current.pip.enemyPieces[current.index]),
            destination: getEnemyPreviewDestination(current.pip.index, current.pip.enemyPieces[current.index], index)
          };
        })
        .filter(Boolean);

      for (const intent of intents) {
        const sourceCenter = getPipCenter(intent.source);
        const center = intent.destination === "score"
          ? getBearOffCenter()
          : getPipCenter(intent.destination);

        // Draw animated dashed connector line from source checker to destination
        ctx.save();
        ctx.strokeStyle = Theme.danger;
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.44 + Math.sin(performance.now() / 250) * 0.12;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -Math.round(performance.now() / 30) % 10;
        
        const dx = center.x - sourceCenter.x;
        const dy = center.y - sourceCenter.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        
        const side = -1;
        const arcAmount = Math.min(30, len * 0.15);
        const midX = (sourceCenter.x + center.x) / 2;
        const midY = (sourceCenter.y + center.y) / 2;
        const cpX = midX + nx * arcAmount * side;
        const cpY = midY + ny * arcAmount * side;
        
        ctx.beginPath();
        ctx.moveTo(sourceCenter.x, sourceCenter.y);
        ctx.quadraticCurveTo(cpX, cpY, center.x, center.y);
        ctx.stroke();
        ctx.restore();

        // Draw the premium targeting reticle at destination
        drawTargetReticle(center.x, center.y, layout.checkerRadius);
      }
    }

    function drawTargetReticle(cx, cy, radius) {
      const time = performance.now();
      const rotationAngle = (time / 800) % (Math.PI * 2);
      const pulse = Math.sin(time / 200) * 3;
      const targetRadius = radius + 12;

      ctx.save();

      // Outer Glow / Pulse Background
      ctx.shadowColor = Theme.danger;
      ctx.shadowBlur = 12 + pulse;
      ctx.globalAlpha = 0.12 + Math.sin(time / 300) * 0.05;
      ctx.fillStyle = Theme.danger;
      ctx.beginPath();
      ctx.arc(cx, cy, targetRadius + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // Reset shadow

      // 1. Rotating Outer Dashed Ring
      ctx.strokeStyle = Theme.danger;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75 + Math.sin(time / 250) * 0.15;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotationAngle);
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, targetRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 2. Inner Solid Ring with smaller radius
      ctx.strokeStyle = Theme.danger;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + Math.sin(time / 250) * 0.1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      // 3. Static Crosshair Ticks (Four corner marks pointing inward)
      ctx.strokeStyle = Theme.danger;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.85;
      const tickLength = 8;
      const startDist = targetRadius - 4;
      const endDist = startDist - tickLength;

      const angles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
      for (const angle of angles) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx + cos * startDist, cy + sin * startDist);
        ctx.lineTo(cx + cos * endDist, cy + sin * endDist);
        ctx.stroke();
      }

      // 4. Pulsing center dot
      ctx.fillStyle = Theme.danger;
      ctx.globalAlpha = 0.85 + Math.sin(time / 150) * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function getEnemyPreviewDestination(source, checker, moveIndex) {
      const level = LevelConfig[GameState.levelIndex];
      const tokens = level.enemyTokens || [3, 3];
      const tokenValue = tokens[moveIndex] || 3;

      const result = getEnemyPreviewStep(checker, source, tokenValue);
      if (result.type === "blocked") return source;
      if (result.type === "score") return "score";
      return result.destination;
    }

    function getEnemyPreviewStep(checker, source, tokenValue) {
      for (let dist = tokenValue; dist >= 1; dist--) {
        const dest = source - dist;
        const landing = getEnemyPreviewLanding(checker, dest, dist);
        if (landing.type !== "blocked") return landing;
      }
      return { type: "blocked" };
    }

    function getEnemyPreviewLanding(checker, destination, distance) {
      if (destination < 0) return { type: "score" };
      const targetPip = GameState.board[destination];
      if (!targetPip) return { type: "blocked" };

      const isGate = targetPip.playerPieces.length >= 2;
      const isRam = getEnemyAbility(checker) === EnemyAbility.RAM;
      if (isGate && !(isRam && distance === 2 && findRamVictimIndex(targetPip) !== -1)) return { type: "blocked" };
      if (targetPip.playerPieces.length === 1 && targetPip.playerPieces[0].core === "anchor") return { type: "blocked" };
      return { type: "pip", destination };
    }

    function drawChecker(cx, cy, radius, owner, checker) {
      const palette = getCheckerPalette(owner, checker);
      const depth = radius * 0.18;

      ctx.save();

      if (owner === "player" && checker && checker.startingIndex !== undefined && GameState.deckPlacement && (GameState.deckPlacement.kind === "checker" || GameState.deckPlacement.kind === "upgrade")) {
        ctx.save();
        const pulse = 1.06 + Math.sin(performance.now() / 150) * 0.08;
        ctx.strokeStyle = "rgba(112, 227, 95, 0.85)";
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "rgba(112, 227, 95, 0.9)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = palette.shadow;
      ctx.globalAlpha = 0.48;
      ctx.beginPath();
      ctx.ellipse(cx + radius * 0.12, cy + depth * 1.55, radius * 0.98, radius * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const sideGradient = ctx.createLinearGradient(cx, cy, cx, cy + depth);
      sideGradient.addColorStop(0, palette.rim);
      sideGradient.addColorStop(0.46, palette.dark);
      sideGradient.addColorStop(1, palette.edge);
      ctx.fillStyle = sideGradient;
      ctx.beginPath();
      ctx.ellipse(cx, cy + depth, radius * 0.98, radius * 0.30, 0, 0, Math.PI, false);
      ctx.lineTo(cx - radius * 0.98, cy);
      ctx.arc(cx, cy, radius * 0.98, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();

      if (owner === "enemy" && getEnemyAbility(checker) === EnemyAbility.RAM) {
        ctx.save();
        ctx.shadowColor = Theme.danger;
        ctx.shadowBlur = radius * 1.35;
        ctx.globalAlpha = 0.14 + Math.sin(performance.now() / 380) * 0.06;
        ctx.fillStyle = Theme.danger;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = palette.edge;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      const rimGradient = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.36, radius * 0.08, cx, cy, radius);
      rimGradient.addColorStop(0, palette.rimLight || palette.light);
      rimGradient.addColorStop(0.48, palette.rim);
      rimGradient.addColorStop(1, palette.dark);
      ctx.fillStyle = rimGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.91, 0, Math.PI * 2);
      ctx.fill();

      drawTokenRimMarks(cx, cy, radius, palette, checker);

      const topGradient = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.30, radius * 0.04, cx, cy, radius * 0.78);
      topGradient.addColorStop(0, palette.light);
      topGradient.addColorStop(0.62, palette.base);
      topGradient.addColorStop(1, palette.mid);
      ctx.fillStyle = topGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.68, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = Math.max(1.6, radius * 0.07);
      ctx.stroke();

      ctx.strokeStyle = palette.rimLight || palette.rim;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = Math.max(1, radius * 0.035);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.49, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.66, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = palette.light;
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.24, cy - radius * 0.30, radius * 0.28, radius * 0.12, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (owner === "enemy") {
        drawSwordIcon(cx, cy, radius * 0.50);
        if (getEnemyAbility(checker) === EnemyAbility.RAM) {
          ctx.fillStyle = palette.rimLight || Theme.gold;
          ctx.font = `900 ${Math.round(radius * 0.34)}px Georgia, serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("R", cx, cy + radius * 0.38);
        }
      } else {
        drawCheckerGlyph(cx, cy, radius, checker, palette);
      }

      const isSelected = GameState.selected && GameState.selected.checkerId === checker.id;
      if (isSelected) {
        ctx.save();
        const pulse = Math.sin(performance.now() / 150) * 1.5;
        const glowRadius = radius + 3.5 + pulse;

        ctx.shadowColor = Theme.gold;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = Theme.gold;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore();
    }

    function drawTokenRimMarks(cx, cy, radius, palette, checker) {
      if (checker && checker.rim === "prism") {
        ctx.save();
        ctx.lineWidth = Math.max(1.5, radius * 0.06);
        ctx.lineCap = "round";
        const time = performance.now() / 1000;
        const speed = 0.5;
        const angleOffset = time * speed * Math.PI * 2;

        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8 + angleOffset;
          const hue = (i * 360 / 8 + time * 90) % 360;
          ctx.strokeStyle = `hsla(${hue}, 85%, 65%, 0.95)`;
          const inner = radius * 0.74;
          const outer = radius * 0.89;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
          ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.strokeStyle = palette.mark || "rgba(246,223,170,0.72)";
      ctx.lineWidth = Math.max(1, radius * 0.045);
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8 + Math.PI / 8;
        const inner = radius * 0.76;
        const outer = radius * 0.88;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawPipNumber(pipIndex, cx, cy) {
      ctx.fillStyle = "rgba(246,223,170,0.72)";
      ctx.font = "900 13px Georgia, serif";
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
      barGradient.addColorStop(0, "#4b2c18");
      barGradient.addColorStop(0.22, "#0a1a1d");
      barGradient.addColorStop(0.78, "#071014");
      barGradient.addColorStop(1, "#4b2c18");
      ctx.fillStyle = barGradient;
      roundRect(x, y, width, height, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.72)";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawInsetFrame(x + 7, y + 12, width - 14, height - 24);

      ctx.fillStyle = Theme.ink;
      ctx.font = "900 14px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.translate(x + width / 2, innerTop + innerHeight / 2 - 18);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("BAR", 0, 0);
      ctx.restore();

      ctx.fillStyle = Theme.muted;
      ctx.font = "800 11px Inter, sans-serif";
      if (!GameState.deckPlacement) {
        if (GameState.bar.player.length === 0) {
          ctx.fillText(`W ${GameState.bar.player.length}`, x + width / 2, innerTop + innerHeight / 2 + 8);
        }
        ctx.fillText(`R ${GameState.bar.enemy.length}`, x + width / 2, innerTop + innerHeight / 2 + 30);
      }

      if (GameState.bar.player.length > 0 && !GameState.deckPlacement) {
        const cx = x + width / 2;
        const barPipHeight = innerHeight / 2 - 20;
        const barPipY = innerTop + innerHeight / 2 + 10;
        drawCheckerStack(GameState.bar.player, cx, barPipY, barPipHeight, "up", "player");
      }
    }

    function drawBearOff(x, innerTop, innerHeight, width = 54) {
      const area = {
        x,
        y: innerTop + innerHeight / 2 - 78,
        width,
        height: 156
      };
      GameState.bearOffArea = area;
      GameState.bearOffArea.tooltip = {
        kind: "bearOff",
        title: "Attack",
        body: `Move beyond pip 24 to attack. Each successful attack adds +250 Chips before Mult. Attacked: ${GameState.borneOff.length}.${getBearOffPreviewText()}`
      };
      const isValid = GameState.validTargets.some((target) => target.type === "bearOff");
      const validTarget = GameState.validTargets.find((target) => target.type === "bearOff");

      const columnGradient = ctx.createLinearGradient(x, innerTop - 10, x + width, innerTop + innerHeight + 10);
      columnGradient.addColorStop(0, "#12262a");
      columnGradient.addColorStop(0.5, "#071014");
      columnGradient.addColorStop(1, "#12262a");
      ctx.fillStyle = columnGradient;
      roundRect(x, innerTop - 10, width, innerHeight + 20, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.76)";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawInsetFrame(x + 7, innerTop + 10, width - 14, innerHeight - 20);

      ctx.fillStyle = isValid ? "rgba(182,245,83,0.18)" : "rgba(0,0,0,0.22)";
      roundRect(area.x + 7, area.y, area.width - 14, area.height, 5);
      ctx.fill();
      ctx.strokeStyle = isValid ? Theme.valid : "rgba(201,138,67,0.42)";
      ctx.lineWidth = isValid ? 2 : 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(area.x + area.width / 2, area.y + area.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = Theme.ink;
      ctx.font = "900 13px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(GameState.deckPlacement ? "DECK VIEW" : `ATTACK ${GameState.borneOff.length}`, 0, 0);
      ctx.restore();

      if (validTarget) {
        drawTargetPreviewBadge(area.x + area.width / 2, area.y + area.height - 28, validTarget);
      }
    }

    function drawLeftMenu(width, height) {
      const x = 18;
      const y = 18;
      const menuWidth = layout.leftMenuWidth - 36;
      const menuHeight = height - y - 18;
      const level = LevelConfig[GameState.levelIndex];
      const progress = clamp(GameState.score.current / GameState.score.target, 0, 1);

      const panelGradient = ctx.createLinearGradient(x, y, x + menuWidth, y + menuHeight);
      panelGradient.addColorStop(0, "rgba(12,33,37,0.98)");
      panelGradient.addColorStop(0.48, "rgba(6,18,22,0.98)");
      panelGradient.addColorStop(1, "rgba(9,15,17,0.98)");
      ctx.fillStyle = panelGradient;
      roundRect(x, y, menuWidth, menuHeight, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.82)";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawArtDecoCorners(x, y, menuWidth, menuHeight, 24);

      ctx.fillStyle = Theme.muted;
      ctx.font = "800 11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${level.name} / 24 pips`, x + 18, y + 24);

      drawProgressBar(x + 18, y + 38, menuWidth - 36, 8, progress);

      let cursorY = y + 66;
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
        GameState.deckPlacement ? "Cancel Place" : GameState.turnPhase === TurnPhase.MOVING ? "Deselect" : "Restart",
        GameState.deckPlacement ? cancelDeckPlacement : GameState.turnPhase === TurnPhase.MOVING ? clearSelection : restartRun,
        GameState.deckPlacement ? true : GameState.turnPhase === TurnPhase.MOVING ? Boolean(GameState.selected) : true,
        "secondary"
      );

      cursorY += 56;
      drawMessagePanel(x + 18, cursorY, menuWidth - 36, Math.max(74, y + menuHeight - cursorY - 18));
    }

    function drawRightMenu(width, height) {
      const x = width - layout.rightMenuWidth + 18;
      const y = 18;
      const menuWidth = layout.rightMenuWidth - 36;
      const menuHeight = height - y - 18;
      const level = LevelConfig[GameState.levelIndex];

      const panelGradient = ctx.createLinearGradient(x, y, x + menuWidth, y + menuHeight);
      panelGradient.addColorStop(0, "rgba(12,33,37,0.98)");
      panelGradient.addColorStop(0.48, "rgba(6,18,22,0.98)");
      panelGradient.addColorStop(1, "rgba(9,15,17,0.98)");
      ctx.fillStyle = panelGradient;
      roundRect(x, y, menuWidth, menuHeight, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.82)";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawArtDecoCorners(x, y, menuWidth, menuHeight, 24);

      // Portrait
      const portraitX = x + 12;
      const portraitY = y + 12;
      const portraitW = menuWidth - 24;
      const portraitH = 160;

      ctx.fillStyle = "rgba(3,8,11,0.62)";
      roundRect(portraitX, portraitY, portraitW, portraitH, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(228,183,90,0.46)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const cx = portraitX + portraitW / 2;
      const cy = portraitY + portraitH / 2;

      // Glow behind the mask
      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 60);
      bgGrad.addColorStop(0, "rgba(37, 185, 201, 0.18)");
      bgGrad.addColorStop(1, "rgba(3, 8, 11, 0)");
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 70, 0, Math.PI * 2);
      ctx.fill();

      // Cybernetic Mask lines & shapes
      ctx.save();
      ctx.lineWidth = 1.5;

      const drawSymPath = (pts, strokeColor, fillColor) => {
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = fillColor || "transparent";
        
        // Right side
        ctx.beginPath();
        ctx.moveTo(cx + pts[0][0], cy + pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(cx + pts[i][0], cy + pts[i][1]);
        }
        if (fillColor) ctx.fill();
        ctx.stroke();

        // Left side
        ctx.beginPath();
        ctx.moveTo(cx - pts[0][0], cy + pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(cx - pts[i][0], cy + pts[i][1]);
        }
        if (fillColor) ctx.fill();
        ctx.stroke();
      };

      // 1. Forehead plates
      drawSymPath([[0, -50], [25, -42], [20, -22], [0, -26]], "rgba(182, 49, 53, 0.85)", "rgba(182, 49, 53, 0.1)");
      
      // 2. Crest/Spine
      ctx.strokeStyle = "rgba(228, 183, 90, 0.8)";
      ctx.fillStyle = "rgba(228, 183, 90, 0.15)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 58);
      ctx.lineTo(cx + 8, -48 + cy);
      ctx.lineTo(cx, cy - 36);
      ctx.lineTo(cx - 8, -48 + cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 3. Eyebrow plates
      drawSymPath([[4, -18], [28, -18], [24, -13], [4, -13]], "rgba(37, 185, 201, 0.85)", "rgba(37, 185, 201, 0.2)");

      // 4. Glowing eyes (Cyan glow)
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#25b9c9";
      drawSymPath([[8, -10], [22, -10], [18, -5], [8, -5]], "#fff", "#25b9c9");
      ctx.shadowBlur = 0;

      // 5. Cheekbones
      drawSymPath([[28, -18], [38, 6], [22, 14], [8, -8]], "rgba(182, 49, 53, 0.85)", "rgba(182, 49, 53, 0.15)");

      // 6. Nose bridge / spine
      ctx.strokeStyle = "rgba(37, 185, 201, 0.85)";
      ctx.fillStyle = "rgba(37, 185, 201, 0.15)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 13);
      ctx.lineTo(cx + 6, cy - 5);
      ctx.lineTo(cx + 4, cy + 10);
      ctx.lineTo(cx, cy + 12);
      ctx.lineTo(cx - 4, cy + 10);
      ctx.lineTo(cx - 6, cy - 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 7. Jaw/Chin plates
      drawSymPath([[0, 12], [16, 12], [10, 42], [0, 48]], "rgba(182, 49, 53, 0.85)", "rgba(182, 49, 53, 0.25)");

      // 8. Mouth plate
      drawSymPath([[0, 16], [7, 18], [4, 30], [0, 32]], "rgba(37, 185, 201, 0.85)", "rgba(37, 185, 201, 0.3)");

      ctx.restore();

      // Enemy Data section
      let cursorY = y + 12 + portraitH + 14;

      ctx.fillStyle = Theme.ink;
      ctx.font = "800 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ENEMY DATA", x + menuWidth / 2, cursorY);
      cursorY += 8;

      ctx.strokeStyle = "rgba(228, 183, 90, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 12, cursorY);
      ctx.lineTo(x + menuWidth - 12, cursorY);
      ctx.stroke();
      cursorY += 12;

      const enemyName = level.bossRule ? level.bossRule.name : "The Adversary";
      const enemyLevel = getRomanNumeral(level.level);
      const enemyPassive = level.bossRule ? level.bossRule.description : "Chance to block pips.";
      const enemyTarget = level.target;

      ctx.fillStyle = "rgba(5,18,20,0.88)";
      const dataBoxH = 92;
      roundRect(x + 12, cursorY, menuWidth - 24, dataBoxH, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.38)";
      ctx.stroke();

      // Name
      ctx.fillStyle = Theme.muted;
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("NAME:", x + 24, cursorY + 16);
      ctx.fillStyle = Theme.danger;
      ctx.font = "800 11px Inter, sans-serif";
      ctx.fillText(enemyName, x + 82, cursorY + 16);

      // Level
      ctx.fillStyle = Theme.muted;
      ctx.font = "800 10px Inter, sans-serif";
      ctx.fillText("LEVEL:", x + 24, cursorY + 32);
      ctx.fillStyle = Theme.ink;
      ctx.font = "800 11px Inter, sans-serif";
      ctx.fillText(enemyLevel, x + 82, cursorY + 32);

      // Passive
      ctx.fillStyle = Theme.muted;
      ctx.font = "800 10px Inter, sans-serif";
      ctx.fillText("PASSIVE:", x + 24, cursorY + 48);
      ctx.fillStyle = Theme.ink;
      ctx.font = "700 9px Inter, sans-serif";
      wrapText(enemyPassive, x + 82, cursorY + 48, menuWidth - 110, 11);

      // Target
      ctx.fillStyle = Theme.muted;
      ctx.font = "800 10px Inter, sans-serif";
      ctx.fillText("TARGET:", x + 24, cursorY + 76);
      ctx.fillStyle = Theme.gold;
      ctx.font = "900 12px Georgia, serif";
      ctx.fillText(enemyTarget.toLocaleString() + " Score", x + 82, cursorY + 76);

      cursorY += dataBoxH + 16;

      // Enemy Moves (Intent Tokens)
      ctx.fillStyle = Theme.ink;
      ctx.font = "800 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ENEMY MOVES", x + menuWidth / 2, cursorY);
      cursorY += 8;

      ctx.strokeStyle = "rgba(228, 183, 90, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 12, cursorY);
      ctx.lineTo(x + menuWidth - 12, cursorY);
      ctx.stroke();
      cursorY += 12;

      const tokens = level.enemyTokens || [3, 3];
      const tokensCount = tokens.length;
      const tokenSize = 34;
      const tokenGap = 16;
      const totalWidth = tokensCount * tokenSize + (tokensCount - 1) * tokenGap;
      const startTokenX = x + (menuWidth - totalWidth) / 2;

      for (let i = 0; i < tokensCount; i++) {
        const tokenX = startTokenX + i * (tokenSize + tokenGap) + tokenSize / 2;
        const tokenY = cursorY + tokenSize / 2;
        const value = tokens[i];
        const isConsumed = i < GameState.enemyMovesConsumed;
        drawPentagonToken(tokenX, tokenY, tokenSize / 2, value, isConsumed);
      }
      cursorY += tokenSize + 16;

      // Killed/Captured Enemies
      ctx.fillStyle = Theme.ink;
      ctx.font = "800 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ATTACKED ENEMIES", x + menuWidth / 2, cursorY);
      cursorY += 8;

      ctx.strokeStyle = "rgba(228, 183, 90, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 12, cursorY);
      ctx.lineTo(x + menuWidth - 12, cursorY);
      ctx.stroke();
      cursorY += 12;

      const containerW = menuWidth - 24;
      const containerH = 54;
      const containerX = x + 12;
      const containerY = cursorY;

      ctx.fillStyle = "rgba(5,18,20,0.88)";
      roundRect(containerX, containerY, containerW, containerH, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.38)";
      ctx.stroke();

      const capturedList = [...(GameState.bar.enemy || [])];
      if (capturedList.length === 0) {
        ctx.fillStyle = "rgba(143,176,164,0.4)";
        ctx.font = "750 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("NONE", containerX + containerW / 2, containerY + containerH / 2);
      } else {
        const startCx = containerX + 24;
        const maxDraw = Math.min(6, capturedList.length);
        const spacing = Math.min(24, (containerW - 48) / (capturedList.length || 1));
        for (let i = 0; i < maxDraw; i++) {
          const checkerCx = startCx + i * spacing;
          const checkerCy = containerY + containerH / 2;
          drawChecker(checkerCx, checkerCy, 14, "enemy", capturedList[i]);
        }
        if (capturedList.length > 6) {
          ctx.fillStyle = Theme.muted;
          ctx.font = "800 11px Inter, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(`+${capturedList.length - 6}`, startCx + 6 * spacing + 6, containerY + containerH / 2);
        }
      }

      cursorY += containerH + 16;

      // Player Box (Bottom Right)
      const playerBoxY = cursorY;
      const playerBoxH = menuHeight - 12 - (playerBoxY - y);
      const playerBoxW = menuWidth - 24;
      const playerBoxX = x + 12;

      ctx.fillStyle = "rgba(5,18,20,0.88)";
      roundRect(playerBoxX, playerBoxY, playerBoxW, playerBoxH, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.38)";
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "800 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PLAYER", playerBoxX + playerBoxW / 2, playerBoxY + 16);

      ctx.strokeStyle = "rgba(228, 183, 90, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(playerBoxX + 12, playerBoxY + 26);
      ctx.lineTo(playerBoxX + playerBoxW - 12, playerBoxY + 26);
      ctx.stroke();

      // Draw Dice inside player box
      drawDicePanel(playerBoxX + 12, playerBoxY + 34);

      // Allied Bar below dice
      const barY = playerBoxY + 98;
      const barH = playerBoxH - 98 - 12;
      const barW = playerBoxW - 24;
      const barX = playerBoxX + 12;

      GameState.barHitArea = {
        x: barX,
        y: barY,
        width: barW,
        height: barH,
        tooltip: {
          kind: "bar",
          title: "The Bar",
          body: `White checkers hit by hazards wait here. Allied on bar: ${GameState.bar.player.length}. Allied must re-enter before moving other checkers.`
        }
      };

      const isBarSelected = GameState.selected?.source === "bar";
      ctx.fillStyle = "rgba(5,18,20,0.88)";
      roundRect(barX, barY, barW, barH, 4);
      ctx.fill();
      ctx.strokeStyle = isBarSelected ? Theme.valid : "rgba(201,138,67,0.38)";
      ctx.lineWidth = isBarSelected ? 2 : 1;
      ctx.stroke();

      if (GameState.bar.player.length === 0) {
        ctx.fillStyle = "rgba(143,176,164,0.4)";
        ctx.font = "750 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("ALLIED BAR (EMPTY)", barX + barW / 2, barY + barH / 2);
      } else {
        const cx = barX + barW / 2;
        const barPipHeight = barH - 20;
        const barPipY = barY + 10;
        const originalRadius = layout.checkerRadius;
        layout.checkerRadius = Math.max(14, Math.min(18, Math.round(barPipHeight * 0.15)));
        drawCheckerStack(GameState.bar.player, cx, barPipY, barPipHeight, "up", "player");
        layout.checkerRadius = originalRadius;
      }
    }

    function drawPentagonToken(cx, cy, r, value, isConsumed) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      if (isConsumed) {
        ctx.fillStyle = "rgba(40, 50, 55, 0.8)";
        ctx.strokeStyle = "rgba(100, 110, 115, 0.4)";
      } else {
        ctx.fillStyle = "rgba(37, 185, 201, 0.85)"; // neon blue
        ctx.strokeStyle = "rgba(228, 183, 90, 0.8)"; // gold border
      }
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isConsumed ? "rgba(150, 150, 150, 0.5)" : "#fff";
      ctx.font = "900 12px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), cx, cy);

      ctx.restore();
    }

    function getRomanNumeral(num) {
      const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
      return roman[num - 1] || String(num);
    }

    function drawLeftMetric(x, y, width, label, value, color, iconKind) {
      ctx.fillStyle = "rgba(5,18,20,0.88)";
      roundRect(x, y, width, 48, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(201,138,67,0.38)";
      ctx.stroke();

      ctx.fillStyle = Theme.muted;
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label.toUpperCase(), x + 12, y + 15);

      const isAkce = iconKind === "akce";
      const scaleActive = isAkce && GameState.akceDisplayScale > 1.0;

      if (scaleActive) {
        ctx.save();
        const scale = GameState.akceDisplayScale;
        const textWidth = ctx.measureText(value).width;
        const totalW = textWidth + 14 + 10; // text + spacing + icon size
        const cx = x + 12 + totalW / 2;
        const cy = y + 33;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      }

      ctx.fillStyle = color;
      ctx.font = "900 23px Georgia, serif";
      ctx.fillText(value, x + 12, y + 33);

      if (isAkce) {
        const valueWidth = ctx.measureText(value).width;
        drawAkceIcon(x + 12 + valueWidth + 14, y + 32, 10);
      }

      if (scaleActive) {
        ctx.restore();
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
      if (GameState.deckPlacement) return "Place Pip";
      if (GameState.turnPhase === TurnPhase.SHOP) return "Next Blind";
      if (GameState.turnPhase === TurnPhase.MOVING && GameState.score.current >= GameState.score.target) return "Win";
      if (GameState.turnPhase === TurnPhase.MOVING || GameState.turnPhase === TurnPhase.EVALUATING) return "End Turn";
      if (GameState.turnPhase === TurnPhase.ROLLING) return "Rolling...";
      if (roundCanAdvance) return "Next Blind";
      if (GameState.turnPhase === TurnPhase.ROUND_OVER) return "Restart Run";
      return "End Turn";
    }

    function startNextBlind() {
      GameState.turnPhase = TurnPhase.ROLLING;
      GameState.selected = null;
      GameState.validTargets = [];
      GameState.dice = [];
      GameState.rolledDice = [];
      GameState.diceBodies = [];
      GameState.message = `${LevelConfig[GameState.levelIndex].name}: dice are rolling.`;
      queueAutoRoll();
    }

    function getPrimaryAction() {
      const roundCanAdvance = GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.levelIndex < LevelConfig.length - 1 && !GameState.runWon;
      if (GameState.runWon) return restartRun;
      if (GameState.turnPhase === TurnPhase.ROUND_OVER && GameState.roundPayout) return continueAfterRoundClear;
      if (GameState.deckPlacement) return () => {};
      if (GameState.turnPhase === TurnPhase.SHOP) return startNextBlind;
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
      const isAnimating = (GameState.upgradeAnimations && GameState.upgradeAnimations.length > 0) || (GameState.pipPlacementAnimations && GameState.pipPlacementAnimations.length > 0);
      const isPlacing = GameState.deckPlacement || isAnimating;

      const primaryLabel = GameState.runWon
        ? "New Run"
        : GameState.deckPlacement
          ? "Place Pip"
        : isAnimating
          ? "Placing..."
        : GameState.turnPhase === TurnPhase.SHOP
          ? "Skip Shop"
        : roundCanAdvance
          ? "Next Blind"
          : GameState.turnPhase === TurnPhase.ROUND_OVER
            ? "Restart Run"
            : "Roll Dice";
      const primaryAction = GameState.runWon
        ? restartRun
        : isPlacing
          ? () => {}
        : GameState.turnPhase === TurnPhase.SHOP
          ? startNextBlind
        : roundCanAdvance
          ? advanceLevel
          : GameState.turnPhase === TurnPhase.ROUND_OVER
            ? restartRun
            : rollDice;

      drawButton(30, y + 28, 150, 54, primaryLabel, primaryAction, canUsePrimaryButton());

      if (GameState.deckPlacement) {
        drawButton(30, y + 94, 150, 42, "Cancel Place", cancelDeckPlacement, true, "secondary");
      } else if (isAnimating) {
        drawButton(30, y + 94, 150, 42, "Placing...", () => {}, false, "secondary");
      } else if (GameState.turnPhase === TurnPhase.MOVING) {
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
      if (GameState.deckPlacement || (GameState.upgradeAnimations && GameState.upgradeAnimations.length > 0) || (GameState.pipPlacementAnimations && GameState.pipPlacementAnimations.length > 0)) return false;
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
        ctx.fillStyle = "rgba(143,176,164,0.62)";
        ctx.font = "750 12px Inter, sans-serif";
        ctx.fillText(GameState.turnPhase === TurnPhase.ROLLING ? "rolling" : "none", x, y + 32);
        return;
      }

      const diceGap = 52;
      const dicePerRow = 3;
      for (let i = 0; i < GameState.dice.length; i++) {
        const row = Math.floor(i / dicePerRow);
        const column = i % dicePerRow;
        drawDie(x + column * diceGap, y + 20 + row * 52, GameState.dice[i]);
      }
    }

    function drawMessagePanel(x, y, width, height = 112) {
      ctx.fillStyle = "rgba(5,18,20,0.86)";
      roundRect(x, y, width, height, 3);
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
      ctx.fillStyle = "rgba(5,18,20,0.88)";
      roundRect(x, y, width, height, 3);
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
      ctx.fillStyle = "rgba(5,18,20,0.88)";
      roundRect(x, y, width, 132, 3);
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

      const elapsed = performance.now() - GameState.payoutStartedAt;
      ctx.save();
      ctx.fillStyle = "rgba(12,4,18,0.72)";
      ctx.fillRect(0, 0, width, height);

      // Render background coin rain particles
      if (GameState.payoutCoins) {
        for (const coin of GameState.payoutCoins) {
          if (elapsed < coin.delay) continue;
          
          // Update coin position in draw loop
          coin.y += coin.vy * 0.0038;
          coin.x += coin.vx * 0.0006;
          coin.rotation += coin.vrot;

          const px = coin.x * width;
          const py = coin.y * height;

          if (py < height + 50 && py > -50) {
            ctx.save();
            ctx.globalAlpha = 0.42; // subtle background drifting coin rain
            drawAkceIcon(px, py, coin.size);
            ctx.restore();
          }
        }
      }

      const t = performance.now() / 1000;
      const cardW = Math.min(560, width - 80);
      const cardH = 440;
      const x = width / 2 - cardW / 2;
      const y = height / 2 - cardH / 2 + Math.sin(t * 2.4) * 4;

      const glow = ctx.createRadialGradient(width / 2, y + 90, 20, width / 2, y + 90, 360);
      glow.addColorStop(0, "rgba(228,183,90,0.24)");
      glow.addColorStop(0.5, "rgba(37,185,201,0.10)");
      glow.addColorStop(1, "rgba(37,185,201,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
      gradient.addColorStop(0, "#173137");
      gradient.addColorStop(0.48, "#0b1d22");
      gradient.addColorStop(1, "#3b2417");
      ctx.fillStyle = gradient;
      roundRect(x, y, cardW, cardH, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(228,183,90,0.82)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "950 54px Inter, sans-serif";
      ctx.fillText(GameState.runWon ? "RUN WON" : "BLIND CLEAR", width / 2, y + 74);
      ctx.font = "850 14px Inter, sans-serif";
      ctx.fillStyle = Theme.muted;
      ctx.fillText("PAYOUT", width / 2, y + 122);

      const rows = [
        [`Remaining rolls`, `${payout.remainingRolls} Akçe`],
        [`${LevelConfig[GameState.levelIndex].bossRule ? "Boss" : "Normal"} blind`, `${payout.blindReward} Akçe`],
        ["Mars multiplier", payout.mars ? "x2" : "x1"]
      ];

      let rowY = y + 174;
      ctx.textAlign = "left";
      ctx.font = "850 20px Inter, sans-serif";
      for (let i = 0; i < rows.length; i++) {
        const [label, value] = rows[i];
        const rowStart = 200 + i * 350;
        const rowDuration = 300;
        const rowProgress = clamp((elapsed - rowStart) / rowDuration, 0, 1);
        if (rowProgress <= 0) continue;

        ctx.save();
        ctx.globalAlpha = rowProgress;
        const xOffset = (1 - easeOutCubic(rowProgress)) * -24;

        ctx.fillStyle = "rgba(5,18,20,0.82)";
        roundRect(x + 62 + xOffset, rowY - 24, cardW - 124, 48, 3);
        ctx.fill();
        ctx.fillStyle = Theme.ink;
        ctx.fillText(label, x + 86 + xOffset, rowY);
        ctx.textAlign = "right";
        ctx.fillText(value, x + cardW - 86 + xOffset, rowY);
        ctx.restore();

        rowY += 58;
      }

      // Total Payout calculations section
      const totalStart = 1350;
      const totalDuration = 1000;
      const totalProgress = clamp((elapsed - totalStart) / totalDuration, 0, 1);

      if (totalProgress > 0) {
        ctx.save();
        ctx.globalAlpha = totalProgress;

        const easedCount = easeOutCubic(totalProgress);
        const countedTotal = Math.round(payout.total * easedCount);
        const countedCash = payout.startingMoney + countedTotal;

        ctx.textAlign = "center";
        ctx.fillStyle = Theme.ink;

        const pulse = 1.0 + Math.sin(totalProgress * Math.PI) * 0.08 * (1 - totalProgress);
        ctx.font = `950 ${Math.round(34 * pulse)}px Inter, sans-serif`;
        const totalLabel = `+${countedTotal} Akçe`;
        ctx.fillText(totalLabel, width / 2, y + 346);

        const totalW = ctx.measureText(totalLabel).width;
        drawAkceIcon(width / 2 + totalW / 2 + 22, y + 346, 14 * pulse);

        ctx.font = "750 13px Inter, sans-serif";
        ctx.fillStyle = Theme.muted;
        ctx.fillText(`Akçe now: ${countedCash}`, width / 2, y + 380);
        ctx.restore();
      }

      // Draw the Continue button at the end
      const buttonStart = 2350;
      const buttonProgress = clamp((elapsed - buttonStart) / 250, 0, 1);
      if (buttonProgress > 0) {
        ctx.save();
        ctx.globalAlpha = buttonProgress;
        drawButton(width / 2 - 92, y + cardH - 58, 184, 42, GameState.runWon ? "New Run" : "Continue", continueAfterRoundClear, true, "primary");
        ctx.restore();
      }

      ctx.restore();
    }

    function drawStoreOverlay(width, height) {
      const x = layout.leftMenuWidth + 48;
      const y = 54;
      const panelW = width - x - 48;
      const panelH = height - 108;
      if (panelW < 560 || panelH < 420) return;

      ctx.save();
      // Backdrop dimming
      ctx.fillStyle = "rgba(3,8,11,0.66)";
      ctx.fillRect(layout.leftMenuWidth, 0, width - layout.leftMenuWidth, height);

      // Velvet radial gradient panel background
      const gradient = ctx.createRadialGradient(x + panelW / 2, y + panelH / 2, 50, x + panelW / 2, y + panelH / 2, panelW / 2 + 100);
      gradient.addColorStop(0, "rgba(18,48,53,0.98)");
      gradient.addColorStop(0.65, "rgba(7,16,20,0.99)");
      gradient.addColorStop(1, "rgba(22,12,10,0.99)");
      ctx.fillStyle = gradient;
      roundRect(x, y, panelW, panelH, 8);
      ctx.fill();

      // Ornate double borders
      ctx.strokeStyle = "rgba(201,138,67,0.72)";
      ctx.lineWidth = 2.5;
      roundRect(x, y, panelW, panelH, 8);
      ctx.stroke();

      ctx.strokeStyle = "rgba(246,223,170,0.18)";
      ctx.lineWidth = 1;
      roundRect(x + 5, y + 5, panelW - 10, panelH - 10, 6);
      ctx.stroke();

      // Ornate corners
      drawArtDecoCorners(x, y, panelW, panelH, 28);

      // Animate and draw gold particle motes
      if (GameState.shopParticles && GameState.shopParticles.length) {
        ctx.save();
        for (const particle of GameState.shopParticles) {
          particle.wobble += particle.wobbleSpeed;
          particle.x += particle.vx / 100;
          particle.y += particle.vy / 100;
          if (particle.x < 0) particle.x = 1;
          if (particle.x > 1) particle.x = 0;
          if (particle.y < 0) particle.y = 1;
          if (particle.y > 1) particle.y = 0;

          const px = x + particle.x * panelW + Math.sin(particle.wobble) * 6;
          const py = y + particle.y * panelH;

          ctx.fillStyle = `rgba(246, 223, 170, ${particle.alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, particle.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Title & Akce count
      ctx.fillStyle = Theme.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "950 42px Inter, sans-serif";
      ctx.fillText("✦ SHOP ✦", x + 34, y + 48);

      ctx.fillStyle = Theme.gold;
      ctx.font = "900 18px Georgia, serif";
      const cashLabel = `${GameState.money} Akçe`;
      ctx.fillText(cashLabel, x + 34, y + 84);
      const cashW = ctx.measureText(cashLabel).width;
      drawAkceIcon(x + 34 + cashW + 16, y + 84, 10);

      ctx.fillStyle = Theme.muted;
      ctx.font = "700 13px Inter, sans-serif";
      wrapText("Buy relic-pips to place on your bottom deck pips. Piece upgrades still hit the top white checker.", x + 34, y + 110, panelW - 68, 16);

      const pips = GameState.shopOffers.filter((offer) => offer.kind === "pip");
      const checkers = GameState.shopOffers.filter((offer) => offer.kind === "checker");
      const upgrades = GameState.shopOffers.filter((offer) => offer.kind === "upgrade");
      const gap = 18;
      const cardW = (panelW - 68 - gap * 2) / 3;
      const cardH = 110;

      // Header 1: RELIC-PIPS
      ctx.fillStyle = Theme.gold;
      ctx.font = "900 13px Inter, sans-serif";
      ctx.fillText("✦  RELIC-PIPS  ✦", x + 34, y + 130);
      ctx.strokeStyle = "rgba(201, 138, 67, 0.38)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 34, y + 138);
      ctx.lineTo(x + panelW - 34, y + 138);
      ctx.stroke();

      pips.forEach((offer, index) => {
        drawShopCard(x + 34 + index * (cardW + gap), y + 148, cardW, cardH, offer);
      });

      // Header 2: CHECKER DRAFT
      ctx.fillStyle = "#df4e56";
      ctx.font = "900 13px Inter, sans-serif";
      ctx.fillText("✦  CHECKER DRAFT  ✦", x + 34, y + 276);
      ctx.strokeStyle = "rgba(223, 78, 86, 0.38)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 34, y + 284);
      ctx.lineTo(x + panelW - 34, y + 284);
      ctx.stroke();

      checkers.forEach((offer, index) => {
        drawShopCard(x + 34 + index * (cardW + gap), y + 294, cardW, cardH, offer);
      });

      // Header 3: CORE & RIM UPGRADES
      ctx.fillStyle = Theme.blue;
      ctx.font = "900 13px Inter, sans-serif";
      ctx.fillText("✦  CORE & RIM UPGRADES  ✦", x + 34, y + 422);
      ctx.strokeStyle = "rgba(37, 185, 201, 0.38)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 34, y + 430);
      ctx.lineTo(x + panelW - 34, y + 430);
      ctx.stroke();

      upgrades.forEach((offer, index) => {
        drawShopCard(x + 34 + index * (cardW + gap), y + 440, cardW, cardH, offer);
      });

      drawButton(x + panelW - 214, y + panelH - 70, 180, 46, "Next Blind", startNextBlind, true, "primary");
      ctx.restore();
    }

    function drawStoreControls(width, height) {
      if (GameState.deckPlacement || (GameState.upgradeAnimations && GameState.upgradeAnimations.length > 0) || (GameState.pipPlacementAnimations && GameState.pipPlacementAnimations.length > 0)) return;
      const controlW = 142;
      const x = width - controlW - 156;
      const y = 24;
      drawButton(
        x,
        y,
        controlW,
        38,
        GameState.storeHidden ? "Show Store" : "Hide Store",
        toggleStoreVisibility,
        true,
        "secondary"
      );
    }

    function drawDeckPlacementBanner(width, height) {
      const placement = GameState.deckPlacement;
      if (!placement) return;
      const x = layout.leftMenuWidth + 46;
      const y = height - 96;
      const w = Math.min(560, width - x - 52);
      ctx.save();
      ctx.fillStyle = "rgba(5,18,20,0.90)";
      roundRect(x, y, w, 64, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(112,227,95,0.62)";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (placement.modifier) {
        drawTileModifier(placement.modifier, x + 38, y + 32, 1.1, true);
        ctx.fillStyle = Theme.ink;
        ctx.font = "900 15px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`Place ${placement.modifier.name}`, x + 72, y + 22);
        ctx.fillStyle = Theme.muted;
        ctx.font = "750 12px Inter, sans-serif";
        wrapText(`${placement.modifier.description} Click a bottom deck pip to replace whatever relic-pip is there.`, x + 72, y + 42, w - 92, 15);
      } else if (placement.kind === "checker") {
        let core = "basic";
        let rim = "basic";
        if (placement.checkerType === CheckerType.GOLDEN) core = "gold";
        else if (placement.checkerType === CheckerType.GLASS) rim = "glass";
        else if (placement.checkerType === CheckerType.ANCHOR) core = "anchor";
        else if (placement.checkerType === CheckerType.RUBY) rim = "ruby";
        else if (placement.checkerType === CheckerType.PRISM) rim = "prism";

        drawChecker(x + 38, y + 32, 16, "player", { type: placement.checkerType, core, rim });
        ctx.fillStyle = Theme.ink;
        ctx.font = "900 15px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`Replace with ${placement.title}`, x + 72, y + 22);
        ctx.fillStyle = Theme.muted;
        ctx.font = "750 12px Inter, sans-serif";
        wrapText("Select any starting checker on the board to replace it.", x + 72, y + 42, w - 92, 15);
      } else if (placement.kind === "upgrade") {
        let core = placement.upgrade.type === "core" ? placement.upgrade.value : "basic";
        let rim = placement.upgrade.type === "rim" ? placement.upgrade.value : "basic";
        let type = CheckerType.STANDARD;
        if (core === "gold") type = CheckerType.GOLDEN;
        else if (core === "anchor") type = CheckerType.ANCHOR;
        else if (rim === "glass") type = CheckerType.GLASS;
        else if (rim === "ruby") type = CheckerType.RUBY;
        else if (rim === "prism") type = CheckerType.PRISM;

        drawChecker(x + 38, y + 32, 16, "player", { type, core, rim });
        ctx.fillStyle = Theme.ink;
        ctx.font = "900 15px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`Upgrade: ${placement.title}`, x + 72, y + 22);
        ctx.fillStyle = Theme.muted;
        ctx.font = "750 12px Inter, sans-serif";
        wrapText(`Select any starting checker on the board to upgrade its ${placement.upgrade.type} to ${placement.upgrade.value}.`, x + 72, y + 42, w - 92, 15);
      }
      ctx.restore();
    }

    function drawShopCard(x, y, width, height, offer) {
      const price = getOfferPrice(offer);
      const affordable = GameState.money >= price;
      const isHovered = !offer.bought && GameState.hover.active && pointInRect(GameState.hover.x, GameState.hover.y, { x, y, width, height });

      ctx.save();

      // Lift card and draw glow shadow if hovered
      if (isHovered) {
        const cx = x + width / 2;
        const cy = y + height / 2;
        ctx.translate(cx, cy);
        ctx.scale(1.05, 1.05);
        ctx.translate(-cx, -cy - 6);

        ctx.save();
        let glowColor = "rgba(37, 185, 201, 0.62)";
        if (offer.kind === "pip") glowColor = "rgba(228, 183, 90, 0.62)";
        else if (offer.kind === "checker") glowColor = "rgba(223, 78, 86, 0.62)";
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 18;
        ctx.fillStyle = "rgba(3, 8, 11, 0.4)";
        roundRect(x - 2, y - 2, width + 4, height + 4, 6);
        ctx.fill();
        ctx.restore();
      }

      // Draw custom background skin
      if (offer.kind === "pip") {
        // Dark leather/wood gradient
        const bgGrad = ctx.createLinearGradient(x, y, x + width, y + height);
        bgGrad.addColorStop(0, "#1c120e");
        bgGrad.addColorStop(0.5, "#271b15");
        bgGrad.addColorStop(1, "#150d0a");
        ctx.fillStyle = bgGrad;
        roundRect(x, y, width, height, 6);
        ctx.fill();

        ctx.strokeStyle = "rgba(201, 138, 67, 0.76)";
        ctx.lineWidth = 1.8;
        roundRect(x + 3, y + 3, width - 6, height - 6, 4);
        ctx.stroke();

        ctx.strokeStyle = "rgba(246, 223, 170, 0.16)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x + 6, y + 6, width - 12, height - 12);
      } else if (offer.kind === "checker") {
        // Crimson/dark red gradient
        const bgGrad = ctx.createLinearGradient(x, y, x + width, y + height);
        bgGrad.addColorStop(0, "#2c0e12");
        bgGrad.addColorStop(0.5, "#3d181c");
        bgGrad.addColorStop(1, "#1a0608");
        ctx.fillStyle = bgGrad;
        roundRect(x, y, width, height, 6);
        ctx.fill();

        ctx.strokeStyle = "rgba(223, 78, 86, 0.76)";
        ctx.lineWidth = 1.8;
        roundRect(x + 3, y + 3, width - 6, height - 6, 4);
        ctx.stroke();

        ctx.strokeStyle = "rgba(246, 223, 170, 0.16)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x + 6, y + 6, width - 12, height - 12);
      } else {
        // Cosmic blue gradient
        const bgGrad = ctx.createLinearGradient(x, y, x + width, y + height);
        bgGrad.addColorStop(0, "#081622");
        bgGrad.addColorStop(0.5, "#0d2232");
        bgGrad.addColorStop(1, "#050e16");
        ctx.fillStyle = bgGrad;
        roundRect(x, y, width, height, 6);
        ctx.fill();

        ctx.strokeStyle = "rgba(37, 185, 201, 0.76)";
        ctx.lineWidth = 1.8;
        roundRect(x + 3, y + 3, width - 6, height - 6, 4);
        ctx.stroke();

        // Background sparkles
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
        const sparkles = [
          [x + width * 0.15, y + height * 0.3],
          [x + width * 0.85, y + height * 0.25],
          [x + width * 0.25, y + height * 0.75],
          [x + width * 0.75, y + height * 0.8]
        ];
        for (const [sx, sy] of sparkles) {
          ctx.beginPath();
          ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Border and alpha for affordablity
      ctx.globalAlpha = affordable || offer.bought ? 1 : 0.58;
      ctx.strokeStyle = offer.bought ? Theme.accent : "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1;
      roundRect(x, y, width, height, 6);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Text Title
      ctx.fillStyle = Theme.ink;
      ctx.font = `${width < 260 ? "850 12.5px" : "900 14px"} Georgia, serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      truncateText(offer.title, x + 12, y + 20, width - 62);

      // Text Detail
      ctx.fillStyle = Theme.muted;
      ctx.font = `${width < 260 ? "700 10.5px" : "700 11.5px"} Inter, sans-serif`;
      wrapText(offer.detail, x + 12, y + 40, width - 68, 14);

      // Draw larger physical emblems on the right center
      if (offer.kind === "pip" && offer.modifier) {
        drawTileModifier(offer.modifier, x + width - 32, y + height / 2, 1.28);
      } else if (offer.kind === "checker" && offer.checkerType) {
        let core = "basic";
        let rim = "basic";
        if (offer.checkerType === CheckerType.GOLDEN) core = "gold";
        else if (offer.checkerType === CheckerType.GLASS) rim = "glass";
        else if (offer.checkerType === CheckerType.ANCHOR) core = "anchor";
        else if (offer.checkerType === CheckerType.RUBY) rim = "ruby";
        else if (offer.checkerType === CheckerType.PRISM) rim = "prism";
        drawChecker(x + width - 32, y + height / 2, 17, "player", { type: offer.checkerType, core, rim });
      } else if (offer.kind === "upgrade" && offer.upgrade) {
        let core = offer.upgrade.type === "core" ? offer.upgrade.value : "basic";
        let rim = offer.upgrade.type === "rim" ? offer.upgrade.value : "basic";
        let type = CheckerType.STANDARD;
        if (core === "gold") type = CheckerType.GOLDEN;
        else if (core === "anchor") type = CheckerType.ANCHOR;
        else if (rim === "glass") type = CheckerType.GLASS;
        else if (rim === "ruby") type = CheckerType.RUBY;
        else if (rim === "prism") type = CheckerType.PRISM;
        drawChecker(x + width - 32, y + height / 2, 17, "player", { type, core, rim });
      }

      // Styled Pill Badge for Price
      if (!offer.bought) {
        const pillW = 76;
        const pillH = 22;
        const pillX = x + width / 2 - pillW / 2;
        const pillY = y + height - 26;

        ctx.save();
        ctx.fillStyle = affordable ? "rgba(32, 12, 18, 0.92)" : "rgba(10, 20, 24, 0.92)";
        ctx.strokeStyle = affordable ? "rgba(228, 183, 90, 0.9)" : "rgba(143, 176, 164, 0.4)";
        ctx.lineWidth = 1.5;
        roundRect(pillX, pillY, pillW, pillH, 11);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = affordable ? Theme.gold : Theme.muted;
        ctx.font = "900 12px Georgia, serif";

        const text = `${price}`;
        const textW = ctx.measureText(text).width;
        const totalContentW = textW + 4 + 12; // text + gap + icon size
        const startX = pillX + (pillW - totalContentW) / 2;

        drawAkceIcon(startX + 6, pillY + pillH / 2, 6);
        ctx.fillText(text, startX + 16, pillY + pillH / 2 + 1);
        ctx.restore();
      }

      // Draw diagonal SOLD ribbon
      if (offer.bought) {
        // Dark translucent overlay
        ctx.fillStyle = "rgba(3, 8, 11, 0.64)";
        roundRect(x, y, width, height, 6);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        roundRect(x, y, width, height, 6);
        ctx.clip();

        // Translate and rotate diagonal ribbon in top corner
        ctx.translate(x + width - 32, y + 18);
        ctx.rotate(Math.PI / 4);

        ctx.fillStyle = "#9e244c";
        ctx.fillRect(-60, -9, 120, 18);

        ctx.strokeStyle = "#e4b75a";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-60, -9);
        ctx.lineTo(60, -9);
        ctx.moveTo(-60, 9);
        ctx.lineTo(60, 9);
        ctx.stroke();

        ctx.fillStyle = "#f6dfaa";
        ctx.font = "950 9.5px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SOLD", 0, 0.5);

        ctx.restore();
      }

      ctx.restore();

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
            body: `${offer.detail} ${affordable ? (offer.kind === "pip" ? "Click to buy, then place it in your deck." : "Click to buy.") : "Not enough Akçe yet."}`
          }
        });
      }
    }

    function drawButton(x, y, width, height, label, action, enabled = true, variant = "primary") {
      const palette = {
        primary: enabled ? ["#7f2439", "#2a1018", "#f6dfaa"] : ["#334145", "#182529", "#8fb0a4"],
        secondary: ["#0f3b42", "#071416", "#f6dfaa"],
        tiny: ["#123035", "#0a1a1d", "#f6dfaa"],
        tinyActive: ["#70e35f", "#178c72", "#071014"]
      };
      const colors = palette[variant] || palette.primary;
      const gradient = ctx.createLinearGradient(x, y, x, y + height);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1]);

      ctx.fillStyle = gradient;
      roundRect(x, y, width, height, 3);
      ctx.fill();
      ctx.strokeStyle = enabled ? "rgba(228,183,90,0.76)" : "rgba(143,176,164,0.18)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      drawButtonNotches(x, y, width, height);

      ctx.fillStyle = colors[2];
      ctx.font = `${height <= 30 ? "800 11px" : "900 16px"} Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + width / 2, y + height / 2 + 1);

      if (enabled) {
        GameState.buttons.push({ x, y, width, height, action, tooltip: getButtonTooltip(label) });
      }
    }

    function drawTargetPreviewBadge(cx, cy, targetData) {
      const preview = getMovePreviewResult(targetData);
      if (!preview) return;

      const w = 58;
      const h = 35;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.46)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(8, 29, 22, 0.94)";
      roundRect(cx - w / 2, cy - h / 2, w, h, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = Theme.valid;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = Theme.ink;
      ctx.font = "900 11px Georgia, serif";
      ctx.fillText(`d${targetData.die}`, cx, cy - 8);
      ctx.fillStyle = Theme.valid;
      ctx.font = "950 12px Georgia, serif";
      ctx.fillText(`+${formatCompactScore(preview.gained)}`, cx, cy + 7);
      ctx.restore();
    }

    function drawButtonNotches(x, y, width, height) {
      ctx.save();
      ctx.strokeStyle = "rgba(246,223,170,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 8);
      ctx.lineTo(x + 18, y + 3);
      ctx.lineTo(x + width - 18, y + 3);
      ctx.lineTo(x + width - 8, y + 8);
      ctx.moveTo(x + 8, y + height - 8);
      ctx.lineTo(x + 18, y + height - 3);
      ctx.lineTo(x + width - 18, y + height - 3);
      ctx.lineTo(x + width - 8, y + height - 8);
      ctx.stroke();
      ctx.restore();
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

      ctx.fillStyle = "#6b3f20";
      drawFace(side);
      ctx.fill();
      ctx.fillStyle = "#d4ad6a";
      drawFace(top);
      ctx.fill();

      ctx.strokeStyle = "rgba(7,16,20,0.45)";
      ctx.lineWidth = 1;
      drawFace(side);
      ctx.stroke();
      drawFace(top);
      ctx.stroke();

      if (sideValue) drawFacePips(side, size, sideValue, 0.048, "rgba(7,16,20,0.72)");
      if (topValue) drawFacePips(top, size, topValue, 0.046, "rgba(7,16,20,0.62)");

      const faceGradient = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
      faceGradient.addColorStop(0, "#f8e9bd");
      faceGradient.addColorStop(0.55, "#d9a85b");
      faceGradient.addColorStop(1, "#7f2439");
      ctx.fillStyle = faceGradient;
      roundRect(-half, -half, size, size, radius);
      ctx.fill();
      ctx.strokeStyle = animated ? Theme.valid : Theme.brass;
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
      const checkerHit = GameState.deckPlacement
        ? null
        : [...GameState.checkerHitAreas].reverse().find((area) => pointInRect(x, y, area));
      if (checkerHit) {
        GameState.hover.tooltip = checkerHit.tooltip;
        if (checkerHit.owner === "player" && (GameState.turnPhase === TurnPhase.MOVING || GameState.turnPhase === TurnPhase.SHOP)) {
          canvas.style.cursor = "pointer";
        } else {
          canvas.style.cursor = "help";
        }
        return;
      }

      const pipHit = GameState.pipHitAreas.find((area) => pointInRect(x, y, area));
      if (pipHit) {
        GameState.hover.tooltip = pipHit.tooltip;
        if (GameState.deckPlacement) {
          if (GameState.deckPlacement.kind === "pip") {
            const modifier = GameState.deckPlacement.modifier;
            const existing = GameState.board[pipHit.pipIndex]?.modifier;
            GameState.message = isDeckPip(pipHit.pipIndex)
              ? `${modifier.name}: ${modifier.description} Click to ${existing ? `replace ${existing.name}` : "place it"} on deck Pip ${pipHit.pipIndex + 1}.`
              : "Enemy-side pips are greyed out. Relic-pips can only be placed in your bottom deck.";
          } else if (GameState.deckPlacement.kind === "checker" || GameState.deckPlacement.kind === "upgrade") {
            const pip = GameState.board[pipHit.pipIndex];
            GameState.message = pip && pip.playerPieces.length > 0
              ? `Occupied Pip ${pipHit.pipIndex + 1}. Click any starting checker here to apply ${GameState.deckPlacement.title}.`
              : `Empty Pip ${pipHit.pipIndex + 1}. You can only select occupied pips for replacement/upgrades.`;
          }
        }
        canvas.style.cursor = GameState.deckPlacement
          ? isDeckPip(pipHit.pipIndex) ? "copy" : "not-allowed"
          : GameState.turnPhase === TurnPhase.MOVING ? "pointer" : "help";
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
      ctx.fillStyle = "rgba(10,29,33,0.97)";
      roundRect(x, y, boxWidth, boxHeight, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = tooltip.kind === "pip" ? Theme.blue : Theme.brass;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.font = "900 15px Georgia, serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      let textY = y + padding;
      for (const line of titleLines) {
        ctx.fillText(line, x + padding, textY);
        textY += 18;
      }

      textY += 6;
      ctx.fillStyle = Theme.muted;
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

      if (GameState.deckPlacement) {
        if (GameState.deckPlacement.kind === "pip") {
          const modifier = GameState.deckPlacement.modifier;
          if (isDeckPip(pipIndex)) {
            const replaceText = pip.modifier ? ` This will replace ${pip.modifier.name}.` : "";
            parts.push(`Deck slot. Click to place ${modifier.name}: ${modifier.description}${replaceText}`);
          } else {
            parts.push("Enemy half. Boss and enemy effects may use this side, but your relic-pips cannot be placed here.");
          }
        } else if (GameState.deckPlacement.kind === "checker" || GameState.deckPlacement.kind === "upgrade") {
          if (pip.playerPieces.length > 0) {
            parts.push(`Contains player checkers. Click a checker to apply ${GameState.deckPlacement.title}.`);
          } else {
            parts.push("Empty pip. You can only select occupied pips for replacement/upgrades.");
          }
        }
      }

      if (pip.modifier) {
        const passText = getModifierPassText(pip.modifier);
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

    function getModifierPassText(modifier) {
      if (modifier.id === TileModifierLibrary.FORGE.id) return "Passing over it adds +5 Chips.";
      if (modifier.id === TileModifierLibrary.MARKET.id) return "Passing over it adds x0.25 Mult.";
      return "Pass-over has no extra effect.";
    }

    function getCheckerTooltip(checker, owner) {
      if (owner === "enemy") {
        const ability = getEnemyAbility(checker);
        const moverText = ability === EnemyAbility.RAM
          ? "Ram enemy: moves up to 3 times per enemy turn. Each step advances 2 pips and can attack a defended white gate, pushing one non-anchor checker to the bar."
          : "Pawn enemy: moves up to 3 times per enemy turn. Each step advances 2 pips, or 1 pip when a defended white gate blocks the 2-pip landing.";
        return {
          kind: "checker",
          title: ability === EnemyAbility.RAM ? "Ram Enemy Checker" : "Pawn Enemy Checker",
          body: `${moverText} Land on one red checker to break it for +200 Chips.`
        };
      }

      function getCheckerName(checker) {
        if (checker.core === "basic" && checker.rim === "basic") {
          return "Basic Checker";
        }
        return `${capitalize(checker.core || "basic")} Core, ${capitalize(checker.rim || "basic")} Rim`;
      }

      const coreDesc = {
        basic: "Basic Core (+10 Chips)",
        gold: "Gold Core (+50 Chips)",
        platinum: "Platinum Core (+100 Chips)",
        anchor: "Anchor Core (+10 Chips, invulnerable)"
      };
      const rimDesc = {
        basic: "Basic Rim (x1 Mult)",
        glass: "Glass Rim (x2 Mult, shatters if landed on or passed over)",
        ruby: "Ruby Rim (x3 Mult)",
        prism: "Prism Rim (x5 Mult)"
      };

      return {
        kind: "checker",
        title: `${getCheckerName(checker)} White Checker`,
        body: `${coreDesc[checker.core || "basic"]} & ${rimDesc[checker.rim || "basic"]}. Current stats: +${checker.chips} Chips, x${formatNumber(checker.mult)} Mult.`
      };
    }

    function getSelectedChecker() {
      if (!GameState.selected) return null;
      if (GameState.selected.source === "bar") {
        return GameState.bar.player.find((c) => c.id === GameState.selected.checkerId)
          || GameState.bar.player[GameState.bar.player.length - 1]
          || null;
      }

      const pip = GameState.board[GameState.selected.source];
      return pip?.playerPieces.find((c) => c.id === GameState.selected.checkerId)
        || pip?.playerPieces[pip?.playerPieces.length - 1]
        || null;
    }

    function getBearOffPreviewText() {
      const targetData = GameState.validTargets.find((target) => target.type === "bearOff");
      const preview = targetData ? getMovePreviewBreakdown(targetData) : null;
      return preview ? ` ${preview}` : "";
    }

    function getMovePreviewBreakdown(targetData) {
      const preview = getMovePreviewResult(targetData);
      if (!preview) return null;

      return `Preview: ${preview.gained.toLocaleString()} pts (${preview.parts.join(" + ")}; x${formatNumber(preview.mult)} Mult).`;
    }

    function getMovePreviewResult(targetData) {
      const checker = getSelectedChecker();
      if (!checker || !GameState.selected || !targetData) return null;

      const destination = targetData.type === "bearOff" ? null : targetData.index;
      const destinationPip = destination === null ? null : GameState.board[destination];
      const passedPips = getPassedPips(GameState.selected.source, targetData);
      const brokeEnemy = Boolean(destinationPip && destinationPip.enemyPieces.length === 1);
      const alliedCount = destinationPip ? destinationPip.playerPieces.length : 0;

      return calculateMoveScorePreview({
        checker,
        die: targetData.die,
        destination,
        borneOff: targetData.type === "bearOff",
        brokeEnemy,
        alliedCount,
        passedPips
      });
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
        globalMult: GameState.score.mult
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
        Win: "Collect the blind payout and go directly to the shop.",
        "End Turn": "End this turn. If your score beats the target, collect the blind; otherwise the next dice roll starts automatically.",
        "Next Blind": "Advance to the next blind, keeping your deck pips and drafted checker upgrades.",
        "Place Pip": "Choose a bottom deck pip to place the purchased relic-pip.",
        "Cancel Place": "Cancel this relic-pip purchase and return to the shop.",
        "Hide Store": "Hide the store overlay so you can inspect the board.",
        "Show Store": "Bring the store overlay back.",
        Continue: "Continue from the payout screen to the shop.",
        "New Run": "Start a fresh run from Small Blind.",
        "Restart Run": "Restart the run from Small Blind.",
        Restart: "Restart the run from Small Blind.",
        Deselect: "Cancel the current checker selection.",
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

    function getCheckerTargetPosition(targetData, owner) {
      if (!targetData) return { x: 0, y: 0 };
      if (targetData.type === "bearOff") {
        return getBearOffCenter();
      }
      if (targetData.type === "bar") {
        return getSourcePoint("bar");
      }
      if (targetData.type === "pip") {
        const pipIndex = targetData.index;
        const area = GameState.pipHitAreas.find((hitArea) => hitArea.pipIndex === pipIndex);
        if (!area) return getPipCenter(pipIndex);
        
        const pip = GameState.board[pipIndex];
        const direction = pipIndex < 12 ? "up" : "down";
        
        const enemyStack = pip.enemyPieces;
        const playerStack = pip.playerPieces;
        
        const cx = area.x + area.width / 2;
        const stackOffset = layout.checkerRadius * 0.62;
        
        let targetCx = cx;
        let count = 0;
        
        if (owner === "player") {
          const hasEnemy = enemyStack.length > 0;
          targetCx = cx - (hasEnemy ? stackOffset : 0);
          count = playerStack.length;
        } else {
          const hasPlayer = playerStack.length > 0;
          targetCx = cx + (hasPlayer ? stackOffset : 0);
          count = enemyStack.length;
        }
        
        const radius = layout.checkerRadius;
        const step = radius * 1.34;
        const startY = direction === "down" ? area.y + radius + 12 : area.y + area.height - radius - 12;
        
        const index = Math.min(count, 4);
        const targetCy = direction === "down" ? startY + index * step : startY - index * step;
        
        return { x: targetCx, y: targetCy };
      }
      return { x: 0, y: 0 };
    }

    function addMoveAnimation(checker, path, owner, targetData = null, victim = null, hitText = null, hitTextColor = null) {
      const now = performance.now();
      const duration = Math.max(260, (path.length - 1) * 170);
      GameState.hiddenCheckerIds.add(checker.id);
      if (victim) {
        GameState.hiddenCheckerIds.add(victim.id);
      }
      GameState.moveAnimations.push({
        checker,
        owner,
        path,
        startedAt: now,
        duration,
        targetData,
        victim,
        hitText,
        hitTextColor
      });
      return duration;
    }

    function updateMoveAnimations() {
      const now = performance.now();
      GameState.moveAnimations = GameState.moveAnimations.filter((animation) => {
        const done = now - animation.startedAt >= animation.duration;
        if (done) {
          GameState.hiddenCheckerIds.delete(animation.checker.id);
          if (animation.victim) {
            triggerCollision(animation);
          }
        }
        return !done;
      });
    }

    function triggerCollision(animation) {
      const victim = animation.victim;
      if (!victim) return;

      const path = animation.path;
      const destPoint = path[path.length - 1];
      const cx = destPoint.x;
      const cy = destPoint.y;

      if (animation.hitText) {
        addFloatingText(cx, cy - 10, animation.hitText, animation.hitTextColor || Theme.accent, 0.9);
      }

      GameState.cameraShake = 22;

      const lastFrom = path[path.length - 2] || path[0];
      const lastTo = path[path.length - 1];
      const dx = lastTo.x - lastFrom.x;
      const dy = lastTo.y - lastFrom.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const dirX = dx / len;

      const speed = 5 + Math.random() * 4;
      const vx = dirX * speed;
      const vy = -6 - Math.random() * 5;

      const targetPos = getCheckerTargetPosition(animation.targetData, victim.owner);

      GameState.fallingCheckers.push({
        checker: victim,
        owner: victim.owner,
        x: targetPos.x,
        y: targetPos.y,
        vx: vx,
        vy: vy,
        rotation: 0,
        vRotation: (Math.random() - 0.5) * 0.25
      });

      if (victim.rim === "glass") {
        spawnGlassShards(targetPos.x, targetPos.y);
      }
    }

    function updateFallingCheckers() {
      const gravity = 0.45;
      GameState.fallingCheckers = GameState.fallingCheckers.filter((fc) => {
        fc.vy += gravity;
        fc.x += fc.vx;
        fc.y += fc.vy;
        fc.rotation += fc.vRotation;

        const offScreen = fc.y > canvas.clientHeight + 40;
        if (offScreen) {
          GameState.hiddenCheckerIds.delete(fc.checker.id);
        }
        return !offScreen;
      });
    }

    function drawFallingCheckers() {
      const radius = layout.checkerRadius;
      for (const fc of GameState.fallingCheckers) {
        ctx.save();
        ctx.translate(fc.x, fc.y);
        ctx.rotate(fc.rotation);
        drawChecker(0, 0, radius, fc.owner, fc.checker);
        ctx.restore();
      }
    }

    function spawnGlassShards(x, y) {
      const shardCount = 14 + Math.floor(Math.random() * 8);
      for (let i = 0; i < shardCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        GameState.glassShards.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          size: Math.random() * 5 + 3,
          color: "rgba(173, 216, 230, " + (Math.random() * 0.5 + 0.5) + ")",
          rotation: Math.random() * Math.PI * 2,
          vRotation: (Math.random() - 0.5) * 0.2,
          life: 1.0,
          decay: Math.random() * 0.03 + 0.015
        });
      }
    }

    function updateGlassShards() {
      for (const shard of GameState.glassShards) {
        shard.x += shard.vx;
        shard.y += shard.vy;
        shard.vy += 0.2;
        shard.rotation += shard.vRotation;
        shard.life -= shard.decay;
      }
      GameState.glassShards = GameState.glassShards.filter(shard => shard.life > 0);
    }

    function drawGlassShards() {
      for (const shard of GameState.glassShards) {
        ctx.save();
        ctx.translate(shard.x, shard.y);
        ctx.rotate(shard.rotation);
        ctx.fillStyle = shard.color;
        ctx.strokeStyle = "rgba(255, 255, 255, " + shard.life + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -shard.size);
        ctx.lineTo(shard.size * 0.8, shard.size * 0.5);
        ctx.lineTo(-shard.size * 0.8, shard.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawMoveAnimations() {
      const now = performance.now();
      for (const animation of GameState.moveAnimations) {
        const progress = clamp((now - animation.startedAt) / animation.duration, 0, 1);

        // 1. Draw static victim if present
        if (animation.victim && progress < 1) {
          const victimPos = getCheckerTargetPosition(animation.targetData, animation.victim.owner);
          ctx.save();
          drawChecker(victimPos.x, victimPos.y, layout.checkerRadius, animation.victim.owner, animation.victim);
          ctx.restore();
        }

        // 2. Draw moving checker
        const segmentCount = Math.max(1, animation.path.length - 1);
        const rawSegment = Math.min(segmentCount - 1, Math.floor(progress * segmentCount));
        const segmentProgress = progress >= 1 ? 1 : (progress * segmentCount) - rawSegment;
        const eased = easeOutCubic(segmentProgress);
        const from = animation.path[rawSegment];
        const to = animation.path[rawSegment + 1] || from;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        const side = animation.owner === "player" ? 1 : -1;
        const arcAmount = 24; // slight arced path
        const offset = Math.sin(segmentProgress * Math.PI) * arcAmount * side;

        const x = lerp(from.x, to.x, eased) + nx * offset;
        const y = lerp(from.y, to.y, eased) + ny * offset;

        ctx.save();
        drawChecker(x, y, layout.checkerRadius + 2, animation.owner, animation.checker);
        ctx.restore();
      }
    }

    function easeOutBack(x) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }

    function updateUpgradeAnimations() {
      const now = performance.now();
      const initialLength = GameState.upgradeAnimations.length;
      GameState.upgradeAnimations = GameState.upgradeAnimations.filter(anim => {
        const progress = (now - anim.startedAt) / anim.duration;
        if (progress >= 1) {
          if (anim.newChecker && anim.newChecker.id) {
            GameState.hiddenCheckerIds.delete(anim.newChecker.id);
          }
          return false;
        }
        // Update particles
        if (anim.particles) {
          for (const p of anim.particles) {
            p.x += Math.cos(p.angle) * p.speed;
            p.y += Math.sin(p.angle) * p.speed;
            p.speed *= p.drag;
            p.alpha = clamp(1 - progress * 1.1, 0, 1);
          }
        }
        return true;
      });

      if (initialLength > 0 && GameState.upgradeAnimations.length === 0) {
        if (GameState.turnPhase === TurnPhase.SHOP) {
          GameState.storeHidden = false;
        }
      }
    }

    function drawUpgradeAnimations() {
      const now = performance.now();
      const radius = layout.checkerRadius;
      for (const anim of GameState.upgradeAnimations) {
        const progress = clamp((now - anim.startedAt) / anim.duration, 0, 1);
        ctx.save();
        ctx.translate(anim.x, anim.y);

        // 1. Draw glowing magic transmutation circle
        const ringScale = progress < 0.5 ? progress * 2 : 2 * (1 - progress); // peaks at 1
        const ringRadius = radius * (1.1 + ringScale * 0.45);
        ctx.save();
        ctx.strokeStyle = anim.oldChecker.core === "anchor" || anim.newChecker.core === "anchor" ? Theme.blue : Theme.gold;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 16 * ringScale;
        ctx.lineWidth = 3;

        // Outer rotating ring
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner ornate rotating triangles
        ctx.rotate(now / 350);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const angle = (i * Math.PI * 2) / 3;
          ctx.lineTo(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius);
        }
        ctx.closePath();
        ctx.stroke();

        // Counter rotating inner ornate shape
        ctx.rotate(-now / 200);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI * 2) / 4;
          ctx.lineTo(Math.cos(angle) * ringRadius * 0.68, Math.sin(angle) * ringRadius * 0.68);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // 2. Draw old checker fading/scaling down
        if (progress < 0.8) {
          const oldScale = easeOutCubic(1 - progress);
          ctx.save();
          ctx.scale(oldScale, oldScale);
          ctx.globalAlpha = clamp(1 - progress * 1.25, 0, 1);
          drawChecker(0, 0, radius, "player", anim.oldChecker);
          ctx.restore();
        }

        // 3. Draw new checker fading/scaling up
        if (progress > 0.15) {
          const newScale = easeOutBack((progress - 0.15) / 0.85);
          ctx.save();
          ctx.scale(newScale, newScale);
          ctx.globalAlpha = clamp((progress - 0.15) * 1.25, 0, 1);
          drawChecker(0, 0, radius, "player", anim.newChecker);
          ctx.restore();
        }

        // 4. Draw particles
        if (anim.particles) {
          for (const p of anim.particles) {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.restore();
      }
    }

    function updatePipPlacementAnimations() {
      const now = performance.now();
      const initialLength = GameState.pipPlacementAnimations.length;
      GameState.pipPlacementAnimations = GameState.pipPlacementAnimations.filter(anim => {
        const progress = (now - anim.startedAt) / anim.duration;
        if (progress >= 1) {
          return false;
        }
        // Update particles
        if (anim.particles) {
          for (const p of anim.particles) {
            p.x += Math.cos(p.angle) * p.speed;
            p.y += Math.sin(p.angle) * p.speed;
            p.speed *= p.drag;
            p.alpha = clamp(1 - progress * 1.1, 0, 1);
          }
        }
        return true;
      });

      if (initialLength > 0 && GameState.pipPlacementAnimations.length === 0) {
        if (GameState.turnPhase === TurnPhase.SHOP) {
          GameState.storeHidden = false;
        }
      }
    }

    function drawPipPlacementAnimations() {
      const now = performance.now();
      for (const anim of GameState.pipPlacementAnimations) {
        const progress = clamp((now - anim.startedAt) / anim.duration, 0, 1);
        
        // 1. Draw glowing contour around the pip triangle
        const area = GameState.pipHitAreas.find(a => a.pipIndex === anim.pipIndex);
        if (area) {
          const direction = anim.pipIndex < 12 ? "up" : "down";
          const baseY = direction === "up" ? area.y + area.height : area.y;
          const tipY = direction === "up" ? area.y : area.y + area.height;

          ctx.save();
          ctx.strokeStyle = anim.newModifier.color || Theme.blue;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 20 * (1 - progress);
          ctx.lineWidth = 3.5 * (1 - progress) + 1.2;
          ctx.globalAlpha = 1 - progress;
          ctx.beginPath();
          ctx.moveTo(area.x, baseY);
          ctx.lineTo(area.x + area.width, baseY);
          ctx.lineTo(area.x + area.width / 2, tipY);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(anim.x, anim.y);

        // 2. Draw old modifier fading out
        if (anim.oldModifier && progress < 0.8) {
          ctx.save();
          ctx.scale(1 - progress, 1 - progress);
          ctx.globalAlpha = clamp(1 - progress * 1.25, 0, 1);
          drawTileModifier(anim.oldModifier, 0, 0, 1.0, true);
          ctx.restore();
        }

        // 3. Draw new modifier zooming in with overshoot bounce
        const scaleVal = easeOutBack(progress);
        ctx.save();
        ctx.scale(scaleVal, scaleVal);
        ctx.globalAlpha = progress;
        drawTileModifier(anim.newModifier, 0, 0, 1.3, false);
        ctx.restore();

        // 4. Draw particles
        if (anim.particles) {
          for (const p of anim.particles) {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
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

    function getCheckerAccent(checker) {
      if (!checker) return Theme.muted;
      const colors = {
        gold: Theme.gold,
        glass: Theme.blue,
        anchor: Theme.muted,
        ruby: Theme.danger,
        prism: Theme.purple
      };
      return colors[checker.rim] || colors[checker.core] || Theme.muted;
    }

    function getCheckerPalette(owner, checker) {
      if (owner === "enemy") {
        const ram = getEnemyAbility(checker) === EnemyAbility.RAM;
        return {
          light: ram ? "#e17c66" : "#df6c5e",
          base: ram ? "#a8272d" : "#b73539",
          mid: ram ? "#7e2025" : "#8c282c",
          dark: ram ? "#51171b" : "#55191b",
          edge: "#2a0c0d",
          rim: ram ? "#c98a43" : "#a76639",
          rimLight: "#f0b562",
          mark: "rgba(246,223,170,0.64)",
          shadow: "#050809"
        };
      }

      const corePart = (checker && checker.core) || "basic";
      const rimPart = (checker && checker.rim) || "basic";

      const corePalettes = {
        basic: {
          light: "#fff4cf",
          base: Theme.player,
          mid: "#c8b183",
          dark: "#725d3c",
          edge: Theme.playerEdge,
          glyph: "#5d4a31"
        },
        gold: {
          light: "#fff0a5",
          base: Theme.gold,
          mid: "#b77a2e",
          dark: "#70431b",
          edge: "#3e2410",
          glyph: "#6a4318"
        },
        platinum: {
          light: "#ffffff",
          base: "#e5e8eb",
          mid: "#b0b7bd",
          dark: "#6c7780",
          edge: "#384047",
          glyph: "#464d52"
        },
        anchor: {
          light: "#eee3c9",
          base: "#aaa899",
          mid: "#74776c",
          dark: "#3f4945",
          edge: "#18211f",
          glyph: "#26312e"
        }
      };

      const rimPalettes = {
        basic: {
          rim: "#d4b374",
          rimLight: "#fff0bd",
          mark: "rgba(76,58,38,0.54)"
        },
        glass: {
          rim: "#54c9c4",
          rimLight: "#dcfffb",
          mark: "rgba(13,75,82,0.64)"
        },
        ruby: {
          rim: "#b62f42",
          rimLight: "#e79a9a",
          mark: "rgba(70,22,33,0.54)"
        },
        prism: {
          rim: "#a254c9",
          rimLight: "#f4dcff",
          mark: "rgba(57,37,65,0.64)"
        }
      };

      const cPal = corePalettes[corePart] || corePalettes.basic;
      const rPal = rimPalettes[rimPart] || rimPalettes.basic;

      return {
        light: cPal.light,
        base: cPal.base,
        mid: cPal.mid,
        dark: cPal.dark,
        edge: cPal.edge,
        glyph: cPal.glyph,
        rim: rPal.rim,
        rimLight: rPal.rimLight,
        mark: rPal.mark,
        shadow: "#050809"
      };
    }

    function drawSwordIcon(cx, cy, radius) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.save();
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = Theme.ink;
      ctx.lineWidth = Math.max(2.6, radius * 0.18);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.06, radius * 0.52);
      ctx.lineTo(radius * 0.06, -radius * 0.46);
      ctx.stroke();

      ctx.strokeStyle = Theme.gold;
      ctx.lineWidth = Math.max(2.2, radius * 0.14);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.26, radius * 0.22);
      ctx.lineTo(radius * 0.26, radius * 0.22);
      ctx.stroke();

      ctx.fillStyle = Theme.ink;
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.64);
      ctx.lineTo(-radius * 0.13, -radius * 0.38);
      ctx.lineTo(radius * 0.13, -radius * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = Theme.gold;
      ctx.beginPath();
      ctx.arc(-radius * 0.27, radius * 0.32, radius * 0.12, 0, Math.PI * 2);
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
      ctx.fillStyle = open ? "rgba(228,183,90,0.92)" : "rgba(7,16,20,0.86)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = open ? "#5b3c00" : "rgba(228,183,90,0.65)";
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
      ctx.fillStyle = "rgba(7,16,20,0.94)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(228,183,90,0.50)";
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

    function drawCheckerGlyph(cx, cy, radius, checker, palette) {
      const g = radius * 0.34;
      ctx.save();
      ctx.strokeStyle = palette.edge;
      ctx.fillStyle = palette.glyph || palette.dark;
      ctx.lineWidth = Math.max(1.5, radius * 0.07);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.78;

      const coreType = checker ? checker.core : "basic";

      if (coreType === "basic") {
        // Clean face for basic checkers with no core icon
      } else if (coreType === "gold") {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const outer = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const inner = outer + Math.PI / 5;
          const ox = cx + Math.cos(outer) * g * 1.1;
          const oy = cy + Math.sin(outer) * g * 1.1;
          const ix = cx + Math.cos(inner) * g * 0.46;
          const iy = cy + Math.sin(inner) * g * 0.46;
          if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
          ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

      } else if (coreType === "platinum") {
        ctx.beginPath();
        ctx.moveTo(cx - g * 0.8, cy + g * 0.5);
        ctx.lineTo(cx + g * 0.8, cy + g * 0.5);
        ctx.lineTo(cx + g * 0.9, cy - g * 0.3);
        ctx.lineTo(cx + g * 0.4, cy - g * 0.05);
        ctx.lineTo(cx, cy - g * 0.7);
        ctx.lineTo(cx - g * 0.4, cy - g * 0.05);
        ctx.lineTo(cx - g * 0.9, cy - g * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx - g * 0.9, cy - g * 0.3, g * 0.15, 0, Math.PI * 2);
        ctx.arc(cx, cy - g * 0.7, g * 0.15, 0, Math.PI * 2);
        ctx.arc(cx + g * 0.9, cy - g * 0.3, g * 0.15, 0, Math.PI * 2);
        ctx.fill();

      } else if (coreType === "anchor") {
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

    function formatCompactScore(value) {
      if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
      if (Math.abs(value) >= 10000) return `${Math.round(value / 1000)}k`;
      if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
      return String(value);
    }

    function setRulesDrawer(open) {
      rulesDrawer.classList.toggle("is-open", open);
      rulesDrawer.setAttribute("aria-hidden", String(!open));
      rulesToggle.setAttribute("aria-expanded", String(open));
      if (glossaryToggle) glossaryToggle.setAttribute("aria-expanded", String(open));
      drawerScrim.hidden = !open;
    }

    // Rules / Wiki tab controllers
    const rulesTabBtn = document.getElementById("rulesTabBtn");
    const wikiTabBtn = document.getElementById("wikiTabBtn");
    const rulesTabContent = document.getElementById("rulesTabContent");
    const wikiTabContent = document.getElementById("wikiTabContent");

    function switchDrawerTab(tabId) {
      if (tabId === "rules") {
        rulesTabBtn.classList.add("active");
        rulesTabBtn.setAttribute("aria-selected", "true");
        wikiTabBtn.classList.remove("active");
        wikiTabBtn.setAttribute("aria-selected", "false");
        rulesTabContent.classList.add("is-active");
        wikiTabContent.classList.remove("is-active");
        wikiTabContent.hidden = true;
      } else {
        wikiTabBtn.classList.add("active");
        wikiTabBtn.setAttribute("aria-selected", "true");
        rulesTabBtn.classList.remove("active");
        rulesTabBtn.setAttribute("aria-selected", "false");
        wikiTabContent.classList.add("is-active");
        wikiTabContent.hidden = false;
        rulesTabContent.classList.remove("is-active");
      }
    }

    if (rulesTabBtn && wikiTabBtn) {
      rulesTabBtn.addEventListener("click", () => switchDrawerTab("rules"));
      wikiTabBtn.addEventListener("click", () => switchDrawerTab("wiki"));
    }

    // Sub-section category selectors inside Wiki tab
    const wikiNavBtns = document.querySelectorAll(".wiki-nav-btn");
    const wikiSections = document.querySelectorAll(".wiki-section");

    wikiNavBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetSection = btn.getAttribute("data-wiki-section");
        wikiNavBtns.forEach((b) => b.classList.toggle("active", b === btn));
        wikiSections.forEach((sec) => {
          const isTarget = sec.id === `wiki-section-${targetSection}`;
          sec.classList.toggle("active", isTarget);
          sec.hidden = !isTarget;
        });
      });
    });

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
    rulesToggle.addEventListener("click", () => {
      setRulesDrawer(true);
      switchDrawerTab("rules");
    });
    if (glossaryToggle) {
      glossaryToggle.addEventListener("click", () => {
        setRulesDrawer(true);
        switchDrawerTab("wiki");
      });
    }
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
      enemies() {
        return GameState.board
          .filter((pip) => pip.enemyPieces.some((checker) => getEnemyAbility(checker) === EnemyAbility.PAWN || getEnemyAbility(checker) === EnemyAbility.RAM))
          .map((pip) => ({
            pip: pip.index + 1,
            enemies: pip.enemyPieces.map((checker) => getEnemyAbility(checker))
          }));
      },
      movers() {
        return this.enemies();
      }
    };

    resetLevel(0, false);
    requestAnimationFrame(draw);
