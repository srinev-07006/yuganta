// DebugVNOverlay.js — built-in fallback VN player (plain DOM).
// Lets the tactical layer be developed/tested before Role 2's VN exists. Role 2 replaces it with
//     vnBridge.setProvider(theirProvider)      and this file can be deleted.
// Plays raw dialogue-sequence JSON: buttons advance, choices branch, honours next_dialogue_id /
// is_endpoint. Reports { choicesMade, visitedNodeIds } back to the bridge.
export class DebugVNOverlay {
    constructor(doc = (typeof document !== 'undefined' ? document : null)) { this.doc = doc; }

    play(sequence) {
        if (!this.doc) return Promise.resolve({ choicesMade: [], visitedNodeIds: [] });
        const doc = this.doc;
        return new Promise((resolve) => {
            const byId = new Map(sequence.nodes.map(n => [n.dialogue_id, n]));
            const choicesMade = [];
            const visitedNodeIds = [];

            const root = doc.createElement('div');
            root.id = 'vn-debug-overlay';
            root.style.cssText = 'position:fixed;inset:0;z-index:5000;display:flex;align-items:flex-end;justify-content:center;background:rgba(5,5,10,.72);font-family:Segoe UI,Tahoma,sans-serif;';
            const box = doc.createElement('div');
            box.style.cssText = 'width:min(820px,94vw);margin-bottom:6vh;background:rgba(18,16,24,.97);border:1px solid #c9a063;border-radius:6px;padding:18px 22px;color:#f0e6d2;box-shadow:0 8px 30px rgba(0,0,0,.85);';
            root.appendChild(box);
            doc.body.appendChild(root);

            const finish = () => { root.remove(); resolve({ choicesMade, visitedNodeIds }); };
            const btn = (label) => {
                const b = doc.createElement('button');
                b.textContent = label;
                b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:8px 12px;background:#2a241d;color:#f0e6d2;border:1px solid #5a4833;border-radius:3px;cursor:pointer;font-size:13px;';
                b.onmouseenter = () => { b.style.background = '#c9a063'; b.style.color = '#121218'; };
                b.onmouseleave = () => { b.style.background = '#2a241d'; b.style.color = '#f0e6d2'; };
                return b;
            };

            const show = (node) => {
                if (!node) return finish();          // dangling link → end gracefully
                if (visitedNodeIds.length > 500) return finish();   // cycle guard
                visitedNodeIds.push(node.dialogue_id);
                box.innerHTML = '';
                const who = doc.createElement('div');
                who.style.cssText = 'color:#d4af37;font-weight:700;letter-spacing:.5px;margin-bottom:8px;text-transform:capitalize;';
                who.textContent = `${String(node.speaker_id || '').replace(/-/g, ' ')}${node.speaker_emotion ? ` · ${String(node.speaker_emotion).toLowerCase()}` : ''}`;
                const text = doc.createElement('div');
                text.style.cssText = 'line-height:1.55;font-size:15px;margin-bottom:14px;';
                text.textContent = node.dialogue_text || '';
                box.append(who, text);

                const choices = node.choices || [];
                if (choices.length) {
                    for (const c of choices) {
                        const b = btn(c.choice_text);
                        b.onclick = () => { choicesMade.push(c); show(byId.get(c.next_dialogue_id)); };
                        box.appendChild(b);
                    }
                } else {
                    const b = btn(node.is_endpoint ? 'Continue ▸' : 'Next ▸');
                    b.style.width = 'auto';
                    b.onclick = () => {
                        if (node.is_endpoint) return finish();
                        if (node.next_dialogue_id) return show(byId.get(node.next_dialogue_id));
                        show(sequence.nodes[sequence.nodes.indexOf(node) + 1]);   // linear fallthrough
                    };
                    box.appendChild(b);
                }
            };
            show(sequence.nodes[0]);
        });
    }
}
