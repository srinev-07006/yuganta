// =============================================================
// GridSystem.js — The Tactical Battlefield Grid
// =============================================================
// This system manages the SPATIAL layer of the game:
//   - Creating and rendering the tile grid
//   - Tracking which unit is on which tile
//   - Calculating movement ranges (which tiles a unit can reach)
//   - A* pathfinding (finding the shortest path between tiles)
//   - Terrain cost lookups (integrating with TerrainConfig)
//
// The grid is ORTHOGONAL (square tiles, top-down view).
// Each tile is 64×64 pixels for the prototype.
//
// COORDINATE SYSTEM:
//   (0,0) is the top-left tile.
//   x increases to the right.
//   y increases downward.
//   Pixel position = grid position × tileSize.
// =============================================================

import { TERRAIN_CONFIG, getTerrainForUnit } from '../data/TerrainConfig.js';

export class GridSystem {

    // =============================================================
    // CONSTRUCTOR
    // =============================================================

    constructor(scene, config) {
        // ----------------------------------------------------------
        // REFERENCES
        // ----------------------------------------------------------
        // The Phaser scene this grid belongs to.
        // We need it to create visual objects (rectangles, text).
        // ----------------------------------------------------------
        this.scene = scene;

        // ----------------------------------------------------------
        // GRID DIMENSIONS
        // ----------------------------------------------------------
        this.cols = config.cols || 5;         // Number of columns (x)
        this.rows = config.rows || 5;         // Number of rows (y)
        this.tileSize = config.tileSize || 64; // Pixel size of each tile

        // ----------------------------------------------------------
        // OFFSET
        // ----------------------------------------------------------
        // Where on the screen the grid starts drawing.
        // This centers the grid in the game canvas.
        //
        // Calculation:
        //   Total grid width = cols × tileSize = 5 × 64 = 320px
        //   Game width = 1280px
        //   Offset = (1280 - 320) / 2 = 480px from left edge
        // ----------------------------------------------------------
        this.offsetX = config.offsetX || Math.floor((1280 - this.cols * this.tileSize) / 2);
        this.offsetY = config.offsetY || Math.floor((720 - this.rows * this.tileSize) / 2);

        // ----------------------------------------------------------
        // DATA STRUCTURES
        // ----------------------------------------------------------

        // tiles: 2D array storing terrain data for each cell.
        // tiles[y][x] = { terrainType: 'plains', ... }
        // NOTE: It's [row][col] = [y][x], which is standard
        // for 2D arrays in game dev.
        this.tiles = [];

        // unitMap: 2D array tracking which unit occupies each tile.
        // unitMap[y][x] = Unit instance or null
        // This enables O(1) lookup: "what unit is at (3,2)?"
        this.unitMap = [];

        // tileObjects: 2D array of Phaser GameObjects (rectangles).
        // Used for visual rendering and click detection.
        this.tileObjects = [];

        // highlightObjects: Array of highlight overlays
        // (movement range indicators, attack range indicators).
        // Cleared and redrawn when selection changes.
        this.highlightObjects = [];

        // units: Flat array of all units on the grid.
        // Maintained alongside unitMap for easy iteration.
        this.units = [];

        // ----------------------------------------------------------
        // INITIALIZE
        // ----------------------------------------------------------
        this._initializeGrid(config.terrainData);
    }

    // =============================================================
    // GRID INITIALIZATION
    // =============================================================

