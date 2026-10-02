// normalize.js — the ONE place where data-file shapes become engine shapes.
// Role 4 owns JSON field names; Role 1 owns the engine shape. A schema rename
// is a one-file fix here. All adapters are pure, idempotent, non-mutating.
//   trigger_id→id  condition_type→condition  condition_value→value
//   linked_sequence_id→sequence_id  pauses_tactical_scene→pauses_tactical(default true)
//   is_repeatable→repeatable(default false)
export const SYSTEM_SEQUENCES = Object.freeze(['SYSTEM_HEAL_FULL']);
const KNOWN_CONDITIONS = ['UNIT_HP_BELOW_PERCENT', 'UNIT_DEATH', 'UNIT_ENTER_TILE', 'TURN_COUNT_EQUAL', 'TURN_START'];

// INTERIM aliases for sequence ids referenced by triggers but named differently in the
// dialogue files (Role 4 should fix the data; delete an entry once they do).
// key = id used by the trigger, value = real sequence_id (verified by tests/data-links).
export const SEQUENCE_ALIASES = {};

export function normalizeTrigger(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object') return { trigger: null, errors: ['trigger is not an object'] };
    if (raw.id && raw.condition && raw.sequence_id !== undefined) return { trigger: { ...raw }, errors };

    const id = raw.trigger_id;
    let condition = raw.condition_type;
    let value = raw.condition_value;
    if (condition === 'TURN_COUNT_EQUAL' && value === 'EVERY_TURN') { condition = 'TURN_START'; value = null; }

    if (!id) errors.push('missing trigger_id');
    if (!condition) errors.push('missing condition_type');
    else if (!KNOWN_CONDITIONS.includes(condition)) errors.push(`unknown condition_type "${condition}"`);
    if (!raw.linked_sequence_id) errors.push('missing linked_sequence_id');
    if (condition === 'TURN_COUNT_EQUAL' && !Number.isInteger(Number(value))) errors.push(`TURN_COUNT_EQUAL needs an integer, got "${value}"`);
    if (['UNIT_HP_BELOW_PERCENT', 'UNIT_DEATH', 'UNIT_ENTER_TILE'].includes(condition) && !raw.target_unit_id) errors.push(`${condition} needs target_unit_id`);
    if (condition === 'UNIT_ENTER_TILE' && !(value && Number.isInteger(value.x) && Number.isInteger(value.y))) errors.push('UNIT_ENTER_TILE needs condition_value {x,y}');
    if (errors.length) return { trigger: null, errors };

    return { trigger: {
        id, condition, value,
        target_unit_id: raw.target_unit_id ?? null,
        sequence_id: SEQUENCE_ALIASES[raw.linked_sequence_id] || raw.linked_sequence_id,
        pauses_tactical: raw.pauses_tactical_scene !== false,
        repeatable: raw.is_repeatable === true,
        node_id: raw.node_id ?? null
    }, errors };
}

export function normalizeDirective(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object') return { directive: null, errors: ['directive is not an object'] };
    if (!raw.directive_id) errors.push('missing directive_id');
    if (!raw.directive_type) errors.push('missing directive_type');
    if (errors.length) return { directive: null, errors };
    const d = { ...raw };
    d.fail_on_deviation = raw.fail_on_deviation !== false;   // schema default: true
    d.node_id = raw.node_id ?? null;
    if (!d.target_tile) d.target_tile = raw.destination_tile || raw.destination || undefined;
    if (!d.escort_to_unit_id) d.escort_to_unit_id = raw.destination_unit_id || undefined;
    return { directive: d, errors };
}

/** Items with node_id === nodeId apply; items with no node_id apply to every node (legacy) — `unlinkedCount` lets callers warn. */
export function filterForNode(items, nodeId) {
    const linked = items.filter(i => i.node_id === nodeId);
    const unlinked = items.filter(i => !i.node_id);
    return { items: [...linked, ...unlinked], unlinkedCount: unlinked.length };
}

/** Infer a trigger's node from its sequence's node_id — only if that node exists in the timeline. */
export function linkTriggersToNodes(triggers, sequencesById, nodeIds) {
    const known = new Set(nodeIds);
    return triggers.map(t => {
        if (t.node_id) return t;
        const seq = sequencesById[t.sequence_id];
        return seq && known.has(seq.node_id) ? { ...t, node_id: seq.node_id } : t;
    });
}

export function normalizeSequence(raw) {
    const errors = [];
    if (!raw || !raw.sequence_id) return { sequence: null, errors: ['missing sequence_id'] };
    if (!Array.isArray(raw.nodes) || !raw.nodes.length) return { sequence: null, errors: [`${raw.sequence_id}: no dialogue nodes`] };
    const ids = new Set(raw.nodes.map(n => n.dialogue_id));
    for (const n of raw.nodes) {
        if (n.next_dialogue_id && !ids.has(n.next_dialogue_id)) errors.push(`${raw.sequence_id}/${n.dialogue_id}: next_dialogue_id "${n.next_dialogue_id}" not found`);
        for (const c of n.choices || []) if (!ids.has(c.next_dialogue_id)) errors.push(`${raw.sequence_id}/${c.choice_id}: next_dialogue_id "${c.next_dialogue_id}" not found`);
    }
    return { sequence: { ...raw, trigger_event: raw.trigger_event || 'MID_BATTLE' }, errors };
}
