# Tavlatus: Game Design Document

Tavlatus is a single-player rogue-like deckbuilder and backgammon hybrid. It fuses the movement and blocking rules of traditional Backgammon with modern deckbuilding scaling and run structures (inspired by games like *Balatro*). Players modify their starting checkers, custom-build their board's tile effects, and score chips to beat round targets while defending against relentless enemy invasions.

---

## 1. High Concept & Aesthetic Feel

### The Concept
"Backgammon meets Roguelike Drafting." Instead of playing against a mirroring opponent, the player moves their pieces (checkers) from the top-right, down the left side, and into the bottom-right **Attack zone** (traditionally the Bear-Off area) to score points (Chips x Mult). The enemy pieces advance in the opposite direction from the top-left towards the player's starting base, acting as obstacles, gates, and hostile units. 

### Aesthetic & Mood
- **Art-Deco Cyber-Velvet**: The game features a dark, atmospheric board with gold and teal geometric lines. Velvet-textured radial gradients, golden corners, and glowing indicators establish a premium, tactile board-game environment.
- **Fluid Movement**: Checkers do not tele-transport; they leap gracefully from pip to pip, tracing dynamic, curved physical arcs. Allied and enemy checkers curve in opposite directions to prevent visual overlaps when passing each other.
- **Physics-Based Feedback**: Collisions carry physical weight. Striking an enemy checker sends it spinning off-screen under gravity before it lands in the enemy holding area. Shattering a *Glass Rim* checker bursts custom light-blue shard particles across the board, accompanied by a physical screen shake.
- **Dynamic Background**: The background features smooth, continuous vector-wave washes. The speed and intensity of these background waves scale dynamically with the player's current global score multiplier, making the game feel "alive" and reactive as the player builds high-scoring combos.

---

## 2. Core Gameplay Loop

Each level of Tavlatus is structured around a **Run** of multiple blinds (Small Blind, Big Blind, Boss Blind):
1. **The Roll**: Dice roll automatically at the start of the turn.
2. **The Move**: The player selects an allied checker and moves it according to the rolled die values. 
3. **Scoring & Pass-Over**: Each step of the move triggers points and any pass-over effects on the tiles (pips) the checker jumps over, culminating in landing effects.
4. **Enemy Turn**: After the player ends their turn, the enemy phase begins. The enemy checkers consume preset **Move Tokens** to advance towards the player's base, capturing unprotected allied checkers.
5. **Clear or Fail**: The round continues until the player reaches the target score (allowing them to click **Win** and visit the Shop) or runs out of checkers/rolls (resulting in a failed run).

---

## 3. Scoring Mechanics

Moves in Tavlatus generate score using a classic **Chips & Multiplier (Mult)** system:
$$\text{Move Score} = (\text{Base Chips} + \text{Bonuses}) \times (\text{Global Mult} \times \text{Checker/Tile Multipliers})$$

### Scoring Triggers
- **Base Move Score**: Every pip moved scores $10 \text{ Chips} \times \text{die value}$.
- **Allied Landing**: Landing on a pip already occupied by friendly checkers yields $+50 \text{ Chips}$ for each allied checker already present.
- **Break**: Landing on a pip occupied by a single, vulnerable enemy checker **breaks** (captures) it, earning $+200 \text{ Chips}$ and sending the enemy to the Attacked Enemies bar.
- **Attack Area Entry**: Moving a checker past the 24th pip exits the board, scoring $+250 \text{ Chips}$ and removing the checker from play.
- **Pass-Over Hooks**: Checkers jump pip-by-pip. Moving over pips containing modifiers can trigger passive score additions or multiplier hooks during transit, letting players "route" their moves for maximum score.

---

## 4. Player Checker Archetypes (Cores & Rims)

Player checkers are modular entities defined by two attributes: a **Core** (which sets base chips and hazards defense) and a **Rim** (which dictates score multipliers).

```mermaid
graph TD
    A[Player Checker] --> B[Core: Base Chips & Defense]
    A --> C[Rim: Multipliers & Effects]
    
    B --> B1[Basic: +10 Chips]
    B --> B2[Gold: +50 Chips]
    B --> B3[Platinum: +100 Chips]
    B --> B4[Anchor: +10 Chips / Hazard Proof]
    
    C --> C1[Basic: x1 Mult]
    C --> C2[Glass: x2 Mult / Shatters on landing]
    C --> C3[Ruby: x3 Mult]
    C --> C4[Prism: x5 Mult]
```

### Checker Cores (Vulnerability & Value)
- **Basic Core**: Gives $+10 \text{ Chips}$. Vulnerable to enemy attacks and hazards.
- **Gold Core**: Gives $+50 \text{ Chips}$. High scoring, but still vulnerable.
- **Platinum Core**: Gives $+100 \text{ Chips}$. Elite scoring potential.
- **Anchor Core**: Gives $+10 \text{ Chips}$. Invulnerable to enemy attacks and hazard pips (cannot be sent to the bar or destroyed).

