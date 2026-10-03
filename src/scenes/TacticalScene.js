class TacticalScene extends Phaser.Scene {
  constructor(gameManager) {
    super('TacticalScene');
    this.gameManager = gameManager;
  }

  preload() {
    // Load map data (could be dynamic based on Parva)
    this.load.json('map_kurukshetra_center', 'data/parvas/map_kurukshetra_center.json');
  }

  create() {
    // Load map data
    const mapData = this.load.get('map_kurukshetra_center');

    // Use the GameManager's dataStore to hydrate units
    const loader = new TacticalSceneLoader(this.gameManager.dataStore);

    // Build the grid and spawn zones
    const mapDataFull = loader.load('map_kurukshetra_center');

    // Create tilemap
    const map = this.make.tilemap({ tileData: mapDataFull.grid });

    // Add tileset
    const tileset = map.addTilesetImage('tileset_kurukshetra', 'tileset_kurukshetra');

    // Create layers
    const groundLayer = map.createLayer('Ground', tileset);
    groundLayer.setScrollFactor(0);
    groundLayer.setDepth(-10);

    // Hydrate units with full stats from GameManager
    const units = loader.hydrateUnits(mapDataFull.units, mapDataFull.spawnZones);

    // Create sprites for each unit
    units.forEach(unit => {
      const sprite = this.add.sprite(
        unit.spawn_tile.x * mapDataFull.grid_width * mapDataFull.tile_size / 1000,
        unit.spawn_tile.y * mapDataFull.tile_size,
        unit.sprite_key
      );
      // Store unit reference if needed
      this.units.set(unit.unit_id, unit);
    }

    // Set up event listeners for Role 3's engine triggers
    this.events.on('CANONICAL_DEVIATION', this.handleCanonicalDeviation, this);
    this.events.on('PAUSE_TACTICAL_SCENE', () => this.physics.pause());
    this.events.on('RESUME_TACTICAL_SCENE', () => this.physics.resume());
  }

  handleCanonicalDeviation(data) {
    console.log('[TacticalScene] Canonical deviation detected:', data);
    this.isPaused = true;
    this.physics.pause();
    // Trigger Role 2's VNScene to show dialogue
    this.scene.start('VNScene', { dialogueId: data.dialogue_id });
  }

  update() {
    // Game loop logic
    if (!this.isPaused) {
      // Example: advance turn or handle input
      console.log('[TacticalScene] Update - Turn active');
    }
  }
}