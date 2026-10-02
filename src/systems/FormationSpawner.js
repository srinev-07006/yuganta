// =============================================================
// FormationSpawner.js — Spawns units from vyuha formations
// =============================================================
// Takes a formation definition + character pool and spawns:
// - Maharathis at key positions (using character_id_suggestion or random)
// - Battalions in fill positions (generic unit classes)
//
// Input: formation config, character pool, spawn zone, faction
// Output: array of {character_id, class, x, y, faction}
// =============================================================

export function spawnFormation(formation, characterPool, spawnZone, faction) {
    if (!formation || !spawnZone) return [];

    const spawned = [];
    const zoneWidth = spawnZone.x_max - spawnZone.x_min + 1;
    const zoneHeight = spawnZone.y_max - spawnZone.y_min + 1;
    const centerX = spawnZone.x_min + Math.floor(zoneWidth / 2);
    const centerY = spawnZone.y_min + Math.floor(zoneHeight / 2);

    if (!formation.unit_placement) return [];

    // Track which characters are already used
    const usedCharacters = new Set();

    for (const placement of formation.unit_placement) {
        let count = placement.count || 1;

        // Handle Maharathi placements (often have character suggestions)
        if (placement.class === 'MAHARATHI' || placement.position === 'HEAD' || placement.position === 'BEAK') {
            // Use specific character IDs if provided
            if (placement.character_ids && Array.isArray(placement.character_ids)) {
                for (const charId of placement.character_ids) {
                    if (characterPool.has(charId) && !usedCharacters.has(charId)) {
                        const pos = _positionInZone(centerX, centerY, spawnZone, usedCharacters.size, count);
                        spawned.push({
                            character_id: charId,
                            class: 'MAHARATHI',
                            x: pos.x,
                            y: pos.y,
                            faction
                        });
                        usedCharacters.add(charId);
                    }
                }
            } else if (placement.character_id_suggestion) {
                // Try to use suggestion first
                const suggested = placement.character_id_suggestion;
                if (characterPool.has(suggested) && !usedCharacters.has(suggested)) {
                    const pos = _positionInZone(centerX, centerY, spawnZone, usedCharacters.size, count);
                    spawned.push({
                        character_id: suggested,
                        class: 'MAHARATHI',
                        x: pos.x,
                        y: pos.y,
                        faction
                    });
                    usedCharacters.add(suggested);
                    count--;
                }

                // Fill remaining slots with available Maharathis from pool
                for (const [charId, char] of characterPool) {
                    if (count <= 0) break;
                    if (usedCharacters.has(charId)) continue;
                    if (!char.unit_class || !char.unit_class.includes('MAHARATHI')) continue;

                    const pos = _positionInZone(centerX, centerY, spawnZone, usedCharacters.size, count);
                    spawned.push({
                        character_id: charId,
                        class: 'MAHARATHI',
                        x: pos.x,
                        y: pos.y,
                        faction
                    });
                    usedCharacters.add(charId);
                    count--;
                }
            } else {
                // No suggestion, pick available Maharathis
                for (const [charId, char] of characterPool) {
                    if (count <= 0) break;
                    if (usedCharacters.has(charId)) continue;
                    if (!char.unit_class || !char.unit_class.includes('MAHARATHI')) continue;

                    const pos = _positionInZone(centerX, centerY, spawnZone, usedCharacters.size, count);
                    spawned.push({
                        character_id: charId,
                        class: 'MAHARATHI',
                        x: pos.x,
                        y: pos.y,
                        faction
                    });
                    usedCharacters.add(charId);
                    count--;
                }
            }
        } else {
            // Generic battalions (CHARIOTEER, CAVALRY, INFANTRY, ELEPHANT_CORPS)
            for (let i = 0; i < count; i++) {
                const pos = _positionInZone(centerX, centerY, spawnZone, spawned.length, count);
                spawned.push({
                    character_id: null,
                    class: placement.class,
                    x: pos.x,
                    y: pos.y,
                    faction
                });
            }
        }
    }

    return spawned;
}

/**
 * Calculate position within spawn zone based on index and total count.
 * Simple grid layout: fill left-to-right, top-to-bottom.
 */
function _positionInZone(centerX, centerY, zone, index, totalCount) {
    const zoneWidth = zone.x_max - zone.x_min + 1;
    const zoneHeight = zone.y_max - zone.y_min + 1;

    // Arrange in a grid: sqrt(total) wide, sqrt(total) tall
    const gridWidth = Math.ceil(Math.sqrt(totalCount));
    const gridHeight = Math.ceil(totalCount / gridWidth);

    const col = index % gridWidth;
    const row = Math.floor(index / gridWidth);

    const x = zone.x_min + Math.floor((col / gridWidth) * zoneWidth);
    const y = zone.y_min + Math.floor((row / gridHeight) * zoneHeight);

    return { x: Math.max(zone.x_min, Math.min(zone.x_max, x)), y: Math.max(zone.y_min, Math.min(zone.y_max, y)) };
}

/**
 * Build character pool from global characters.json
 */
export function buildCharacterPool(charactersData) {
    const pool = new Map();
    if (!charactersData || !charactersData.characters) return pool;

    for (const char of charactersData.characters) {
        pool.set(char.character_id, char);
    }

    return pool;
}
