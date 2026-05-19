extends Resource
class_name Relic
## A purchasable relic with hook tags that the rules engine fires.
##
## Hooks are matched as strings inside game_core.gd, e.g.:
##   "on_break"     — fires when a red checker is broken
##   "on_doubles"   — fires when dice come up doubles
##   "on_bear_off"  — fires when a checker is borne off
##   "shop_discount" — modifies shop prices

@export var id: String = ""
@export var name: String = ""
@export var short_name: String = ""
@export var description: String = ""
@export var hook: String = ""
@export var payload: Dictionary = {}

## Optional mesh / icon override for the future relic-on-board renderer.
@export var icon_color: Color = Color(1, 0.88, 0.36)
