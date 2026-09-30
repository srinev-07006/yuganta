/**
 * CombatResolver.js
 * Handles mathematical skirmishes on the tactical grid, including:
 * - Rock-Paper-Scissors hierarchy: Infantry < Cavalry < Elephants < Charioteers < Infantry
 * - Base stats resolution via DataStore (unit_classes.json)
 * - Trait integration & exception handling (e.g. chiranjivi immunity) via lore.json
 */

class CombatResolver {
  constructor(dataStore) {
    this.dataStore = dataStore;

    // Rock-Paper-Scissors cycle:
    // INFANTRY < CAVALRY < ELEPHANT_CORPS < CHARIOTEER < INFANTRY
    // Advantage = 1.5x multiplier, Disadvantage = 0.7x multiplier
    this.rpsTable = {
      INFANTRY: {
        CHARIOTEER: 1.5,
        CAVALRY: 0.7,
        ELEPHANT_CORPS: 0.7,
        MAHARATHI: 1.0,
        INFANTRY: 1.0
      },
      CAVALRY: {
        INFANTRY: 1.5,
        ELEPHANT_CORPS: 0.7,
        CHARIOTEER: 0.7,
        MAHARATHI: 0.7,
        CAVALRY: 1.0
      },
      ELEPHANT_CORPS: {
        CAVALRY: 1.5,
        INFANTRY: 1.5,
        CHARIOTEER: 0.7,
        MAHARATHI: 0.7,
        ELEPHANT_CORPS: 1.0
      },
      CHARIOTEER: {
        ELEPHANT_CORPS: 1.5,
        INFANTRY: 0.7,
        CAVALRY: 1.5,
        MAHARATHI: 1.0,
        CHARIOTEER: 1.0
      },
      MAHARATHI: {
        ELEPHANT_CORPS: 1.5,
        CAVALRY: 1.5,
        INFANTRY: 1.5,
        CHARIOTEER: 1.0,
        MAHARATHI: 1.0
      }
    };
  }

