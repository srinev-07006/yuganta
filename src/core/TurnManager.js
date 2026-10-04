// TurnManager.js — alternating faction phases + round counting.
// One ROUND = every faction takes one PHASE. "Turn N" in directives/triggers = ROUND N.
// EVENTS: 'round:start' {round} · 'phase:start' {round,faction,isPlayer} · 'phase:end' {round,faction}
//         'round:end' {round} (→ DirectiveManager.onTurnEnd) · 'stopped' {reason}
// Never touches rendering; listeners (UI, AI) drive it. AI listeners MUST defer
// (await / setTimeout) before calling endPhase() so phases don't nest recursively.
import { Emitter } from './Emitter.js';

export class TurnManager extends Emitter {
    constructor(unitSource, opts = {}) {
        super();
        this.units = unitSource;
        this.factions = (opts.factions || ['PANDAVA', 'KAURAVA']).map(f => f.toUpperCase());
        this.playerFaction = (opts.playerFaction || 'PANDAVA').toUpperCase();
        this.round = 0;
        this.phaseIndex = -1;
        this.running = false;
    }
    get activeFaction() { return this.phaseIndex >= 0 ? this.factions[this.phaseIndex] : null; }
    get isPlayerPhase() { return this.running && this.activeFaction === this.playerFaction; }

    start() {
        if (this.running) return;
        this.running = true;
        this.round = 1;
        this.phaseIndex = -1;
        this.emit('round:start', { round: this.round });
        if (this.running) this._beginNextPhase();
    }
    stop(reason = 'stopped') {
        if (!this.running) return;
        this.running = false;
        this.emit('stopped', { reason });
    }
    endPhase() {
        if (!this.running) return false;
        this.emit('phase:end', { round: this.round, faction: this.activeFaction });
        if (!this.running) return true;
        if (this.phaseIndex === this.factions.length - 1) {
            this.emit('round:end', { round: this.round });
            if (!this.running) return true;          // round:end can resolve the node
            this.round += 1;
            this.phaseIndex = -1;
            this.emit('round:start', { round: this.round });
            if (!this.running) return true;
        }
        this._beginNextPhase();
        return true;
    }
    actors(faction = this.activeFaction) {
        return (this.units.getUnitsByFaction(faction) || []).filter(u => u.isAlive !== false && !u.isProp && u.canAct?.() !== false);   // props (the fish) never act
    }
    /** Ends the PLAYER phase when nobody can act. Also call right after 'phase:start'. */
    checkAutoEnd() {
        if (this.isPlayerPhase && this.actors().length === 0) this.endPhase();
    }
    _beginNextPhase() {
        this.phaseIndex += 1;
        const faction = this.factions[this.phaseIndex];
        for (const u of this.units.getUnitsByFaction(faction) || []) {
            if (u.isAlive !== false && typeof u.startTurn === 'function') u.startTurn();
        }
        this.emit('phase:start', { round: this.round, faction, isPlayer: faction === this.playerFaction });
    }
}
