// =============================================================
// Unit.js — The Object-Oriented Unit Hierarchy
// =============================================================
//        Unit (base class)
//        └── Maharathi (Named hero — extends Unit)
//
// These are LOGIC classes, not Phaser sprites.
// TacticalScene binds visuals via unit.gameObject / unit.sprite / unit.label.
// =============================================================

import { UNIT_CLASS_CONFIG, getClassStats, getTerrainProfile } from '../data/UnitClassConfig.js';

// =============================================================
// BASE UNIT CLASS
// =============================================================
export class Unit {

    constructor(config) {
        // ----------------------------------------------------------
        // IDENTITY
        // ----------------------------------------------------------
        this.unitId = config.unitId || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        this.characterId = config.characterId || null;
        this.unitClass = config.unitClass || 'PADATI_MELEE';
        this.faction = config.faction || 'PANDAVA';
        this.name = config.name || 'Unknown Unit';

        // ----------------------------------------------------------
        // STATS — Pulled from UnitClassConfig.js
        // ----------------------------------------------------------
        const classStats = getClassStats(this.unitClass);

        this.maxHp = config.maxHp || classStats.baseHp;
        this.currentHp = (config.currentHp !== undefined) ? config.currentHp : this.maxHp;
        this.movement = config.movement || classStats.baseMovement;
        this.attackRange = config.attackRange || classStats.baseAttackRange;
        this.attackPower = config.attackPower || classStats.baseAttackPower;
        this.defense = config.defense || classStats.baseDefense;
        this.attackType = config.attackType || classStats.attackType;
        this.formationSize = config.formationSize || classStats.formationSize || 1;

        // ----------------------------------------------------------
        // POSITION ON THE GRID
        // ----------------------------------------------------------
        this.gridX = config.gridX || 0;
        this.gridY = config.gridY || 0;

        // ----------------------------------------------------------
        // STATE FLAGS
        // ----------------------------------------------------------
        this.isAlive = true;
        this.hasActedThisTurn = false;
        this.hasMovedThisTurn = false;   // one move per phase (then Attack / Wait)
        this.isStunned = false;
        this.morale = 100;

        // ----------------------------------------------------------
        // TRAIT / ASTRA SYSTEM
        // ----------------------------------------------------------
        this.resolvedTraits = config.resolvedTraits || [];
        this.resolvedAstras = config.resolvedAstras || [];
        this.resolvedVows = config.resolvedVows || [];
        this.activeVows = new Set();           // vow ids switched on from the menu (only ids in data/VowEffects.js do anything)
        this.hesitationTurns = 0;              // >0: this unit's next attack deals reduced damage (Shalya's psychological warfare)
        this.guidedMove = false;               // Krishna's guidance: the next move ignores terrain
        this.consumedAstras = new Set();
        // Charioteer synergies
        this.charioteerSynergies = []; // List of available synergy types

        // ----------------------------------------------------------
        // VISUAL REFERENCES
        // ----------------------------------------------------------
        // gameObject: legacy/general Phaser object handle
        // sprite/label: used by 2.5D iso TacticalScene projection
        // ----------------------------------------------------------
        this.spriteKey = config.spriteKey || null;
        this.gameObject = null;
        this.sprite = null;
        this.label = null;

        // Ordinary units have no sarathi scaling
        this.sarathiBuffScale = config.sarathiBuffScale ?? 0;
    }

    // =============================================================
    // COMPATIBILITY ACCESSORS (Phase 1 name ↔ Phase 2 callers)
    // =============================================================
    // TacticalScene / TriggerEvaluator may read unit.hp or unit.moveRange.
    // Canonical fields remain currentHp / movement.
    // =============================================================
    get hp() { return this.currentHp; }
    set hp(value) {
        this.currentHp = value;
        if (this.currentHp <= 0) {
            this.currentHp = 0;
            this.isAlive = false;
        } else {
            this.isAlive = true;
        }
    }

    get id() { return this.unitId; }

    get moveRange() {
        const bonus = (typeof this.getSarathiMovementBonus === 'function')
            ? this.getSarathiMovementBonus()
            : 0;
        return this.movement + bonus;
    }

    // =============================================================
    // TRAIT QUERIES
    // =============================================================
    hasTrait(traitId) {
        return this.resolvedTraits.some(t => t.trait_id === traitId);
    }

    isInvulnerable() {
        return this.resolvedTraits.some(t => t.invulnerable_to_standard_damage === true);
    }

    ignoresTerrainCost() {
        return this.resolvedTraits.some(t => t.ignores_terrain_cost === true);
    }

    getTraitHandlers() {
        return this.resolvedTraits
            .map(t => t.custom_script_handler)
            .filter(Boolean);
    }

