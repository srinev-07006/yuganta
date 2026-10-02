# CONTRACTS — who talks to whom, and in what shape

This file is the single reference for every hand-off between roles. It describes what the code
**does today** (Phase 3), and it replaces the older "scene.pause / `vn_complete`" wording in
`BATON_PASS.md`. If code and this file disagree, the code is wrong or this file is stale. Fix one.

| Role | Owns | Talks to the engine through |
|---|---|---|
| 1 — Tactical Engine | everything in `src/`, `tools/`, `tests/`, `vite.config.js` | (is the engine) |
| 2 — VN / Narrative | the VN player | a **VN provider** given to `VNBridge` (section 3) |
| 3 — Level Design | map files | `public/data/maps/<map_id>.json` (section 4) |
| 4 — Lore | JSON in `public/data/` | field names in section 5 |

Role 1 never writes to `public/data/`. Role 4 never edits `src/`.

---

## 1. Node lifecycle

```
BootScene ─ loads lore/characters, builds registries, creates services ─▶ TimelineManager.loadNode(id)
    ▶ TacticalScene.init({ bundle }) ─▶ battle ─▶ DirectiveManager verdict ─▶ next node / retry
```

**Registry keys** (Phaser `registry`, set by `BootScene`): `traitMap`, `astraMap`, `vowMap`,
`characterMap`, `loreData`, `gameState`, `timeline`, `vnBridge`.

**Starting node:** `?node=<node_id>` in the URL, else `bp-day10-sunset`, else the first TACTICAL node.

### TimelineManager (Role 2's Sanjaya scrubber only needs these)

```
listParvas() · listNodes(parvaIdOrSlug) · findNode(id) · getNextNodeId(id) · getDefaultNodeId()
await loadNode(nodeId, { reload }) → NodeBundle
resetNode()  → restores GameState to the snapshot taken when the node first started
```

- `reload: false` (default, fresh entry) takes a **new** GameState snapshot.
- `reload: true` (retry after defeat / imbalance) **keeps** the original snapshot. Retry is
  `resetNode()` then `loadNode(sameId, { reload: true })`.

```
NodeBundle = {
  node, parva:{id,slug,name}, sceneType:'TACTICAL'|'VN',
  directives:[…], triggers:[…],        // already filtered to this node and normalised
  sequences:{ sequence_id → sequence }, // every dialogue of the parva
  startSequences:[sequence],            // this node's trigger_event === 'NODE_START'
  mapId, map|null, warnings:[string]
}
```

- `VN` nodes: the scene plays `startSequences` in order, then moves to `getNextNodeId()`.
- `TACTICAL` nodes: NODE_START sequences play first, then round 1 begins.
- No map file for `map_id` → the scene uses the built-in 10×10 demo map and a demo spawn
  (Shikhandi + Arjuna chariot vs Bhishma). A warning is logged, nothing crashes.

### GameState (`registry.get('gameState')`)

Fields: `dharmaMeter` (clamped 0–100), `artha`, `kama`, `moksha`, `currentParva`, `currentWarDay`,
`isNight`, `consumedAstras` (Set), `vowStates`.

| Event | Payload |
|---|---|
| `dharma:changed` | `{ value, previous, delta, reason }` |
| `purusharthas:changed` | `{ artha, kama, moksha, deltas, reason }` |
| `state:restored` | full snapshot. **UI must refresh everything on this event**; purusharthas are restored without their own event |

---

## 2. Turns and combat flow

- **Round** = every faction takes one **phase** (PANDAVA, then KAURAVA). "Turn N" in directives and
  triggers means **round N**.
- Per unit, per phase: **one Move** (optional), then **one action** (Attack or Wait). A unit may move
  then attack; it may not move after acting.
- The player phase ends when every Pandava unit has acted, or by the **End Phase** button.
- A stunned unit loses its next action at the start of its phase.
- All damage goes through `CombatResolver.resolveAttack()` and is applied **once, inside it**.
  Callers must not subtract HP again.
- Ordering rule after every attack: triggers and directives are evaluated **before**
  `UnitManager.removeUnit()`, because removal makes `getUnitById` return null.

