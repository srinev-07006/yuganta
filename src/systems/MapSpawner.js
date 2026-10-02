// MapSpawner.js — turns a parsed map's spawn list into units (scene-independent).
// The scene calls this once after building UnitManager and then projects each returned
// unit to the screen:
//
//     const { units, failures } = spawnMapUnits(this.unitManager, bundle.map.spawns);
//     units.forEach(u => this._projectUnitToIso(u));
//
// One bad spawn (unknown character, etc.) is reported in `failures` and never blocks the rest.
export function spawnMapUnits(unitManager, spawns) {
    const units = [];
    const failures = [];
    for (const s of spawns || []) {
        let unit = null;
        try {
            if (s.character_id && s.charioteer_id) {
                unit = unitManager.spawnChariotPair(s.character_id, s.charioteer_id, s.x, s.y, { faction: s.faction });
            } else if (s.character_id) {
                unit = unitManager.spawnCharacter(s.character_id, s.x, s.y, s.faction);
            } else {
                unit = unitManager.spawnBattalion(s.unit_class, s.faction, s.x, s.y, { characterId: s.tag || null, name: s.name || null });
            }
        } catch (err) {
            failures.push({ spawn: s, error: err.message });
            continue;
        }
        if (unit) units.push(unit);
        else failures.push({ spawn: s, error: 'spawn returned null (unknown character, non-combatant, or blocked tile)' });
    }
    return { units, failures };
}
