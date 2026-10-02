// BattleGrid.js — adapter: UnitManager + terrain → the "grid" API that CombatResolver,
// TraitHandlers and DirectiveManager were written against.
//   units · findUnit(charId) · getDistance(...) · tiles[y][x].terrainType
// findUnit ALSO matches a chariot token's charioteer (crew.charioteerId), so
// e.g. LoyaltyBonusToKrishna finds Krishna when he drives Arjuna's ratha.
export class BattleGrid {
    constructor(unitManager, getTerrainMatrix = () => []) {
        this.unitManager = unitManager;
        this._getMatrix = getTerrainMatrix;
    }
    get units() { return this.unitManager.getAllUnits(); }
    findUnit(characterId) {
        const direct = this.unitManager.getUnitById(characterId);
        if (direct) return direct;
        for (const u of this.unitManager.getAllUnits()) {
            if (u.isAlive !== false && u.crew && u.crew.charioteerId === characterId) return u;
        }
        return null;
    }
    getDistance(x1, y1, x2, y2) { return Math.abs(x1 - x2) + Math.abs(y1 - y2); }
    get tiles() {
        return this._getMatrix().map(row => row.map(t => ({ terrainType: (t?.name || 'plains').toLowerCase() })));
    }
}
