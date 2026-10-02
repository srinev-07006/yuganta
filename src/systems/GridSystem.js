import Phaser from 'phaser';
import { TERRAIN_CONFIG } from '../data/TerrainConfig.js';

/**
 * Pure bitwise color dimmer for 3D wall faces.
 * No Phaser.Display.Color dependency — crash-proof across Phaser builds.
 */
function dimColor(hexColor, factor = 0.60) {
    const num = (typeof hexColor === 'number' && !Number.isNaN(hexColor))
        ? hexColor
        : 0x8fbc8f;
    const r = Math.min(255, Math.max(0, Math.floor(((num >> 16) & 0xff) * factor)));
    const g = Math.min(255, Math.max(0, Math.floor(((num >> 8) & 0xff) * factor)));
    const b = Math.min(255, Math.max(0, Math.floor((num & 0xff) * factor)));
    return (r << 16) | (g << 8) | b;
}

// Tiles at/above this elevation (px) are drawn as depth-sorted props (pillars, walls)
// instead of flat extruded terrain, so units pass in front of / behind them correctly.
const TALL_PROP_MIN = 20;

function legacyElevation(name) {
    if (name === 'Mountain') return 22;
    if (name === 'Forest') return 10;
    if (name === 'River') return -8;
    if (name === 'Lake') return -10;
    if (name === 'Desert') return 2;
    return 0;
}

/**
 * Yuganta Engine - GridSystem (2.5D Isometric)
 * 128×64 diamond projection, terrain extrusion, diamond hit-test.
 *
 * TerrainConfig contract (canonical):
 *   keys: plains | forest | mountain | desert | river | lake  (lowercase)
 *   fields: name, color, moveCost, defenseModifier, isPassable, unitOverrides, ...
 */
export class GridSystem {
    constructor(scene, config) {
        this.scene = scene;
        this.width = config.width || 10;
        this.height = config.height || 10;

        this.tileWidth = 128;
        this.tileHeight = 64;

        this.recalculateOffsets();

        // Single batch layer for all terrain diamonds (1 draw path, not 100 GameObjects)
        this.terrainGraphics = scene.add.graphics().setDepth(0);
        this.highlightGraphics = scene.add.graphics().setDepth(9000);
        this.pathGraphics = scene.add.graphics().setDepth(9001);

        // Cache last matrix so resize can redraw without caller re-passing data
        this._lastTerrainMatrix = null;
        this._props = [];            // per-tile Graphics for tall tiles (depth-sorted against units)
    }

    recalculateOffsets() {
        const screenWidth =
            (this.scene.scale && this.scene.scale.width > 0 && this.scene.scale.width) ||
            (this.scene.cameras && this.scene.cameras.main && this.scene.cameras.main.width > 0 && this.scene.cameras.main.width) ||
            window.innerWidth ||
            1280;

        const screenHeight =
            (this.scene.scale && this.scene.scale.height > 0 && this.scene.scale.height) ||
            (this.scene.cameras && this.scene.cameras.main && this.scene.cameras.main.height > 0 && this.scene.cameras.main.height) ||
            window.innerHeight ||
            720;

        // Center horizontally
        this.offsetX = Math.floor(screenWidth / 2);

        // Keep the diamond clear of top HUD and bottom combat log
        // Top padding for title/hints, bottom padding for combat log
        const topPad = Math.max(60, screenHeight * 0.06);
        const bottomPad = Math.max(160, screenHeight * 0.15);
        const usable = Math.max(200, screenHeight - topPad - bottomPad);

        // Vertically position toward upper portion of usable space (move grid up)
        this.offsetY = topPad + Math.floor(usable * 0.25);
    }

    getTerrainAt(x, y) {
        if (!this._lastTerrainMatrix) return null;
        if (y < 0 || y >= this._lastTerrainMatrix.length) return null;
        if (x < 0 || x >= this._lastTerrainMatrix[y].length) return null;
        return this._lastTerrainMatrix[y][x];
    }

