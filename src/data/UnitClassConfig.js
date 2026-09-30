// =============================================================
// UnitClassConfig.js — Chaturanga Unit Class Definitions
// =============================================================
// The four-fold army of ancient India (Chaturanga):
//   1. RATHA — Chariots (elite ranged + mobile)
//   2. GAJA  — War Elephants (heavy assault)
//   3. ASHVA — Cavalry (fast flankers)
//   4. PADATI — Infantry (the backbone, melee + ranged sub-types)
//
// MAHARATHI is a special upgrade applied ON TOP of RATHA.
// A Maharathi is a chariot warrior of legendary skill.
// In our OOP hierarchy: Maharathi extends Ratha extends Unit.
//
// These are BASE stats. Individual characters get modifications
// from their traits (defined in lore.json).
//
// TROOP ABSTRACTION:
// Each unit on the grid represents a battalion, not one soldier.
// HP represents fighting strength of the formation.
// When HP reaches 0, the battalion is "routed" (broken, fled).
// =============================================================

export const UNIT_CLASS_CONFIG = {

    // ----------------------------------------------------------
    // RATHA (Chariot) — Elite Strike Force
    // ----------------------------------------------------------
    // In the Mahābhārata, chariots carry a warrior + charioteer.
    // They are the primary fighting platform of all named heroes.
    // Arjuna + Krishna, Karna + Shalya, Bhishma + his charioteer.
    //
    // Gameplay role: High damage, good range, moderate speed.
    // Weakness: Cannot enter mountains, rivers, or forests easily.
    // ----------------------------------------------------------
    RATHA: {
        name: 'Chariot',
        baseHp: 100,
        baseMovement: 4,          // Tiles per turn
        baseAttackRange: 3,       // Can shoot arrows from 3 tiles away
        baseAttackPower: 25,
        baseDefense: 10,
        attackType: 'ranged',     // Primary attack is bow-based

        // ----------------------------------------------------------
        // FORMATION SIZE
        // ----------------------------------------------------------
        // How many actual chariots this battalion token represents.
        // Used for narrative display: "A squadron of 50 chariots advances."
        // Does NOT affect gameplay math — it's flavor.
        // ----------------------------------------------------------
        formationSize: 50,

        // ----------------------------------------------------------
        // DESCRIPTION
        // ----------------------------------------------------------
        // Shown in the unit info panel when the player clicks a unit.
        // ----------------------------------------------------------
        description: 'Chariot squadron. Excels at ranged combat from a mobile platform. Vulnerable to terrain restrictions.'
    },

    // ----------------------------------------------------------
    // GAJA (War Elephant) — Heavy Assault
    // ----------------------------------------------------------
    // Elephants were terror weapons. They could crush infantry,
    // break fortifications, and cause mass panic.
    // Bhagadatta's elephant Supratika was legendary.
    //
    // Gameplay role: Massive HP, high damage, very slow.
    // Weakness: Cannot enter forests (too large), slow everywhere.
    // Special: Ignores mud traps (too heavy to get stuck).
    // ----------------------------------------------------------
    GAJA: {
        name: 'War Elephant',
        baseHp: 200,              // Double the chariot — elephants are tanks
        baseMovement: 2,          // Very slow
        baseAttackRange: 1,       // Melee only (trunk/tusks/trampling)
        baseAttackPower: 35,      // Highest base damage
        baseDefense: 15,          // Thick hide
        attackType: 'melee',
        formationSize: 20,
        description: 'War elephant corps. Devastating in melee but extremely slow. Cannot enter forests or cross rivers.'
    },

    // ----------------------------------------------------------
    // ASHVA (Cavalry) — Fast Flankers
    // ----------------------------------------------------------
    // The Kamboja and Gandhara kingdoms were famous for cavalry.
    // Horses excelled at flanking, pursuit, and reconnaissance.
    //
    // Gameplay role: High speed, moderate damage, low defense.
    // Weakness: Fragile. Dies quickly if caught in melee by elephants.
    // ----------------------------------------------------------
    ASHVA: {
        name: 'Cavalry',
        baseHp: 60,
        baseMovement: 6,          // Fastest unit type
        baseAttackRange: 1,       // Melee (lance/sword from horseback)
        baseAttackPower: 20,
        baseDefense: 5,           // Light armor
        attackType: 'melee',
        formationSize: 100,
        description: 'Cavalry squadron. Fastest unit on the field. Excellent for flanking but fragile in sustained combat.'
    },

    // ----------------------------------------------------------
    // PADATI_MELEE (Infantry — Swordsmen/Macemen)
    // ----------------------------------------------------------
    // The vast majority of troops were Padati (foot soldiers).
    // Swordsmen and macemen form the front line.
    //
    // Gameplay role: Cheap, moderate stats, can go anywhere infantry can.
    // Strength: Can cross rivers, enter forests without penalty.
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
    // Bow-armed foot soldiers. Less damage than chariot archers
    // but much cheaper and more numerous.
    //
    // Gameplay role: Ranged support behind the melee line.
    // Weakness: Very fragile in close combat.
    // ----------------------------------------------------------
    PADATI_RANGED: {
        name: 'Infantry (Ranged)',
        baseHp: 50,
        baseMovement: 3,
        baseAttackRange: 2,       // Shorter range than chariots
        baseAttackPower: 12,
        baseDefense: 4,           // Almost no armor
        attackType: 'ranged',
        formationSize: 500,
        description: 'Ranged infantry battalion. Provides arrow support from behind the front line. Fragile if engaged in melee.'
    },

    // ----------------------------------------------------------
    // MAHARATHI — Legendary Chariot Warriors
    // ----------------------------------------------------------
    // These are NOT regular Ratha units. They are NAMED HEROES.
    // Arjuna, Karna, Bhishma, Drona — each a one-man army.
    //
    // A Maharathi is defined as a warrior capable of fighting
    // 720,000 soldiers simultaneously (canonical definition).
    //
    // Gameplay role: Extremely powerful single units with traits.
    // They are NOT battalion abstractions — they represent ONE person.
    // Their stats are much higher than regular Ratha.
    // ----------------------------------------------------------
    MAHARATHI: {
        name: 'Maharathi',
        baseHp: 300,              // 3× a regular chariot
        baseMovement: 5,          // Faster than regular chariots
        baseAttackRange: 4,       // Longer range (divine bows)
        baseAttackPower: 40,      // Devastating damage
        baseDefense: 20,          // Battle-hardened
        attackType: 'ranged',
        formationSize: 1,         // They ARE the unit — one warrior
        description: 'A warrior of unmatched prowess. Capable of turning the tide of battle single-handedly.'
    }
};

