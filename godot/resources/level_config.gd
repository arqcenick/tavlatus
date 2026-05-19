extends Resource
class_name LevelConfig
## A single blind in the ante: score target, payout, optional boss rule.
## Mirrors the LevelConfig array in `../app.js`.

@export var id: String = ""
@export var name: String = "Small Blind"
@export var target: int = 750
@export var rolls: int = 7

## Akçe reward for clearing this blind.
@export var reward: int = 3

## Optional boss-only rule descriptor. Empty for normal blinds.
##
## Example payloads:
##   { "kind": "no_doubles" }
##   { "kind": "score_floor", "amount": 200 }
@export var boss_rule: Dictionary = {}

## Initial enemy placement override. Empty array means use the default.
@export var enemy_layout: Array = []
