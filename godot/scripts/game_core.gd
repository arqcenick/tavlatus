extends Node
## Autoloaded singleton. Pure rules engine.
##
## Port target for `../game-core.js`. Functions in here take state by
## reference (the GameState autoload) and produce events; they should NOT
## reach into any visual nodes. Visuals listen to GameState signals.
##
## This file is intentionally a thin skeleton — each function below is a
## stub mapping to its JS counterpart so the port can proceed function by
## function without restructuring at the same time.

# ---------------------------------------------------------------------------
# Dice
# ---------------------------------------------------------------------------

## Roll two d6. Doubles expand to four matched moves, mirroring backgammon
## and the JS prototype's behaviour.
func roll_dice(rng: RandomNumberGenerator = null) -> Array[int]:
    var r := rng if rng != null else RandomNumberGenerator.new()
    if rng == null:
        r.randomize()
    var a := r.randi_range(1, 6)
    var b := r.randi_range(1, 6)
    if a == b:
        return [a, a, a, a]
    return [a, b]


# ---------------------------------------------------------------------------
# Movement legality
# ---------------------------------------------------------------------------

## Returns the array of destination pip indices a checker can legally reach
## given the current dice and board state. Bear-off is encoded as index 24.
func legal_targets_for(_checker_id: String) -> Array[int]:
    # TODO: port from getLegalTargetsForChecker() in game-core.js.
    # Handle: bar re-entry, blocking by ≥2 enemy checkers, anchor immunity,
    # bear-off conditions, and the per-die targets independently.
    return []


## Returns true if the player has *any* legal move with the current dice.
func has_any_legal_move() -> bool:
    # TODO: port from hasAnyLegalMove() in game-core.js.
    return false


# ---------------------------------------------------------------------------
# Move resolution + scoring
# ---------------------------------------------------------------------------

## Resolve a move. Returns an event list (chip-gain, break, allied-landing,
## bear-off, pip-modifier triggers, etc.) so the scene controller can
## animate it.
func apply_move(_checker_id: String, _to_pip: int, _die_used: int) -> Array:
    # TODO: port from applyMove() / scoreMove() in game-core.js.
    return []


## Pure scoring helper. Computes (chips, mult, gained) for a move without
## mutating state — useful for hover previews.
func preview_score(_checker_id: String, _to_pip: int, _die_used: int) -> Dictionary:
    # TODO: port from previewScore() in game-core.js.
    return {"chips": 0, "mult": 1.0, "gained": 0, "parts": []}


# ---------------------------------------------------------------------------
# Turn flow
# ---------------------------------------------------------------------------

## End the current turn. Either re-rolls (if rolls remain and the blind
## isn't beaten), advances to ROUND_OVER (target beaten), or ends the run.
func end_turn() -> void:
    # TODO: port from endTurn() in game-core.js, including:
    # - resolving enemy movers
    # - decrementing rolls
    # - checking win/lose conditions
    # - emitting the relevant GameState signals
    pass


# ---------------------------------------------------------------------------
# Blind / level flow
# ---------------------------------------------------------------------------

func start_blind(_level_index: int) -> void:
    # TODO: port from resetLevel() / startBlind() in game-core.js.
    pass

func calculate_payout() -> Dictionary:
    # TODO: port from calculateRoundPayout() in game-core.js.
    return {
        "remaining_rolls": 0,
        "blind_reward": 0,
        "mars": false,
        "starting_money": 0,
        "total": 0,
    }


# ---------------------------------------------------------------------------
# Shop
# ---------------------------------------------------------------------------

func enter_shop() -> void:
    # TODO: port from enterShop() in game-core.js.
    pass

func purchase_offer(_offer_id: String) -> bool:
    # TODO: port from chooseShopOffer() in game-core.js.
    return false
