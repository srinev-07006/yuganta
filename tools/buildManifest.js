// buildManifest.js — derives the data index from public/data. Nobody edits an index by hand.
// Output (consumed by TimelineManager / BootScene / DevNodePicker):
//   { parvas:[{ parva_id, slug, name, order_index, is_unlocked,
//               nodes:[{ node_id, war_day, phase_name, title, initial_scene_type, map_id }],
//               dialogues:[ 'file.json', … ] }],
//     maps:[ map_id, … ],            // files found in public/data/maps/*.json
//     problems:[ string, … ] }       // readable data problems (never throws for bad data)
// Pure Node (fs/path only) so it runs from vite.config.js and from tests.
import fs from 'node:fs';
import path from 'node:path';

const readJson = (file, problems) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch (err) { problems.push(`${path.basename(path.dirname(file))}/${path.basename(file)}: ${err.message}`); return null; }
};

export function buildManifest(dataDir) {
    const problems = [];
    const parvasDir = path.join(dataDir, 'parvas');
    const mapsDir = path.join(dataDir, 'maps');

    const maps = fs.existsSync(mapsDir)
        ? fs.readdirSync(mapsDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort()
        : [];

    const parvas = [];
    const seenNodes = new Map();
    const slugs = fs.existsSync(parvasDir)
        ? fs.readdirSync(parvasDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
        : [];

    for (const slug of slugs) {
        const dir = path.join(parvasDir, slug);
        const meta = readJson(path.join(dir, '_meta.json'), problems);
        const timelineData = readJson(path.join(dir, 'timeline.json'), problems);
        if (!meta || !timelineData) {
            problems.push(`${slug}: missing/invalid _meta.json or timeline.json — parva skipped`);
            continue;
        }
        const timelineNodes = timelineData.nodes || timelineData.timeline || [];
        if (!Array.isArray(timelineNodes)) {
            problems.push(`${slug}: timeline (nodes) is not an array — parva skipped`);
            continue;
        }

        if (!fs.existsSync(path.join(dir, 'directives.json'))) {
            problems.push(`${slug}: directives.json missing — parva skipped`);
            continue;
        }
        const dlgDir = path.join(dir, 'dialogues');
        const dialogues = fs.existsSync(dlgDir) ? fs.readdirSync(dlgDir).filter(f => f.endsWith('.json')).sort() : [];

        const nodes = [];
        for (const n of timelineNodes) {
            const node_id = n.node_id || n.id;
            if (!node_id) { problems.push(`${slug}: a timeline node has no node_id/id — skipped`); continue; }
            if (seenNodes.has(node_id)) { problems.push(`node_id "${node_id}" appears in both ${seenNodes.get(node_id)} and ${slug}`); continue; }
            seenNodes.set(node_id, slug);

            if (n.map_id && !maps.includes(n.map_id)) problems.push(`${node_id}: map_id "${n.map_id}" has no file in public/data/maps (demo map will be used)`);
            nodes.push({
                node_id: node_id, war_day: n.war_day ?? n.day ?? 0, phase_name: n.phase_name ?? '',
                title: n.title ?? node_id, initial_scene_type: n.initial_scene_type || (n.battle_start === false ? 'VN' : 'TACTICAL'), map_id: n.map_id ?? null
            });
        }
        parvas.push({
            parva_id: meta.parva_id ?? timelineNodes[0]?.parva_id ?? null, slug, name: meta.name ?? slug,
            order_index: meta.order_index ?? meta.order ?? 999, is_unlocked: (meta.locked === true ? false : (meta.is_unlocked !== false)), nodes, dialogues
        });
    }
    parvas.sort((a, b) => a.order_index - b.order_index);
    return { parvas, maps, problems };
}
