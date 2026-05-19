extends Resource
class_name PipModifier
## Per-pip tile effect (Forge, Market, future relic-as-pip tiles).
##
## Stored in `GameState.pip_modifiers[pip_index]`. The rules engine
## inspects the `effect` tag at the moment a checker lands on or passes
## over the pip and applies the matching behaviour.

@export var id: String = ""
@export var name: String = ""
@export var description: String = ""

## Effect tags currently used by the JS prototype:
##   "forge"   — +1 mult to the checker that lands here (permanent)
##   "market"  — doubles chips for that move
##   "pass_*"  — future hooks that fire when a checker passes over the pip
@export var effect: String = ""
@export var color: Color = Color(1, 0.83, 0.28)
@export var payload: Dictionary = {}
