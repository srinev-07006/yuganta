export function mountSanjayaScrubber(game, timeline) {
    if (typeof document === 'undefined' || document.getElementById('sanjaya-scrubber')) return;
    const host = document.getElementById('game-container') || document.body;
    
    // Container
    const wrap = document.createElement('div');
    wrap.id = 'sanjaya-scrubber';
    wrap.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: linear-gradient(to bottom, rgba(11, 10, 18, 0.95) 0%, rgba(11, 10, 18, 0.8) 100%);
        border-bottom: 1px solid rgba(255, 209, 102, 0.3);
        z-index: 1500;
        display: flex;
        align-items: center;
        padding: 0 24px;
        font-family: 'Cinzel', Georgia, serif;
        color: #f0e6d2;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        overflow-x: auto;
        overflow-y: hidden;
        user-select: none;
    `;

    // Title / Sanjaya branding
    const title = document.createElement('div');
    title.style.cssText = `
        font-size: 14px;
        font-weight: bold;
        color: #ffd166;
        text-transform: uppercase;
        margin-right: 24px;
        letter-spacing: 2px;
        text-shadow: 0 0 10px rgba(255, 209, 102, 0.3);
        display: flex;
        flex-direction: column;
    `;
    title.innerHTML = `<span>Sanjaya's</span><span style="font-size: 10px; color: #a39580; letter-spacing: 3px;">Vision</span>`;
    wrap.appendChild(title);

    // Timeline track
    const track = document.createElement('div');
    track.style.cssText = `
        display: flex;
        flex: 1;
        align-items: center;
        position: relative;
    `;
    wrap.appendChild(track);

    const parvas = timeline.listParvas();
    
    // Build Nodes
    const uiNodes = new Map();

    parvas.forEach((p, pIndex) => {
        // Parva separator
        if (pIndex > 0) {
            const sep = document.createElement('div');
            sep.style.cssText = 'width: 20px; height: 1px; background: rgba(255, 209, 102, 0.2); margin: 0 10px;';
            track.appendChild(sep);
        }

        // Parva label
        const pLabel = document.createElement('div');
        pLabel.style.cssText = `
            font-size: 10px;
            color: rgba(255, 209, 102, 0.6);
            margin-right: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            white-space: nowrap;
        `;
        pLabel.textContent = p.name;
        track.appendChild(pLabel);

        // Nodes
        p.nodes.forEach(n => {
            const nodeBtn = document.createElement('div');
            const isVN = n.initial_scene_type === 'VN';
            nodeBtn.style.cssText = `
                position: relative;
                width: 32px;
                height: 32px;
                margin: 0 4px;
                border-radius: 50%;
                background: rgba(40, 35, 30, 0.8);
                border: 1px solid rgba(255, 209, 102, 0.4);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: bold;
                color: #a39580;
                transition: all 0.2s ease;
                flex-shrink: 0;
            `;
            nodeBtn.textContent = n.war_day ? `D${n.war_day}` : (isVN ? 'VN' : 'E');
            nodeBtn.title = `${n.title}\n${isVN ? 'Narrative Event' : 'Tactical Battle'}`;
            
            nodeBtn.onmouseenter = () => {
                if (!nodeBtn.classList.contains('active')) {
                    nodeBtn.style.background = 'rgba(255, 209, 102, 0.2)';
                    nodeBtn.style.borderColor = '#ffd166';
                    nodeBtn.style.transform = 'scale(1.1)';
                }
            };
            nodeBtn.onmouseleave = () => {
                if (!nodeBtn.classList.contains('active')) {
                    nodeBtn.style.background = 'rgba(40, 35, 30, 0.8)';
                    nodeBtn.style.borderColor = 'rgba(255, 209, 102, 0.4)';
                    nodeBtn.style.transform = 'scale(1)';
                }
            };
            
            nodeBtn.onclick = async () => {
                try {
                    // Update visuals preemptively for responsiveness
                    setActive(n.node_id);
                    const bundle = await timeline.loadNode(n.node_id);
                    game.scene.start('TacticalScene', { bundle });
                } catch (err) { console.error('[SanjayaScrubber]', err); }
            };

            track.appendChild(nodeBtn);
            uiNodes.set(n.node_id, nodeBtn);
        });
    });

    const setActive = (nodeId) => {
        uiNodes.forEach((btn, id) => {
            if (id === nodeId) {
                btn.style.background = 'rgba(255, 209, 102, 0.2)';
                btn.style.borderColor = '#ffd166';
                btn.style.color = '#ffd166';
                btn.style.boxShadow = '0 0 12px rgba(255, 209, 102, 0.4)';
                btn.classList.add('active');
                
                // Ensure it's in view
                btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } else {
                btn.style.background = 'rgba(40, 35, 30, 0.8)';
                btn.style.borderColor = 'rgba(255, 209, 102, 0.4)';
                btn.style.color = '#a39580';
                btn.style.boxShadow = 'none';
                btn.classList.remove('active');
            }
        });
    };

    game.events.on('yuganta:node-started', setActive);
    host.appendChild(wrap);
}
