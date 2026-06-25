# Tavlatus Architecture

Tavlatus is a rogue-like backgammon hybrid split into a renderer-agnostic rules core and a canvas presentation layer.

---

## Core Terminology

- **Checkers**: Pieces representing player or enemy entities.
  - **Player Checkers**: Configured with a **Core** (Basic, Gold, Platinum, Anchor - determines base chips & vulnerability) and a **Rim** (Basic, Glass, Ruby, Prism - determines scoring multipliers).
  - **Enemy Checkers**: Pawns (basic) and Rams (can attack gates).
- **Pips**: The 24 standard backgammon board triangles.
  - **Deck Pips**: The bottom 12 pips where the player can install **Relic-Pips** (modifiers like *Iron Gate*, *Haste Line*, *Ledger*, *Dealer*, *Forge*, or *Market*).
- **Attack (Internal: Bear Off)**: The zone where player checkers score and exit the board. Also displays procedural boss panels and active enemy statistics.
- **Allied Bar**: Re-entry area for captured player checkers.
- **Attacked Enemies (Enemy Bar)**: Hold area for captured enemy checkers before they enter play at the start of their turn.
- **Enemy Move Tokens**: Pentagonal intent tokens showing values for upcoming enemy moves. Each enemy phase, the move budget is split in two: half the tokens advance the **rearmost** enemy checkers (highest index, farthest from the player base) and half advance the **vanguard** (lowest index, closest to the player base). With the default `[3, 3, 3, 3]` tokens this is two rear + two vanguard. One mover is chosen per occupied pip (Rams prioritized over Pawns within a pip), picked from the highest-index pip first, and each advances by its token's value.

---

## `game-core.js` (Deterministic Core)

Owns the game rules, mathematical formulas, and parameters:
- **Board & Pip Init**: Sets up starting boards and level configurations.
- **Move Generation**: Validates legal targets for dice values, including double rolls.
- **Combat Logic**: Handles captures, hit evaluations, and glass rims shattering.
- **Scoring Formulas**: Computes Chip values and Multipliers based on checkers, rims, cores, and landed modifiers.

*This file is DOM-free and contains no canvas or rendering code.*

---

## `app.js` (Canvas Presentation & UI)

Owns the client experience and browser lifecycle:
- **Rendering Loop**: Draws the 2D canvas, including procedural animations (smooth background waves, spirographs, shop particles, coin rain).
- **Pointer/Hit Detection**: Maps click locations to checkers, pips, buttons, and custom tooltip boundaries.
- **Animations**: Handles movement arcs, dislodge collision physics, camera shakes, and upgrade morphs.
- **HUD & Shop Panels**: Manages UI state, draft selections, starting checker replacements, and the tabbed Rules/Encyclopedia glossary drawer.

---

## Future Renderer Contract

To replace the 2D canvas with a 3D renderer (e.g. Three.js):
1. **Board Creation**: Build state using `PipjackCore.createStartingBoard`.
2. **Move Options**: Fetch valid destinations via `PipjackCore.getValidTargets`.
3. **Move Results**: Resolve score and capture changes via `PipjackCore.calculateMoveScore`.
4. **Visual Mapping**: Path animations using source, destination, and the passed pips array from `PipjackCore.getPassedPips`.
