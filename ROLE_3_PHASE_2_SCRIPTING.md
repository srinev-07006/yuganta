# Role 3 Directive: Phase 2 - Systems Scripting & Logic Implementation

**From:** Role 4 (Itihāsa Lore Lead & Narrative Designer)
**Subject:** Moving from Data Design to Phaser.js Engine Scripting

The data-design phase of Role 3's task is essentially complete. Thank you for generating the `data/maps/*.json` tilemaps and defining the archetypes in `data/global/unit_classes.json`. Your raw data foundation is solid.

However, **there is currently no Javascript codebase to read this data.** To complete your role, you must now implement the active scripting logic (Phase 2) that executes this data within the game engine.

Here is the exact technical roadmap for the rest of Role 3's work:

---

## 1. Tactical Combat Engine (`Systems/CombatResolver.js`)
You need to write the script that handles mathematical exchanges on the grid.
*   **The RPS Engine**: Code the Rock-Paper-Scissors hierarchy: `Infantry` < `Cavalry` < `Elephants` < `Chariots` < `Infantry`. When a skirmish is initiated, read `unit_classes.json` to calculate base damage.
*   **Trait Integration**: You must write logic referencing `/data/global/lore.json`. 
    *   *Requirement:* Ensure units dynamically pull their traits array via `characters.json`.
    *   *Requirement:* Write the specific exception handler for the `"chiranjivi"` trait. If the defending unit possesses this trait, the calculated damage must yield `0` unless a canonical override applies.

## 2. Event & objective Systems (`Systems/DirectiveManager.js`)
You are responsible for writing the loop that parses and monitors `data/parvas/*/directives.json`.
*   **Win/Loss Listeners**: 
    *   Implement an active Turn Counter reader for `directive_type: SURVIVE_TURNS`.
    *   Implement spatial bounding/coordinate listeners for `directive_type: ESCORT_SHIKHANDI` (listen for adjacent tiles to Bhishma).
*   **The Canonical Trigger (Critical)**:
    *   Write the system event hook that fires upon failure of a tactical objective.
    *   It must read the boolean for `fail_on_deviation`. 
    *   If `true`, your script must halt the Phaser scene rendering loop, pause grid tracking, dispatch a `CANONICAL_DEVIATION` event to the global event bus, and pass the linked `dialogue_id` so Role 2's UI can render the timeline rewind.

## 3. Grid Implementation & Instantiation (`Scenes/TacticalScene.js` bridge)
While Role 1 will set up the foundational Phaser Boot and state machine, *you* must implement the level instantiation logic.
*   **Map Parsing**: Write the logic to read your newly created `data/maps/*.json`. Convert your geometric coordinates (like the spiral in `map_chakravyuha.json`) into the actual `Phaser.Tilemaps.Tilemap` object.
*   **Spawn Hydration**: Write the loop that parses the battle triggers in `directives.json` and dynamically instantiates unit sprites at your designated map spawn coordinates.

---

### Sequence of Execution
1.  **Coordinate with Role 1**: Wait for Role 1 to establish the Phaser 3 environment (`index.html`, package bundler, core scene structure).
2.  **State Manager**: Build the JSON Data Loaders to map `unit_classes.json` and `lore.json` to active memory.
3.  **Combat Math**: Build the `CombatResolver.js` class.
4.  **Objective Tracker**: Build the `DirectiveManager.js` class.

**Remember:** Never rewrite canon. Your code must slavishly execute the rules defined in the data layer. Good luck with the scripts!