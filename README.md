# Yuganta — Tactical Engine + Visual Novel Hybrid

**Yuganta** is a browser-based strategy RPG / visual novel hybrid based on the 18 Parvas of the Mahābhārata.
The entire game is driven by a decoupled narrative timeline system: load a timeline node → play a turn-based tactical battle with canonical directives → narrative triggers fire sequences → directives issue a verdict (victory / canon progress / dharma imbalance / defeat) → load the next node or retry.

**Stack:** Phaser 3 · Vite · AJV (JSON schema validation) · plain ES modules. No paid services, no build-step magic.

> **Status: Phase 3 (narrative integration).**
> Playable loop complete: timeline node → tactical battle with AI → directive verdict → node progression.
> See [What's Done](#whats-done) and [Architecture](#architecture).

---

## Quick Start

Requires [Node.js](https://nodejs.org/) (v18 LTS recommended).

```bash
npm install
npm run validate     # validate public/data/** against JSON schemas
npm run dev          # http://localhost:5173/
npm run test:scene   # headless smoke test (no browser, plain Node)
npm run build        # production bundle in dist/
```

**Jump to a specific battle:**  
`http://localhost:5173/?node=bhishma-parva_day10_sunset`

**Dev utilities:**
- Top-left dropdown: timeline node picker
- Press `E` in-battle: end your phase early
- Press `0` in-battle: reset camera zoom & pan
- Double-click background: toggle fullscreen

---

## How to Play

### Player Phase (Pandava)
1. **Click a blue unit** to select it (must be PANDAVA faction and able to act)
2. **Menu options:**
   - **Move** — select a reachable tile (range shown in blue highlight)
   - **Attack** — select a target in attack range (red highlight); can use an Astra
   - **Wait** — end this unit's turn immediately without moving/attacking
   - **Cancel** — deselect without acting
3. **One action per unit per phase:** move OR (attack/wait), not both after moving
4. Dimmed units have already acted this phase

### AI Phase (Kaurava)
- Controlled by `AIController`; they move/attack automatically
- **Battle Chronicle** logs every damage step: traits, terrain, astras, dharma costs

### End of Battle
- **Victory**: All canonical directives fulfilled → next node
- **Dharma Imbalance**: Hard-canon objective broken (e.g., killing a unit who must survive) → reset node
- **Canon Progress**: Soft-canon objective broken (e.g., army lost in scenario where defeat is written) → story advances
- **Defeat**: No canon explains the loss → retry same node

---

## Architecture

### High-Level Flow

```
BootScene (once)
   ├─ Load lore.json + characters.json
   ├─ Build registries: characterMap, traitMap, astraMap, vowMap
   ├─ Create TimelineManager, GameState, VNBridge
   └─ Init TacticalScene
        │
        ▼
   TimelineManager.loadNode(nodeId)  ← fetches timeline.json, directives.json, maps/, sequences/
        │
        └─ NodeBundle {
             node, parva, sceneType ('TACTICAL' | 'VN'),
             directives[], triggers[], sequences{},
             startSequences[], map, mapId, warnings[]
           }
        │
        ▼
   TacticalScene.init(bundle)
        │
        ├─ If sceneType='VN': run VNBridge.play(sequence) [Role 2 renders]
        │
        └─ If sceneType='TACTICAL': _buildBattle()
             ├─ GridSystem: 2.5D isometric projection, hit-test, highlights
             ├─ UnitManager: spawn roster, O(1) spatial index
             ├─ CombatResolver: damage pipeline (traits, astras, terrain)
             ├─ TriggerEvaluator: battle-event tripwires → VN sequences
             ├─ DirectiveManager: canon referee
             ├─ TurnManager: round/phase orchestration
             └─ AIController: Kaurava turn automation
                  │
                  ▼ (on unit death / HP threshold / trigger)
                  │
                  VNBridge.play(sequence)  ← pauses tactical, runs narrative
                  │
                  ▼ (on narrative end)
                  │
                  Resume tactical phase
                  │
                  ▼ (on directive verdict)
                  │
                  next node  OR  resetNode() + reload
```

### Core Modules (Phaser-free, testable in Node)

**`src/core/`:**
- **`Emitter.js`** — event bus (TurnManager, VNBridge, DirectiveManager use this)
- **`GameState.js`** — global state (dharmaMeter, consumedAstras, vowStates)
- **`TurnManager.js`** — round/phase orchestration (no rendering; events drive everything)
- **`TimelineManager.js`** — loads nodes, owns game-state snapshots for reset-on-defeat
- **`VNBridge.js`** — the **ONLY** link to narrative (Role 2 plugs in a provider)
- **`BattleGrid.js`** — unit pathfinding + spatial index (O(1) unit lookup by tile)
- **`MapLoader.js`** — fetches and parses `maps/<map_id>.json`
- **`normalize.js`** — absorbs all data-shape variations (directives, triggers, sequences)

**Why separate?** These modules run tests in plain Node without Phaser. Role 1 owns the turn/combat/AI logic; Role 2 owns rendering/narrative UI.

### Tactical Systems (`src/systems/`)

- **`GridSystem.js`** — 2.5D isometric rendering, diamond hit-test, camera fit-to-screen
- **`UnitManager.js`** — unit roster with spatial indexing (find by tile in O(1))
- **`CombatResolver.js`** — damage pipeline:
  1. Invulnerability checks (traits like `iccha-mrityu`)
  2. Defender traits (damage reduction, defense scaling)
  3. Terrain defense
  4. Attacker traits (bonus damage, dual-attack, stun)
  5. Astra multipliers (divine weapons) + dharma cost
  6. Final damage = baseDamage × multipliers − defense (min 1)
  7. Post-damage: stun, dharma deduction, counter-attack
- **`TriggerEvaluator.js`** — battle-event tripwires (HP thresholds, unit death, turn count) → `'trigger:fire-vn'` / `'trigger:fire-system'`
- **`DirectiveManager.js`** — canonical referee (watches directives, issues verdicts)
- **`MapSpawner.js`** — spawns units from map layout

### Scene Layer

- **`BootScene.js`** — boots once: loads JSON, builds registries, creates services
- **`TacticalScene.js`** — the battlefield: grid rendering, unit interaction, turn flow

### UI Layer (`src/ui/`)

- **`HudController.js`** — DOM action menu, info boxes, combat log (never touches Phaser canvas directly)
- **`DevNodePicker.js`** — dev-only timeline node picker (top-left dropdown)
- **`DebugVNOverlay.js`** — debug VN overlay (shows raw sequences if no Role 2 provider)

---

## Data Layer

All data is JSON under `public/data/` and validated against schemas in `public/data/schemas/`.

### Global
- **`characters.json`** — roster (Bhishma, Arjuna, Krishna, etc.) with traits, astras, vows
- **`lore.json`** — trait definitions, astra stats, vow metadata
- **`aesthetics/direction.json`** — visual art direction (color palettes, armor eras, forbidden tropes)

### Per-Parva
Each of the 18 Parvas has a folder under `public/data/parvas/<slug>/`:
- **`timeline.json`** — nodes (scenes) in order, with `node_id`, `map_id`, narrative context
- **`directives.json`** — tactical goals and battle triggers
- **`dialogues/*.json`** — branching VN sequences (Role 2 renders these)
- **`_meta.json`** — Parva metadata

### Maps
`public/data/maps/<map_id>.json` — 10×10 terrain grids (plains, forest, mountain, river, desert, lake).

---

## Design Rules Worth Knowing

1. **One grid token = one formation.** A chariot pair (warrior + charioteer) shares a grid tile; the charioteer's support traits apply at 70% scale. A named hero (Maharathi) is always a single token.

2. **Damage is applied exactly once,** inside `CombatResolver.resolveAttack()`. Triggers and directives evaluate *before* the dead unit is removed, so they can react to deaths in canonical order.

3. **`normalize.js` is the only place data-file field names become engine shapes.** A schema rename is a one-file fix—every system consumes the normalized shape.

4. **TimelineManager owns the game-state snapshot.** When a node loads, it saves a copy of `gameState` (dharma meter, vow states, consumed astras). On defeat or dharma imbalance, the snapshot is restored before the node reloads. DirectiveManager never owns state.

5. **VNBridge is the only coupling to narrative.** Role 1 never imports `VNScene` or narrative logic; it emits `'vn:request'` and waits for `'vn:complete'`. Role 2 plugs in a provider—or the debug overlay plays raw JSON.

---

## Directory Structure

```
Yuganta/
├── public/data/                                JSON served to browser
│   ├── global/
│   │   ├── characters.json                     32 Mahabharat characters
│   │   └── lore.json                           41 traits, 11 astras, 20 vows
│   ├── parvas/
│   │   ├── bhishma-parva/
│   │   │   ├── timeline.json                   5 scenes (days 1, 2, 5, 9, 10)
│   │   │   ├── directives.json                 tactical goals + triggers
│   │   │   └── dialogues/                      VN sequences
│   │   ├── drona-parva/
│   │   └── ⋮                                   (18 Parvas total)
│   ├── maps/
│   │   ├── map_kurukshetra_center.json         open field
│   │   ├── map_kurukshetra_formations.json     vyuha deployment zone
│   │   ├── map_kurukshetra_open_field.json     wide expanse
│   │   ├── map_kurukshetra_crater.json         damaged terrain
│   │   └── map_kurukshetra_dense_forest.json   restrictive terrain
│   ├── aesthetics/
│   │   └── direction.json                      visual/audio direction (Hex palettes, forbiddens)
│   └── schemas/
│       ├── narrative.schema.json
│       ├── tactical.schema.json
│       ├── lore.schema.json
│       └── aesthetics.schema.json
│
├── src/
│   ├── main.js                                 Phaser config + bootstrap
│   ├── scenes/
│   │   ├── BootScene.js                        (once) load JSON, build registries
│   │   └── TacticalScene.js                    battlefield + turn flow
│   ├── core/                                   Phaser-free, testable in Node
│   │   ├── Emitter.js
│   │   ├── GameState.js
│   │   ├── TurnManager.js                      round/phase orchestration
│   │   ├── TimelineManager.js                  node loading, snapshots
│   │   ├── VNBridge.js                         ↔ narrative layer (Role 2)
│   │   ├── BattleGrid.js                       unit pathfinding, spatial index
│   │   ├── MapLoader.js
│   │   └── normalize.js                        data-shape normalization
│   ├── systems/                                Phaser-aware
│   │   ├── GridSystem.js                       2.5D isometric rendering
│   │   ├── UnitManager.js                      roster + O(1) spatial index
│   │   ├── CombatResolver.js                   damage pipeline
│   │   ├── TriggerEvaluator.js                 battle events → VN
│   │   ├── DirectiveManager.js                 canon referee
│   │   └── MapSpawner.js
│   ├── ai/
│   │   └── AIController.js                     Kaurava turn automation
│   ├── entities/
│   │   └── Unit.js                             unit model (HP, traits, astras, vows)
│   ├── handlers/
│   │   └── TraitHandlers.js                    trait effect functions (BonusDamage, Stun, etc.)
│   ├── data/
│   │   ├── TerrainConfig.js                    plains, forest, mountain, river, lake, desert
│   │   ├── UnitClassConfig.js                  RATHA, GAJA, ASHVA, PADATI, MAHARATHI base stats
│   │   └── MapLayouts.js                       map definitions (terrain matrices)
│   └── ui/
│       ├── HudController.js                    DOM action menu, logs, info boxes
│       ├── DevNodePicker.js                    dev: timeline picker
│       └── DebugVNOverlay.js                   debug: raw sequence overlay
│
├── tests/
│   └── scene-smoke.mjs                         headless smoke test (Node)
│
├── dist/                                       (generated) production build
├── node_modules/
├── package.json
├── vite.config.js
├── index.html                                  canvas + DOM host
└── CONTRACTS.md                                role hand-off rules (Role 1–4)
```

---

## What's Done

### Phase 1 (Tactical Engine) ✓
- [x] 2.5D isometric grid rendering with proper hit-testing
- [x] Unit movement (pathfinding, terrain cost)
- [x] Combat resolver (8-step damage pipeline)
- [x] Trait effects (invulnerability, bonus damage, stun, dual-attack)
- [x] Astra (divine weapon) system with dharma cost
- [x] Chaturanga unit classes (RATHA, GAJA, ASHVA, PADATI, MAHARATHI)
- [x] Terrain system (plains, forest, mountain, river, lake, desert)

### Phase 2 (UI & Polish) ✓
- [x] DOM action menu (Move, Attack, Wait, Cancel)
- [x] Unit info tooltip (HP, ATK, DEF, MOV, RNG, faction)
- [x] Battle chronicle log (cumulative combat history)
- [x] Camera fit-to-screen (responsive zoom/pan)
- [x] Fullscreen support with proper layout
- [x] Dev utilities (node picker, zoom reset, phase skip)

### Phase 3 (Narrative Integration) ✓
- [x] TimelineManager (node loading, snapshots for reset)
- [x] DirectiveManager (canonical referee: victory / imbalance / canon-progress / defeat)
- [x] TriggerEvaluator (battle events → VN sequences)
- [x] VNBridge (decoupled link to narrative layer)
- [x] TurnManager (round/phase orchestration, events)
- [x] AIController (Kaurava turn automation)
- [x] Game state persistence (dharma meter, consumed astras, vow tracking)
- [x] Map spawner (dynamic unit deployment from timeline)
- [x] Headless smoke test (plain Node, no browser)

---

## Contracts & Roles

Full hand-off rules between roles are in **[CONTRACTS.md](CONTRACTS.md)**.

### Role 1 (Tactical Engine — **YOU**)
Owns: `src/core/`, `src/systems/`, `src/ai/`, `src/data/`, `src/entities/`, `src/handlers/`
- Receives: `NodeBundle` from TimelineManager
- Emits: `'yuganta:node-started'`, `'trigger:fire-vn'`, directive verdicts
- **Never touches:** `VNScene`, role 2 UI rendering, dialogue nodes

### Role 2 (Frontend / UI Engineer)
Owns: `src/ui/`, DOM overlays, `VNScene`
- Receives: `'vn:request'` event with sequence; must call `vnBridge.complete(result)` when done
- Returns: `result` with player choices, which Role 1 uses to apply dharma impacts
- **Never touches:** `TacticalScene`, grid rendering, turn logic

### Role 3 (Level / Systems Designer)
Owns: `public/data/maps/`
- Creates 10×10 terrain grids for each battle
- Designs unit spawn layouts (who starts where)
- Balances unit stats per map (role 1 read-only)

### Role 4 (Itihāsa Lore Lead & Narrative Designer)
Owns: `public/data/parvas/`, `public/data/global/`
- Defines canonical directives (victory conditions, canon violations)
- Writes battle triggers (narrative tripwires)
- Authors dialogue sequences (Role 2 renders)
- Manages trait definitions, astras, vows

---

## Tests

Run the headless smoke test (no browser):
```bash
npm run test:scene
```

This spawns a battle in plain Node, runs both phases, checks directive verdicts, and confirms the timeline can reset on defeat.

---

## Common Tasks

### Add a New Map
1. Create `public/data/maps/map_<name>.json` with a 10×10 terrain grid
2. Reference `map_<name>` in a node's `timeline.json`
3. Role 3 defines spawn layout; Role 1 loads and renders

### Add a New Trait
1. Add entry to `public/data/lore.json` with `trait_id`, `trait_name`, `custom_script_handler`
2. Add handler function to `src/handlers/TraitHandlers.js`
3. Reference the `trait_id` in character definitions

### Add a New Battle Trigger
1. Add entry to a Parva's `directives.json` under `triggers[]`
2. Set `condition_type` (UNIT_HP_BELOW_PERCENT, UNIT_DEATH, TURN_COUNT_EQUAL, etc.)
3. Set `linked_sequence_id` (must exist in narratives)

### Retry a Battle on Defeat
TimelineManager automatically saves a snapshot when a node loads. On `DEFEAT` or `DHARMA_IMBALANCE`:
1. Directive verdict fires
2. TacticalScene calls `timeline.resetNode()`
3. GameState is restored from snapshot
4. Scene reloads with same bundle

---

## Debugging

### Console
- `[BootScene]` — data loading, registry build
- `[TimelineManager]` — node loading, warnings
- `[TacticalScene]` — battle init, phases
- `[TurnManager]` — phase/round events
- `[DirectiveManager]` — directive verdicts
- `[CombatResolver]` — damage pipeline (every step logged)
- `[AIController]` — Kaurava turn automation

### Dev Utilities
- **Node picker** (top-left dropdown) — jump to any timeline node
- **Console logs** → detailed damage, trait effects, directive status
- **?node=<id>** query param → start at specific battle

---

## Performance

- **GridSystem** uses Graphics (single draw path for all terrain, not per-tile GameObjects)
- **UnitManager** uses O(1) spatial index (hash map: `"x,y" → unit`)
- **CombatResolver** computes damage once per attack
- **BattleGrid** pathfinding is lazy-evaluated (only computed when unit moves)

For a 10×10 grid with 20–30 units, browser performance is smooth at 60 FPS.

---

## Known Limitations & Future Work

- **VN layer** awaits Role 2 integration (debug overlay shows raw JSON for now)
- **Sound** not yet integrated (audio shlokas defined in `aesthetics.json`)
- **Animations** are minimal (tween on-damage only; no move/attack animations yet)
- **Mobile** — grid rendering works, but UI menu may need touch-friendly rework

---

## Attribution

**Yuganta** is built by a four-role team. This engine (Role 1) is the tactical layer.
For role hand-offs, see **[CONTRACTS.md](CONTRACTS.md)** and **[BATON_PASS.md](BATON_PASS.md)**.

---

**Questions?** Check `CONTRACTS.md` for role-specific APIs, or `src/core/normalize.js` for data shape details.
