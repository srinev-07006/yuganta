import Phaser from 'phaser';
import { VNBridge } from '../core/VNBridge.js';
import { DebugVNOverlay } from '../ui/DebugVNOverlay.js';

export class VNScene extends Phaser.Scene {
    constructor() {
        super('VNScene');
    }

    init(data) {
        // data.dialogueId is the id of the dialogue node (e.g., "gita-visada")
        // We map it to the file name (without .json) in the bhishma-parva dialogues directory.
        this.dialogueId = data.dialogueId;
        this.parva = 'bhishma-parva';
        // Mapping from dialogue node id to file name (without .json) for the vertical slice.
        this.dialogueIdToFileName = {
            "gita-visada": "day-1-gita-visada",
            "krishna-rage": "day-9-krishna-rage",
            "day-10-fall": "day-10-fall",
            "day-1-kuru-kshetra": "day-1-kuru-kshetra"
        };
    }

    preload() {
        // We'll load the dialogue file based on the mapping.
        const fileName = this.dialogueIdToFileName[this.dialogueId];
        if (fileName) {
            this.load.json('dialogue', `data/parvas/${this.parva}/dialogues/${fileName}.json`);
        } else {
            // Fallback to day-10-fall if not found.
            this.load.json('dialogue', `data/parvas/${this.parva}/dialogues/day-10-fall.json`);
        }
    }

    create() {
        // Get the game state from the BootScene (assuming it's loaded first).
        const bootScene = this.scene.get('BootScene');
        const gameState = bootScene ? bootScene.gameManager?.dataStore?.gameState : null;
        const events = this.sys.events; // Use the scene's event emitter.

        const vnBridge = new VNBridge({
            gameState: gameState,
            events: events,
            fallbackProvider: new DebugVNOverlay(document),
            timeoutMs: 0
        });

        // Get the loaded dialogue JSON.
        const dialogueJson = this.cache.json.get('dialogue');
        if (!dialogueJson) {
            console.error('[VNScene] Failed to load dialogue JSON.');
            this.scene.stop('VNScene');
            return;
        }

        // Play the dialogue sequence.
        vnBridge.play(dialogueJson).then(result => {
            console.log('[VNScene] Dialogue completed with result:', result);
            // Notify the TacticalScene to resume.
            this.scene.get('TacticalScene')?.events.emit('RESUME_TACTICAL_SCENE');
            // Stop this scene.
            this.scene.stop('VNScene');
        }).catch(err => {
            console.error('[VNScene] Dialogue error:', err);
            this.scene.stop('VNScene');
        });
    }
}