// =============================================================
// HELPER: Derive unit class from a character's sprite key
// =============================================================
// The Lore Lead embedded unit types in sprite key names:
//   "spr_arjuna_chariot" → MAHARATHI (named hero on chariot)
//   "spr_bhima_mace"     → MAHARATHI (named hero with mace)
//   "spr_nakula_sword"   → MAHARATHI (named hero with sword)
//
// All named characters from characters.json are MAHARATHI class
// because they are all legendary warriors. Generic battalions
// (created by Role 3) will use the regular RATHA/GAJA/ASHVA/PADATI.
//
// We still track their weapon type for combat calculations.
// =============================================================

export function deriveUnitClass(spriteKey, characterId) {

    // Named characters are always Maharathi or special
    // We check for known non-combatant sprites first
    const nonCombatSprites = [
        'spr_dhritarashtra', 'spr_gandhari', 'spr_vyasa',
        'spr_sanjaya', 'spr_vidura', 'spr_kunti'
    ];

    if (nonCombatSprites.includes(spriteKey)) {
        return 'NON_COMBATANT';
    }

    // Ghatotkacha is a special flying unit
    if (spriteKey === 'spr_ghatotkacha') {
        return 'MAHARATHI';   // He's Maharathi-class with special traits
    }

    // All other named characters are Maharathi
    // Their weapon type is embedded in the sprite key
    if (spriteKey.includes('chariot')) {
        return 'MAHARATHI';
    }
    if (spriteKey.includes('mace')) {
        return 'MAHARATHI';
    }
    if (spriteKey.includes('sword')) {
        return 'MAHARATHI';
    }

    // For generic battalion sprites (from Role 3), parse directly
    if (spriteKey.includes('ratha'))  return 'RATHA';
    if (spriteKey.includes('gaja'))   return 'GAJA';
    if (spriteKey.includes('ashva'))  return 'ASHVA';
    if (spriteKey.includes('padati')) return 'PADATI_MELEE';
    if (spriteKey.includes('archer')) return 'PADATI_RANGED';

    // Unknown sprite — default to infantry
    console.warn(`Cannot derive unit class from sprite key "${spriteKey}". Defaulting to PADATI_MELEE.`);
    return 'PADATI_MELEE';
}

// =============================================================
// HELPER: Determine weapon type from sprite key
// =============================================================
// Used to check if an attack is "melee" or "ranged"
// for trait calculations like BonusRangedDamage(1.5).
// =============================================================

export function deriveWeaponType(spriteKey) {
    if (spriteKey.includes('chariot'))      return 'ranged';  // Bow from chariot
    if (spriteKey.includes('mace'))         return 'melee';   // Mace
    if (spriteKey.includes('sword'))        return 'melee';   // Sword
    if (spriteKey.includes('charioteer'))   return 'none';    // Krishna doesn't fight
    return 'melee';  // Default
}