`TurnManager` events: `round:start`, `phase:start`, `phase:end`, `round:end`, `stopped`.

---

## 3. Tactical ⇄ Narrative (Role 1 ⇄ Role 2)

The **only** coupling is `VNBridge` (`registry.get('vnBridge')`). The tactical scene never
calls `scene.pause()` for narrative. It waits on the bridge, and player input and the AI are
blocked while a sequence is playing.

### What Role 2 supplies: a provider

Register once: `vnBridge.setProvider(provider)`. With none, the built-in `DebugVNOverlay`
plays the raw JSON (delete it when yours ships, and remove its import in `BootScene.js`).

```js
// Style A — promise
provider.play(sequence, ctx) → Promise<Result>

// Style B — event: play() returns nothing; later either
vnBridge.complete(Result)
// or emit 'vn:complete' / 'vn_complete' on game.events   (both spellings work)
```

- `sequence` is one dialogue-sequence JSON object. `ctx` is `{ sequences }`.
- `Result` (every field optional):

```js
{
  choicesMade:    [ /* the full choice OBJECTS the player picked */ ],
  visitedNodeIds: [ /* dialogue_id of every node shown */ ]
}
```

**Return whole choice objects, not ids.** The bridge reads `dharma_impact`, `artha_impact`,
`kama_impact`, `moksha_impact` and `tactical_override_event` from them, and applies the
Purusartha impacts to `GameState` itself. Do **not** apply impacts on your side (they would
count twice). `visitedNodeIds` is what lets node-level `tactical_override_event` values count.

Dev helper: `new VNBridge({ timeoutMs })` continues after N ms if a provider never completes.

### What the bridge emits

`vn:request { sequenceId, sequence }` · `vn:complete { sequenceId, choicesMade, tacticalOverrides, skipped }`

`skipped: true` means the sequence id was not found. The bridge warns and the game continues.

### Tactical override events (from dialogue data)

| Value | Current engine effect (INTERIM, Role 4 to confirm) |
|---|---|
| `MORALE_BOOST` | Pandava units +10 morale |
| `KNOCKOUT_KAURAVAS` | every Kaurava unit is stunned (loses next action) |
| `DRONA_RAMPAGE_CONTINUES` | logged only, no mechanical effect yet |
| `NONE` | ignored |
| anything else | warning, ignored |

### Engine events (scene-level, `scene.events`)

```js
'trigger:fire-vn'     { triggerId, sequenceId, pausesTactical, targetUnitId }
'trigger:fire-system' { triggerId, action, targetUnitId }   // action: 'HEAL_FULL'
```

Global: `game.events.emit('yuganta:node-started', nodeId)` fires at the start of every node
(the scrubber uses it to stay in sync).

