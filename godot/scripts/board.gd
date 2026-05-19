extends Node3D
class_name BoardNode
## Owns the 24 PipNodes and the board mesh. Listens to GameState signals
## and updates pip contents to match.

@export var pip_scene: PackedScene

const BOARD_WIDTH := 12.0   # along X (game units)
const BOARD_DEPTH := 8.0    # along Z
const HALF_WIDTH := BOARD_WIDTH / 2.0
const HALF_DEPTH := BOARD_DEPTH / 2.0
const PIP_SPACING := 1.0
const BAR_HALF_WIDTH := 0.6  # gap between the two 6-pip groups

var pips: Array[PipNode] = []


func _ready() -> void:
    _build_pips()
    GameState.checker_moved.connect(_on_checker_moved)
    GameState.state_reset.connect(_on_state_reset)


## Layout: 24 pips around the rectangular board, two rows of 12.
## Pip 0 = far-bottom-right (player home start), counted counter-clockwise.
## Matches the JS prototype's pip indexing.
func _build_pips() -> void:
    if pip_scene == null:
        return
    pips.clear()
    for i in 24:
        var pip := pip_scene.instantiate() as PipNode
        if pip == null:
            continue
        pip.pip_index = i
        pip.position = _pip_position(i)
        pip.clicked.connect(_on_pip_clicked)
        add_child(pip)
        pips.append(pip)


func _pip_position(index: int) -> Vector3:
    # Bottom row: pips 0..11, right→left.  Top row: pips 12..23, left→right.
    var on_top := index >= 12
    var col := index if not on_top else index - 12
    # Skip the bar gap by shifting columns 6..11 to the left.
    var x := lerp(HALF_WIDTH - 0.5, -HALF_WIDTH + 0.5, col / 11.0)
    if col >= 6:
        x -= BAR_HALF_WIDTH * 2.0  # leave a visual gap for the bar
    var z := HALF_DEPTH - 0.5 if not on_top else -HALF_DEPTH + 0.5
    return Vector3(x, 0, z)


func _on_pip_clicked(pip_index: int) -> void:
    # TODO: route through GameCore — for now just forward to GameState as
    # an intent signal that the main scene controller can react to.
    if GameState.selected_checker_id == "":
        # Pick the top checker of the clicked pip as the selection candidate.
        pass
    else:
        # Attempt move: pass selection + die used to game_core.apply_move().
        pass


func _on_checker_moved(_checker_id: String, _from_pip: int, _to_pip: int, _events: Array) -> void:
    # TODO: animate the actual chip transfer between pips.
    pass


func _on_state_reset() -> void:
    # TODO: clear visual stacks and rebuild from GameState.board.
    pass