    // =============================================================
    // CHARIOTEER SYNERGY SYSTEM
    // =============================================================

    /**
     * Set available charioteer synergies for this unit
     * Called by CharioteerSynergyManager during initialization
     */
    setCharioteerSynergies(synergies) {
        this.charioteerSynergies = synergies || [];
    }

    /**
     * Get available charioteer synergies for this unit
     * @returns {Array} List of available synergy objects
     */
    getCharioteerSynergies() {
        return this.charioteerSynergies;
    }

    /**
     * Check if unit has a specific charioteer synergy available
     * @param {string} synergyType - Type of synergy to check
     * @returns {boolean} true if available
     */
    hasCharioteerSynergy(synergyType) {
        return this.charioteerSynergies.some(s => s.type === synergyType);
    }

    /**
     * Use a charioteer synergy
     * @param {string} synergyType - Type of synergy to use
     * @returns {boolean} true if synergy was used
     */
    useCharioteerSynergy(synergyType) {
        const index = this.charioteerSynergies.findIndex(s => s.type === synergyType);
        if (index === -1) return false;

        const synergy = this.charioteerSynergies[index];
        if (synergy.usesLeft <= 0) return false;

        // Use the synergy
        synergy.usesLeft--;

        // Remove if no uses left
        if (synergy.usesLeft <= 0) {
            this.charioteerSynergies.splice(index, 1);
        }

        return true;
    }

    // =============================================================
    // TERRAIN (Chaturanga rules)
    // =============================================================
    /**
     * @param {object} terrain - entry from TERRAIN_CONFIG (must have .name)
     * @returns {boolean}
     */
    canTraverseTerrain(terrain) {
        if (!terrain) return false;

        // Trait override (e.g. rakshasa-prince, ganga-putra style flags)
        if (this.ignoresTerrainCost()) {
            return true;
        }

        // A hero fighting on foot (mace / sword) is not bound by chariot terrain rules.
        const profileClass = (this.unitClass === 'MAHARATHI' && this.weaponType === 'melee') ? 'PADATI_MELEE' : this.unitClass;
        const profile = getTerrainProfile(profileClass);
        const terrainName = terrain.name || terrain.id || '';
        if (profile.blockedTerrainNames.includes(terrainName)) {
            return false;
        }

        // Impassable water bodies for everyone unless ignored above
        if (terrainName === 'Lake') {
            return false;
        }

        return true;
    }

    // =============================================================
    // COMBAT METHODS
    // =============================================================
    takeDamage(amount) {
        const actualDamage = Math.max(0, amount);
        this.currentHp -= actualDamage;

        if (this.currentHp <= 0) {
            this.currentHp = 0;
            this.isAlive = false;
            this.isStunned = false; // dead units shouldn't carry stun into resets/replays
        }

        return actualDamage;
    }

    heal(amount) {
        if (!this.isAlive) return 0;
        const before = this.currentHp;
        this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
        return this.currentHp - before;
    }

    /** Used by triggers: UNIT_HP_BELOW_PERCENT */
    getHpPercent() {
        if (this.maxHp <= 0) return 0;
        return this.currentHp / this.maxHp;
    }

    // =============================================================
    // TURN MANAGEMENT
    // =============================================================
    startTurn() {
        this.hasActedThisTurn = false;
        this.hasMovedThisTurn = false;
        this.guidedMove = false;

        if (this.isStunned) {
            this.isStunned = false;
            this.hasActedThisTurn = true;
        }
    }

    /** Commit a move: the unit may still attack or wait, but not move again this phase. */
    endMove() {
        this.hasMovedThisTurn = true;
        this.guidedMove = false;
    }

    endAction() {
        this.hasActedThisTurn = true;
        if (this.hesitationTurns > 0) this.hesitationTurns--;   // the hesitating phase is over
    }

    canAct() {
        return this.isAlive && !this.hasActedThisTurn && !this.isStunned;
    }
}


// =============================================================
// MAHARATHI CLASS — Named Hero Extension
// =============================================================
export class Maharathi extends Unit {

