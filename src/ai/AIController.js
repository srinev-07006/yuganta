// AIController.js — baseline rule-based opponent (terrain-aware), scene-agnostic.
// facade = { isRunning(), actors(faction), enemiesOf(faction), reachable(unit)→[{x,y,path}],
//            targetsInRange(unit)→Unit[], terrainDefenseAt(x,y), move(unit,x,y,path), attack(unit,target), pause(ms) }
// facade.move must NOT end the unit's action (move-then-attack). Per unit: attack weakest in range;
// else move toward nearest enemy (cover breaks ties) and attack if now in range; never wander away.
export class AIController {
    constructor(facade, opts = {}) {
        this.f = facade;
        this.thinkDelayMs = opts.thinkDelayMs ?? 250;
    }
    async takeTurn(faction) {
        const units = [...this.f.actors(faction)];
        for (const unit of units) {
            if (!this.f.isRunning()) return;
            if (unit.isAlive === false || unit.canAct?.() === false) continue;
            const foes = this.f.enemiesOf(faction).filter(e => e.isAlive !== false);
            if (!foes.length) return;

            let target = this._weakest(this.f.targetsInRange(unit));
            if (!target && !unit.hasMovedThisTurn) {
                const dest = this._bestTile(unit, foes);
                if (dest) {
                    await this.f.move(unit, dest.x, dest.y, dest.path);
                    if (!this.f.isRunning()) return;
                }
                target = this._weakest(this.f.targetsInRange(unit));
            }
            if (target) await this.f.attack(unit, target);
            if (typeof unit.endAction === 'function') unit.endAction();
            await this.f.pause(this.thinkDelayMs);
        }
    }
    _weakest(list) {
        if (!list || !list.length) return null;
        return [...list].sort((a, b) => (a.currentHp ?? a.hp) - (b.currentHp ?? b.hp))[0];
    }
    _bestTile(unit, foes) {
        let best = null, bestScore = Infinity;
        for (const t of this.f.reachable(unit)) {
            if (t.x === unit.gridX && t.y === unit.gridY) continue;
            const d = Math.min(...foes.map(e => Math.abs(e.gridX - t.x) + Math.abs(e.gridY - t.y)));
            const score = d * 10 - this.f.terrainDefenseAt(t.x, t.y);
            if (score < bestScore) { bestScore = score; best = t; }
        }
        if (!best) return null;
        const here = Math.min(...foes.map(e => Math.abs(e.gridX - unit.gridX) + Math.abs(e.gridY - unit.gridY)));
        const there = Math.min(...foes.map(e => Math.abs(e.gridX - best.x) + Math.abs(e.gridY - best.y)));
        return there < here ? best : null;
    }
}
