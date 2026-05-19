extends Node3D
## Root scene controller. Owns the board, dice tray, camera, lights, and
## hooks the HUD up to GameState.

@onready var board: BoardNode = $Board
@onready var hud: Control = $HUD
@onready var camera: Camera3D = $CameraRig/Camera3D


func _ready() -> void:
    GameState.reset_run()
    # TODO: GameCore.start_blind(0) once that function is ported.


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("toggle_debug"):
        GameState.debug_open = not GameState.debug_open
    elif event.is_action_pressed("end_turn"):
        GameCore.end_turn()
