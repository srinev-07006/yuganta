// =============================================================
// UnitManager.js — Army & Roster Instantiation System
// =============================================================
// RESPONSIBILITIES:
//   1. Look up character data from BootScene registry or test catalog
//   2. Instantiate Unit / Maharathi with resolved traits & astras
//   3. Track live roster by unitId (Map) for triggers and death
//   4. Track spatial position by "x,y" key (Map) for O(1) click detection
//   5. Spawn chariot pairs as ONE grid token (warrior + sarathi crew)
// =============================================================

import { Unit, Maharathi } from '../entities/Unit.js';
import { deriveWeaponType, getClassStats } from '../data/UnitClassConfig.js';

/** Trait handlers that must NEVER copy from charioteer → warrior token */
const BLOCKED_CHARIOTEER_TRAIT_HANDLERS = new Set([
    'DisableAttackCommand()',
    'DisableAttackCommand',
    'NonCombatant()',
    'NonCombatant',
    'NarratorVision()',
    'NarratorVision',
    'WisdomCounsel()',
    'WisdomCounsel'
]);

export class UnitManager {

    /**
     * @param {Phaser.Scene} scene
     * @param {object|GridSystem} [gridSystemOrCatalog]
     */
    constructor(scene, gridSystemOrCatalog = null) {
        this.scene = scene;

        // Primary roster: unitId → Unit/Maharathi
        this.units = new Map();

        // FIX 3: Spatial index: "x,y" → Unit
        // O(1) lookup for click detection instead of O(n) linear scan
        this._spatialIndex = new Map();

        this.grid = null;
        this._testCatalog = null;

        if (gridSystemOrCatalog) {
            if (typeof gridSystemOrCatalog.placeUnit === 'function' ||
                typeof gridSystemOrCatalog.isValidTile === 'function') {
                this.grid = gridSystemOrCatalog;
            } else if (typeof gridSystemOrCatalog === 'object') {
                this._testCatalog = gridSystemOrCatalog;
            }
        }

        if (!this.grid && scene.gridSystem) {
            this.grid = scene.gridSystem;
        }

        // Primary data source: BootScene registry Map
        this.characterMap = null;
        if (scene.registry && typeof scene.registry.get === 'function') {
            this.characterMap = scene.registry.get('characterMap') || null;
        }
    }

    // =============================================================
    // INTERNAL HELPERS
    // =============================================================
    _generateUnitId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    _spatialKey(x, y) {
        return `${x},${y}`;
    }

    _spatialSet(unit) {
        this._spatialIndex.set(this._spatialKey(unit.gridX, unit.gridY), unit);
    }

    _spatialClear(x, y) {
        this._spatialIndex.delete(this._spatialKey(x, y));
    }

    _lookupCharacter(characterId) {
        if (this.characterMap && typeof this.characterMap.get === 'function') {
            return this.characterMap.get(characterId) || null;
        }
        if (this._testCatalog && this._testCatalog[characterId]) {
            const c = this._testCatalog[characterId];
            return {
                character_id: c.id || characterId,
                canonical_name: c.name || characterId,
                default_faction: (c.faction || 'PANDAVA').toUpperCase(),
                isCombatant: c.isCombatant !== false,
                base_sprite_key: c.spriteKey || c.base_sprite_key || null,
                portrait_atlas_key: c.portraitKey || null,
                resolvedTraits: c.resolvedTraits || (c.traits || []).map(t =>
                    (typeof t === 'string' ? { trait_id: t } : t)
                ),
                resolvedAstras: c.resolvedAstras || (c.astras || []).map(a =>
                    (typeof a === 'string'
                        ? { astra_id: a, name: a, damage_multiplier: 1, dharma_cost: 0 }
                        : a)
                )
            };
        }
        return null;
    }

    _register(unit) {
        if (!unit || !unit.unitId) return unit;
        this.units.set(unit.unitId, unit);
        this._spatialSet(unit);
        return unit;
    }

    _tryPlaceOnGrid(unit, gridX, gridY) {
        if (this.grid && typeof this.grid.placeUnit === 'function') {
            return this.grid.placeUnit(unit, gridX, gridY);
        }
        // Iso path: TacticalScene owns visuals; set coords directly
        unit.gridX = gridX;
        unit.gridY = gridY;
        return true;
    }

    /**
     * Optional per-character balance knobs in characters.json: "stat_mods": { "hp": 1.2, "attack": 1.1, "defense": 1.0 }.
     * Multiplies the MAHARATHI class stats for that hero only; omitted fields (or no stat_mods) mean ×1.
     * Exists because every hero shares one class block, so canon strength (Arjuna vs a host) cannot be expressed otherwise.
     */
    _statOverrides(charData) {
        const m = charData?.stat_mods;
        if (!m) return {};
        const base = getClassStats('MAHARATHI');
        const out = {};
        if (m.hp) out.maxHp = Math.round(base.baseHp * m.hp);
        if (m.attack) out.attackPower = Math.round(base.baseAttackPower * m.attack);
        if (m.defense) out.defense = Math.round(base.baseDefense * m.defense);
        return out;
    }

