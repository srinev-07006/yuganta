// Emitter.js — tiny dependency-free event emitter (same surface as Phaser's
// EventEmitter: on/once/off/emit/removeAllListeners + optional context), so
// core modules run in plain Node for tests.
export class Emitter {
    constructor() { this._l = new Map(); }
    on(event, fn, context = null) { return this._add(event, fn, context, false); }
    once(event, fn, context = null) { return this._add(event, fn, context, true); }
    _add(event, fn, context, once) {
        if (typeof fn !== 'function') throw new TypeError(`Emitter: listener for "${event}" is not a function`);
        if (!this._l.has(event)) this._l.set(event, []);
        this._l.get(event).push({ fn, context, once });
        return this;
    }
    off(event, fn, context) {
        const list = this._l.get(event);
        if (!list) return this;
        if (!fn) { this._l.delete(event); return this; }
        const keep = list.filter(l => !(l.fn === fn && (context === undefined || l.context === context)));
        if (keep.length) this._l.set(event, keep); else this._l.delete(event);
        return this;
    }
    emit(event, ...args) {
        const list = this._l.get(event);
        if (!list || !list.length) return false;
        for (const l of [...list]) {
            if (l.once) this.off(event, l.fn, l.context);
            try { l.fn.apply(l.context, args); }
            catch (err) { console.error(`[Emitter] listener for "${event}" threw:`, err); }
        }
        return true;
    }
    listenerCount(event) { return (this._l.get(event) || []).length; }
    removeAllListeners(event) { if (event) this._l.delete(event); else this._l.clear(); return this; }
}