`pausesTactical:false` triggers play without blocking input. `SYSTEM_HEAL_FULL` is not a dialogue.
It is a system action (Ashwatthama's Mani heal).

---

## 4. Maps (Role 3 → Role 1)

File: `public/data/maps/<map_id>.json`, where `map_id` equals the timeline node's `map_id`.
The manifest picks new files up automatically (page reloads when a data file changes).

```json
{
  "map_id": "map_kurukshetra_crater",
  "width": 10, "height": 10,
  "terrain": [ ["plains","plains", "..."], "... height rows of width strings" ],
  "spawns": [
    { "character_id": "arjuna", "charioteer_id": "krishna", "faction": "PANDAVA", "x": 2, "y": 3 },
    { "character_id": "bhishma", "faction": "KAURAVA", "x": 7, "y": 6 },
    { "unit_class": "GAJA", "faction": "KAURAVA", "x": 8, "y": 5 }
  ]
}
```

Rules enforced by `MapLoader.parseMap` (errors are readable, and the scene falls back to the demo map):

- `width`/`height` integers ≥ 2; `terrain` has exactly `height` rows of exactly `width` entries.
- Terrain: `plains | forest | mountain | desert | river | lake`.
- Each spawn is inside the grid, has `faction` `PANDAVA` or `KAURAVA`, and has `character_id` **or** `unit_class`.
- `unit_class`: `RATHA | GAJA | ASHVA | PADATI_MELEE | PADATI_RANGED | MAHARATHI`.
- `charioteer_id` requires `character_id` (the warrior). The pair is **one** grid token.
- No two spawns on one tile. Non-combatant characters (Sanjaya, Vyasa, …) cannot be
  spawned as fighters; any character in `characters.json` is valid as a `charioteer_id`.
- **Coordinates are `x` = column, `y` = row, origin top-left.** Grids above ~15×15 need camera
  pan/zoom, which is not built yet.

---

## 5. Data files (Role 4 → Role 1)

Role 4 owns the field names. Role 1 absorbs them in **one file**, `src/core/normalize.js`. A rename
on either side is a one-file fix there.

### Triggers (`directives.json → triggers[]`)

| Data field | Engine field | Notes |
|---|---|---|
| `trigger_id` | `id` | required |
| `condition_type` | `condition` | required, one of the table below |
| `condition_value` | `value` | shape depends on the condition |
| `linked_sequence_id` | `sequence_id` | required. `SYSTEM_HEAL_FULL` = system action |
| `target_unit_id` | `target_unit_id` | a `character_id`; a chariot's charioteer also matches |
| `pauses_tactical_scene` | `pauses_tactical` | default **true** |
| `is_repeatable` | `repeatable` | default **false** |
| `node_id` | `node_id` | optional; if missing it is inferred from the sequence's node |

| `condition_type` | `condition_value` | Evaluated |
|---|---|---|
| `UNIT_HP_BELOW_PERCENT` | percent, e.g. `50` | after every attack (uses ≤) |
| `UNIT_DEATH` | none | after every attack, before removal |
| `UNIT_ENTER_TILE` | `{ "x": 3, "y": 4 }` | after every committed move |
| `TURN_COUNT_EQUAL` | integer round | at round start |
| `TURN_START` | none | every round start (repeatable use) |

`TURN_COUNT_EQUAL` + `"EVERY_TURN"` is still accepted and converted to `TURN_START`, but new data should
use `TURN_START`. Invalid triggers are dropped with a warning naming the reason. Fired state resets on every node load.

### Directives (`directives.json → directives[]`)

`directive_id` and `directive_type` are required (`SURVIVE_TURNS | DEFEAT_UNIT | SACRIFICE | ESCORT | REACH_TILE`).
`fail_on_deviation` defaults to **true** (hard canon → Dharma Imbalance → rewind). Set it to `false` for soft canon
(story advances instead). Destinations may be written `target_tile`, `destination_tile` or `destination`
(and `escort_to_unit_id` or `destination_unit_id`). `deviation_dialogue_id` must be a real `sequence_id`.

**Add `node_id` to every directive and trigger.** Without it the item applies to every node in the parva
(the engine warns).

### Dialogue sequences (`dialogues/*.json`)

`sequence_id`, `node_id`, `trigger_event` (`NODE_START` or `MID_BATTLE`, default `MID_BATTLE`), `nodes[]`.
Every `next_dialogue_id` (node and choice) must point at a `dialogue_id` in the same file.
`speaker_id` must be a `character_id`.

### Battle outcomes

| DirectiveManager event | Scene reaction |
|---|---|
| `directive:all-complete` | banner, then next node |
| `directive:canon-progress` | play `deviation_dialogue_id` (if any), then next node |
| `directive:dharma-imbalance` | play deviation dialogue, `resetNode()`, reload same node |
| `directive:defeat` | `resetNode()`, reload same node |

Other events (informational): `directive:completed`, `directive:failed`.

---

## 6. Known gaps and open decisions

- Tactical override effects are placeholders (section 3).
- No astra button in the player menu. The resolver supports astras (`resolveAttack(a, d, astraId)`).
- Single-use astras are tracked per unit and reset when a node reloads. `GameState.consumedAstras` is unused.
- If the Kaurava side is wiped and no directive resolves the node, the battle keeps running.
- Current data problems for Role 4: sequence ids referenced by triggers that do not exist
  (`seq_night_slaughter`, `seq_brahmashira_standoff`, and any missing `deviation_dialogue_id` such as
  `dev-bhishma-survives`); directives without `node_id`; no map files exist yet.
- Camera pan/zoom, sprite art, sound: not started.
