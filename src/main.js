// =============================================================
// main.js — Phaser Game Initialization
// =============================================================
// This is the ENTRY POINT of the entire game.
// It creates the Phaser.Game instance, which:
//   1. Creates the <canvas> element inside #game-container
//   2. Initializes the WebGL (or Canvas 2D fallback) renderer
//   3. Registers all game scenes
//   4. Starts the first scene (BootScene)
//   5. Begins the game loop (update/render at ~60 FPS)
//
// Think of this file as turning the ignition key on the engine.
// =============================================================

import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { TacticalScene } from './scenes/TacticalScene.js';

// =============================================================
// GAME CONFIGURATION
// =============================================================
// This object tells Phaser HOW to set up the game.
// Every property here has a specific purpose.
// =============================================================

const config = {

    // ----------------------------------------------------------
    // RENDERER TYPE
    // ----------------------------------------------------------
    // Phaser.AUTO means: "Use WebGL if the browser supports it,
    // otherwise fall back to Canvas 2D."
    // WebGL is GPU-accelerated = much faster for complex scenes.
    // Canvas 2D is CPU-based = works everywhere but slower.
    // For a tactical grid with moderate sprites, either works.
    // ----------------------------------------------------------
    type: Phaser.AUTO,

    // ----------------------------------------------------------
    // PARENT CONTAINER
    // ----------------------------------------------------------
    // Tells Phaser which DOM element to inject the <canvas> into.
    // Must match the id of the div in index.html.
    // ----------------------------------------------------------
    parent: 'game-container',

    // ----------------------------------------------------------
    // RESOLUTION
    // ----------------------------------------------------------
    // The internal resolution of the game world.
    // This is NOT the screen size — it's the coordinate system.
    // A 1280x720 game world means:
    //   - Position (0,0) is the top-left corner
    //   - Position (1280,720) is the bottom-right corner
    //   - Everything is placed within this space
    // If the browser window is larger, Phaser can scale this up.
    // ----------------------------------------------------------
    width: 1280,
    height: 720,

    // ----------------------------------------------------------
    // BACKGROUND COLOR
    // ----------------------------------------------------------
    // The color that shows behind all sprites and tilemaps.
    // This dark blue matches the index.html body background.
    // ----------------------------------------------------------
    backgroundColor: '#1a1a2e',

    // ----------------------------------------------------------
    // SCALE MANAGER
    // ----------------------------------------------------------
    // Controls how the game canvas resizes with the browser window.
    //
    // FIT: Scale the canvas to fit the window while maintaining
    //      the aspect ratio (16:9 in our case).
    //      Black bars appear if the window ratio doesn't match.
    //
    // autoCenter: CENTER_BOTH centers the canvas horizontally
    //             and vertically in the parent container.
    // ----------------------------------------------------------
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },

    // ----------------------------------------------------------
    // SCENE REGISTRY
    // ----------------------------------------------------------
    // All scenes the game knows about, in order of registration.
    // The FIRST scene in the array is the one that starts
    // automatically when the game boots.
    //
    // BootScene: Loads JSON data, builds registries.
    // TacticalScene: The battlefield grid.
    //
    // VNScene will be added here later by Role 2.
    // ----------------------------------------------------------
    scene: [BootScene, TacticalScene]
};

// =============================================================
// CREATE THE GAME
// =============================================================
// This single line does EVERYTHING:
//   - Creates the <canvas> element
//   - Initializes the renderer (WebGL/Canvas)
//   - Registers all scenes
//   - Starts BootScene
//   - Begins the game loop
//
// We store the reference in a variable in case we need to
// access the game instance from outside (for debugging).
// =============================================================

const game = new Phaser.Game(config);