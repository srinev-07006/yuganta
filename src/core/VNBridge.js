// VNBridge.js — the ONLY coupling between tactical and narrative.
// Role 1 calls:  await vnBridge.play(sequenceOrId, { sequences })
// Role 2 supplies a PROVIDER (style A or B); with none, the built-in DebugVNOverlay plays raw JSON.
//   A) Promise:  provider.play(sequence, ctx) → Promise<result>
//   B) Event:    provider.play() returns nothing; later call vnBridge.complete(result)
//                or emit 'vn:complete' / 'vn_complete' on game.events (both spellings accepted).
// RESULT (all optional): { choicesMade:[choice objects], visitedNodeIds:[dialogue_id] }
// The bridge applies Purusartha impacts to GameState itself and returns
// tacticalOverrides from BOTH chosen choices and visited nodes (node-level
// tactical_override_event, e.g. DRONA_RAMPAGE_CONTINUES).
// EVENTS: 'vn:request' {sequenceId,sequence} · 'vn:complete' {sequenceId,choicesMade,tacticalOverrides,skipped}
import { Emitter } from './Emitter.js';

export class VNBridge extends Emitter {
    constructor({ gameState = null, events = null, fallbackProvider = null, timeoutMs = 0 } = {}) {
        super();
        this.gameState = gameState;
        this.provider = null;
        this.fallbackProvider = fallbackProvider;
        this.timeoutMs = timeoutMs;          // 0 = wait forever; set in dev to catch providers that never complete()
        this._pending = null;
        this._queue = Promise.resolve();
        if (events && typeof events.on === 'function') {
            events.on('vn:complete', this._onExternalComplete, this);
            events.on('vn_complete', this._onExternalComplete, this);
            this._externalEvents = events;
        }
    }
    setProvider(provider) { this.provider = provider; }
    destroy() {
        if (this._externalEvents) {
            this._externalEvents.off('vn:complete', this._onExternalComplete, this);
            this._externalEvents.off('vn_complete', this._onExternalComplete, this);
        }
        this.removeAllListeners();
    }
    /** Serialised: two sequences never overlap even if triggers fire together. */
    play(sequenceOrId, ctx = {}) {
        const run = () => this._play(sequenceOrId, ctx);
        const p = this._queue.then(run, run);
        this._queue = p.catch(() => {});
        return p;
    }
    complete(result = {}) { if (this._pending) this._pending.resolve(result); }
    _onExternalComplete(payload) { this.complete(payload || {}); }

    async _play(sequenceOrId, ctx) {
        const sequence = typeof sequenceOrId === 'string' ? (ctx.sequences || {})[sequenceOrId] : sequenceOrId;
        const sequenceId = typeof sequenceOrId === 'string' ? sequenceOrId : sequenceOrId?.sequence_id;

        if (!sequence || !Array.isArray(sequence.nodes)) {
            console.warn(`[VNBridge] Sequence "${sequenceId}" not found — skipping. (Role 4: check linked_sequence_id / deviation_dialogue_id.)`);
            const skipped = { sequenceId, choicesMade: [], tacticalOverrides: [], skipped: true };
            this.emit('vn:complete', skipped);
            return skipped;
        }
        this.emit('vn:request', { sequenceId, sequence });
        const provider = this.provider || this.fallbackProvider;

        let raw = {};
        if (provider && typeof provider.play === 'function') {
            raw = await new Promise((resolve) => {
                let timer = null;
                const done = (v) => { if (timer) clearTimeout(timer); resolve(v); };
                this._pending = { resolve: done };
                if (this.timeoutMs > 0) timer = setTimeout(() => { console.error(`[VNBridge] provider did not complete "${sequenceId}" within ${this.timeoutMs}ms — continuing.`); done({}); }, this.timeoutMs);
                let ret;
                try { ret = provider.play(sequence, ctx); }
                catch (err) { console.error('[VNBridge] provider threw:', err); done({}); return; }
                if (ret && typeof ret.then === 'function') ret.then(done, (e) => { console.error('[VNBridge] provider rejected:', e); done({}); });
            });
            this._pending = null;
        } else {
            console.warn('[VNBridge] No VN provider registered — sequence skipped.');
        }

        const choicesMade = Array.isArray(raw?.choicesMade) ? raw.choicesMade : [];
        const overrides = [];
        const add = (e) => { if (e && e !== 'NONE') overrides.push(e); };
        for (const c of choicesMade) {
            if (this.gameState) this.gameState.applyImpacts(c, `vn:${sequenceId}/${c.choice_id || '?'}`);
            add(c.tactical_override_event);
        }
        const visited = new Set(Array.isArray(raw?.visitedNodeIds) ? raw.visitedNodeIds : []);
        for (const n of sequence.nodes) if (visited.has(n.dialogue_id)) add(n.tactical_override_event);

        const result = { sequenceId, choicesMade, tacticalOverrides: overrides, skipped: false };
        this.emit('vn:complete', result);
        return result;
    }
}
