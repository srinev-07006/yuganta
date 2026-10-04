import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { TacticalScene } from './scenes/TacticalScene.js';

/**
 * Yuganta Engine - Main Entry Point
 * Configures Phaser 3 WebGL/Canvas renderer with responsive viewport scaling.
 */
const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: '#0d0d11',
    pixelArt: false,
    scene: [BootScene, TacticalScene]
};

const game = new Phaser.Game(config);

// Dynamic viewport resize handler
window.addEventListener('resize', () => {
    if (game && game.scale) {
        game.scale.resize(window.innerWidth, window.innerHeight);
    }
});

export default game;