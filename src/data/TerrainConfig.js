// =============================================================
// TerrainConfig.js — Data-Driven Terrain Definitions
// =============================================================

export const TERRAIN_CONFIG = {

    plains: {
        name: 'Plains',
        moveCost: 1,
        defenseModifier: 0,
        isPassable: true,
        color: 0x8fbc8f,
        unitOverrides: {},
        attritionPerTurn: 0,
        visibilityModifier: 1.0,
        specialFlag: 'NONE'
    },

    forest: {
        name: 'Forest',
        moveCost: 2,
        defenseModifier: 0.2,     // +20% defense
        isPassable: true,
        color: 0x228b22,

        unitOverrides: {
            ASHVA: { moveCost: 3 },
            GAJA:  { isPassable: false }, // Elephants blocked
            RATHA: { moveCost: 3 }
        },

        attritionPerTurn: 0,
        visibilityModifier: 0.7,  // 30% ranged accuracy penalty
        specialFlag: 'NONE'
    },

    mountain: {
        name: 'Mountain',
        moveCost: 3,
        defenseModifier: 0.4,     // +40% defense
        isPassable: true,
        color: 0x808080,

        unitOverrides: {
            RATHA: { isPassable: false }, // Chariots blocked
            GAJA:  { isPassable: false }  // Elephants blocked
        },

        attritionPerTurn: 5,      // 5% HP attrition/turn
        visibilityModifier: 1.0,
        specialFlag: 'NONE'
    },

    desert: {
        name: 'Desert',
        moveCost: 2,
        defenseModifier: 0,
        isPassable: true,
        color: 0xdeb887,
        unitOverrides: {},
        attritionPerTurn: 3,      // 3% heat attrition/turn
        visibilityModifier: 1.0,
        specialFlag: 'NONE'
    },

    river: {
        name: 'River',
        moveCost: 4,
        defenseModifier: -0.1,    // -10% defense
        isPassable: true,
        color: 0x4169e1,          // FIX: was missing entirely — tiles rendered black (undefined color)

        unitOverrides: {
            RATHA: { isPassable: false }, // Chariots blocked
            GAJA:  { isPassable: false }, // Elephants blocked
            ASHVA: { moveCost: 3 }
        },

        attritionPerTurn: 0,
        visibilityModifier: 1.0,
        specialFlag: 'NONE'
    },

    lake: {
        name: 'Lake',
        moveCost: 99,
        defenseModifier: 0,
        isPassable: false,        // Nobody enters
        color: 0x1e90ff,
        unitOverrides: {},
        attritionPerTurn: 0,
        visibilityModifier: 1.0,
        specialFlag: 'NONE'
    }
};

// =============================================================
// HELPER: Get effective terrain stats for a unit
// =============================================================
export function getTerrainForUnit(terrainType, unitClass, weaponType = 'ranged') {
    const terrain = TERRAIN_CONFIG[terrainType];

    if (!terrain) {
        console.warn(`Unknown terrain type: "${terrainType}". Defaulting to plains.`);
        return { ...TERRAIN_CONFIG.plains };
    }

    const effectiveStats = {
        name: terrain.name,
        moveCost: terrain.moveCost,
        defenseModifier: terrain.defenseModifier,
        isPassable: terrain.isPassable,
        attritionPerTurn: terrain.attritionPerTurn,
        visibilityModifier: terrain.visibilityModifier,
        specialFlag: terrain.specialFlag
    };

    // Map MAHARATHI to underlying Chaturanga vehicle class
    let chaturangaClass = unitClass;
    if (unitClass === 'MAHARATHI') {
        chaturangaClass = (weaponType === 'ranged' || weaponType === 'none') ? 'RATHA' : 'PADATI_MELEE';
    }

    // Apply unit-specific overrides
    if (terrain.unitOverrides && terrain.unitOverrides[chaturangaClass]) {
        const overrides = terrain.unitOverrides[chaturangaClass];
        Object.assign(effectiveStats, overrides);
    }

    return effectiveStats;
}