// =============================================================
// TraitHandlers.js — Maps Handler Strings to Functions
// =============================================================
// The Lore Lead defined traits with handler strings like:
//   "custom_script_handler": "CheckShikhandiPresence()"
//   "custom_script_handler": "BonusRangedDamage(1.5)"
//   "custom_script_handler": "NightCombatBonus(3.0)"
//
// This file maps those strings to ACTUAL JavaScript functions
// that the CombatResolver and TurnManager can execute.
//
// HOW IT WORKS:
//   1. Parse the handler string: "BonusRangedDamage(1.5)"
//   2. Extract function name: "BonusRangedDamage"
//   3. Extract parameters: [1.5]
//   4. Look up in registry: TRAIT_HANDLERS["BonusRangedDamage"]
//   5. Call it: handler({ params: [1.5], attacker, defender, grid })
//
// TO ADD A NEW TRAIT:
//   Just add a new entry to the TRAIT_HANDLERS object.
//   No other file needs to change.
// =============================================================


// =============================================================
// HANDLER STRING PARSER
// =============================================================
// Converts "BonusRangedDamage(1.5)" into:
//   { name: "BonusRangedDamage", params: [1.5] }
//
// Handles multiple formats:
//   "CannotBeKilled()"        → { name: "CannotBeKilled", params: [] }
//   "BonusRangedDamage(1.5)"  → { name: "BonusRangedDamage", params: [1.5] }
//   "RudraAuraDamage(50)"     → { name: "RudraAuraDamage", params: [50] }
// =============================================================

export function parseHandlerString(handlerString) {
    // Match: FunctionName(optional, params, here)
    const match = handlerString.match(/^(\w+)\((.*)\)$/);

    if (!match) {
        console.warn(`Cannot parse handler string: "${handlerString}"`);
        return { name: handlerString, params: [] };
    }

    const name = match[1];
    const paramString = match[2].trim();

    // Parse parameters
    let params = [];
    if (paramString.length > 0) {
        params = paramString.split(',').map(p => {
            const trimmed = p.trim();
            // Try to convert to number
            const num = Number(trimmed);
            if (!isNaN(num)) return num;
            // Try boolean
            if (trimmed === 'true') return true;
            if (trimmed === 'false') return false;
            // Otherwise keep as string
            return trimmed;
        });
    }

    return { name, params };
}


// =============================================================
// THE HANDLER REGISTRY
// =============================================================
// Each handler receives a context object:
// {
//   params: [1.5],              ← Parameters from the handler string
//   unit: Unit,                 ← The unit that HAS this trait
//   attacker: Unit | null,      ← The attacking unit (in combat)
//   defender: Unit | null,      ← The defending unit (in combat)
//   grid: GridSystem,           ← The grid (for proximity checks)
//   gameState: Object           ← Global state (turn count, day/night)
// }
//
// Each handler returns a RESULT object whose shape depends on
// the handler category. The CombatResolver knows how to read
// each category's result format.
// =============================================================

