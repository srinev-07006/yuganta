/**
 * TacticalSceneLoader.js
 * Parses map JSON files and produces data ready for Phaser 3's Tilemaps system.
 *
 * Role 1 Integration Notes:
 * - This loader returns plain data objects, not Phaser scene instances.
 * - After load(), Role 1 should:
 *   1. Create a Tilemap: scene.make.tilemap({ tileData: mapData.grid })
 *   2. Add tilesets via mapData.tileset_asset_key
 *   3. Create Sprites for each unit at spawn_tile coordinates
 */

const fs = require('fs');
const path = require('path');

class TacticalSceneLoader {
  constructor(dataStore) {
    this.dataStore = dataStore;
  }

  /**
   * Load and process a map definition
   * @param {String} mapId The map identifier (e.g., 'map_kurukshetra_center')
   * @param {String} dataDir Path to the data root (default: ../data)
   * @returns {Object} Processed map data ready for Phaser scene instantiation
   */
  load(mapId, dataDir = null) {
    if (!dataDir) {
      dataDir = path ? path.join(__dirname, '../data') : '../data';
    }

    const mapPath = require('path').join(dataDir, 'maps', `${mapId}.json`);

    if (!require('fs').existsSync(mapPath)) {
      throw new Error(`Map file not found: ${mapPath}`);
    }

    const mapData = require('fs').readFileSync(mapPath, 'utf8');
    const parsed = JSON.parse(mapData);

    // VN-only maps require no grid processing
    if (parsed.scene_type === 'VN_ONLY' || parsed.grid_width === null) {
      return {
        type: 'VN_ONLY',
        map_id: parsed.map_id,
        scene_type: parsed.scene_type,
        tileset_asset_key: parsed.tileset_asset_key,
        description: parsed.description,
        vn_backdrop_notes: parsed.vn_backdrop_notes
      };
    }

    // Build the 2D tile grid
    const grid = this._buildGrid(parsed);

    // Resolve spawn zones into concrete tile coordinates
    const spawnZones = this._resolveSpawnZones(parsed);

    // Return structured map data
    return {
      type: 'TACTICAL',
      map_id: parsed.map_id,
      grid_width: parsed.grid_width,
      grid_height: parsed.grid_height,
      tile_size: parsed.tile_size,
      orientation: parsed.orientation,
      tileset_asset_key: parsed.tileset_asset_key,
      grid: grid,
      spawn_zones: spawnZones,
      description: parsed.description,
      formation_ref: parsed.formation_ref || null,
      event_triggers: parsed.special_mechanics || null,
      directive_notes: parsed.directive_notes || null,
      fog_of_war: parsed.fog_of_war || null,
      // Metadata for scene construction
      _raw: parsed
    };
  }

  /**
   * Hydrates raw unit data with full stats from DataStore
   * @param {Object[]} rawUnits Array of unit objects with class_id and optional character_id
   * @param {Object} spawnZones Spawn zone definitions
   * @returns {Object[]} Fully hydrated unit objects ready for sprite instantiation
   */
  hydrateUnits(rawUnits, spawnZones) {
    const units = [];

    for (let i = 0; i < rawUnits.length; i++) {
      const raw = rawUnits[i];
      const classStats = this.dataStore.getUnitClass(raw.class_id);
      const charData = raw.character_id ? this.dataStore.getCharacter(raw.character_id) : null;

      // Find spawn tile for this unit (simplified: use first tile of appropriate zone)
      const spawnTile = this._findSpawnTile(raw, spawnZones);

      const unit = {
        unit_id: `unit_${raw.character_id || raw.class_id}_${i}`,
        class_id: raw.class_id,
        character_id: raw.character_id || null,
        faction: charData ? charData.default_faction : (raw.faction || 'UNKNOWN'),

        // Base stats from class definition
        base_hp: classStats ? classStats.base_hp : 40,
        base_movement: classStats ? classStats.base_movement : 3,
        base_attack_range: classStats ? classStats.base_attack_range : 1,
        base_attack_power: classStats ? classStats.base_attack_power : 10,
        base_defense: classStats ? classStats.base_defense : 8,

        // Combat state (will be updated during combat)
        hp: classStats ? classStats.base_hp : 40,
        movement_left: classStats ? classStats.base_movement : 3,

        // Traits from character data
        traits: charData && Array.isArray(charData.traits) ? charData.traits : [],

        // Astra data (if applicable)
        astras: charData && Array.isArray(charData.astras) ? charData.astras : [],

        // Position
        spawn_tile: spawnTile,
        current_tile: spawnTile ? { x: spawnTile.x, y: spawnTile.y } : null,

        // Sprite keys for Phaser
        sprite_key: charData ? charData.base_sprite_key : `spr_${raw.class_id}`,
        portrait_atlas_key: charData ? charData.portrait_atlas_key : null
      };

      units.push(unit);
    }

    return units;
  }