    _isHeroSarathi(charData) {
        if (!charData) return false;
        const traits = charData.resolvedTraits || [];
        return traits.some(t =>
            t.trait_id === 'sarathi' || t.trait_id === 'charioteer-master'
        );
    }

    _filterCharioteerTraits(traits) {
        return (traits || []).filter(t => {
            const handler = t.custom_script_handler || '';
            const id = t.trait_id || '';
            if (BLOCKED_CHARIOTEER_TRAIT_HANDLERS.has(handler)) return false;
            if (BLOCKED_CHARIOTEER_TRAIT_HANDLERS.has(id)) return false;
            return true;
        });
    }

    // =============================================================
    // SPAWN NAMED CHARACTER (MAHARATHI / HERO)
    // =============================================================
    spawnCharacter(characterId, gridX, gridY, overrideFaction = null) {
        const charData = this._lookupCharacter(characterId);

        if (!charData) {
            console.error(`[UnitManager] Failed to spawn: "${characterId}" not found in registry.`);
            return null;
        }

        if (charData.isCombatant === false) {
            console.warn(`[UnitManager] Blocked: ${charData.canonical_name} is a non-combatant.`);
            return null;
        }

        const faction = (overrideFaction || charData.default_faction || 'PANDAVA').toUpperCase();
        const weaponType = deriveWeaponType(charData.base_sprite_key);

        const hero = new Maharathi({
            unitId: this._generateUnitId(`${faction.toLowerCase()}_${characterId}`),
            characterId: charData.character_id || characterId,
            name: (charData.canonical_name || characterId).split(' ')[0],
            canonicalName: charData.canonical_name || characterId,
            faction,
            spriteKey: charData.base_sprite_key,
            portraitKey: charData.portrait_atlas_key,
            weaponType,
            resolvedTraits: [...(charData.resolvedTraits || [])],
            resolvedAstras: [...(charData.resolvedAstras || [])],
            resolvedVows: [...(charData.resolvedVows || [])],
            ...this._statOverrides(charData),
            gridX,
            gridY
        });

        const placed = this._tryPlaceOnGrid(hero, gridX, gridY);
        if (!placed) {
            console.error(`[UnitManager] Failed to place ${hero.name} at [${gridX}, ${gridY}].`);
            return null;
        }

        this._register(hero);
        console.log(`[UnitManager] ⚔️ Spawned HERO: ${hero.name} (${faction}) at [${gridX}, ${gridY}]`);
        return hero;
    }

    // =============================================================
    // SPAWN GENERIC BATTALION (CHATURANGA TROOPS)
    // =============================================================
    spawnBattalion(unitClass, faction, gridX, gridY, opts = {}) {
        const normalizedFaction = (faction || 'PANDAVA').toUpperCase();
        const stats = getClassStats(unitClass);

        const battalion = new Unit({
            unitId: this._generateUnitId(`${normalizedFaction.toLowerCase()}_${unitClass.toLowerCase()}`),
            characterId: opts.characterId || null,   // map `tag`: lets directives/triggers target a battalion-class unit
            unitClass,
            faction: normalizedFaction,
            name: opts.name || `${normalizedFaction === 'PANDAVA' ? 'Pandava' : 'Kaurava'} ${String(unitClass).replace('_', ' ')}`,
            maxHp: stats.baseHp,
            movement: stats.baseMovement,
            attackRange: stats.baseAttackRange,
            attackPower: stats.baseAttackPower,
            defense: stats.baseDefense,
            attackType: stats.attackType,
            formationSize: stats.formationSize,
            resolvedTraits: [],
            resolvedAstras: [],
            gridX,
            gridY
        });

        if (unitClass === 'TARGET') battalion.isProp = true;   // never takes a phase action (TurnManager skips props)

        const placed = this._tryPlaceOnGrid(battalion, gridX, gridY);
        if (!placed) return null;

        this._register(battalion);
        console.log(`[UnitManager] 🛡️ Spawned BATTALION: ${battalion.name} at [${gridX}, ${gridY}]`);
        return battalion;
    }

