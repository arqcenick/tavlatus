## Enum-style constants shared across the project.
## Kept as a class with constants (not Godot enums) so values can be used as
## dictionary keys, exported in the editor, and serialized cleanly.
class_name PipEnums

const PLAYER := "player"
const ENEMY := "enemy"

# Turn phases — matches the JS prototype's TurnPhase values so the port can
# reuse the same state transitions.
const PHASE_ROLLING := "rolling"
const PHASE_MOVING := "moving"
const PHASE_ROUND_OVER := "round_over"
const PHASE_SHOP := "shop"

# Player checker upgrade types.
const CHECKER_STANDARD := "standard"
const CHECKER_GOLDEN := "golden"
const CHECKER_GLASS := "glass"
const CHECKER_ANCHOR := "anchor"
const CHECKER_RUBY := "ruby"
const CHECKER_PRISM := "prism"
const CHECKER_SPRINTER := "sprinter"

# Enemy ability tags.
const ENEMY_STATIC := "static"
const ENEMY_MOVER := "mover"
