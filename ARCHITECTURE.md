# Tavlatus Architecture

Tavlatus is split into a renderer-agnostic rules core and a canvas presentation layer.

## `game-core.js`

Owns deterministic game rules and reusable data structures:

- board, pip, checker, deck relic-pip, tile, and level definitions
- starting board construction
- dice expansion, including doubles
- valid target calculation
- pass-over pip calculation
- movement scoring math

This file does not read the DOM, draw to Canvas, or trigger animations. A future Three.js renderer should call this layer for legal moves and score results.

## `app.js`

Owns the current browser experience:

- canvas rendering
- pointer hit detection
- menus, drawer, tooltips, and shop interactions
- floating score text and checker movement animations
- mutation of the current `GameState` after core rule results are returned

The canvas app should treat `game-core.js` as the source of truth for rules, then decide how to show those results.

## Future Renderer Contract

A future renderer should be able to:

1. Create board state with `PipjackCore.createStartingBoard`.
2. Ask for legal moves with `PipjackCore.getValidTargets`.
3. Preview or resolve score with `PipjackCore.calculateMoveScore`.
4. Animate however it wants using the source, target, and passed pip list from `PipjackCore.getPassedPips`.