### Checker Rims (Multipliers)
- **Basic Rim**: Applies a $1\times$ multiplier.
- **Glass Rim**: Applies a $2\times$ multiplier. However, it is fragile; if another checker lands on it, or if a checker passes over it, the Glass Rim shatters, destroying the checker.
- **Ruby Rim**: Applies a $3\times$ multiplier.
- **Prism Rim**: Applies a premium $5\times$ multiplier.

---

## 5. Board Modifiers (Relic-Pips)

The board consists of 24 pips. The bottom 12 pips represent the player's **Deck**. Players buy **Relic-Pips** in the shop and permanently place them onto these deck slots to customize their scoring board:

| Relic-Pip | Symbol | In-Transit (Pass-Over) Effect | Landing Effect |
| :--- | :---: | :--- | :--- |
| **The Forge** | **F** | Adds $+5 \text{ Chips}$ to the move. | Permanently grants the landing checker $+1 \text{ Mult}$ for the rest of the run. |
| **The Market** | **M** | Adds $+0.25\times \text{ Mult}$ to the move. | Doubles the final Chip value of that move. |
| **Iron Gate** | **I** | None | Establishes a protective block. Enemy checkers cannot pass this pip if at least one allied checker stands here. |
| **Haste Line** | **H** | Grants $+1$ extra movement pip. | Draws $1$ extra die for the player's next roll. |
| **Ledger Pip** | **$** | None | Grants $+1 \text{ Akçe}$ (money) if a checker lands here. |
| **Dealer Pip** | **+** | None | Adds $+1$ temporary die roll to the player's remaining pool. |

---

## 6. Enemy Behavior & Obstacles

The enemy does not take random actions. Instead, they act as deterministic obstacles on the board:

### Enemy Checkers
- **Pawns**: Standard red checkers. They move 2 pips at a time. If they hit a single player checker, they capture it and send it to the Allied Bar. If the player has two or more checkers on a pip (forming a "Gate"), Pawns cannot pass it unless it is undefended. If blocked by a defended allied gate, Pawns can only advance 1 pip.
- **Rams**: Elite heavy units. Rams advance 2 pips and can actively attack a defended allied gate, breaking the gate and sending one of the player's non-Anchor checkers to the Allied Bar.

### Enemy Phase & Move Tokens
- At the start of the level, the enemy's upcoming movements are displayed as a row of blue **Move Tokens** (e.g. `[3, 3]`).
- During the enemy phase, the enemy consumes these tokens one-by-one.
- For each token consumed, the **farthest enemy checker** (the one highest on the board index/closest to the player's starting area) advances towards the player's base by the token's value.
- If an enemy checker reaches the player's base (pip 0), it escapes, raising the blind's difficulty.

### Re-entry & The Bars
- **Allied Bar**: Captured player checkers are sent here and must re-enter the board at the starting area (pips 0-5) using dice before any other checker can move.
- **Attacked Enemies (Enemy Bar)**: Captured enemy checkers are held here. At the start of the enemy turn, captured enemy checkers re-enter play at the enemy's starting area.

---

## 7. Economy & The Shop

Clearing a blind allows players to visit the Shop, using their accumulated **Akçe** (earned by clearing rounds and landing on Ledger Pips) to upgrade their engine.

### Akçe Payout Mechanics
- **Blind Payout**: Clearing a standard blind pays $3 \text{ Akçe}$. Clearing a Boss Blind pays $5 \text{ Akçe}$.
- **Interest Payout**: Every unused die roll remaining in the player's pool at the end of the round pays $+1 \text{ Akçe}$.
- **Mars Bonus**: If the player beats the target score and wins the round before any enemy checker reaches the player's base, they earn a **Mars Payout**, doubling the total money rewarded.

### Shop Draft Categories
The shop drafts 9 items divided into three rows:
1. **Relic-Pips**: Modifiers (Forge, Market, etc.) to place onto the bottom 12 deck slots. Buying a relic-pip lets the player inspect the board, hide the shop, and click a deck slot to place it (replacing any existing modifier).
2. **Checker Drafts**: Specialized pre-configured checkers (e.g. Golden, Glass, Anchor, Ruby, Prism) that can replace one of the player's 10 starting checkers.
3. **Core & Rim Upgrades**: Permanent upgrades that can be applied directly to a selected starting checker on the board (e.g. upgrading a checker's core to Gold, or its rim to Prism).

---

## 8. User Experience & Mechanical Synergy

- **Deselect & Plan**: Players can select checkers to preview paths, check legal landing zones, and preview exact score calculations before finalizing a move.
- **Inspect Board**: The "Hide Store" option in the shop dims the shop overlay completely, allowing players to look at the exact state of the board and layout before deciding what modifiers to buy or where to place them.
- **Roguish Adaptability**: Because the player upgrades their persistent starting checkers, they can build synergies—for example, upgrading a checker to have an Anchor Core (ignoring hazards) and a Prism Rim (x5 Mult), or combining Forge Pips with Glass Rims to build high-risk, high-multiplier scoring runs.
