// =============================================================
// BootScene.js — The Data Loading Scene
// =============================================================
// This scene runs ONCE at game start. Its job:
//   1. Load all JSON data files (lore.json, characters.json)
//   2. Build lookup registries (trait map, astra map)
//   3. Store everything in Phaser's global DataManager
//   4. Hand off to TacticalScene
//
// Think of this as the "loading screen" — except instead of
// loading images, we're loading the RULES of the universe.
// =============================================================

import { parseHandlerString } from '../handlers/TraitHandlers.js';

export class BootScene extends Phaser.Scene {

    constructor() {
        // ----------------------------------------------------------
        // Register this scene with Phaser under the key 'BootScene'.
        // This key is used when other scenes want to start/stop this one.
        // ----------------------------------------------------------
        super({ key: 'BootScene' });
    }

    // =============================================================
    // PRELOAD — Load raw data files from disk
    // =============================================================
    // Phaser's loader handles fetching files from the server.
    // this.load.json() fetches a JSON file and parses it automatically.
    // The first argument is a KEY we'll use to retrieve it later.
    // The second argument is the file path relative to the project root.
    // =============================================================

    preload() {
        console.log('[BootScene] Loading game data...');

        // ----------------------------------------------------------
        // Load the Lore Lead's data files
        // ----------------------------------------------------------
        // These paths are relative to the /public folder (Vite convention)
        // OR relative to the project root if the files are accessible.
        //
        // Since our data/ folder is at the project root, we need to
        // make it accessible to Vite. We do this by placing the JSON
        // files in public/data/ OR by importing them directly.
        //
        // For simplicity, we'll copy the relevant JSONs to public/data/.
        // In production, you'd configure Vite to serve the data/ folder.
        // ----------------------------------------------------------
        this.load.json('loreData', 'data/global/lore.json');
        this.load.json('charData', 'data/global/characters.json');
    }

    // =============================================================
    // CREATE — Process loaded data and build registries
    // =============================================================

