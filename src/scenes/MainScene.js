class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  create() {
    // Start the tactical gameplay scene
    this.scene.start('TacticalScene');
  }
}