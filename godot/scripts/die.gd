extends RigidBody3D
class_name DieNode
## A six-sided die. RigidBody3D so the roll tumble is real physics,
## replacing the fake 2D rotation in the JS prototype.

signal settled(value: int)

@export var value: int = 1

const DIE_SIZE := 0.5

# Each face's local-up vector for the cube as authored (top = +Y).
# Used by `settled()` detection to read the upward face after tumbling.
const FACE_NORMALS := {
    1: Vector3.UP,
    2: Vector3.RIGHT,
    3: Vector3.FORWARD,
    4: Vector3.BACK,
    5: Vector3.LEFT,
    6: Vector3.DOWN,
}

var _settled_emitted: bool = false


func roll(impulse: Vector3, torque: Vector3) -> void:
    _settled_emitted = false
    apply_central_impulse(impulse)
    apply_torque_impulse(torque)


func _physics_process(_delta: float) -> void:
    if _settled_emitted:
        return
    if linear_velocity.length() < 0.05 and angular_velocity.length() < 0.05:
        value = _face_up()
        _settled_emitted = true
        settled.emit(value)


func _face_up() -> int:
    var best := 1
    var best_dot := -INF
    for face in FACE_NORMALS:
        var world_normal := global_transform.basis * (FACE_NORMALS[face] as Vector3)
        var d := world_normal.dot(Vector3.UP)
        if d > best_dot:
            best_dot = d
            best = face
    return best
