// TimelineManager.js — loads a timeline node and owns its reset snapshot.
// PUBLIC API (Role 2's Sanjaya scrubber only ever needs these):
//   listParvas() · listNodes(parvaIdOrSlug) · findNode(id) · getNextNodeId(id) · getDefaultNodeId()
//   await loadNode(nodeId, { reload })  → NodeBundle
//        reload:true (retry after defeat / imbalance) KEEPS the snapshot taken when the
//        node first started; reload:false/omitted (fresh entry, e.g. from the picker) takes a new one.
//   resetNode() → restores GameState to the node-start snapshot, returns current bundle
// NodeBundle = { node, parva:{id,slug,name}, sceneType:'TACTICAL'|'VN', directives, triggers,
//                sequences:{id→seq}, startSequences:[seq], mapId, map|null, warnings:[string] }
// Data-shape differences are absorbed by normalize.js. One parva's files in memory at a time.
import { normalizeTrigger, normalizeDirective, normalizeSequence, filterForNode, linkTriggersToNodes } from './normalize.js';
import { parseMap } from './MapLoader.js';

export class TimelineManager {
    constructor({ manifest, fetchJson, gameState = null, baseUrl = 'data' }) {
        if (!manifest || !Array.isArray(manifest.parvas)) throw new Error('[TimelineManager] manifest missing');
        if (typeof fetchJson !== 'function') throw new Error('[TimelineManager] fetchJson missing');
        this.manifest = manifest;
        this.fetchJson = fetchJson;
        this.gameState = gameState;
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.current = null;
        this._snapshot = null;
        this._snapshotNodeId = null;
        this._parvaCache = null;
        this._order = manifest.parvas.flatMap(p => p.nodes.map(n => ({ parvaSlug: p.slug, nodeId: n.node_id })));
    }

    listParvas() { return this.manifest.parvas; }
    listNodes(parvaIdOrSlug) {
        const p = this.manifest.parvas.find(x => x.slug === parvaIdOrSlug || x.parva_id === parvaIdOrSlug);
        return p ? p.nodes : [];
    }
    findNode(nodeId) {
        for (const p of this.manifest.parvas) {
            const n = p.nodes.find(x => x.node_id === nodeId);
            if (n) return { parva: p, node: n };
        }
        return null;
    }
    getNextNodeId(nodeId) {
        const i = this._order.findIndex(o => o.nodeId === nodeId);
        return i >= 0 && i < this._order.length - 1 ? this._order[i + 1].nodeId : null;
    }
    getDefaultNodeId() {
        for (const p of this.manifest.parvas) {
            const n = p.nodes.find(x => x.initial_scene_type === 'TACTICAL');
            if (n) return n.node_id;
        }
        return this._order[0]?.nodeId ?? null;
    }

