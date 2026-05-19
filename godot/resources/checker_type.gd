extends Resource
class_name CheckerType
## Visual + statistical profile for a player checker upgrade tier.
##
## One Resource per type (Standard, Golden, Glass, Anchor, Ruby, Prism,
## Sprinter). The mesh node reads `top_color` / `side_color` / `rim_color`
## to drive its StandardMaterial3D, and the rules engine reads
## `chips_bonus` / `mult_bonus` / `ability_tag` when scoring moves.

@export var id: String = "standard"
@export var display_name: String = "Standard"
@export var top_color: Color = Color(1, 0.97, 0.91)
@export var side_color: Color = Color(0.66, 0.61, 0.66)
@export var rim_color: Color = Color(1, 0.17, 0.53)
@export var emissive: Color = Color(0, 0, 0)
@export var emissive_strength: float = 0.0

@export var chips_bonus: int = 0
@export var mult_bonus: float = 0.0

## Tag the rules engine inspects to apply per-type abilities
## (e.g. "anchor" = immune to break, "sprinter" = +chips on 5/6).
@export var ability_tag: String = ""
