import Phaser from 'phaser';
import { TERRAIN_CONFIG } from '../data/TerrainConfig.js';
import { TERRAIN_TILE_FILES, tileKey, propKey, terrainPropSpec, FIRE_SHEET } from '../data/TerrainArt.js';

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
        this.hoverGraphics = scene.add.graphics().setDepth(8999);
        this.markerGraphics = scene.add.graphics().setDepth(1);
        this._markerLabels = [];

        // Camera state: panX/panY are screen-pixel drag offsets set by the scene; zoom is the fitted zoom.
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1;
        this._camCx = 0;             // world point shown at the centre of the screen
        this._camCy = 0;
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
        (this._groundArt || []).forEach(i => i.destroy?.()); this._groundArt = [];
        this._clearProps();
        // offsets are fixed at construction; the camera (fitCamera) handles centering and resize

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
                const tKey = this._terrainKey(terrain);

                // --- Painted ground: flat plains tiles use the real tile art (drawn beneath every Graphics), just a thin outline on top ---
                if (elevation === 0 && this._addGroundArt(x, y, center.x, center.y, tKey)) {
                    this.terrainGraphics.lineStyle(1, 0xffffff, 0.12);
                    this.terrainGraphics.beginPath();
                    this.terrainGraphics.moveTo(center.x, center.y - hh);
                    this.terrainGraphics.lineTo(center.x + hw, center.y);
                    this.terrainGraphics.lineTo(center.x, center.y + hh);
                    this.terrainGraphics.lineTo(center.x - hw, center.y);
                    this.terrainGraphics.closePath();
                    this.terrainGraphics.strokePath();
                    this._addTerrainProp(x, y, center, 0, tKey);
                    continue;
                }

                // --- Tall impassables with a sprite (mountain / pillar / wall): painted floor + the sprite instead of a flat-shaded block ---
                if (elevation >= TALL_PROP_MIN && this._hasPropArt(tKey)) {
                    if (!this._addGroundArt(x, y, center.x, center.y, tKey) && !this._addGroundArt(x, y, center.x, center.y, 'plains')) {
                        this.terrainGraphics.fillStyle(terrain.baseColor ?? fallback.color, 1);
                        this.terrainGraphics.beginPath();
                        this.terrainGraphics.moveTo(center.x, center.y - hh); this.terrainGraphics.lineTo(center.x + hw, center.y);
                        this.terrainGraphics.lineTo(center.x, center.y + hh); this.terrainGraphics.lineTo(center.x - hw, center.y);
                        this.terrainGraphics.closePath(); this.terrainGraphics.fillPath();
                    }
                    this._addTerrainProp(x, y, center, 0, tKey);
                    continue;
                }

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
                this._addGroundArt(x, y, center.x, topY, tKey, 0.5);     // painted top face over the flat-shaded block
                this._addTerrainProp(x, y, center, elevation, tKey);
            }
        }
    }

    /** TERRAIN_CONFIG key of a matrix terrain object (identity first, then by name). */
    _terrainKey(terrain) {
        if (!this._keyByObj) this._keyByObj = new Map(Object.entries(TERRAIN_CONFIG).map(([k, v]) => [v, k]));
        return this._keyByObj.get(terrain) || String(terrain?.name || 'plains').toLowerCase();
    }

    _canDrawArt() {
        const sc = this.scene;
        return !!(sc?.textures?.exists && typeof sc.add?.image === 'function');
    }

    /** Paint a ground tile (public/tiles/<file>.webp, pre-cut to the 2:1 diamond) at (cx, cy). Returns false when there is no art for this terrain / headless. */
    _addGroundArt(gx, gy, cx, cy, terrainKey = 'plains', depth = -1) {
        if (!this._canDrawArt()) return false;
        const sc = this.scene;
        const have = (TERRAIN_TILE_FILES[terrainKey] || []).filter(f => sc.textures.exists(tileKey(f)));
        if (!have.length) return false;
        const key = tileKey(have[(gx * 3 + gy * 5) % have.length]);
        const img = sc.add.image(cx, cy, key).setDisplaySize(this.tileWidth, this.tileHeight).setDepth(depth);
        (this._groundArt ||= []).push(img);
        return true;
    }

    /** True when at least one sprite for this terrain's prop is loaded (so the flat-shaded block can be skipped). */
    _hasPropArt(terrainKey) {
        const spec = terrainPropSpec(terrainKey);
        return !!spec && this._canDrawArt() && spec.files.some(f => this.scene.textures.exists(propKey(f)));
    }

    /**
     * Stand a prop sprite (tree, tent, mountain, pillar…) on a tile. Passable props sit BEHIND a unit on the same tile
     * (depth +2 < unit +5); impassable ones (`tall`) sit in front of it (+6), like the extruded blocks they replace.
     */
    _addTerrainProp(gx, gy, center, elevation, terrainKey) {
        const spec = terrainPropSpec(terrainKey);
        if (!spec || !this._hasPropArt(terrainKey)) return;
        if (spec.density < 1 && ((gx * 31 + gy * 17) % 100) / 100 >= spec.density) return;
        const sc = this.scene;
        const have = spec.files.filter(f => sc.textures.exists(propKey(f)));
        const file = spec.side && have.length > 1
            ? (gx * 2 < this.width ? have[0] : have[1])                       // Pandava (west) / Kaurava (east) tent
            : have[(gx * 7 + gy * 13) % have.length];
        const x = center.x, y = center.y - (elevation >= TALL_PROP_MIN ? 0 : elevation) + this.tileHeight * 0.12;
        let obj;
        if (spec.animated && sc.textures.exists(FIRE_SHEET.key) && sc.anims?.exists?.(FIRE_SHEET.anim) && typeof sc.add.sprite === 'function') {
            obj = sc.add.sprite(x, y, FIRE_SHEET.key, 0).setScale(spec.width / FIRE_SHEET.frameWidth);
            obj.play({ key: FIRE_SHEET.anim, startFrame: (gx * 5 + gy * 3) % FIRE_SHEET.frames });
        } else {
            obj = sc.add.image(x, y, propKey(file));
            obj.setScale(spec.width / (obj.width || spec.width * 2));
        }
        obj.setOrigin(0.5, spec.originY ?? 0.82).setDepth(this.getTileDepth(gx, gy) + (spec.tall ? 6 : 2));
        this._props.push(obj);
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
        for (const g of this._groundArt || []) { if (g && typeof g.destroy === 'function') g.destroy(); }
        this._groundArt = [];
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

    // =============================================================
    // CAMERA FIT, SCREEN <-> WORLD, PICKING
    // =============================================================

    /** World-space bounding box of the whole board, including headroom for tall props and unit tokens. */
    boardBounds() {
        const hw = this.tileWidth / 2, hh = this.tileHeight / 2;
        const minX = this.offsetX - (this.height - 1) * hw - hw;
        const maxX = this.offsetX + (this.width - 1) * hw + hw;
        const minY = this.offsetY - hh - 90;                                   // unit plates / tall props above the top corner
        const maxY = this.offsetY + (this.width + this.height - 2) * hh + hh + 24;  // side walls under the bottom corner
        return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }

    /**
     * Fit the whole board into the free screen area, then apply wheel zoom (zoomMul) and drag pan.
     * Uses the Phaser main camera: zoom + centerOn.
     */
    fitCamera(insets = {}, zoomMul = 1) {
        const cam = this.scene.cameras && this.scene.cameras.main;
        if (!cam) return;
        const W = cam.width || this.scene.scale?.width || window.innerWidth || 1280;
        const H = cam.height || this.scene.scale?.height || window.innerHeight || 720;

        // Keep clear of the HUD: title/turn panels sit along the top, so reserve at least that much.
        const m = {
            top: Math.max(insets.top || 0, 80),
            bottom: Math.max(insets.bottom || 0, 30),
            left: Math.max(insets.left || 0, 30),
            right: Math.max(insets.right || 0, 30)
        };
        const availW = Math.max(100, W - m.left - m.right);
        const availH = Math.max(100, H - m.top - m.bottom);

        const b = this.boardBounds();
        const baseZoom = Math.min(availW / b.w, availH / b.h, 1.25);   // never blow small boards up past 1.25x
        const zoom = baseZoom * zoomMul;
        this.baseZoom = baseZoom;
        this.zoom = zoom;

        // Where on screen the board centre should land (middle of the free area, shifted by drag pan).
        const targetX = m.left + availW / 2 + (this.panX || 0);
        const targetY = m.top + availH / 2 + (this.panY || 0);
        this._camCx = b.cx - (targetX - W / 2) / zoom;
        this._camCy = b.cy - (targetY - H / 2) / zoom;

        if (typeof cam.setZoom === 'function') cam.setZoom(zoom);
        if (typeof cam.centerOn === 'function') cam.centerOn(this._camCx, this._camCy);
        this._screenW = W;
        this._screenH = H;
    }

    /** World point -> canvas pixel (matches what the main camera renders). */
    worldToScreen(wx, wy) {
        const W = this._screenW || this.scene.scale?.width || window.innerWidth || 1280;
        const H = this._screenH || this.scene.scale?.height || window.innerHeight || 720;
        return {
            x: (wx - this._camCx) * this.zoom + W / 2,
            y: (wy - this._camCy) * this.zoom + H / 2
        };
    }

    /** Where a unit token is anchored (its feet): the tile centre, lifted by the tile's elevation. */
    unitAnchor(gridX, gridY) {
        const c = this.gridToWorldCenter(gridX, gridY);
        const t = this.getTerrainAt(gridX, gridY);
        const elev = (t && typeof t.elevation === 'number' && t.elevation > 0 && t.elevation < TALL_PROP_MIN) ? t.elevation : 0;
        return { x: c.x, y: c.y + 4 - elev };
    }

    /** World point -> tile {x,y}, or null if off the board. Tiles are centred on gridToWorldCenter, so round. */
    pickTile(worldX, worldY) {
        const hw = this.tileWidth / 2, hh = this.tileHeight / 2;
        const dx = (worldX - this.offsetX) / hw;
        const dy = (worldY - this.offsetY) / hh;
        const gx = Math.round((dx + dy) / 2);
        const gy = Math.round((dy - dx) / 2);
        return this.isValidTile(gx, gy) ? { x: gx, y: gy } : null;
    }

    /** Outline the hovered tile. Pass null to clear. */
    setHoverTile(tile, color = 0xffe08a) {
        const g = this.hoverGraphics;
        if (!g) return;
        g.clear();
        if (!tile) return;
        const hw = this.tileWidth / 2, hh = this.tileHeight / 2;
        const c = this.gridToWorldCenter(tile.x, tile.y);
        g.lineStyle(3, color, 0.95);
        g.fillStyle(color, 0.14);
        g.beginPath();
        g.moveTo(c.x, c.y - hh); g.lineTo(c.x + hw, c.y); g.lineTo(c.x, c.y + hh); g.lineTo(c.x - hw, c.y);
        g.closePath(); g.fillPath(); g.strokePath();
    }

    /** Optional map markers: [{x,y,label?,color?}] drawn as small flags on the tile. */
    drawMarkers(markers) {
        const g = this.markerGraphics;
        if (!g) return;
        g.clear();
        for (const t of this._markerLabels) { if (t && t.destroy) t.destroy(); }
        this._markerLabels = [];
        const hw = this.tileWidth / 2, hh = this.tileHeight / 2;
        for (const m of (markers || [])) {
            const x = m.x ?? m.grid_x, y = m.y ?? m.grid_y;
            if (!this.isValidTile(x, y)) continue;
            const c = this.gridToWorldCenter(x, y);
            const col = (typeof m.color === 'number') ? m.color : 0xf3d98b;
            g.lineStyle(2, col, 0.9);
            g.beginPath();
            g.moveTo(c.x, c.y - hh * 0.6); g.lineTo(c.x + hw * 0.6, c.y); g.lineTo(c.x, c.y + hh * 0.6); g.lineTo(c.x - hw * 0.6, c.y);
            g.closePath(); g.strokePath();
            if (m.label && this.scene.add && typeof this.scene.add.text === 'function') {
                const t = this.scene.add.text(c.x, c.y, String(m.label), { fontSize: '12px', color: '#f3d98b' }).setOrigin(0.5).setDepth(2);
                this._markerLabels.push(t);
            }
        }
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