    _initializeGrid(terrainData) {
        for (let y = 0; y < this.rows; y++) {
            this.tiles[y] = [];
            this.unitMap[y] = [];
            this.tileObjects[y] = [];

            for (let x = 0; x < this.cols; x++) {
                // ----------------------------------------------------------
                // TERRAIN ASSIGNMENT
                // ----------------------------------------------------------
                // If terrainData is provided (2D array of terrain type strings),
                // use it. Otherwise, default everything to 'plains'.
                //
                // terrainData format example:
                //   [
                //     ['plains', 'plains', 'forest', 'plains', 'plains'],
                //     ['plains', 'mountain', 'mountain', 'river', 'plains'],
                //     ...
                //   ]
                // ----------------------------------------------------------
                let terrainType = 'plains';
                if (terrainData && terrainData[y] && terrainData[y][x]) {
                    terrainType = terrainData[y][x];
                }

                this.tiles[y][x] = {
                    x: x,
                    y: y,
                    terrainType: terrainType
                };

                // No unit on this tile initially
                this.unitMap[y][x] = null;

                // ----------------------------------------------------------
                // VISUAL RENDERING
                // ----------------------------------------------------------
                // For the prototype, each tile is a colored rectangle.
                // The color comes from TERRAIN_CONFIG.
                // Later, these will be replaced with actual tilemap sprites.
                // ----------------------------------------------------------
                const pixelX = this.offsetX + x * this.tileSize;
                const pixelY = this.offsetY + y * this.tileSize;

                const terrainColor = TERRAIN_CONFIG[terrainType]
                    ? TERRAIN_CONFIG[terrainType].color
                    : 0x808080;

                // Create a filled rectangle for the tile
                const tileRect = this.scene.add.rectangle(
                    pixelX + this.tileSize / 2,  // Phaser rectangles are centered
                    pixelY + this.tileSize / 2,
                    this.tileSize - 2,            // -2 for a 1px gap between tiles
                    this.tileSize - 2,
                    terrainColor
                );

                // Set the rectangle's transparency
                tileRect.setAlpha(0.8);

                // Store grid coordinates on the visual object
                // so click handlers know which tile was clicked
                tileRect.setData('gridX', x);
                tileRect.setData('gridY', y);

                // Make it clickable
                tileRect.setInteractive();

                // Store reference
                this.tileObjects[y][x] = tileRect;
            }
        }

        // ----------------------------------------------------------
        // ADD GRID LABELS (for debugging)
        // ----------------------------------------------------------
        // Show terrain type abbreviation on each tile.
        // This helps during development — remove for production.
        // ----------------------------------------------------------
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const pixelX = this.offsetX + x * this.tileSize + this.tileSize / 2;
                const pixelY = this.offsetY + y * this.tileSize + this.tileSize / 2;
                const terrain = this.tiles[y][x].terrainType;

                // Abbreviate terrain names for display
                const abbrev = terrain.substring(0, 3).toUpperCase();

                this.scene.add.text(pixelX, pixelY - 10, abbrev, {
                    fontSize: '10px',
                    color: '#ffffff',
                    fontFamily: 'monospace'
                }).setOrigin(0.5);

                // Show coordinates
                this.scene.add.text(pixelX, pixelY + 10, `${x},${y}`, {
                    fontSize: '9px',
                    color: '#aaaaaa',
                    fontFamily: 'monospace'
                }).setOrigin(0.5);
            }
        }
    }

    // =============================================================
    // UNIT PLACEMENT
    // =============================================================

    /**
     * Place a unit on the grid at the specified coordinates.
     * Creates a visual representation (colored circle for prototype).
     */
    placeUnit(unit, gridX, gridY) {
        // Bounds check
        if (!this.isValidTile(gridX, gridY)) {
            console.error(`Cannot place unit at (${gridX},${gridY}) — out of bounds.`);
            return false;
        }

        // Occupation check
        if (this.unitMap[gridY][gridX] !== null) {
            console.error(`Cannot place unit at (${gridX},${gridY}) — tile occupied by ${this.unitMap[gridY][gridX].name}`);
            return false;
        }

        // Update unit's position
        unit.gridX = gridX;
        unit.gridY = gridY;

        // Register in the unit map
        this.unitMap[gridY][gridX] = unit;

        // Add to the flat unit list if not already there
        if (!this.units.includes(unit)) {
            this.units.push(unit);
        }

        // ----------------------------------------------------------
        // CREATE VISUAL REPRESENTATION
        // ----------------------------------------------------------
        // For the prototype:
        //   - PANDAVA units = blue circles
        //   - KAURAVA units = red circles
        //   - Circle size based on unit class (Maharathi = larger)
        // ----------------------------------------------------------
        const pixelX = this.offsetX + gridX * this.tileSize + this.tileSize / 2;
        const pixelY = this.offsetY + gridY * this.tileSize + this.tileSize / 2;

        const color = unit.faction === 'PANDAVA' ? 0x4488ff : 0xff4444;
        const radius = unit.unitClass === 'MAHARATHI' ? 20 : 14;

        const unitCircle = this.scene.add.circle(pixelX, pixelY, radius, color);
        unitCircle.setStrokeStyle(2, 0xffffff);  // White border
        unitCircle.setDepth(10);  // Draw above tiles

        // Add the unit's name initial
        const initial = this.scene.add.text(pixelX, pixelY, unit.name[0], {
            fontSize: '14px',
            color: '#ffffff',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11);

        // Store references for later movement/removal
        unit.gameObject = unitCircle;
        unit.labelObject = initial;

        return true;
    }

    /**
     * Move a unit from its current position to a new position.
     * Updates both the data layer and the visual representation.
     */
    moveUnit(unit, newX, newY) {
        if (unit.gridX === newX && unit.gridY === newY) {
            return true;
        }
        if (!this.isValidTile(newX, newY)) {
            console.error(`Cannot move to (${newX},${newY}) — out of bounds.`);
            return false;
        }

        if (this.unitMap[newY][newX] !== null) {
            console.error(`Cannot move to (${newX},${newY}) — occupied.`);
            return false;
        }

        // Clear old position
        this.unitMap[unit.gridY][unit.gridX] = null;

        // Set new position
        unit.gridX = newX;
        unit.gridY = newY;
        this.unitMap[newY][newX] = unit;

        // Update visual position
        const pixelX = this.offsetX + newX * this.tileSize + this.tileSize / 2;
        const pixelY = this.offsetY + newY * this.tileSize + this.tileSize / 2;

        if (unit.gameObject) {
            unit.gameObject.setPosition(pixelX, pixelY);
        }
        if (unit.labelObject) {
            unit.labelObject.setPosition(pixelX, pixelY);
        }

        return true;
    }

    // =============================================================
    // MOVEMENT RANGE CALCULATION
    // =============================================================
    // Uses Breadth-First Search (BFS) to find all tiles a unit
    // can reach within its movement points.
    //
    // BFS is simpler than A* for range calculation because we
    // need ALL reachable tiles, not just the shortest path to one.
    //
    // HOW BFS WORKS (step by step):
    //   1. Start at the unit's current tile with full movement points.
    //   2. Look at all 4 neighbors (up/down/left/right).
    //   3. For each neighbor:
    //      a. Is it in bounds? Is it passable for this unit type?
    //      b. How much movement does it cost to enter?
    //      c. Do we have enough remaining movement?
    //      d. If yes, add it to the "reachable" list and check ITS neighbors.
    //   4. Repeat until no more tiles can be reached.
    // =============================================================

    getMovementRange(unit) {
        const reachable = [];    // Array of { x, y, remaining }

        // FIX: A plain "visited once" BFS flag is only correct when every
        // edge/tile costs the same to enter. Our terrain costs vary
        // (1/2/3/4/99), so this is a weighted-graph problem. If a tile
        // got reached first via an expensive route (little movement left),
        // the old code locked that in as "visited" and never let a later,
        // cheaper route re-open it — even if that cheaper route left more
        // movement to spend on tiles beyond it. That silently shrank the
        // unit's true movement range.
        //
        // Fix: track the BEST (highest) remaining movement found so far
        // for each tile, and only keep expanding through a tile when a
        // new path beats the best we've already recorded for it
        // (relaxation, à la Dijkstra/SPFA rather than plain BFS).
        const bestRemaining = {}; // key "x,y" -> best remaining movement found

        const startKey = `${unit.gridX},${unit.gridY}`;
        bestRemaining[startKey] = unit.movement;

        // Queue: each entry is [x, y, remainingMovement]
        const queue = [[unit.gridX, unit.gridY, unit.movement]];

        // The four cardinal directions (orthogonal grid)
        const directions = [
            { dx: 0, dy: -1 },  // Up
            { dx: 0, dy: 1 },   // Down
            { dx: -1, dy: 0 },  // Left
            { dx: 1, dy: 0 }    // Right
        ];

        while (queue.length > 0) {
            const [currentX, currentY, remaining] = queue.shift();

            // Stale entry: we've since found a strictly better (or equal)
            // way to reach this tile, so expanding from this worse copy
            // would only redo work / potentially re-shrink the range.
            const currentKey = `${currentX},${currentY}`;
            if (remaining < bestRemaining[currentKey]) continue;

            for (const dir of directions) {
                const nextX = currentX + dir.dx;
                const nextY = currentY + dir.dy;
                const key = `${nextX},${nextY}`;

                // Skip if out of bounds
                if (!this.isValidTile(nextX, nextY)) continue;

                // Get terrain stats for this unit type
                const terrainType = this.tiles[nextY][nextX].terrainType;

                // ----------------------------------------------------------
                // TRAIT: Check if unit ignores terrain costs
                // ----------------------------------------------------------
                let terrainStats;
                if (unit.ignoresTerrainCost()) {
                    // Flying/special units: everything costs 1 and is passable
                    terrainStats = { moveCost: 1, isPassable: true };
                } else {
                    terrainStats = getTerrainForUnit(terrainType, unit.unitClass, unit.weaponType);

                    // ----------------------------------------------------------
                    // TRAIT: Check for specific terrain overrides
                    // (e.g., Bhishma's IgnoreRiverTerrain)
                    // ----------------------------------------------------------
                    // We check each trait's handler for terrain overrides
                    // This is a simplified check for the prototype
                    if (unit.hasTrait('ganga-putra') && terrainType === 'river') {
                        terrainStats = { ...terrainStats, moveCost: 1, isPassable: true };
                    }
                }

                // Skip if impassable for this unit type
                if (!terrainStats.isPassable) continue;

                // Skip if occupied by an enemy
                const occupant = this.unitMap[nextY][nextX];
                if (occupant && occupant.faction !== unit.faction) continue;

                // Skip if not enough movement remaining
                const cost = terrainStats.moveCost;
                if (remaining < cost) continue;

                const newRemaining = remaining - cost;

                // Only continue through this tile if this path reaches it
                // with MORE remaining movement than any path we've already
                // found — otherwise there's nothing new to gain by re-expanding.
                if (bestRemaining[key] !== undefined && bestRemaining[key] >= newRemaining) {
                    continue;
                }
                bestRemaining[key] = newRemaining;

                // Continue searching from this tile
                if (newRemaining > 0) {
                    queue.push([nextX, nextY, newRemaining]);
                }
            }
        }

        // Build the final reachable list from the best-known remaining
        // movement per tile — excluding the unit's own starting tile and
        // any tile currently occupied by a friendly unit (you can move
        // THROUGH friendlies but not STOP on them).
        for (const key in bestRemaining) {
            if (key === startKey) continue;

            const [x, y] = key.split(',').map(Number);
            const occupant = this.unitMap[y][x];
            if (occupant) continue;

            reachable.push({ x, y, remaining: bestRemaining[key] });
        }

        return reachable;
    }

    // =============================================================
    // ATTACK RANGE CALCULATION
    // =============================================================

    /**
     * Get all tiles within attack range of a unit.
     * Uses Manhattan distance (no pathfinding needed for attacks).
     *
     * Manhattan distance = |x1-x2| + |y1-y2|
     * This creates a diamond-shaped range pattern.
     */
    getAttackRange(unit) {
        const targets = [];
        const range = unit.attackRange;

        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                // Manhattan distance check
                if (Math.abs(dx) + Math.abs(dy) > range) continue;

                // Skip the unit's own tile
                if (dx === 0 && dy === 0) continue;

                const targetX = unit.gridX + dx;
                const targetY = unit.gridY + dy;

                // Bounds check
                if (!this.isValidTile(targetX, targetY)) continue;

                // Check if there's an enemy here
                const occupant = this.unitMap[targetY][targetX];
                if (occupant && occupant.faction !== unit.faction && occupant.isAlive) {
                    targets.push({
                        x: targetX,
                        y: targetY,
                        unit: occupant
                    });
                }
            }
        }

        return targets;
    }

    // =============================================================
    // VISUAL HIGHLIGHTING
    // =============================================================

    /**
     * Show movement range as blue-tinted tiles.
     */
    showMovementRange(reachableTiles) {
        this.clearHighlights();

        reachableTiles.forEach(tile => {
            const pixelX = this.offsetX + tile.x * this.tileSize + this.tileSize / 2;
            const pixelY = this.offsetY + tile.y * this.tileSize + this.tileSize / 2;

            const highlight = this.scene.add.rectangle(
                pixelX, pixelY,
                this.tileSize - 2, this.tileSize - 2,
                0x0088ff  // Blue tint
            );
            highlight.setAlpha(0.3);
            highlight.setDepth(5);  // Above tiles, below units

            this.highlightObjects.push(highlight);
        });
    }

    /**
     * Show attack range as red-tinted tiles.
     */
    showAttackRange(targetTiles) {
        targetTiles.forEach(tile => {
            const pixelX = this.offsetX + tile.x * this.tileSize + this.tileSize / 2;
            const pixelY = this.offsetY + tile.y * this.tileSize + this.tileSize / 2;

            const highlight = this.scene.add.rectangle(
                pixelX, pixelY,
                this.tileSize - 2, this.tileSize - 2,
                0xff0000  // Red tint
            );
            highlight.setAlpha(0.3);
            highlight.setDepth(5);

            this.highlightObjects.push(highlight);
        });
    }

    /**
     * Remove all highlight overlays.
     */
    clearHighlights() {
        this.highlightObjects.forEach(obj => obj.destroy());
        this.highlightObjects = [];
    }

    // =============================================================
    // UTILITY METHODS
    // =============================================================

    /**
     * Check if coordinates are within grid bounds.
     */
    isValidTile(x, y) {
        return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
    }

    /**
     * Get the unit at a specific grid position.
     * Returns null if the tile is empty.
     */
    getUnitAt(x, y) {
        if (!this.isValidTile(x, y)) return null;
        return this.unitMap[y][x];
    }

    /**
     * Find a unit by character ID.
     * Used by trait handlers (e.g., CheckShikhandiPresence needs to find Shikhandi).
     */
    findUnit(characterId) {
        return this.units.find(u => u.characterId === characterId);
    }

    /**
     * Calculate Manhattan distance between two points.
     */
    getDistance(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    /**
     * Get all units within a radius of a point.
     * Used by aura effects (TruthAura, HealingAura, etc.)
     */
    getUnitsInRadius(centerX, centerY, radius, filter) {
        const results = [];
        this.units.forEach(unit => {
            if (!unit.isAlive) return;
            const dist = this.getDistance(centerX, centerY, unit.gridX, unit.gridY);
            if (dist <= radius) {
                if (filter === 'ALLY' && unit.faction !== this.unitMap[centerY]?.[centerX]?.faction) return;
                if (filter === 'ENEMY' && unit.faction === this.unitMap[centerY]?.[centerX]?.faction) return;
                results.push(unit);
            }
        });
        return results;
    }

    /**
     * Convert grid coordinates to pixel coordinates.
     */
    gridToPixel(gridX, gridY) {
        return {
            x: this.offsetX + gridX * this.tileSize + this.tileSize / 2,
            y: this.offsetY + gridY * this.tileSize + this.tileSize / 2
        };
    }

    /**
     * Convert pixel coordinates to grid coordinates.
     * Used by click handlers to determine which tile was clicked.
     */
    pixelToGrid(pixelX, pixelY) {
        const gridX = Math.floor((pixelX - this.offsetX) / this.tileSize);
        const gridY = Math.floor((pixelY - this.offsetY) / this.tileSize);

        if (this.isValidTile(gridX, gridY)) {
            return { x: gridX, y: gridY };
        }
        return null;
    }
}