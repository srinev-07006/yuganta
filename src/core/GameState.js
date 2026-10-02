// GameState.js — single owner of global campaign state (registry key 'gameState').
// Same field names the engine already used, so `gameState.dharmaMeter -= cost`
// in CombatResolver keeps working, but it is now clamped and emits events.
// EVENTS: 'dharma:changed' {value,previous,delta,reason}
//         'purusharthas:changed' {artha,kama,moksha,deltas,reason}
//         'state:restored' {}
import { Emitter } from './Emitter.js';

export const DHARMA_MIN = 0;
export const DHARMA_MAX = 100;

export class GameState extends Emitter {
    constructor(initial = {}) {
        super();
        this._dharma = initial.dharmaMeter ?? DHARMA_MAX;
        this.artha = initial.artha ?? 0;
        this.kama = initial.kama ?? 0;
        this.moksha = initial.moksha ?? 0;
        this.currentParva = initial.currentParva ?? 1;
        this.currentWarDay = initial.currentWarDay ?? 0;
        this.isNight = initial.isNight ?? false;
        this.consumedAstras = new Set(initial.consumedAstras || []);
        this.vowStates = { ...(initial.vowStates || {}) };
    }
    get dharmaMeter() { return this._dharma; }
    set dharmaMeter(v) { this._setDharma(v, 'direct-assignment'); }

    _setDharma(v, reason) {
        const next = Math.max(DHARMA_MIN, Math.min(DHARMA_MAX, Number(v)));
        if (Number.isNaN(next)) return;
        const previous = this._dharma;
        this._dharma = next;
        if (next !== previous) this.emit('dharma:changed', { value: next, previous, delta: next - previous, reason });
    }
    change(delta, reason = 'unspecified') { this._setDharma(this._dharma + delta, reason); return this._dharma; }

    /** Apply a narrative choice's shifts (narrative.schema.json: dharma/artha/kama/moksha_impact). */
    applyImpacts(choice, reason = 'narrative-choice') {
        if (!choice) return;
        const d = choice.dharma_impact || 0, a = choice.artha_impact || 0;
        const k = choice.kama_impact || 0, m = choice.moksha_impact || 0;
        if (d) this.change(d, reason);
        if (a || k || m) {
            this.artha += a; this.kama += k; this.moksha += m;
            this.emit('purusharthas:changed', { artha: this.artha, kama: this.kama, moksha: this.moksha, deltas: { artha: a, kama: k, moksha: m }, reason });
        }
    }
    snapshot() {
        return {
            dharmaMeter: this._dharma, artha: this.artha, kama: this.kama, moksha: this.moksha,
            currentParva: this.currentParva, currentWarDay: this.currentWarDay, isNight: this.isNight,
            consumedAstras: [...this.consumedAstras], vowStates: JSON.parse(JSON.stringify(this.vowStates))
        };
    }
    restore(snap) {
        if (!snap) return;
        const before = this._dharma;
        this._dharma = snap.dharmaMeter;
        this.artha = snap.artha; this.kama = snap.kama; this.moksha = snap.moksha;
        this.currentParva = snap.currentParva; this.currentWarDay = snap.currentWarDay; this.isNight = snap.isNight;
        this.consumedAstras = new Set(snap.consumedAstras);
        this.vowStates = JSON.parse(JSON.stringify(snap.vowStates));
        if (before !== this._dharma) this.emit('dharma:changed', { value: this._dharma, previous: before, delta: this._dharma - before, reason: 'timeline-restore' });
        // UI should refresh everything on this one event (purusharthas are restored silently otherwise)
        this.emit('state:restored', this.snapshot());
    }
}
