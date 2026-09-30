// =============================================================
// UnitManager.js — Army & Roster Instantiation System
// =============================================================
// This system decouples unit creation from the TacticalScene.
// 
// RESPONSIBILITIES:
//   1. Look up character data from the global registry (characters.json)
//   2. Instantiate the correct OOP class (Maharathi vs base Unit)
//   3. Pass the unit to the GridSystem for spatial placement
//   4. (Future) Spawn generic Chaturanga battalions
//   5. (Future) Handle army loading from a timeline node's manifest
// =============================================================

import { Unit, Maharathi } from '../entities/Unit.js';
import { deriveWeaponType } from '../data/UnitClassConfig.js';

export class UnitManager {

    constructor(scene, gridSystem) {
        this.scene = scene;
        this.grid = gridSystem;

        // Retrieve the pre-parsed JSON data from the BootScene
        this.characterMap = this.scene.registry.get('characterMap');
    }

    // =============================================================
    // SPAWN NAMED CHARACTER (MAHARATHI / HERO)
    // =============================================================
    /**
     * Spawns a specific named character from characters.json onto the grid.
     * 
     * @param {string} characterId - The ID from characters.json (e.g., 'arjuna')
     * @param {number} gridX - X coordinate on the grid
     * @param {number} gridY - Y coordinate on the grid
     * @param {string} overrideFaction - Optional: force them to a specific side (for defections/training)
     * @returns {Maharathi|null} The created unit, or null if failed.
     */
    spawnCharacter(characterId, gridX, gridY, overrideFaction = null) {
        // 1. Look up the character in the central data registry
        const charData = this.characterMap.get(characterId);

        if (!charData) {
            console.error(`[UnitManager] Failed to spawn: Character ID "${characterId}" not found in registry.`);
            return null;
        }

        // 2. Enforce Non-Combatant Rule
        if (!charData.isCombatant) {
            console.warn(`[UnitManager] Blocked spawn: ${charData.canonical_name} is a non-combatant (e.g., Dhritarashtra, Sanjaya).`);
            return null;
        }

        // 3. Determine Faction and Weapon Type
        const faction = overrideFaction || charData.default_faction;
        const weaponType = deriveWeaponType(charData.base_sprite_key);

        // 4. Construct the Maharathi OOP Object
        // This attaches all the resolved traits, astras, and base stats
        // FIX: appended a random suffix alongside Date.now() — spawning
        // multiple heroes in the same millisecond (e.g. a startup loop
        // placing a whole army) would otherwise produce duplicate unitIds.
        // Matches the fallback pattern Unit.js's own constructor already uses.
        const hero = new Maharathi({
            unitId: `${faction.toLowerCase()}_${characterId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            characterId: charData.character_id,
            name: charData.canonical_name.split(' ')[0], // Use first name for UI brevity
            canonicalName: charData.canonical_name,
            faction: faction,
            spriteKey: charData.base_sprite_key,
            portraitKey: charData.portrait_atlas_key,
            weaponType: weaponType,
            resolvedTraits: charData.resolvedTraits,
            resolvedAstras: charData.resolvedAstras
        });

        // 5. Place on the Grid
        const placedSuccessfully = this.grid.placeUnit(hero, gridX, gridY);

        if (placedSuccessfully) {
            console.log(`[UnitManager] ⚔️ Spawned HERO: ${hero.name} (${faction}) at [${gridX}, ${gridY}]`);
            return hero;
        } else {
            console.error(`[UnitManager] Failed to place ${hero.name} at [${gridX}, ${gridY}]. Tile may be occupied or out of bounds.`);
            return null;
        }
    }

    // =============================================================
    // SPAWN GENERIC BATTALION (CHATURANGA TROOPS)
    // =============================================================
    /**
     * Spawns a generic nameless battalion (Infantry, Cavalry, etc.)
     * This will be heavily used by the Level Designer (Role 3) to fill the map.
     * 
     * @param {string} unitClass - 'RATHA', 'GAJA', 'ASHVA', 'PADATI_MELEE', 'PADATI_RANGED'
     * @param {string} faction - 'PANDAVA' or 'KAURAVA'
     * @param {number} gridX 
     * @param {number} gridY 
     */
    spawnBattalion(unitClass, faction, gridX, gridY) {

        // Construct standard Unit object
        // FIX: same unitId-collision fix as spawnCharacter above.
        const battalion = new Unit({
            unitId: `${faction.toLowerCase()}_${unitClass.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            characterId: null, // Nameless
            unitClass: unitClass,
            faction: faction,
            name: `${faction === 'PANDAVA' ? 'Pandava' : 'Kaurava'} ${unitClass.replace('_', ' ')}`,
            resolvedTraits: [], // Generics usually don't have special traits
            resolvedAstras: []  // Generics cannot use astras
        });

        const placedSuccessfully = this.grid.placeUnit(battalion, gridX, gridY);

        if (placedSuccessfully) {
            console.log(`[UnitManager] 🛡️ Spawned BATTALION: ${battalion.name} at [${gridX}, ${gridY}]`);
            return battalion;
        }
        return null;
    }
}