  /**
   * Resolves a combat skirmish between an attacker and defender.
   * @param {Object} attacker Unit executing the attack
   * @param {Object} defender Unit receiving the attack
   * @param {Object} context Environmental and situational variables (is_night, attack_type, strike_target, etc.)
   * @returns {Object} Combat result including final damage, statuses, and logs
   */
  resolve(attacker, defender, context = {}) {
    const log = [];
    let blockedByTrait = null;

    // 1. Resolve Character Trait IDs
    const attackerTraits = this._getUnitTraits(attacker);
    const defenderTraits = this._getUnitTraits(defender);

    // 2. Check Defender Immunity (Critical Path for chiranjivi, iccha-mrityu, rudra-possession)
    for (const traitId of defenderTraits) {
      const traitData = this.dataStore.getTrait(traitId);
      if (traitData && traitData.invulnerable_to_standard_damage) {
        // Check for specific canonical bypasses (e.g. Shikhandi presence vs Bhishma)
        if (traitId === 'iccha-mrityu' && context.shikhandi_present) {
          log.push(`[Trait Override] Shikhandi is adjacent! Iccha-Mrityu invulnerability nullified.`);
        } else {
          blockedByTrait = traitId;
          log.push(`[Immunity] Attack completely nullified by trait: ${traitData.trait_name} (${traitId})`);
          return {
            damage: 0,
            counter_damage: 0,
            stunned: false,
            blocked_by: blockedByTrait,
            second_attack: null,
            log
          };
        }
      }
    }

    // 3. Check Specific Trait Exceptions (e.g. Bhishma refusing to attack Shikhandi)
    if (attacker.character_id === 'bhishma' && defenderTraits.includes('bhishma-bane')) {
      log.push(`[Vow/Trait] Bhishma refuses to raise weapons against Shikhandi (bhishma-bane).`);
      return {
        damage: 0,
        counter_damage: 0,
        stunned: false,
        blocked_by: 'bhishma-bane',
        second_attack: null,
        log
      };
    }

    // Check Lower Body Invulnerability (Duryodhana's vajra-thighs)
    if (defenderTraits.includes('vajra-thighs') && context.strike_target === 'lower_body') {
      log.push(`[Immunity] Lower body is invulnerable (vajra-thighs). Damage negated.`);
      return {
        damage: 0,
        counter_damage: 0,
        stunned: false,
        blocked_by: 'vajra-thighs',
        second_attack: null,
        log
      };
    }

    // 4. Calculate Base Damage
    const baseAtk = attacker.base_attack_power || 10;
    const baseDef = defender.base_defense || 5;

    // Effective attack calculation with Disciple Hesitation debuff
    let effectiveAtk = baseAtk;
    if (defenderTraits.includes('acharya') && attacker.faction === 'PANDAVA') {
      effectiveAtk *= 0.7;
      log.push(`[Debuff] Disciple Hesitation! Attacking Guru Drona reduces attack power by 30%.`);
    }

    // Calculate raw damage: Attack - (Defense * 0.5)
    let rawDamage = Math.max(1, effectiveAtk - (baseDef * 0.5));

    // 5. Apply RPS Multiplier
    const rpsMultiplier = this._getRpsMultiplier(attacker.class_id, defender.class_id);
    rawDamage *= rpsMultiplier;
    if (rpsMultiplier > 1.0) log.push(`[Advantage] ${attacker.class_id} vs ${defender.class_id} (+50% damage)`);
    if (rpsMultiplier < 1.0) log.push(`[Disadvantage] ${attacker.class_id} vs ${defender.class_id} (-30% damage)`);

    // 6. Apply Attacker Trait Modifiers
    for (const traitId of attackerTraits) {
      const traitData = this.dataStore.getTrait(traitId);
      if (!traitData) continue;

      // Bonus Ranged Damage (vijaya-wielder)
      if (traitId === 'vijaya-wielder' && context.attack_type === 'ranged') {
        rawDamage *= 1.5;
        log.push(`[Trait Bonus] Vijaya Bow boosts ranged damage by 1.5x`);
      }

      // Bonus Melee Damage (vayu-putra)
      if (traitId === 'vayu-putra' && context.attack_type === 'melee') {
        rawDamage *= 2.0;
        log.push(`[Trait Bonus] Son of Vayu doubles melee damage`);
      }

      // Night Combat Bonus (night-fighter)
      if (traitId === 'night-fighter' && context.is_night) {
        rawDamage *= 3.0;
        log.push(`[Trait Bonus] Rakshasa Night Powers grant 3.0x combat damage`);
      }

      // Bonus vs Drona (drona-killer)
      if (traitId === 'drona-killer' && defender.character_id === 'drona') {
        rawDamage *= 5.0;
        log.push(`[Trait Bonus] Fated Slayer of Drona deals 5.0x damage!`);
      }
    }

    const finalDamage = Math.round(rawDamage);

    // 7. Check Dual Attack (sabyasachi)
    let secondAttackResult = null;
    if (attackerTraits.includes('sabyasachi') && !context.is_second_attack) {
      const roll = Math.random();
      if (roll < 0.3) {
        log.push(`[Trait Proc] Sabyasachi! Ambidextrous archer fires an immediate second attack.`);
        secondAttackResult = this.resolve(attacker, defender, { ...context, is_second_attack: true });
      }
    }

    // 8. Defender Counter-Attack & On-Hit Trait Effects
    let counterDamage = 0;
    let isStunned = false;

    // Sword Counter-Attack
    if (defenderTraits.includes('sword-master') && context.attack_type === 'melee') {
      counterDamage = Math.round((defender.base_attack_power || 10) * 0.5);
      log.push(`[Counter] Sword Master counter-attacks for ${counterDamage} damage!`);
    }

    // Mace Stun Chance
    if (attackerTraits.includes('mace-master') && Math.random() < 0.25) {
      isStunned = true;
      log.push(`[Status] Mace strike stuns the target!`);
    }

    return {
      damage: finalDamage,
      counter_damage: counterDamage,
      stunned: isStunned,
      blocked_by: null,
      second_attack: secondAttackResult,
      log
    };
  }

  _getUnitTraits(unit) {
    if (!unit) return [];
    if (Array.isArray(unit.traits) && unit.traits.length > 0) {
      return unit.traits;
    }
    if (unit.character_id) {
      const charData = this.dataStore.getCharacter(unit.character_id);
      if (charData && Array.isArray(charData.traits)) {
        return charData.traits;
      }
    }
    return [];
  }

  _getRpsMultiplier(attackerClass, defenderClass) {
    if (!attackerClass || !defenderClass) return 1.0;
    const atkUpper = attackerClass.toUpperCase();
    const defUpper = defenderClass.toUpperCase();
    if (this.rpsTable[atkUpper] && this.rpsTable[atkUpper][defUpper] !== undefined) {
      return this.rpsTable[atkUpper][defUpper];
    }
    return 1.0;
  }
}

module.exports = CombatResolver;
