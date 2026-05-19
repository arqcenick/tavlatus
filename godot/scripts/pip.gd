extends Node3D
class_name PipNode
## A single pip on the board. 1 of 24.
##
## Holds a stack of CheckerNodes, an Area3D for click input, an optional
## PipModifier (Forge/Market/etc.), and a triangle MeshInstance for the
## board visual.

signal clicked(pip_index: int)

@export var pip_index: int = 0
@export var modifier: PipModifier

@onready var stack_root: Node3D = $StackRoot
@onready var click_area: Area3D = $ClickArea

const STACK_SPACING := 0.18  # vertical gap between stacked chips (3D height)


func _ready() -> void:
    if click_area != null:
        click_area.input_event.connect(_on_input_event)


func push_checker(checker: CheckerNode) -> void:
    if stack_root == null:
        return
    var index := stack_root.get_child_count()
    checker.position = Vector3(0, index * STACK_SPACING, 0)
    stack_root.add_child(checker)


func pop_top_checker() -> CheckerNode:
    if stack_root == null or stack_root.get_child_count() == 0:
        return null
    var top := stack_root.get_child(stack_root.get_child_count() - 1)
    stack_root.remove_child(top)
    return top as CheckerNode


func stack_top_position() -> Vector3:
    if stack_root == null:
        return global_position
    var n := stack_root.get_child_count()
    return global_position + Vector3(0, n * STACK_SPACING, 0)


func _on_input_event(_camera: Node, event: InputEvent, _pos: Vector3, _normal: Vector3, _shape_idx: int) -> void:
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        clicked.emit(pip_index)
