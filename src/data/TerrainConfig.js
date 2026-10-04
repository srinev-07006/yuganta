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
    },

    // =============================================================
    // ARCHITECTURE & SPECIAL TILES  (added for hall / palace / camp maps)
    // -------------------------------------------------------------
    // RULES (enforced by tests/terrain.test.mjs):
    //  1. `name`.toLowerCase() MUST equal the key. Pathfinding, BattleGrid and
    //     CombatResolver look terrain up by lower-cased name, so a mismatch would
    //     silently turn a pillar into plains. Hence one-word names ("Hall", not "Hall Floor").
    //  2. Anything nobody may enter: isPassable:false AND moveCost:99
    //     (the pathfinder rejects cost >= 99; it does not read unitOverrides.isPassable).
    //  3. elevation (px) is drawn by GridSystem; elevation >= 20 renders as a depth-sorted
    //     prop (pillar/wall) so units walk in front of / behind it correctly.
    // =============================================================
    hall: {                       // polished palace / court floor
        name: 'Hall',
        moveCost: 1, defenseModifier: 0, isPassable: true,
        color: 0xd9d0c1, elevation: 2,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    carpet: {                     // royal aisle — same rules as Hall, reads as "the path"
        name: 'Carpet',
        moveCost: 1, defenseModifier: 0, isPassable: true,
        color: 0x9b1b30, elevation: 3,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    dais: {                       // raised platform: steps cost extra, high ground defends
        name: 'Dais',
        moveCost: 2, defenseModifier: 0.25, isPassable: true,
        color: 0xc9a063, elevation: 12,
        unitOverrides: { GAJA: { moveCost: 99, isPassable: false } },
        attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    pillar: {                     // slim column — blocks movement, not a full tile
        name: 'Pillar',
        moveCost: 99, defenseModifier: 0, isPassable: false,
        color: 0xb9ad98, baseColor: 0xd9d0c1, elevation: 36, footprint: 0.42,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'BLOCKER'
    },
    wall: {                       // full block — palace wall / shield-wall formation
        name: 'Wall',
        moveCost: 99, defenseModifier: 0, isPassable: false,
        color: 0x6b5a4a, baseColor: 0x3a2f26, elevation: 30, footprint: 1,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'BLOCKER'
    },
    pool: {                       // ritual pool: nobody wades in, but it can be shot across
        name: 'Pool',
        moveCost: 99, defenseModifier: 0, isPassable: false,
        color: 0x2b7a9b, elevation: -6,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'REFLECTION'
    },
    wax: {                        // lacquer / wax flooring of the Lakshagriha — burns
        name: 'Wax',
        moveCost: 1, defenseModifier: 0, isPassable: true,
        color: 0xe0b36a, elevation: 2,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'FLAMMABLE'
    },
    fire: {                       // flames. Impassable until the engine applies attrition (see attritionPerTurn).
        name: 'Fire',
        moveCost: 99, defenseModifier: 0, isPassable: false,
        color: 0xff5a1f, elevation: 5,
        unitOverrides: {}, attritionPerTurn: 10, visibilityModifier: 1.0, specialFlag: 'BURNING'
    },
    tunnel: {                     // secret passage: narrow, dark, safe from archers' sight
        name: 'Tunnel',
        moveCost: 1, defenseModifier: 0.1, isPassable: true,
        color: 0x4a3b2e, elevation: -4,
        unitOverrides: { GAJA: { moveCost: 99, isPassable: false } },
        attritionPerTurn: 0, visibilityModifier: 0.5, specialFlag: 'HIDDEN'
    },
    tent: {                       // camp tent: cover, but elephants cannot squeeze in
        name: 'Tent',
        moveCost: 1, defenseModifier: 0.25, isPassable: true,
        color: 0xb7a47f, elevation: 8,
        unitOverrides: { GAJA: { moveCost: 99, isPassable: false } },
        attritionPerTurn: 0, visibilityModifier: 0.6, specialFlag: 'COVER'
    },
    ford: {                       // shallow crossing: chariots and elephants CAN cross here
        name: 'Ford',
        moveCost: 2, defenseModifier: -0.05, isPassable: true,
        color: 0x7fb3e0, elevation: -3,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    rubble: {                     // broken ground: crater rims, ruins, aftermath
        name: 'Rubble',
        moveCost: 2, defenseModifier: 0.15, isPassable: true,
        color: 0x9a8f86, elevation: 3,
        unitOverrides: { RATHA: { moveCost: 3 } },
        attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    snow: {                       // Himalayan snow
        name: 'Snow',
        moveCost: 2, defenseModifier: 0, isPassable: true,
        color: 0xe9f1f7, elevation: 3,
        unitOverrides: { RATHA: { moveCost: 3 } },
        attritionPerTurn: 2, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    cloud: {                      // Svarga / Meru: walkable sky
        name: 'Cloud',
        moveCost: 1, defenseModifier: 0, isPassable: true,
        color: 0xf3efe2, elevation: 6,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    abyss: {                      // Naraka / chasm: nobody crosses
        name: 'Abyss',
        moveCost: 99, defenseModifier: 0, isPassable: false,
        color: 0x1b1022, elevation: -14,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'VOID'
    },

    // ---- Added for the region-style battle maps (see src/core/MapConverter.js) ----
    // Numbers are balance defaults, not canon — tune freely.
    hill: {                       // ELEVATED tiles: high ground, slower to climb
        name: 'Hill',
        moveCost: 2, defenseModifier: 0.3, isPassable: true,
        color: 0xa8b56a, elevation: 12,
        unitOverrides: { GAJA: { moveCost: 3 } },
        attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    mud: {                        // MUD tiles: chariots bog down
        name: 'Mud',
        moveCost: 2, defenseModifier: -0.1, isPassable: true,
        color: 0x6b5238, elevation: -2,
        unitOverrides: { RATHA: { moveCost: 3 }, GAJA: { moveCost: 3 } },
        attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    },
    fortified: {                  // FORTIFIED tiles: palisades, shield-lines, camp defenses
        name: 'Fortified',
        moveCost: 1, defenseModifier: 0.5, isPassable: true,
        color: 0x8c7b64, elevation: 6,
        unitOverrides: { GAJA: { moveCost: 99, isPassable: false } },
        attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'COVER'
    },
    sanctuary: {                  // SANCTUARY tiles: sacred ground, plain rules
        name: 'Sanctuary',
        moveCost: 1, defenseModifier: 0, isPassable: true,
        color: 0xe6c86e, elevation: 2,
        unitOverrides: {}, attritionPerTurn: 0, visibilityModifier: 1.0, specialFlag: 'NONE'
    }
};

// Stable key on every entry, so code never has to guess it from the display name.
for (const [k, v] of Object.entries(TERRAIN_CONFIG)) v.key = k;

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