    async loadNode(nodeId, { reload = false } = {}) {
        const hit = this.findNode(nodeId);
        if (!hit) throw new Error(`[TimelineManager] Unknown node "${nodeId}"`);
        const { parva } = hit;
        const warnings = [...(this.manifest.problems || [])];

        const data = await this._loadParva(parva.slug);
        warnings.push(...data.loadWarnings);
        // timeline.json ships in two shapes: { nodes:[{node_id}] } and { timeline:[{id}] } (matches tools/buildManifest.js)
        const tlNodes = Array.isArray(data.timeline) ? data.timeline : (data.timeline.nodes || data.timeline.timeline || []);
        const idOf = n => n.node_id || n.id;
        const node = hit.node.initial_scene_type ? { ...(tlNodes.find(n => idOf(n) === nodeId) || {}), ...hit.node } : hit.node;
        const nodeIds = tlNodes.map(idOf).filter(Boolean);

        const triggers = [];
        for (const raw of data.directivesFile.triggers || []) {
            const { trigger, errors } = normalizeTrigger(raw);
            if (!trigger) { warnings.push(`trigger ${raw?.trigger_id ?? '?'}: ${errors.join('; ')} — dropped`); continue; }
            triggers.push(trigger);
        }
        const trig = filterForNode(linkTriggersToNodes(triggers, data.sequences, nodeIds), nodeId);
        for (const t of trig.items) {
            if (t.sequence_id !== 'SYSTEM_HEAL_FULL' && !data.sequences[t.sequence_id]) {
                warnings.push(`trigger ${t.id}: sequence "${t.sequence_id}" does not exist — it will be skipped when fired (Role 4).`);
            }
        }

        const directives = [];
        for (const raw of data.directivesFile.directives || []) {
            const { directive, errors } = normalizeDirective(raw);
            if (!directive) { warnings.push(`directive ${raw?.directive_id ?? '?'}: ${errors.join('; ')} — dropped`); continue; }
            directives.push(directive);
        }
        const dir = filterForNode(directives, nodeId);
        if (dir.unlinkedCount && directives.length) {
            warnings.push(`${dir.unlinkedCount} directive(s) in ${parva.slug} have no node_id and apply to every node of the parva (ask Role 4 to add node_id).`);
        }

        const startSequences = Object.values(data.sequences).filter(s => s.node_id === nodeId && s.trigger_event === 'NODE_START');

        let map = null;
        // VN nodes never build a grid, so their (backdrop-only) map files are not loaded.
        if ((node.initial_scene_type || 'TACTICAL') !== 'VN' && node.map_id && (this.manifest.maps || []).includes(node.map_id)) {
            try {
                map = parseMap(await this.fetchJson(`${this.baseUrl}/maps/${node.map_id}.json`));
                map.notes.forEach(n => warnings.push(`${node.map_id}: ${n}`));
                if (map.unsupported.length) warnings.push(`${node.map_id}: engine does not implement yet → ${map.unsupported.join(', ')}`);
            } catch (err) { warnings.push(`${err.message} — using demo map`); }
        }

        if (this.gameState) {
            const keep = reload && this._snapshot && this._snapshotNodeId === nodeId;
            if (!keep) {
                this.gameState.currentParva = parva.parva_id;
                this.gameState.currentWarDay = node.war_day ?? 0;
                this._snapshot = this.gameState.snapshot();
                this._snapshotNodeId = nodeId;
            }
        }

        this.current = {
            node,
            parva: { id: parva.parva_id, slug: parva.slug, name: parva.name },
            sceneType: node.initial_scene_type || 'TACTICAL',
            directives: dir.items, triggers: trig.items,
            sequences: data.sequences, startSequences,
            mapId: node.map_id || null, map, warnings,
            pandava_formation: node.pandava_formation || null,
            kaurava_formation: node.kaurava_formation || null
        };
        return this.current;
    }

    /** Dharma Imbalance / defeat: rewind global state to the node's start. */
    resetNode() {
        if (!this.current) throw new Error('[TimelineManager] resetNode() before loadNode()');
        if (this.gameState && this._snapshot) this.gameState.restore(this._snapshot);
        return this.current;
    }

    async _loadParva(slug) {
        if (this._parvaCache && this._parvaCache.slug === slug) return this._parvaCache.data;
        const entry = this.manifest.parvas.find(p => p.slug === slug);
        const base = `${this.baseUrl}/parvas/${slug}`;
        const [timeline, directivesFile, ...dialogueFiles] = await Promise.all([
            this.fetchJson(`${base}/timeline.json`),
            this.fetchJson(`${base}/directives.json`),
            ...entry.dialogues.map(f => this.fetchJson(`${base}/dialogues/${f}`))
        ]);
        const loadWarnings = [];
        const sequences = {};
        dialogueFiles.forEach((raw, i) => {
            const { sequence, errors } = normalizeSequence(raw);
            errors.forEach(e => loadWarnings.push(`dialogues/${entry.dialogues[i]}: ${e}`));
            if (sequence) sequences[sequence.sequence_id] = sequence;
        });
        const data = { timeline, directivesFile, sequences, loadWarnings };
        this._parvaCache = { slug, data };
        return data;
    }
}