  _buildGrid(parsed) {
    const width = parsed.grid_width;
    const height = parsed.grid_height;

    // Initialize grid with defaults from terrain types
    const terrainDefaults = {
      PLAIN: { terrain_type: 'PLAIN', movement_cost: 1, defense_multiplier: 1.0, is_impassable: false, special_flag: 'NONE' },
      MUD: { terrain_type: 'MUD', movement_cost: 2, defense_multiplier: 0.8, is_impassable: false, special_flag: 'NONE' },
      RIVER: { terrain_type: 'RIVER', movement_cost: 3, defense_multiplier: 0.5, is_impassable: false, special_flag: 'NONE' },
      ELEVATED: { terrain_type: 'ELEVATED', movement_cost: 2, defense_multiplier: 1.5, is_impassable: false, special_flag: 'NONE' },
      FORTIFIED: { terrain_type: 'FORTIFIED', movement_cost: 1, defense_multiplier: 2.0, is_impassable: false, special_flag: 'NONE' },
      SANCTUARY: { terrain_type: 'SANCTUARY', movement_cost: 1, defense_multiplier: 1.0, is_impassable: false, special_flag: 'NONE' }
    };

    // Initialize empty grid
    const grid = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push({ ...terrainDefaults.PLAIN });
      }
      grid.push(row);
    }

    // Apply region defaults
    if (parsed.tiles) {
      for (const region of parsed.tiles) {
        const defaults = terrainDefaults[region.terrain_type] || terrainDefaults.PLAIN;
        const xMin = region.x_min || 0;
        const xMax = region.x_max !== undefined ? region.x_max : width - 1;
        const yMin = region.y_min || 0;
        const yMax = region.y_max !== undefined ? region.y_max : height - 1;

        for (let y = yMin; y <= yMax; y++) {
          for (let x = xMin; x <= xMax; x++) {
            if (grid[y] && grid[y][x]) {
              grid[y][x] = {
                ...defaults,
                x,
                y,
                region: region.region
              };
            }
          }
        }
      }
    }

    // Apply tile overrides (these take precedence)
    if (parsed.tile_overrides) {
      for (const override of parsed.tile_overrides) {
        const overrideX = override.x !== undefined ? override.x : (override.x_min !== undefined ? override.x_min : 0);
        const overrideY = override.y !== undefined ? override.y : (override.y_min !== undefined ? override.y_min : 0);

        // Single tile override
        if (override.x !== undefined && override.y !== undefined) {
          if (grid[overrideY] && grid[overrideY][overrideX]) {
            grid[overrideY][overrideX] = {
              x: overrideX,
              y: overrideY,
              terrain_type: override.terrain_type,
              movement_cost: override.movement_cost,
              defense_multiplier: override.defense_multiplier,
              is_impassable: override.is_impassable || false,
              special_flag: override.special_flag || 'NONE',
              note: override.note
            };
          }
          continue;
        }

        // Range override
        const xMax = override.x_max !== undefined ? override.x_max : width - 1;
        const yMax = override.y_max !== undefined ? override.y_max : height - 1;
        const defaults = terrainDefaults[override.terrain_type] || terrainDefaults.PLAIN;

        for (let y = overrideY; y <= yMax; y++) {
          for (let x = overrideX; x <= xMax; x++) {
            if (grid[y] && grid[y][x]) {
              grid[y][x] = {
                ...defaults,
                x,
                y,
                override: true,
                special_flag: override.special_flag,
                note: override.note
              };
            }
          }
        }
      }
    }

    return grid;
  }

  _resolveSpawnZones(parsed) {
    const zones = {};
    if (parsed.spawn_zones) {
      for (const [zoneName, zoneDef] of Object.entries(parsed.spawn_zones)) {
        zones[zoneName] = {
          x_min: zoneDef.x_min,
          x_max: zoneDef.x_max,
          y_min: zoneDef.y_min,
          y_max: zoneDef.y_max,
          note: zoneDef.note,
          hero: zoneDef.hero || null,
          formation: zoneDef.formation || null
        };
      }
    }
    return zones;
  }

  _findSpawnTile(unit, spawnZones) {
    if (!spawnZones) return { x: 0, y: 0 };

    // Try to match the unit's faction to a spawn zone
    const faction = unit.faction || unit.faction_suggestion || 'UNKNOWN';
    const zoneKey = Object.keys(spawnZones).find(k => k === faction);

    if (zoneKey && spawnZones[zoneKey]) {
      const zone = spawnZones[zoneKey];
      // Return center of zone as spawn point
      const centerX = Math.floor((zone.x_min + zone.x_max) / 2);
      const centerY = Math.floor((zone.y_min + zone.y_max) / 2);
      return { x: centerX, y: centerY };
    }

    // Fallback: use first zone's center
    const firstZone = Object.values(spawnZones)[0];
    if (firstZone) {
      return {
        x: Math.floor((firstZone.x_min + firstZone.x_max) / 2),
        y: Math.floor((firstZone.y_min + firstZone.y_max) / 2)
      };
    }

    return { x: 0, y: 0 };
  }
}

// Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TacticalSceneLoader;
}
