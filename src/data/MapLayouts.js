// =============================================================
// MapLayouts.js — Dynamic Map Definitions from Parvas Data
// =============================================================
// Defines terrain layouts for different map_id values referenced in timeline.json.
// Each map has a unique terrain matrix and can spawn different unit configurations.
//
// Maps are indexed by map_id (e.g., "map_kurukshetra_center")
// and contain a 10x10 terrain grid using lowercase keys matching TerrainConfig.
// =============================================================

import { TERRAIN_CONFIG } from './TerrainConfig.js';

export const MAP_LAYOUTS = {
    // =============================================================
    // KURUKSHETRA CENTER — Open field, flat terrain
    // Used for: Initial formations, Krishna's near-breach
    // =============================================================
    'map_kurukshetra_center': {
        name: 'Kurukshetra Center',
        description: 'Open battlefield center. Flat plains with clear sightlines.',
        width: 10,
        height: 10,
        terrain: [
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'forest', 'forest', 'forest', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'forest', 'forest', 'forest', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains']
        ]
    },

    // =============================================================
    // KURUKSHETRA FORMATIONS — Military formation deployment zone
    // Used for: Vyuha (formation) battles
    // Features: Mountains as natural barriers, rivers as obstacles
    // =============================================================
    'map_kurukshetra_formations': {
        name: 'Kurukshetra Formations',
        description: 'Deployment zone with natural barriers. Mountains north, rivers west.',
        width: 10,
        height: 10,
        terrain: [
            ['mountain', 'mountain', 'mountain', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['mountain', 'mountain', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'forest'],
            ['river', 'river', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'forest'],
            ['river', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains']
        ]
    },

    // =============================================================
    // KURUKSHETRA OPEN FIELD — Wide expanse, minimal obstacles
    // Used for: Arjuna's rampage, pursuit battles
    // Features: Mostly plains with scattered forest patches
    // =============================================================
    'map_kurukshetra_open_field': {
        name: 'Kurukshetra Open Field',
        description: 'Wide open expanse. Minimal obstacles. Ideal for cavalry charges.',
        width: 10,
        height: 10,
        terrain: [
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'forest', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'desert', 'desert', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'desert', 'desert', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'forest', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains']
        ]
    },

    // =============================================================
    // KURUKSHETRA CRATER — Damaged battlefield, rocky terrain
    // Used for: Bhishma's fall, final confrontations
    // Features: Rocky ground, crater formations, limited movement
    // =============================================================
    'map_kurukshetra_crater': {
        name: 'Kurukshetra Crater',
        description: 'Damaged battlefield with crater formations. Rocky, difficult terrain.',
        width: 10,
        height: 10,
        terrain: [
            ['mountain', 'mountain', 'plains', 'plains', 'plains', 'plains', 'plains', 'mountain', 'mountain', 'plains'],
            ['mountain', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'mountain', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'mountain', 'mountain', 'mountain', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'mountain', 'plains', 'mountain', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'mountain', 'mountain', 'mountain', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['mountain', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'mountain'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains']
        ]
    },

    // =============================================================
    // KURUKSHETRA DENSE FOREST — Restrictive terrain
    // Used for: Ambush scenarios, hidden unit deployments
    // Features: Heavy forest, rivers, limited sight lines
    // =============================================================
    'map_kurukshetra_dense_forest': {
        name: 'Kurukshetra Dense Forest',
        description: 'Dense forest region. Limited movement and sightlines.',
        width: 10,
        height: 10,
        terrain: [
            ['forest', 'forest', 'forest', 'forest', 'forest', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['forest', 'forest', 'forest', 'forest', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['forest', 'forest', 'forest', 'plains', 'plains', 'plains', 'plains', 'plains', 'river', 'river'],
            ['forest', 'forest', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'river', 'plains'],
            ['forest', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'plains'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'forest', 'forest', 'forest'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'forest', 'forest', 'forest'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'forest', 'forest', 'forest'],
            ['plains', 'plains', 'plains', 'plains', 'plains', 'plains', 'forest', 'forest', 'forest', 'forest']
        ]
    }
};

/**
 * Get a map layout by ID, or return a default plain battlefield.
 * Converts terrain type strings to TerrainConfig object references.
 */
export function getMapLayout(mapId = 'map_kurukshetra_center') {
    const layout = MAP_LAYOUTS[mapId] || MAP_LAYOUTS['map_kurukshetra_center'];

    // Convert terrain strings to TerrainConfig objects
    const terrainMatrix = layout.terrain.map(row =>
        row.map(terrainType => TERRAIN_CONFIG[terrainType] || TERRAIN_CONFIG.plains)
    );

    return {
        name: layout.name,
        description: layout.description,
        width: layout.width,
        height: layout.height,
        terrain: terrainMatrix
    };
}

/**
 * List all available map IDs for timeline/scenario selection.
 */
export function listAvailableMaps() {
    return Object.keys(MAP_LAYOUTS).map(mapId => ({
        mapId,
        name: MAP_LAYOUTS[mapId].name,
        description: MAP_LAYOUTS[mapId].description
    }));
}
