# Role 1 Directive: Phase 3 - Core Engine & WebGL Shell

**From:** Role 4 (Itihāsa Lore Lead & Narrative Designer)
**Subject:** Phaser.js Lifecycle and Architecture Integration

With Role 4's Narrative JSON finished and Role 3's Tactical Systems in place, the responsibility falls to you, **Role 1 (Lead Engine Programmer)**, to assemble the actual game application. You are the architect of the WebGL context and the overall game lifecycle.

---

## 1. The Phaser Application Shell (`src/index.js` or `main.js`)
You must define the core Phaser 3 configuration.
*   **Resolution & Scaling**: Configure the canvas for modern aspect ratios (e.g., 1920x1080) utilizing Phaser's `ScaleManager`.
*   **Physics Engine**: We are using grid-based tactical movement. You do *not* need Arcade Physics or Matter.js for combat. However, you will need a lightweight grid manager for input tracking and pathfinding.
*   **Scene Registry**: Register all necessary scenes (Boot, Preloader, MainMenu, Tactical, VN).

## 2. Global State Management (`src/State/GameManager.js`)
Role 3 provided `DataStore.js` and `DirectiveManager.js`, but these need a persistent environment to live in across Parvas.
*   **Global Event Bus**: Implement the central event emitter. It must listen for `CANONICAL_DEVIATION` emitted by Role 3, pause `TacticalScene.js`, and launch `VNScene.js` (Role 2's jurisdiction).
*   **The Dharma Meter Score**: Create the global persistent state that tracks the player's integer scores for `Dharma`, `Artha`, `Kama`, and `Moksha` across the entire 18-Parva campaign.

## 3. Scene Lifecycle Architecture

### A. The Preloader (`Scenes/BootScene.js`)
*   Read `timeline.json` and dynamically batch-load the required assets (sprites defined by `base_sprite_key` in `characters.json`, tilesets for the upcoming maps, and BGM tracks).

### B. The Tactical Scene (`Scenes/TacticalScene.js`)
*   Initialize Role 3's `TacticalSceneLoader`.
*   Consume the generated map data block and invoke `this.make.tilemap()` to render the historical battlefield.
*   Instantiate Phaser GameObjects (Sprites, Tweens) for every hydrated unit.
*   Implement A* Pathfinding (or equivalent orthogonal logic) married to Role 3’s terrain `movement_cost`.

### C. The Visual Novel Scene Bridge (`Scenes/VNScene.js` hook)
*   Role 2 will build the HTML/DOM overlay for the Visual Novel, but you must write the Phaser Scene that acts as its manager. 
*   Ensure that when `VNScene` is active, it runs in parallel (or pauses) `TacticalScene`, preventing players from moving units while dialogues are on-screen.

---

## Next Steps / Execution Plan
1.  Initialize the Node/NPM package with `phaser` and a bundler (Webpack or Vite).
2.  Set up the `src/` directory with the Scene boilerplate.
3.  Inject Role 3's `CombatResolver` and `DirectiveManager` into your primary Game Loop.
4.  Stand up the `map_kurukshetra_crater` as the vertical slice test.