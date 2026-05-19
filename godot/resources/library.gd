extends Node
class_name PipjackLibrary
## Static content lookups. Used as a namespace, not instantiated.
##
## The actual `.tres` Resource files for each checker type, relic, and
## level live under `res://resources/data/` and are loaded on demand here.
## During the port they'll be created via Godot's inspector — for now this
## file just documents the lookup contract.

const CHECKER_TYPE_PATHS := {
    "standard": "res://resources/data/checker_standard.tres",
    "golden":   "res://resources/data/checker_golden.tres",
    "glass":    "res://resources/data/checker_glass.tres",
    "anchor":   "res://resources/data/checker_anchor.tres",
    "ruby":     "res://resources/data/checker_ruby.tres",
    "prism":    "res://resources/data/checker_prism.tres",
    "sprinter": "res://resources/data/checker_sprinter.tres",
}

const RELIC_PATHS := {
    "sneaky_die":     "res://resources/data/relic_sneaky_die.tres",
    "loaded_ledger":  "res://resources/data/relic_loaded_ledger.tres",
    "doubles_dealer": "res://resources/data/relic_doubles_dealer.tres",
    "moon_coupon":    "res://resources/data/relic_moon_coupon.tres",
    "haste_boots":    "res://resources/data/relic_haste_boots.tres",
}

const LEVEL_PATHS := [
    "res://resources/data/level_small_blind.tres",
    "res://resources/data/level_big_blind.tres",
    "res://resources/data/level_boss.tres",
]


static func load_checker_type(id: String) -> CheckerType:
    var path: String = CHECKER_TYPE_PATHS.get(id, "")
    if path == "" or not ResourceLoader.exists(path):
        return null
    return load(path) as CheckerType


static func load_relic(id: String) -> Relic:
    var path: String = RELIC_PATHS.get(id, "")
    if path == "" or not ResourceLoader.exists(path):
        return null
    return load(path) as Relic


static func load_level(index: int) -> LevelConfig:
    if index < 0 or index >= LEVEL_PATHS.size():
        return null
    var path: String = LEVEL_PATHS[index]
    if not ResourceLoader.exists(path):
        return null
    return load(path) as LevelConfig
