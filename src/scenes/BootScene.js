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

import Phaser from 'phaser';
import manifest from 'virtual:yuganta-manifest';
import { parseHandlerString } from '../handlers/TraitHandlers.js';
import { GameState } from '../core/GameState.js';
import { TimelineManager } from '../core/TimelineManager.js';
import { VNBridge } from '../core/VNBridge.js';
import { DebugVNOverlay } from '../ui/DebugVNOverlay.js';
import { mountSanjayaScrubber } from '../ui/SanjayaScrubber.js';

// Node loaded at start-up when the URL has no ?node=<node_id>
const DEFAULT_DEV_NODE = 'day-1-kuru-kshetra';

const fetchJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
};

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
        this.load.json('formationsData', 'data/maps/formations.json');
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
        const formationsData = this.cache.json.get('formationsData') || [];

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
            const broken = { traits: [], astras: [], vows: [] };
            // Resolve trait references: ["iccha-mrityu"] → [{ trait_id: "iccha-mrityu", ...full object }]
            const resolvedTraits = char.traits
                .map(traitId => {
                    const trait = traitMap.get(traitId);
                    if (!trait) {
                        broken.traits.push(traitId);
                    }
                    return trait;
                })
                .filter(t => t !== undefined);  // Remove any failed lookups

            // Resolve astra references
            const resolvedAstras = char.astras
                .map(astraId => {
                    const astra = astraMap.get(astraId);
                    if (!astra) {
                        broken.astras.push(astraId);
                    }
                    return astra;
                })
                .filter(a => a !== undefined);

            // Resolve vow references
            const resolvedVows = char.vows
                .map(vowId => {
                    const vow = vowMap.get(vowId);
                    if (!vow) {
                        broken.vows.push(vowId);
                    }
                    return vow;
                })
                .filter(v => v !== undefined);

            // One consolidated warning per character listing every broken reference
            const brokenParts = Object.entries(broken).filter(([, ids]) => ids.length)
                .map(([k, ids]) => `${k}: ${ids.join(', ')}`);
            if (brokenParts.length) {
                console.warn(`[BootScene] Character "${char.character_id}" has unresolved references → ${brokenParts.join(' | ')}`);
            }

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

        // Build formations registry (formation_id → formation object)
        const formationsMap = new Map();
        formationsData.forEach(formation => {
            formationsMap.set(formation.formation_id, formation);
        });
        this.registry.set('formationsMap', formationsMap);
        console.log(`[BootScene] Registered ${formationsMap.size} formations.`);

        // ----------------------------------------------------------
        // STEP 7: Global game state (owner of dharma & snapshots)
        // ----------------------------------------------------------
        // Same registry key and field names as before, so CombatResolver works
        // unchanged — but dharma is now clamped, emits events, and can be
        // snapshotted/restored by TimelineManager.
        // ----------------------------------------------------------
        const gameState = new GameState();
        this.registry.set('gameState', gameState);

        // ----------------------------------------------------------
        // STEP 8: Services shared by every scene (decoupled via registry)
        //   timeline — loads timeline nodes, owns the reset snapshot
        //   vnBridge — the single tactical <-> narrative handshake
        // ----------------------------------------------------------
        const timeline = new TimelineManager({ manifest, fetchJson, gameState, baseUrl: 'data' });
        const vnBridge = new VNBridge({ gameState, events: this.game.events, fallbackProvider: new DebugVNOverlay() });
        this.registry.set('timeline', timeline);
        this.registry.set('vnBridge', vnBridge);

        console.log(`[BootScene] Timeline ready: ${manifest.parvas.length} parvas, ` +
            `${manifest.parvas.reduce((n, p) => n + p.nodes.length, 0)} nodes, ${manifest.maps.length} map file(s).`);
        (manifest.problems || []).forEach(p => console.warn('[BootScene] manifest problem:', p));

        mountSanjayaScrubber(this.game, timeline);
        this._launchFirstNode(timeline);
    }

    async _launchFirstNode(timeline) {
        const wanted = new URLSearchParams(window.location.search).get('node');
        const nodeId = [wanted, DEFAULT_DEV_NODE].find(id => id && timeline.findNode(id)) || timeline.getDefaultNodeId();
        try {
            const bundle = await timeline.loadNode(nodeId);
            this.scene.start('TacticalScene', { bundle });
        } catch (err) {
            console.error('[BootScene] Failed to load node — starting demo board.', err);
            this.scene.start('TacticalScene', { bundle: null });
        }
    }
}
