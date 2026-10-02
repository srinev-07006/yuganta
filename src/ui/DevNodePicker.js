// DevNodePicker.js — temporary node jumper (Role 2's Sanjaya scrubber replaces it).
// Drop-down of every timeline node grouped by parva; calls timeline.loadNode() and
// restarts TacticalScene. Delete this file + its call in BootScene when the scrubber ships.
// The scene must emit  game.events.emit('yuganta:node-started', nodeId)  to keep it in sync.
export function mountDevNodePicker(game, timeline) {
    if (typeof document === 'undefined' || document.getElementById('dev-node-picker')) return;
    const host = document.getElementById('game-container') || document.body;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:44px;left:16px;z-index:1500;font-size:11px;';
    const sel = document.createElement('select');
    sel.id = 'dev-node-picker';
    sel.style.cssText = 'background:#1c1712;color:#f0e6d2;border:1px solid #5a4833;padding:3px 6px;max-width:300px;';
    for (const p of timeline.listParvas()) {
        const g = document.createElement('optgroup');
        g.label = `${p.parva_id}. ${p.name}`;
        for (const n of p.nodes) {
            const o = document.createElement('option');
            o.value = n.node_id;
            o.textContent = `${n.war_day ? `D${n.war_day} ` : ''}${n.title} ${n.initial_scene_type === 'VN' ? '[VN]' : ''}`;
            g.appendChild(o);
        }
        sel.appendChild(g);
    }
    sel.onchange = async () => {
        try {
            const bundle = await timeline.loadNode(sel.value);      // fresh entry → new snapshot
            game.scene.start('TacticalScene', { bundle });
        } catch (err) { console.error('[DevNodePicker]', err); }
        sel.blur();
    };
    game.events.on('yuganta:node-started', (nodeId) => { sel.value = nodeId; });
    wrap.appendChild(sel);
    host.appendChild(wrap);
}