    // =============================================================
    // SPAWN CHARIOT PAIR (ONE grid token)
    // =============================================================
    spawnChariotPair(warriorId, charioteerId, gridX, gridY, opts = {}) {
        const warriorData = this._lookupCharacter(warriorId);
        const charioteerData = this._lookupCharacter(charioteerId);

        if (!warriorData) {
            console.error(`[UnitManager] Chariot pair failed: warrior "${warriorId}" not found.`);
            return null;
        }
        if (!charioteerData) {
            console.error(`[UnitManager] Chariot pair failed: charioteer "${charioteerId}" not found.`);
            return null;
        }

        const faction = (opts.faction || warriorData.default_faction || 'PANDAVA').toUpperCase();
        const weaponType = deriveWeaponType(warriorData.base_sprite_key);
        const isHeroSarathi = this._isHeroSarathi(charioteerData);
        const charioteerTier = isHeroSarathi ? 'HERO' : 'ORDINARY';
        const filteredCharioteerTraits = isHeroSarathi
            ? this._filterCharioteerTraits(charioteerData.resolvedTraits || [])
            : [];

        const displayName = opts.name ||
            `${(warriorData.canonical_name || warriorId).split(' ')[0]} & ${(charioteerData.canonical_name || charioteerId).split(' ')[0]}`;

        const pair = new Maharathi({
            unitId: this._generateUnitId(`${faction.toLowerCase()}_${warriorId}_ratha`),
            characterId: warriorData.character_id || warriorId,
            name: displayName,
            canonicalName: warriorData.canonical_name || warriorId,
            faction,
            spriteKey: warriorData.base_sprite_key,
            portraitKey: warriorData.portrait_atlas_key,
            weaponType,
            resolvedTraits: [...(warriorData.resolvedTraits || [])],
            resolvedAstras: [...(warriorData.resolvedAstras || [])],
            resolvedVows: [...(warriorData.resolvedVows || [])],
            ...this._statOverrides(warriorData),
            gridX,
            gridY,
            sarathiBuffScale: isHeroSarathi ? 0.7 : 0.0,
            crew: {
                warriorId: warriorData.character_id || warriorId,
                charioteerId: charioteerData.character_id || charioteerId,
                charioteerTier,
                charioteerName: charioteerData.canonical_name || charioteerId,
                charioteerTraits: filteredCharioteerTraits
            }
        });

        const placed = this._tryPlaceOnGrid(pair, gridX, gridY);
        if (!placed) {
            console.error(`[UnitManager] Failed to place chariot pair at [${gridX}, ${gridY}].`);
            return null;
        }

        this._register(pair);
        console.log(`[UnitManager] 🐎 Spawned CHARIOT PAIR: ${pair.getDisplayName()} (${charioteerTier}) at [${gridX}, ${gridY}]`);
        return pair;
    }

    // =============================================================
    // ROSTER QUERIES
    // =============================================================

    getUnitById(unitId) {
        if (!unitId) return null;
        if (this.units.has(unitId)) return this.units.get(unitId);
        // Allow lookup by characterId — triggers use "bhishma" not instance id
        for (const unit of this.units.values()) {
            if (unit.characterId === unitId) return unit;
        }
        return null;
    }

    /**
     * FIX 3: O(1) spatial lookup via pre-built index.
     * Was O(n) linear scan on every pointer event.
     */
    getUnitAt(x, y) {
        const unit = this._spatialIndex.get(this._spatialKey(x, y));
        if (!unit) return null;
        if (unit.isAlive === false) return null;
        return unit;
    }

    getAllUnits() {
        return Array.from(this.units.values());
    }

    getUnitsByFaction(faction) {
        const f = (faction || '').toUpperCase();
        return this.getAllUnits().filter(u => (u.faction || '').toUpperCase() === f);
    }

    /**
     * Updates unit grid position in both roster and spatial index.
     * Same-tile move is always legal (engine rule from Phase 1).
     */
    updateUnitPosition(unitId, newX, newY) {
        const unit = this.getUnitById(unitId);
        if (!unit) return false;

        if (unit.gridX === newX && unit.gridY === newY) return true;

        // Remove old spatial entry
        this._spatialClear(unit.gridX, unit.gridY);

        if (this.grid && typeof this.grid.moveUnit === 'function') {
            const ok = this.grid.moveUnit(unit, newX, newY);
            if (!ok) {
                // Re-register at old position if grid rejected move
                this._spatialSet(unit);
                return false;
            }
        } else {
            unit.gridX = newX;
            unit.gridY = newY;
        }

        // Register at new position
        this._spatialSet(unit);
        return true;
    }

    /**
     * Removes unit from roster and spatial index.
     * Does NOT destroy Phaser visuals — TacticalScene does that.
     */
    removeUnit(unitId) {
        const unit = this.getUnitById(unitId);
        if (!unit) return;

        this._spatialClear(unit.gridX, unit.gridY);

        if (this.grid && typeof this.grid.removeUnit === 'function') {
            this.grid.removeUnit(unit);
        }

        this.units.delete(unit.unitId);
        unit.isAlive = false;
    }

    /** Alias used by TacticalScene chariot pair spawn */
    spawnMaharathi(characterId, x, y, opts = {}) {
        return this.spawnCharacter(characterId, x, y, opts.faction || null);
    }

    /** Alias for generic class spawn */
    spawnUnit(unitClass, x, y, opts = {}) {
        return this.spawnBattalion(unitClass, opts.faction || 'PANDAVA', x, y, opts);
    }
}