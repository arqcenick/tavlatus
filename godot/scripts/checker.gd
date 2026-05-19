extends Node3D
class_name CheckerNode
## Visual representation of a single checker on the board.
##
## Owns a CylinderMesh + StandardMaterial3D and renders the chip in real
## 3D — replacing the 2D `drawChecker` function in the JS prototype.
## Position is driven by the parent Pip node's stack point; this script
## doesn't touch rules at all.

@export var checker_id: String = ""
@export var owner_id: String = PipEnums.PLAYER
@export var checker_type: CheckerType

@onready var mesh: MeshInstance3D = $Mesh

const CHIP_RADIUS := 0.45
const CHIP_HEIGHT := 0.14


func _ready() -> void:
    apply_type(checker_type)


func apply_type(type: CheckerType) -> void:
    if type == null:
        return
    checker_type = type
    if mesh == null:
        return
    var mat := StandardMaterial3D.new()
    mat.albedo_color = type.top_color
    mat.metallic = 0.15
    mat.roughness = 0.35
    if type.emissive_strength > 0.0:
        mat.emission_enabled = true
        mat.emission = type.emissive
        mat.emission_energy_multiplier = type.emissive_strength
    mesh.material_override = mat


## Slide to a target world-position. Called by the board controller when
## the rules engine emits a `checker_moved` event with a path.
func slide_to(target: Vector3, duration: float = 0.25) -> void:
    var tween := create_tween()
    tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
    tween.tween_property(self, "position", target, duration)


## Knockoff animation for when this checker is broken or sent to the bar.
func knockoff(toward: Vector3) -> void:
    # TODO: convert to a RigidBody3D briefly, apply impulse, then despawn.
    var tween := create_tween()
    tween.tween_property(self, "position", position + toward, 0.4)
    tween.parallel().tween_property(self, "rotation_degrees:x", 540.0, 0.4)
    tween.tween_callback(queue_free)
