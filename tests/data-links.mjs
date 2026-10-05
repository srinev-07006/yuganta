// Cross-reference check for everything the data files point at. Plain Node, no Phaser.
//   npm run test:links
// Catches what JSON-schema cannot: dangling sequence ids, unknown speakers, unresolved trait/astra/vow ids,
// deviation scenes that do not exist, timeline nodes that point at missing maps.
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('public/data');
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const problems = [];
const bad = (m) => problems.push(m);

// "narrator" is a system voice, not a roster character; YugantaVN prints it as "Narrator".
const SYSTEM_SPEAKERS = new Set(['narrator']);
// Trigger sequence ids the engine handles itself (see normalize.js)
const SYSTEM_SEQUENCES = new Set(['SYSTEM_HEAL_FULL']);

// ---------- global roster ----------
const lore = rj(`${DATA}/global/lore.json`);
const chars = rj(`${DATA}/global/characters.json`).characters;
const traitIds = new Set(lore.traits.map(t => t.trait_id));
const astraIds = new Set(lore.astras.map(a => a.astra_id));
const vowIds = new Set(lore.vows_boons.map(v => v.id));
const charIds = new Set(chars.map(c => c.character_id));
for (const c of chars) {
    for (const t of c.traits || []) if (!traitIds.has(t)) bad(`characters.json: ${c.character_id} → unknown trait "${t}"`);
    for (const a of c.astras || []) if (!astraIds.has(a)) bad(`characters.json: ${c.character_id} → unknown astra "${a}"`);
    for (const v of c.vows || []) if (!vowIds.has(v)) bad(`characters.json: ${c.character_id} → unknown vow "${v}"`);
}

const mapFiles = new Set(fs.readdirSync(`${DATA}/maps`).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));

// ---------- parvas ----------
let sequences = 0, deviations = 0, triggers = 0;
for (const slug of fs.readdirSync(`${DATA}/parvas`)) {
    const dir = `${DATA}/parvas/${slug}`;
    if (!fs.statSync(dir).isDirectory()) continue;
    const tl = rj(`${dir}/timeline.json`);
    const tlNodes = Array.isArray(tl.timeline) ? tl.timeline : (tl.nodes || tl.timeline?.nodes || []);
    const nodeIds = new Set(tlNodes.map(n => n.node_id || n.id).filter(Boolean));

    for (const n of tlNodes) {
        if (n.map_id && !mapFiles.has(n.map_id)) bad(`${slug}/timeline: node ${n.node_id || n.id} → map "${n.map_id}" has no file in data/maps`);
    }

    // sequences
    const seqById = new Map();
    const dlgDir = `${dir}/dialogues`;
    for (const f of fs.existsSync(dlgDir) ? fs.readdirSync(dlgDir).filter(x => x.endsWith('.json')) : []) {
        const seq = rj(`${dlgDir}/${f}`);
        const tag = `${slug}/dialogues/${f}`;
        if (!seq.sequence_id) { bad(`${tag}: missing sequence_id`); continue; }
        if (seqById.has(seq.sequence_id)) bad(`${tag}: duplicate sequence_id "${seq.sequence_id}"`);
        seqById.set(seq.sequence_id, seq); sequences++;
        if (!Array.isArray(seq.nodes) || !seq.nodes.length) { bad(`${tag}: no nodes`); continue; }
        if (seq.node_id && !nodeIds.has(seq.node_id)) bad(`${tag}: node_id "${seq.node_id}" is not in ${slug}/timeline.json`);
        const ids = new Set();
        for (const n of seq.nodes) {
            if (ids.has(n.dialogue_id)) bad(`${tag}: duplicate dialogue_id "${n.dialogue_id}"`);
            ids.add(n.dialogue_id);
        }
        let endpoint = false;
        for (const n of seq.nodes) {
            if (!n.dialogue_text) bad(`${tag}/${n.dialogue_id}: empty dialogue_text`);
            if (!charIds.has(n.speaker_id) && !SYSTEM_SPEAKERS.has(n.speaker_id)) bad(`${tag}/${n.dialogue_id}: speaker "${n.speaker_id}" is not in characters.json`);
            if (n.next_dialogue_id && !ids.has(n.next_dialogue_id)) bad(`${tag}/${n.dialogue_id}: next_dialogue_id "${n.next_dialogue_id}" not found`);
            for (const c of n.choices || []) if (!ids.has(c.next_dialogue_id)) bad(`${tag}/${c.choice_id}: next_dialogue_id "${c.next_dialogue_id}" not found`);
            if (n.is_endpoint) endpoint = true;
        }
        if (!endpoint) bad(`${tag}: no node has is_endpoint:true`);
    }

    // directives + triggers
    const dj = rj(`${dir}/directives.json`);
    for (const d of dj.directives || []) {
        if (!d.directive_id) bad(`${slug}/directives: entry without directive_id (${JSON.stringify(d).slice(0, 70)}…)`);
        if (!d.directive_type) bad(`${slug}/directives: ${d.directive_id || '?'} has no directive_type`);
        if (d.node_id && !nodeIds.has(d.node_id)) bad(`${slug}/directives: ${d.directive_id} → node_id "${d.node_id}" not in timeline`);
        if (d.deviation_dialogue_id) {
            deviations++;
            if (!seqById.has(d.deviation_dialogue_id)) bad(`${slug}/directives: ${d.directive_id} → deviation scene "${d.deviation_dialogue_id}" does not exist`);
        }
    }
    for (const t of dj.triggers || []) {
        triggers++;
        const sid = t.linked_sequence_id;
        if (!sid) bad(`${slug}/triggers: ${t.trigger_id || '?'} has no linked_sequence_id`);
        else if (!SYSTEM_SEQUENCES.has(sid) && !seqById.has(sid)) bad(`${slug}/triggers: ${t.trigger_id} → sequence "${sid}" does not exist`);
    }
}

console.log(`${sequences} sequences, ${deviations} deviation links, ${triggers} triggers, ${chars.length} characters checked.`);
if (problems.length) { console.log(`\n${problems.length} PROBLEM(S):`); problems.forEach(p => console.log('  ✗ ' + p)); }
else console.log('ALL DATA LINKS RESOLVE');
process.exit(problems.length ? 1 : 0);
