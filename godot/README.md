# Pipjack — Godot 4 Port

This is the in-progress 3D rewrite of the JS prototype that lives in the
repository root (`../app.js`, `../game-core.js`, `../index.html`). Open this
directory in **Godot 4.3+** to work on it.

The JS version stays the authoritative web demo while this port is brought up
to feature parity.

## Goals

- Real 3D pieces and dice with proper lighting, shadows, and physics
- Native Steam build (Win/Mac/Linux) as the eventual product
- Keep the JS demo as the browser experience

## Project layout

```
godot/
├── project.godot             Engine config + autoloads
├── icon.svg                  App icon (placeholder)
├── scripts/
│   ├── game_core.gd          Pure rules engine — port target for game-core.js
│   ├── game_state.gd         Singleton holding runtime state (autoloaded)
│   ├── enums.gd              CheckerType, TurnPhase, etc.
│   ├── srs.gd                (not used — leftover from name overlap; reserved)
│   ├── pip.gd                Per-pip node behaviour
│   ├── checker.gd            Per-checker node behaviour (3D MeshInstance)
│   ├── die.gd                Die node — RigidBody3D tumble
│   ├── board.gd              Board mesh + pip layout
│   └── main.gd               Top-level scene controller
├── resources/
│   ├── checker_type.gd       Resource: visual + stat tweaks per chip type
│   ├── relic.gd              Resource: relic definition + signal hooks
│   ├── pip_modifier.gd       Resource: pip-tile effects (Forge, Market, ...)
│   ├── level_config.gd       Resource: blind targets, payouts, boss rules
│   └── library.gd            Static lookups → all the resources above
├── scenes/
│   ├── main.tscn             Root scene
│   ├── board.tscn            Board + pip layout
│   ├── checker.tscn          Reusable chip mesh + script
│   ├── pip.tscn              Pip area (triangle marker + Area3D for clicks)
│   └── die.tscn              Die mesh + physics body
├── ui/
│   ├── hud.tscn              Left HUD (score / target / mult / rolls / Akçe)
│   ├── shop.tscn             Shop overlay
│   ├── payout.tscn           Round-clear payout screen
│   └── debug_panel.tscn      Debug cheats panel
└── assets/
    └── materials/            StandardMaterial3D resources for chips/dice/board
```

## Porting plan (high level)

1. **game_core.gd** — port the pure rules from `../game-core.js`. No node
   dependencies, no rendering. State is owned by `GameState`, which calls
   into `GameCore` to resolve moves and produce events.
2. **GameState (autoload)** — single source of truth for run state: dice,
   selected checker, current pip occupancy, score, money, blind index,
   relics, etc. Emits signals (`dice_rolled`, `checker_moved`, etc.) that
   visual nodes listen to.
3. **Board scene** — 24 Pip nodes laid out in two rows of 12. Each Pip is
   an Area3D (for input) with a triangle MeshInstance3D and a stack point.
4. **Checker scene** — CylinderMesh, two stacked StandardMaterial3D
   instances (top + side), per-type color swaps. RigidBody3D optional for
   "knockoff" animation later.
5. **Die scene** — start with RigidBody3D + BoxMesh + pip decals. Real
   physics tumble on roll, then snap-orient to nearest face.
6. **HUD** — Control nodes for score/target/mult/rolls/Akçe. Bound to
   GameState signals.

## Steam build

Use the standard Godot export templates for Win/Mac/Linux. For Steam
integration, add [GodotSteam](https://godotsteam.com/) as a GDExtension when
needed.

## Running

```
godot4 --path .
```

Or open this folder in Godot 4.3+.