    createGrid(terrainMatrix) {
        this._lastTerrainMatrix = terrainMatrix;
        this.terrainGraphics.clear();
        this._clearProps();
        this.recalculateOffsets();

        const hw = this.tileWidth / 2;
        const hh = this.tileHeight / 2;
        const fallback = TERRAIN_CONFIG.plains || {
            name: 'Plains',
            color: 0x8fbc8f,
            moveCost: 1,
            isPassable: true
        };

        // Back-to-front iteration so nearer tiles paint over farther walls
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const terrain = (terrainMatrix &&
                    terrainMatrix[y] &&
                    terrainMatrix[y][x])
                    ? terrainMatrix[y][x]
                    : fallback;

                const center = this.gridToWorldCenter(x, y);
                const name = terrain.name || 'Plains';

                // New terrains declare `elevation`; the original six fall back to the name table.
                const elevation = (typeof terrain.elevation === 'number') ? terrain.elevation : legacyElevation(name);

                const topColor = (terrain.color != null) ? terrain.color : fallback.color;
                const sideColor = dimColor(topColor, 0.60);
                const topY = center.y - elevation;

                // --- Tall props (pillar / wall): flat floor now, extruded block as its own depth-sorted object ---
                if (elevation >= TALL_PROP_MIN) {
                    this.terrainGraphics.fillStyle(terrain.baseColor ?? fallback.color, 1);
                    this.terrainGraphics.lineStyle(1, 0xffffff, 0.18);
                    this.terrainGraphics.beginPath();
                    this.terrainGraphics.moveTo(center.x, center.y - hh);
                    this.terrainGraphics.lineTo(center.x + hw, center.y);
                    this.terrainGraphics.lineTo(center.x, center.y + hh);
                    this.terrainGraphics.lineTo(center.x - hw, center.y);
                    this.terrainGraphics.closePath();
                    this.terrainGraphics.fillPath();
                    this.terrainGraphics.strokePath();
                    this._addProp(x, y, center, hw, hh, elevation, topColor, terrain.footprint ?? 1);
                    continue;
                }

                // --- 3D side walls ---
                if (elevation >= 0) {
                    const wall = 10 + elevation;
                    this.terrainGraphics.fillStyle(sideColor, 1);

                    // SE wall
                    this.terrainGraphics.beginPath();
                    this.terrainGraphics.moveTo(center.x, topY + hh);
                    this.terrainGraphics.lineTo(center.x + hw, topY);
                    this.terrainGraphics.lineTo(center.x + hw, topY + wall);
                    this.terrainGraphics.lineTo(center.x, topY + hh + wall);
                    this.terrainGraphics.closePath();
                    this.terrainGraphics.fillPath();

                    // SW wall
                    this.terrainGraphics.beginPath();
                    this.terrainGraphics.moveTo(center.x, topY + hh);
                    this.terrainGraphics.lineTo(center.x - hw, topY);
                    this.terrainGraphics.lineTo(center.x - hw, topY + wall);
                    this.terrainGraphics.lineTo(center.x, topY + hh + wall);
                    this.terrainGraphics.closePath();
                    this.terrainGraphics.fillPath();
                } else {
                    // Sunken river/lake bed rim
                    this.terrainGraphics.fillStyle(sideColor, 1);

                    this.terrainGraphics.beginPath();
                    this.terrainGraphics.moveTo(center.x, center.y - hh);
                    this.terrainGraphics.lineTo(center.x + hw, center.y);
                    this.terrainGraphics.lineTo(center.x + hw, topY);
                    this.terrainGraphics.lineTo(center.x, topY - hh);
                    this.terrainGraphics.closePath();
                    this.terrainGraphics.fillPath();

                    this.terrainGraphics.beginPath();
                    this.terrainGraphics.moveTo(center.x, center.y - hh);
                    this.terrainGraphics.lineTo(center.x - hw, center.y);
                    this.terrainGraphics.lineTo(center.x - hw, topY);
                    this.terrainGraphics.lineTo(center.x, topY - hh);
                    this.terrainGraphics.closePath();
                    this.terrainGraphics.fillPath();
                }

                // --- Top diamond surface ---
                this.terrainGraphics.fillStyle(topColor, 1);
                this.terrainGraphics.lineStyle(
                    1,
                    0xffffff,
                    (elevation < 0) ? 0.35 : 0.18      // sunken water-like tiles get a brighter rim
                );
                this.terrainGraphics.beginPath();
                this.terrainGraphics.moveTo(center.x, topY - hh);
                this.terrainGraphics.lineTo(center.x + hw, topY);
                this.terrainGraphics.lineTo(center.x, topY + hh);
                this.terrainGraphics.lineTo(center.x - hw, topY);
                this.terrainGraphics.closePath();
                this.terrainGraphics.fillPath();
                this.terrainGraphics.strokePath();
            }
        }
    }

    /** Extruded block (pillar / wall) as its own Graphics so units sort against it by tile depth. */
    _addProp(gx, gy, center, hw, hh, elevation, topColor, footprint) {
        const g = this.scene.add.graphics().setDepth(this.getTileDepth(gx, gy) + 6);
        const fw = hw * footprint, fh = hh * footprint;
        const cx = center.x, by = center.y, ty = center.y - elevation;

        // SE face
        g.fillStyle(dimColor(topColor, 0.60), 1);
        g.beginPath();
        g.moveTo(cx, by + fh); g.lineTo(cx + fw, by); g.lineTo(cx + fw, ty); g.lineTo(cx, ty + fh);
        g.closePath(); g.fillPath();
        // SW face
        g.fillStyle(dimColor(topColor, 0.80), 1);
        g.beginPath();
        g.moveTo(cx, by + fh); g.lineTo(cx - fw, by); g.lineTo(cx - fw, ty); g.lineTo(cx, ty + fh);
        g.closePath(); g.fillPath();
        // Top
        g.fillStyle(topColor, 1);
        g.lineStyle(1, 0xffffff, 0.25);
        g.beginPath();
        g.moveTo(cx, ty - fh); g.lineTo(cx + fw, ty); g.lineTo(cx, ty + fh); g.lineTo(cx - fw, ty);
        g.closePath(); g.fillPath(); g.strokePath();

        this._props.push(g);
    }

    _clearProps() {
        for (const g of this._props) { if (g && typeof g.destroy === 'function') g.destroy(); }
        this._props = [];
    }

    gridToWorldCenter(gridX, gridY) {
        return {
            x: this.offsetX + (gridX - gridY) * (this.tileWidth / 2),
            y: this.offsetY + (gridX + gridY) * (this.tileHeight / 2)
        };
    }

    worldToGrid(worldX, worldY) {
        const dx = worldX - this.offsetX;
        const dy = worldY - this.offsetY;
        const hw = this.tileWidth / 2;
        const hh = this.tileHeight / 2;

        const gx = Math.floor((dx / hw + dy / hh) / 2);
        const gy = Math.floor((dy / hh - dx / hw) / 2);

        if (gx >= 0 && gx < this.width && gy >= 0 && gy < this.height) {
            return { x: gx, y: gy };
        }
        return null;
    }

    getTileDepth(gridX, gridY) {
        return (gridX + gridY) * 10;
    }

    getUnitDepth(gridX, gridY) {
        return this.getTileDepth(gridX, gridY) + 5;
    }

    highlightTiles(tiles, color = 0x00ffff, alpha = 0.4) {
        this.highlightGraphics.clear();
        if (!tiles || tiles.length === 0) return;

        this.highlightGraphics.fillStyle(color, alpha);
        this.highlightGraphics.lineStyle(2, color, 0.85);

        const hw = this.tileWidth / 2;
        const hh = this.tileHeight / 2;

        for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            const c = this.gridToWorldCenter(t.x, t.y);
            this.highlightGraphics.beginPath();
            this.highlightGraphics.moveTo(c.x, c.y - hh);
            this.highlightGraphics.lineTo(c.x + hw, c.y);
            this.highlightGraphics.lineTo(c.x, c.y + hh);
            this.highlightGraphics.lineTo(c.x - hw, c.y);
            this.highlightGraphics.closePath();
            this.highlightGraphics.fillPath();
            this.highlightGraphics.strokePath();
        }
    }

    clearHighlights() {
        this.highlightGraphics.clear();
        this.pathGraphics.clear();
    }

    drawPath(path) {
        this.pathGraphics.clear();
        if (!path || path.length < 2) return;

        this.pathGraphics.lineStyle(3, 0xffff00, 0.9);
        this.pathGraphics.beginPath();
        const s = this.gridToWorldCenter(path[0].x, path[0].y);
        this.pathGraphics.moveTo(s.x, s.y);
        for (let i = 1; i < path.length; i++) {
            const p = this.gridToWorldCenter(path[i].x, path[i].y);
            this.pathGraphics.lineTo(p.x, p.y);
        }
        this.pathGraphics.strokePath();
    }

    isValidTile(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    /** Redraw using cached matrix after fullscreen / resize */
    redraw() {
        if (this._lastTerrainMatrix) {
            this.createGrid(this._lastTerrainMatrix);
        }
    }
}