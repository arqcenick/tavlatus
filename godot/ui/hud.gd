extends CanvasLayer
class_name HUD
## Top-level HUD overlay. Bound to GameState signals — never reads state
## directly during render.

@onready var score_label: Label = $LeftPanel/VBox/ScoreRow/Value
@onready var target_label: Label = $LeftPanel/VBox/TargetRow/Value
@onready var mult_label: Label = $LeftPanel/VBox/MultRow/Value
@onready var rolls_label: Label = $LeftPanel/VBox/RollsRow/Value
@onready var akce_label: Label = $LeftPanel/VBox/AkceRow/Value
@onready var message_label: Label = $LeftPanel/VBox/Message

@onready var debug_panel: Control = $DebugPanel


func _ready() -> void:
    GameState.score_changed.connect(_on_score_changed)
    GameState.money_changed.connect(_on_money_changed)
    GameState.rolls_changed.connect(_on_rolls_changed)
    GameState.message.connect(_on_message)
    GameState.state_reset.connect(_refresh)
    _refresh()


func _process(_delta: float) -> void:
    if debug_panel != null:
        debug_panel.visible = GameState.debug_open


func _on_score_changed(current: int, target: int, mult: float) -> void:
    score_label.text = str(current)
    target_label.text = str(target)
    mult_label.text = "x%s" % String.num(mult, 2)


func _on_money_changed(amount: int) -> void:
    akce_label.text = str(amount)


func _on_rolls_changed(remaining: int) -> void:
    rolls_label.text = str(remaining)


func _on_message(text: String) -> void:
    message_label.text = text


func _refresh() -> void:
    _on_score_changed(GameState.score.current, GameState.score.target, GameState.score.mult)
    _on_money_changed(GameState.money)
    _on_rolls_changed(GameState.rolls_remaining)
