import Phaser from 'phaser';
import GameManager from './State/GameManager.js';
import BootScene from './Scenes/BootScene.js';
import MainScene from './Scenes/MainScene.js';
import TacticalScene from './Scenes/TacticalScene.js';
import fs from 'fs';

// Load directives data from file
const directivesData = JSON.parse(fs.readFileSync('data/parvas/directives.json', 'utf8'));

const config = {
  type: Phaser.AUTO,
  width: 1920,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#111111',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }
    }
  }
};

const game = new Phaser.Game(config);

// Initialize GameManager with directives data
const gameManager = new GameManager(directivesData);
game.registry.set('gameManager', gameManager);

// Add scenes to the game instance
game.scene.add('BootScene', BootScene);
game.scene.add('MainScene', MainScene);
game.scene.add('TacticalScene', TacticalScene);

// Start the Boot lifecycle
game.scene.start('BootScene');