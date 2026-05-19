extends Node
## Autoloaded singleton.
##
## Holds the entire run's mutable state and emits signals when it changes.
## Visual nodes (board, checkers, dice, HUD) subscribe to these signals;
## they never read state directly during a frame's render path.
##
## This is the GDScript counterpart to the JS prototype's `GameState`
## object in `../app.js` and the pure logic in `../game-core.js`.

# ---------------------------------------------------------------------------
# Signals — UI and scene nodes listen to these.
# ---------------------------------------------------------------------------

signal state_reset
signal dice_rolled(values: Array)
signal die_consumed(value: int)
signal checker_selected(checker_id: String)
signal selection_cleared
signal checker_moved(checker_id: String, from_pip: int, to_pip: int, events: Array)
signal score_changed(current: int, target: int, mult: float)
signal money_changed(amount: int)
signal rolls_changed(remaining: int)
signal turn_phase_changed(phase: String)
signal blind_started(level_index: int)
signal blind_cleared(payout: Dictionary)
signal run_won
signal run_lost(reason: String)
signal message(text: String)

# ---------------------------------------------------------------------------
# Run state — fields mirror the JS GameState object 1:1 so the port is direct.
# ---------------------------------------------------------------------------

var turn_phase: String = PipEnums.PHASE_ROLLING
var level_index: int = 0

# board[i] is an Array of checker dictionaries; index 0..23 are the 24 pips.
# A checker is { id: String, owner: String, type: String, ability: String,
#                chips: int, mult: float, broken: bool }.
var board: Array = []

# Bar (knocked-off checkers waiting to re-enter).
var bar := {"player": [], "enemy": []}

# Borne-off checkers.
var borne_off: Array = []

# Dice values currently available for this turn. Empty when out of dice.
var dice: Array[int] = []

# Rolls remaining in this blind.
var rolls_remaining: int = 0

var selected_checker_id: String = ""
var valid_targets: Array = []

# Score state for the current blind.
var score := {
    "current": 0,
    "target": 0,
    "mult": 1.0,
    "chips": 0,
    "last_move": 0,
}

# Persistent run state.
var money: int = 0
var relics: Array = []           # Array[Relic]
var pip_modifiers: Dictionary = {}  # pip_index → PipModifier

# Debug overlay state — drives the debug cheats panel.
var debug_open: bool = false


func reset_run() -> void:
    turn_phase = PipEnums.PHASE_ROLLING
    level_index = 0
    board = []
    bar = {"player": [], "enemy": []}
    borne_off = []
    dice = []
    rolls_remaining = 0
    selected_checker_id = ""
    valid_targets = []
    score = {"current": 0, "target": 0, "mult": 1.0, "chips": 0, "last_move": 0}
    money = 0
    relics = []
    pip_modifiers = {}
    debug_open = false
    state_reset.emit()


# ---------------------------------------------------------------------------
# Debug cheats — wired to the debug panel.
# ---------------------------------------------------------------------------

func debug_add_mult(amount: float) -> void:
    score.mult += amount
    score_changed.emit(score.current, score.target, score.mult)

func debug_add_rolls(amount: int) -> void:
    rolls_remaining += amount
    rolls_changed.emit(rolls_remaining)

func debug_hit_target() -> void:
    var need := maxi(0, int(score.target) - int(score.current))
    var bump := need if need > 0 else maxi(200, int(ceil(score.target * 0.25)))
    score.current += bump
    score_changed.emit(score.current, score.target, score.mult)

func debug_add_money(amount: int) -> void:
    money += amount
    money_changed.emit(money)