    create() {
        console.log('[BootScene] Processing game data...');

        // ----------------------------------------------------------
        // STEP 1: Retrieve loaded JSON from Phaser's cache
        // ----------------------------------------------------------
        const loreData = this.cache.json.get('loreData');
        const charData = this.cache.json.get('charData');

        // Validate that data loaded successfully
        if (!loreData || !charData) {
            console.error('[BootScene] CRITICAL: Failed to load game data!');
            console.error('  loreData:', loreData ? 'OK' : 'MISSING');
            console.error('  charData:', charData ? 'OK' : 'MISSING');
            return;
        }

        // ----------------------------------------------------------
        // STEP 2: Build the Trait Registry (trait_id → trait object)
        // ----------------------------------------------------------
        // Converts the traits array into a Map for O(1) lookups.
        // Before: loreData.traits = [{ trait_id: "iccha-mrityu", ... }, ...]
        // After:  traitMap.get("iccha-mrityu") → { trait_id: "iccha-mrityu", ... }
        // ----------------------------------------------------------
        const traitMap = new Map();
        loreData.traits.forEach(trait => {
            traitMap.set(trait.trait_id, trait);
        });
        console.log(`[BootScene] Registered ${traitMap.size} traits.`);

        // ----------------------------------------------------------
        // STEP 3: Build the Astra Registry (astra_id → astra object)
        // ----------------------------------------------------------
        const astraMap = new Map();
        loreData.astras.forEach(astra => {
            astraMap.set(astra.astra_id, astra);
        });
        console.log(`[BootScene] Registered ${astraMap.size} astras.`);

        // ----------------------------------------------------------
        // STEP 4: Build the Vow/Boon Registry (id → vow object)
        // ----------------------------------------------------------
        const vowMap = new Map();
        loreData.vows_boons.forEach(vow => {
            vowMap.set(vow.id, vow);
        });
        console.log(`[BootScene] Registered ${vowMap.size} vows/boons/curses.`);

        // ----------------------------------------------------------
        // STEP 5: Build the Character Registry with resolved references
        // ----------------------------------------------------------
        // For each character, we resolve their trait IDs into full
        // trait objects. This means TacticalScene doesn't need to
        // do any lookups — the data is pre-joined.
        //
        // This is like doing a SQL JOIN ahead of time.
        // ----------------------------------------------------------
        const characterMap = new Map();

        charData.characters.forEach(char => {
            // Resolve trait references: ["iccha-mrityu"] → [{ trait_id: "iccha-mrityu", ...full object }]
            const resolvedTraits = char.traits
                .map(traitId => {
                    const trait = traitMap.get(traitId);
                    if (!trait) {
                        console.warn(`[BootScene] Character "${char.character_id}" references unknown trait "${traitId}"`);
                    }
                    return trait;
                })
                .filter(t => t !== undefined);  // Remove any failed lookups

            // Resolve astra references
            const resolvedAstras = char.astras
                .map(astraId => {
                    const astra = astraMap.get(astraId);
                    if (!astra) {
                        console.warn(`[BootScene] Character "${char.character_id}" references unknown astra "${astraId}"`);
                    }
                    return astra;
                })
                .filter(a => a !== undefined);

            // Resolve vow references
            const resolvedVows = char.vows
                .map(vowId => {
                    const vow = vowMap.get(vowId);
                    if (!vow) {
                        console.warn(`[BootScene] Character "${char.character_id}" references unknown vow "${vowId}"`);
                    }
                    return vow;
                })
                .filter(v => v !== undefined);

            // Determine if this character is a combatant
            const isNonCombatant = resolvedTraits.some(t =>
                t.custom_script_handler === 'NonCombatant()' ||
                t.custom_script_handler === 'NarratorVision()' ||
                t.custom_script_handler === 'WisdomCounsel()'
            );

            // Store the fully resolved character
            characterMap.set(char.character_id, {
                ...char,
                resolvedTraits,
                resolvedAstras,
                resolvedVows,
                isCombatant: !isNonCombatant
            });
        });

        console.log(`[BootScene] Registered ${characterMap.size} characters.`);

        // Log combatant status for verification
        characterMap.forEach((char, id) => {
            const status = char.isCombatant ? '⚔️ COMBATANT' : '📜 NON-COMBAT';
            console.log(`  ${status} ${char.canonical_name} [${char.resolvedTraits.map(t => t.trait_id).join(', ')}]`);
        });

        // ----------------------------------------------------------
        // STEP 6: Store everything in Phaser's global DataManager
        // ----------------------------------------------------------
        // Phaser.registry is a global key-value store accessible
        // from ANY scene. TacticalScene will read these values
        // without needing a direct reference to BootScene.
        //
        // This is the "decoupled state" from the architecture diagram.
        // No scene depends on another scene's internal variables.
        // ----------------------------------------------------------
        this.registry.set('traitMap', traitMap);
        this.registry.set('astraMap', astraMap);
        this.registry.set('vowMap', vowMap);
        this.registry.set('characterMap', characterMap);
        this.registry.set('loreData', loreData);

        // ----------------------------------------------------------
        // STEP 7: Initialize global game state
        // ----------------------------------------------------------
        this.registry.set('gameState', {
            dharmaMeter: 100,          // Starts at full dharma
            currentParva: 1,           // Starting at Adi Parva
            currentWarDay: 0,          // Pre-war (no battle day yet)
            isNight: false,            // Day/night cycle for Ghatotkacha
            consumedAstras: new Set(), // Global tracking of one-time astras
            vowStates: {}              // Tracks fulfilled/broken vows
        });

        console.log('[BootScene] All data loaded and registries built.');
        console.log('[BootScene] Starting TacticalScene...');

        // ----------------------------------------------------------
        // STEP 8: Launch TacticalScene
        // ----------------------------------------------------------
        // this.scene.start() stops BootScene and starts TacticalScene.
        // BootScene's preloaded data stays in the cache.
        // The registries stay in this.registry (global).
        // ----------------------------------------------------------
        this.scene.start('TacticalScene');
    }
}