    constructor(config) {
        super({
            ...config,
            unitClass: config.unitClass || 'MAHARATHI'
        });

        // ----------------------------------------------------------
        // HERO-SPECIFIC PROPERTIES
        // ----------------------------------------------------------
        this.canonicalName = config.canonicalName || config.name || 'Unknown Warrior';
        this.portraitKey = config.portraitKey || null;

        // ----------------------------------------------------------
        // WEAPON TYPE
        // ----------------------------------------------------------
        this.weaponType = config.weaponType || 'ranged';

        if (this.weaponType === 'melee') {
            this.attackType = 'melee';
            this.attackRange = config.attackRange || 1;
        }
        if (this.weaponType === 'none') {
            this.attackType = 'none';
            this.attackRange = 0;
            this.attackPower = 0;
        }

        // ----------------------------------------------------------
        // CHARIOT CREW (warrior + optional charioteer = ONE grid unit)
        // ----------------------------------------------------------
        // charioteerTier:
        //   'NONE'     — no driver / not a chariot pair
        //   'ORDINARY' — unnamed sūta — no trait buffs
        //   'HERO'     — Krishna, Shalya, etc. — support traits at SARATHI_BUFF_SCALE
        // ----------------------------------------------------------
        this.crew = {
            warriorId: config.crew?.warriorId || config.characterId || null,
            charioteerId: config.crew?.charioteerId || null,
            charioteerTier: config.crew?.charioteerTier || 'NONE',
            charioteerName: config.crew?.charioteerName || null,
            charioteerTraits: config.crew?.charioteerTraits || []
        };

        // Hero-sarathi support effectiveness (movement, auras, morale buffs)
        // Locked design value: 0.7
        this.sarathiBuffScale = (config.sarathiBuffScale !== undefined)
            ? config.sarathiBuffScale
            : 0.7;
    }

    // =============================================================
    // ASTRA METHODS
    // =============================================================
    canUseAstra(astraId, currentDharma) {
        const astra = this.resolvedAstras.find(a => a.astra_id === astraId);
        if (!astra) {
            return {
                allowed: false,
                reason: `${this.canonicalName} does not know the ${astraId}.`
            };
        }

        if (this.consumedAstras.has(astraId)) {
            return {
                allowed: false,
                reason: `The ${astra.name} has already been expended.`
            };
        }

        if (currentDharma < astra.dharma_cost) {
            return {
                allowed: false,
                reason: `Insufficient Dharma to invoke the ${astra.name}. Required: ${astra.dharma_cost}, Current: ${currentDharma}.`
            };
        }

        if (this.weaponType === 'none') {
            return {
                allowed: false,
                reason: `${this.canonicalName} has vowed not to wield weapons in this war.`
            };
        }

        return { allowed: true, reason: '' };
    }

    useAstra(astraId) {
        const astra = this.resolvedAstras.find(a => a.astra_id === astraId);
        if (!astra) return { multiplier: 1.0, dharmaCost: 0 };

        const singleUseAstras = ['shakti-astra', 'narayanastra'];
        if (singleUseAstras.includes(astraId)) {
            this.consumedAstras.add(astraId);
        }

        return {
            multiplier: astra.damage_multiplier,
            dharmaCost: astra.dharma_cost,
            name: astra.name,
            restrictions: astra.restrictions
        };
    }

    /**
     * All traits that affect this token:
     * warrior at 100%, hero-sarathi support at sarathiBuffScale.
     * Ordinary driver contributes nothing.
     */
    getEffectiveTraitEntries() {
        const entries = this.resolvedTraits.map(t => ({
            trait: t,
            source: 'warrior',
            scale: 1.0
        }));

        if (this.crew.charioteerTier === 'HERO' && this.crew.charioteerTraits?.length) {
            const scale = this.sarathiBuffScale;
            this.crew.charioteerTraits.forEach(t => {
                entries.push({
                    trait: t,
                    source: 'charioteer',
                    scale
                });
            });
        }

        return entries;
    }

    /** Override: true if warrior OR hero charioteer has the trait id */
    hasTrait(traitId) {
        if (super.hasTrait(traitId)) return true;
        if (this.crew.charioteerTier !== 'HERO') return false;
        return (this.crew.charioteerTraits || []).some(t => t.trait_id === traitId);
    }

    getTraitHandlers() {
        return this.getEffectiveTraitEntries()
            .map(e => e.trait.custom_script_handler)
            .filter(Boolean);
    }

    /**
     * Movement bonus from hero sarathi only (e.g. BoostChariotMovement), scaled.
     * Ordinary driver: 0.
     */
    getSarathiMovementBonus() {
        if (this.crew.charioteerTier !== 'HERO') return 0;

        let bonus = 0;
        for (const t of this.crew.charioteerTraits || []) {
            const h = t.custom_script_handler || '';
            if (h.startsWith('BoostChariotMovement')) {
                const m = h.match(/\(([\d.]+)\)/);
                const raw = m ? Number(m[1]) : 2;
                bonus += raw * this.sarathiBuffScale;
            }
        }
        return Math.floor(bonus);
    }

    /** Display name: "Arjuna (Krishna)" vs "Arjuna" */
    getDisplayName() {
        if (this.crew.charioteerTier === 'HERO' && this.crew.charioteerName) {
            return `${this.name} (${this.crew.charioteerName.split(' ')[0]})`;
        }
        if (this.crew.charioteerTier === 'ORDINARY') {
            return `${this.name} [ratha]`;
        }
        return this.name;
    }
}