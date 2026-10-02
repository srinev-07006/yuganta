// =============================================================
// UnitClassConfig.js — Chaturanga Unit Class Definitions
// =============================================================
// Defines base stats for Chaturanga units (Ratha, Gaja, Ashva, Padati)
// and Maharathi hero units.
//
// Phase 2 notes:
// - Stat field names are LOCKED (baseHp, baseMovement, …).
// - Terrain restrictions live here via getTerrainProfile() so
//   Unit.canTraverseTerrain() and pathfinding share one source of truth.
// =============================================================

export const UNIT_CLASS_CONFIG = {

    // ----------------------------------------------------------
    // RATHA (Chariot) — Elite Strike Force
    // ----------------------------------------------------------
    RATHA: {
        name: 'Chariot',
        baseHp: 100,
        baseMovement: 4,
        baseAttackRange: 3,
        baseAttackPower: 25,
        baseDefense: 10,
        attackType: 'ranged',
        formationSize: 50,
        description: 'Chariot squadron. Excels at ranged combat from a mobile platform. Vulnerable to terrain restrictions.'
    },

    // ----------------------------------------------------------
    // GAJA (War Elephant) — Heavy Assault
    // ----------------------------------------------------------
    GAJA: {
        name: 'War Elephant',
        baseHp: 200,
        baseMovement: 2,
        baseAttackRange: 1,
        baseAttackPower: 35,
        baseDefense: 15,
        attackType: 'melee',
        formationSize: 20,
        description: 'War elephant corps. Devastating in melee but extremely slow. Cannot enter forests or cross rivers.'
    },

    // ----------------------------------------------------------
    // ASHVA (Cavalry) — Fast Flankers
    // ----------------------------------------------------------
    ASHVA: {
        name: 'Cavalry',
        baseHp: 60,
        baseMovement: 6,
        baseAttackRange: 1,
        baseAttackPower: 20,
        baseDefense: 5,
        attackType: 'melee',
        formationSize: 100,
        description: 'Cavalry squadron. Fastest unit on the field. Excellent for flanking but fragile in sustained combat.'
    },

    // ----------------------------------------------------------
    // PADATI_MELEE (Infantry — Swordsmen/Macemen)
    // ----------------------------------------------------------
    PADATI_MELEE: {
        name: 'Infantry (Melee)',
        baseHp: 80,
        baseMovement: 3,
        baseAttackRange: 1,
        baseAttackPower: 15,
        baseDefense: 8,
        attackType: 'melee',
        formationSize: 500,
        description: 'Melee infantry battalion. The backbone of any army. Versatile terrain movement.'
    },

    // ----------------------------------------------------------
    // PADATI_RANGED (Infantry — Archers)
    // ----------------------------------------------------------
    PADATI_RANGED: {
        name: 'Infantry (Ranged)',
        baseHp: 50,
        baseMovement: 3,
        baseAttackRange: 2,
        baseAttackPower: 12,
        baseDefense: 4,
        attackType: 'ranged',
        formationSize: 500,
        description: 'Ranged infantry battalion. Provides arrow support from behind the front line. Fragile if engaged in melee.'
    },

    // ----------------------------------------------------------
    // MAHARATHI — Legendary Chariot/Hero Warriors
    // ----------------------------------------------------------
    MAHARATHI: {
        name: 'Maharathi',
        baseHp: 300,
        baseMovement: 5,
        baseAttackRange: 4,
        baseAttackPower: 40,
        baseDefense: 20,
        attackType: 'ranged',
        formationSize: 1,
        description: 'A warrior of unmatched prowess. Capable of turning the tide of battle single-handedly.'
    },

    // ----------------------------------------------------------
    // TARGET — immobile objective prop (the Swayamvara fish, a banner, a gate).
    // Never moves or attacks; can be placed on impassable tiles (it "hangs" above the pool).
    // Spawned with a `tag` so directives/triggers can name it (target_unit_id).
    // ----------------------------------------------------------
    TARGET: {
        name: 'Target',
        baseHp: 30,
        baseMovement: 0,
        baseAttackRange: 0,
        baseAttackPower: 0,
        baseDefense: 0,
        attackType: 'none',
        formationSize: 1,
        description: 'Objective prop. Does not act. Destroy it to complete the mission.'
    }
};

// =============================================================
// HELPER: Safe stats lookup
// =============================================================
export function getClassStats(unitClass) {
    return UNIT_CLASS_CONFIG[unitClass] || UNIT_CLASS_CONFIG.PADATI_MELEE;
}

// =============================================================
// HELPER: Chaturanga terrain profile (single source of truth)
// =============================================================
// blockedTerrainNames must match TERRAIN_CONFIG[].name values
// ("Mountain", "River", "Forest", "Plains", "Desert", "Lake").
// =============================================================
export function getTerrainProfile(unitClass) {
    switch (unitClass) {
        case 'RATHA':
        case 'MAHARATHI':
            // Chariots / chariot-heroes: blocked by mountains & rivers
            return { blockedTerrainNames: ['Mountain', 'River'] };
        case 'GAJA':
            // Elephants: blocked by forests (and typically rivers)
            return { blockedTerrainNames: ['Forest', 'River'] };
        case 'ASHVA':
        case 'PADATI_MELEE':
        case 'PADATI_RANGED':
        default:
            return { blockedTerrainNames: [] };
    }
}

// =============================================================
// HELPER: Derive unit class from a character's sprite key
// =============================================================
export function deriveUnitClass(spriteKey, characterId) {
    const nonCombatSprites = [
        'spr_dhritarashtra', 'spr_gandhari', 'spr_vyasa',
        'spr_sanjaya', 'spr_vidura', 'spr_kunti'
    ];

    if (nonCombatSprites.includes(spriteKey)) {
        return 'NON_COMBATANT';
    }

    if (spriteKey === 'spr_ghatotkacha') {
        return 'MAHARATHI';
    }

    if (spriteKey && (spriteKey.includes('chariot') || spriteKey.includes('mace') || spriteKey.includes('sword'))) {
        return 'MAHARATHI';
    }

    if (spriteKey && spriteKey.includes('ratha'))  return 'RATHA';
    if (spriteKey && spriteKey.includes('gaja'))   return 'GAJA';
    if (spriteKey && spriteKey.includes('ashva'))  return 'ASHVA';
    if (spriteKey && spriteKey.includes('padati')) return 'PADATI_MELEE';
    if (spriteKey && spriteKey.includes('archer')) return 'PADATI_RANGED';

    // Named heroes without a parseable sprite still default to Maharathi when ID is present
    if (characterId) {
        return 'MAHARATHI';
    }

    console.warn(`Cannot derive unit class from sprite key "${spriteKey}". Defaulting to PADATI_MELEE.`);
    return 'PADATI_MELEE';
}

// =============================================================
// HELPER: Determine weapon type from sprite key
// =============================================================
export function deriveWeaponType(spriteKey) {
    if (!spriteKey) return 'melee';
    if (spriteKey.includes('chariot'))      return 'ranged';
    if (spriteKey.includes('mace'))         return 'melee';
    if (spriteKey.includes('sword'))        return 'melee';
    if (spriteKey.includes('charioteer'))   return 'none';
    if (spriteKey.includes('archer') || spriteKey.includes('bow')) return 'ranged';
    return 'melee';
}