export const TRAIT_HANDLERS = {

    // =============================================================
    // CATEGORY 1: INVULNERABILITY HANDLERS
    // =============================================================
    // These return { invulnerable: true/false }
    // If true, the CombatResolver sets damage to 0.
    // =============================================================

    /**
     * Bhishma's Iccha Mrityu — Death by own will.
     * Invulnerable UNLESS Shikhandi is within 2 tiles of the attacker.
     */
    CheckShikhandiPresence: (ctx) => {
        if (!ctx.grid || !ctx.attacker) {
            return { invulnerable: true };  // No combat context = still invulnerable
        }

        // Find Shikhandi on the grid
        const shikhandi = ctx.grid.findUnit('shikhandi');
        if (!shikhandi || !shikhandi.isAlive) {
            return { invulnerable: true };  // Shikhandi not present or dead
        }

        // Check if Shikhandi is within 2 tiles of the attacker
        const distance = ctx.grid.getDistance(
            ctx.attacker.gridX, ctx.attacker.gridY,
            shikhandi.gridX, shikhandi.gridY
        );

        if (distance <= 2) {
            // Shikhandi is nearby — Bhishma lowers his weapons
            return { invulnerable: false, narrative: 'Bhishma sees Shikhandi and lowers his bow.' };
        }

        return { invulnerable: true };
    },

    /**
     * Ashwatthama's Chiranjivi — Truly immortal.
     * Can NEVER be killed by standard combat. Period.
     */
    CannotBeKilled: (_ctx) => {
        return { invulnerable: true };
    },

    // =============================================================
    // CATEGORY 2: TERRAIN HANDLERS
    // =============================================================
    // These return { terrainOverride: { moveCost, ... } }
    // =============================================================

    /**
     * Bhishma — Son of Ganga.
     * River tiles cost 1 movement instead of 4.
     */
    IgnoreRiverTerrain: (_ctx) => {
        return {
            terrainOverride: {
                river: { moveCost: 1, isPassable: true }
            }
        };
    },

    /**
     * Ghatotkacha — Half-Rakshasa, can fly.
     * ALL terrain costs become 1. Even lakes are passable.
     */
    FlyOverTerrain: (_ctx) => {
        return {
            terrainOverride: {
                ALL: { moveCost: 1, isPassable: true }
            }
        };
    },

    // =============================================================
    // CATEGORY 3: COMBAT MULTIPLIER HANDLERS
    // =============================================================
    // These return { damageMultiplier: number }
    // or { extraAttack: boolean }
    // =============================================================

    /**
     * Karna — Wielder of Vijaya Bow.
     * All ranged attacks deal ×1.5 damage.
     */
    BonusRangedDamage: (ctx) => {
        const multiplier = ctx.params[0] || 1.5;
        // Only applies to ranged attacks
        if (ctx.unit && ctx.unit.attackType === 'ranged') {
            return { damageMultiplier: multiplier };
        }
        return { damageMultiplier: 1.0 };
    },

    /**
     * Arjuna — Ambidextrous Archer (Sabyasachi).
     * 30% chance to attack twice.
     */
    DualAttackChance: (ctx) => {
        const chance = ctx.params[0] || 0.3;
        const procs = Math.random() < chance;
        return { extraAttack: procs };
    },

    /**
     * Bhima — Son of Vayu (Wind God).
     * All melee attacks deal ×2.0 damage.
     */
    BonusMeleeDamage: (ctx) => {
        const multiplier = ctx.params[0] || 2.0;
        if (ctx.unit && (ctx.unit.attackType === 'melee' || ctx.unit.weaponType === 'melee')) {
            return { damageMultiplier: multiplier };
        }
        return { damageMultiplier: 1.0 };
    },

    /**
     * Bhima/Duryodhana — Master of the Mace.
     * 25% chance to stun the target for 1 turn.
     */
    MaceStunChance: (ctx) => {
        const chance = ctx.params[0] || 0.25;
        const stuns = Math.random() < chance;
        return { stunTarget: stuns };
    },

    /**
     * Drona — Brahmin Warrior, Astra Expertise.
     * All astra damage multiplied by an additional ×1.5.
     */
    AstraExpertise: (ctx) => {
        const multiplier = ctx.params[0] || 1.5;
        return { astraMultiplier: multiplier };
    },

    /**
     * Ghatotkacha — Rakshasa Night Powers.
     * At night: ×3.0 damage multiplier.
     */
    NightCombatBonus: (ctx) => {
        const multiplier = ctx.params[0] || 3.0;
        if (ctx.gameState && ctx.gameState.isNight) {
            return { damageMultiplier: multiplier };
        }
        return { damageMultiplier: 1.0 };
    },

    /**
     * Dhrishtadyumna — Born specifically to slay Drona.
     * ×5.0 damage against Drona.
     */
    BonusDamageVsDrona: (ctx) => {
        const multiplier = ctx.params[0] || 5.0;
        if (ctx.defender && ctx.defender.characterId === 'drona') {
            return { damageMultiplier: multiplier };
        }
        return { damageMultiplier: 1.0 };
    },

    /**
     * Dhrishtadyumna — Born of fire for Drona's destruction.
     * Ignores DiscipleHesitation when attacking Drona.
     */
    DestinedToSlayDrona: (ctx) => {
        return { ignoresDiscipleHesitation: true };
    },

    /**
     * Nakula — Master Swordsman.
     * Auto-counterattack when hit by melee.
     */
    SwordCounterAttack: (_ctx) => {
        return { counterAttackOnMelee: true };
    },

    // =============================================================
    // CATEGORY 4: UTILITY & SUPPORT HANDLERS
    // =============================================================
    // These return aura effects processed at turn start.
    // =============================================================

    /**
     * Krishna — Divine Charioteer.
     * Boosts the chariot he's paired with by +2 movement.
     */
    BoostChariotMovement: (ctx) => {
        const bonus = ctx.params[0] || 2;
        return { movementBuff: bonus, buffTarget: 'PAIRED_CHARIOT' };
    },

    /**
     * Yudhishthira — Son of Dharma.
     * All allies within 3 tiles gain morale.
     */
    TruthAura: (ctx) => {
        const radius = ctx.params[0] || 3;
        return { aura: 'MORALE_BOOST', radius: radius, value: 10 };
    },

    /**
     * Nakula/Sahadeva — Sons of the Ashvini Kumaras (divine healers).
     * Heal allies in a 2-tile radius each turn.
     */
    HealingAura: (_ctx) => {
        return { aura: 'HEALING', radius: 2, value: 10 };
    },

    /**
     * Satyaki — Vrishni Clan Champion.
     * Gets stat bonus when near Krishna.
     */
    LoyaltyBonusToKrishna: (ctx) => {
        if (!ctx.grid) return { damageMultiplier: 1.0 };

        const krishna = ctx.grid.findUnit('krishna');
        if (!krishna || !krishna.isAlive) return { damageMultiplier: 1.0 };

        const distance = ctx.grid.getDistance(
            ctx.unit.gridX, ctx.unit.gridY,
            krishna.gridX, krishna.gridY
        );

        if (distance <= 3) {
            return { damageMultiplier: 1.3, defenseBuff: 5 };
        }
        return { damageMultiplier: 1.0 };
    },

    /**
     * Sahadeva — Master Astrologer.
     * Reveals enemy movement ranges (fog of war disabled for nearby enemies).
     */
    ForesightAbility: (_ctx) => {
        return { aura: 'REVEAL_ENEMY_RANGE', radius: 4 };
    },

    /**
     * Sanjaya — Vyasa's Gift of Divine Sight.
     * Removes fog of war entirely (narrator sees everything).
     * Non-combatant — only relevant for VN / UI.
     */
    NarratorVision: (_ctx) => {
        return { globalEffect: 'REMOVE_FOG_OF_WAR' };
    },

    // =============================================================
    // CATEGORY 5: DEBUFF & RESTRICTION HANDLERS
    // =============================================================

    /**
     * Krishna — Bearer of Sudarshana Chakra.
     * CANNOT attack. Attack command is disabled.
     */
    DisableAttackCommand: (_ctx) => {
        return { disableAttack: true };
    },

    /**
     * Karna — Supreme Philanthropist.
     * Cannot refuse when "asked" — used in narrative events only.
     */
    CannotRefuseCharity: (_ctx) => {
        return { narrativeOnly: true, effect: 'CANNOT_REFUSE_DONATION' };
    },

    /**
     * Duryodhana — Thighs Hardened by Gandhari's Gaze.
     * Takes 0 damage from all attacks UNLESS the attacker
     * has the 'break-duryodhana-thigh' vow AND uses a mace.
     */
    LowerBodyInvulnerable: (ctx) => {
        if (!ctx.attacker) return { invulnerable: false };

        // Check if attacker is Bhima with a mace
        const isBhimaWithMace = (
            ctx.attacker.characterId === 'bhima' &&
            ctx.attacker.weaponType === 'melee'
        );

        if (isBhimaWithMace) {
            return { invulnerable: false, narrative: 'Bhima strikes at the thighs!' };
        }

        // Against everyone else, thighs are diamond-hard
        // (This doesn't make him fully invulnerable — just reduces damage significantly)
        return { defenseMultiplier: 3.0 };
    },

    /**
     * Drona — Revered Teacher.
     * Pandava units hesitate to attack him: 50% damage reduction.
     * Exception: Dhrishtadyumna (DestinedToSlayDrona ignores this).
     */
    DiscipleHesitation: (ctx) => {
        if (!ctx.attacker) return { damageReduction: 0 };

        // Check if attacker ignores this hesitation
        if (ctx.attacker.hasTrait && ctx.attacker.hasTrait('agni-putra')) {
            return { damageReduction: 0 };  // Dhrishtadyumna doesn't hesitate
        }

        // Check if attacker is a Pandava
        if (ctx.attacker.faction === 'PANDAVA') {
            return { damageReduction: 0.5, narrative: `${ctx.attacker.name} hesitates to strike their Guru.` };
        }

        return { damageReduction: 0 };
    },

    /**
     * Shakuni — Master of Loaded Dice.
     * When on the field, enemy random rolls have a 50% chance of being reversed.
     */
    ManipulateRNG: (_ctx) => {
        return { aura: 'RNG_MANIPULATION', radius: 99, value: 0.5 };
    },

    /**
     * Shakuni — Master of Illusion.
     * Creates false information (future fog of war integration).
     */
    DeceptionAura: (_ctx) => {
        return { aura: 'FALSE_INFO', radius: 5 };
    },

    /**
     * Shikhandi — Destined Nemesis of Bhishma.
     * Bhishma refuses to attack this unit (sees Amba's rebirth).
     */
    BhishmaRefusesToAttack: (_ctx) => {
        return { immuneFrom: 'bhishma' };
    },

    /**
     * Abhimanyu — Knows entry into Chakravyuha.
     * Can enter formation barriers (future formation system).
     */
    CanEnterChakravyuha: (_ctx) => {
        return { ignoresFormationBarriers: true };
    },

    /**
     * Jayadratha — Shiva's Boon.
     * Blocks all Pandavas except Arjuna from passing through.
     */
    BlockAllPandavasExceptArjuna: (ctx) => {
        return {
            blockade: {
                blocksUnits: (unit) => {
                    return unit.faction === 'PANDAVA' && unit.characterId !== 'arjuna';
                },
                radius: 1
            }
        };
    },

    /**
     * Shalya — Supreme Charioteer-King.
     * Demoralizes the warrior he's driving for (Karna).
     * In Karna Parva, Shalya is Karna's reluctant charioteer.
     */
    DebuffAllyMorale: (ctx) => {
        return { aura: 'DEMORALIZE_PAIRED', value: -15 };
    },

    /**
     * Karna — Son of Surya (Sun God).
     * Solar radiance effect (contextual, narrative-driven).
     */
    SolarRadiance: (_ctx) => {
        return { aura: 'SOLAR_RADIANCE', radius: 2, value: 5 };
    },

    /**
     * Ashwatthama — Forehead Gem (Mani).
     * Regenerates HP each turn.
     */
    ManiRegeneration: (_ctx) => {
        return { selfHeal: true, healPercent: 0.1 };
    },

    /**
     * Ashwatthama — Possessed by Rudra (Shiva) during Sauptika night raid.
     * Deals 50 damage per turn to all enemies within 3 tiles.
     * Also invulnerable + ignores terrain (stacked with chiranjivi).
     */
    RudraAuraDamage: (ctx) => {
        const damage = ctx.params[0] || 50;
        return { aura: 'DAMAGE', radius: 3, value: damage };
    },

    // =============================================================
    // CATEGORY 6: NON-COMBATANT HANDLERS
    // =============================================================

    /**
     * Dhritarashtra, Gandhari, Vyasa — Non-combatant.
     * These characters should not be spawned on the tactical grid.
     */
    NonCombatant: (_ctx) => {
        return { nonCombatant: true };
    },

    /**
     * Vidura — Incarnation of Dharma.
     * Advisor only. Appears in VN scenes but not on grid.
     */
    WisdomCounsel: (_ctx) => {
        return { nonCombatant: true, narrativeEffect: 'WISDOM_COUNSEL' };
    },

    /**
     * Draupadi — Born of the Sacred Fire.
     * Immune to fire-based astras.
     */
    FireImmunity: (_ctx) => {
        return { astraImmunity: ['agneyastra'] };
    },

    /**
     * Gandhari — Power of Devotion.
     * Can curse (narrative ability, not tactical).
     */
    CurseAbility: (_ctx) => {
        return { narrativeOnly: true, effect: 'CURSE_ABILITY' };
    }
};


// =============================================================
// HANDLER EXECUTOR
// =============================================================
// This function is the single entry point for executing ANY trait.
// It parses the handler string, looks up the function, and calls it.
//
// Usage:
//   const result = executeHandler("BonusRangedDamage(1.5)", {
//       unit: arjunaUnit,
//       attacker: arjunaUnit,
//       defender: karnaUnit,
//       grid: gridSystem
//   });
//   // result = { damageMultiplier: 1.5 }
// =============================================================

export function executeHandler(handlerString, context) {
    const parsed = parseHandlerString(handlerString);

    const handlerFn = TRAIT_HANDLERS[parsed.name];

    if (!handlerFn) {
        console.warn(`No handler found for: "${parsed.name}". Returning neutral result.`);
        return {};
    }

    // Merge parsed params into the context
    const fullContext = {
        ...context,
        params: parsed.params
    };

    return handlerFn(fullContext);
}