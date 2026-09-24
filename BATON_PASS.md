# YUGANTA: Narrative & Lore Baton Pass

**To:** Role 1 (Tactical Engine), Role 2 (Frontend/UI), Role 3 (Level Design)
**From:** Role 4 (Itihāsa Lore Lead & Narrative Designer)
**Date:** September 24, 2026

The structural foundation for the Narrative Data Layer is now **100% complete**. The Mahābhārata’s moral complexities, canonical history, and timeline boundaries have been translated into a strict, engine-agnostic JSON architecture. 

It is now time to bridge this pure data into the Phaser.js engine and DOM UI.

---

## 1. What Has Been Built (The Single Source of Truth)

All narrative logic is housed in the `D:/Projects/Yuganta/data/` directory.

### The JSON Schemas (`/schemas`)
Do not break these. `narrative.schema.json`, `tactical.schema.json`, and `lore.schema.json` use Draft-07 to define exactly how our game state works. If the engine needs new data fields, consult these schemas first.

### Global Lore & Roster (`global/characters.json` & `global/lore.json`)
The complete roster of the Kuru dynasty and allies is defined here, alongside their mechanical ties to the Lore.
* **Role 1 (Engine):** Pay close attention to `lore.json`. The traits are not flavor text. For example, Ashwatthama’s `"chiranjivi"` trait grants `"invulnerable_to_standard_damage": true`. Your combat math *must* read this boolean and return 0 damage unless countered by a specific script handler.

### The 18 Parvas (`/parvas`)
The entire epic is mapped from Parva 1 (Adi Parva) to 18 (Svargarohana). Each folder contains:
* `timeline.json`: The sequence of events.
* `directives.json`: The tactical goals (e.g., `SURVIVE_TURNS`).
* `dialogues/`: Branching VN nodes.

---

## 2. Core Mechanics You Must Implement

### A. The Canonical Loop (For Roles 1 & 3)
In `directives.json`, pay attention to the `fail_on_deviation` boolean.
* **If `true`:** (e.g., The player fails to escort Shikhandi to Bhishma). The tactical scene must halt, throw a "Dharma Imbalance" game-over state, and reset the timeline node. The player cannot rewrite core canon.
* **If `false`:** (e.g., The Sauptika Night Raid where Ashwatthama wipes the player's camp). The player's tactical defeat *progresses the story* canonically to the next node.

### B. The Puruṣārtha Dharma Meter (For Roles 1 & 2)
In the dialogue files (like `sabha-parva/dialogues/disrobing.json` or `drona-parva/dialogues/day-15-drona-lie.json`), every player choice carries integer impacts: `dharma_impact`, `artha_impact`, `kama_impact`, `moksha_impact`.
* **Role 2 (UI):** You need to build a global HUD state (likely reading from `Phaser.Data.DataManager`) taking these variables and adjusting the balance scales in the DOM UI in real-time.
* **Role 1 (Engine):** Some narrative choices include a `tactical_override_event` (e.g., `DRONA_RAMPAGE_CONTINUES`). The engine must intercept this string and dynamically adjust the ensuing tactical combat (e.g., buffing enemy stats).

### C. Tactical Event Interception (For Roles 1 & 2)
In `directives.json`, there is a `triggers` array.
* **Example:** When Bhishma drops below 50% HP, the engine must evaluate `pauses_tactical_scene: true`. 
* **Role 1/Role 2 Bridge:** `TacticalScene.js` must literally run `.pause()` and awaken `VNScene.js` to render the narrative beat over the frozen battlefield.

### D. The Anti-Trope Aesthetics (For Role 2 & Asset Artists)
* Read `data/aesthetics/direction.json`. Modern fantasy tropes are strictly banned. The UI and asset generation must reflect historical Mauryan/Gupta/Kushan armor and color palettes as defined in my exact Hex codes. 
* Audio tracks must dynamically hook into the `trigger_context` for proper Sanskrit Shlokas.

---

## 3. Next Steps / Action Items

### Role 1 (Tactical Engine Programmer)
1. Initialize the Phaser 3 environment (`index.html`, `BootScene.js`, `TacticalScene.js`).
2. Build the basic pathfinding Grid (start with Orthogonal for prototyping).
3. Build the Data Manager that parses `global/lore.json` and properly immunizes units with the `chiranjivi` trait from base damage.

### Role 2 (Frontend / UI Engineer)
1. Build `VNScene.js`: an absolute-positioned DOM layer over the WebGL canvas.
2. Build the JSON narrative parser. Test it by having it successfully read and render `sabha-parva/dialogues/disrobing.json`, displaying the choices and recording the Dharma impact scores.
3. Build Sanjaya's Timeline Scrubber UI that parses the `timeline.json` files and lets the player jump between Parva nodes.

### Role 3 (Level / Systems Designer)
1. Start designing the physical tilemaps that correspond to the `map_id` variables defined in `timeline.json` (e.g., `map_kurukshetra_crater` or `map_sabha_hall`).
2. Calibrate unit archetypes (Infantry vs Cavalry).

Let's build a masterpiece.
- *The Lore Lead*