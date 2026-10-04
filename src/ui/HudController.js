// =============================================================
// HudController.js — DOM-based UI for TacticalScene
// =============================================================
// Manages all DOM elements: action menu, tooltips, info cards, combat log,
// objectives, turn display, banners, and dharma meter.
// Never touches the Phaser canvas directly. TacticalScene feeds all UI state.
// =============================================================

export class HudController {
    constructor() {
        this.callbacks = {};
        this.menuOpen = false;
        this.logEntries = [];
        this.objectives = new Map();
        this.currentNode = {};
        this.currentTurn = {};
        this.insets_ = { top: 20, left: 20, right: 20, bottom: 20 };

        // DOM roots
        this.menuEl = null;
        this.tipEl = null;
        this.cardEl = null;
        this.logEl = null;
        this.headerEl = null;
        this.objectivesEl = null;
        this.bannerEl = null;
        this.turnEl = null;
        this.dharmaEl = null;

        this._buildDom();
        this.attach();
    }

    /**
     * Register action callbacks from TacticalScene.
     */
    bind(callbacks) {
        this.callbacks = callbacks || {};
        return this;
    }

    /**
     * Build DOM structure (browser only).
     */
    _buildDom() {
        // Skip in headless/Node environments
        try {
            if (typeof document === 'undefined' || !document.body) return;
            if (typeof document.body.querySelector !== 'function') return;
            const root = document.body;
            if (root.querySelector('[data-yuganta-hud]')) return;
            root.appendChild(this._buildHudContainer());
        } catch (e) {
            // Silently fail in Node.js
        }
    }

    /**
     * Inject DOM references (called after DOM is built).
     */
    attach() {
        // Skip in headless/Node environments
        try {
            if (typeof document === 'undefined' || !document.body) return this;
            if (typeof document.body.querySelector !== 'function') return this;
            const root = document.body;
            this.menuEl = root.querySelector('[data-hud-menu]');
            this.tipEl = root.querySelector('[data-hud-tip]');
            this.cardEl = root.querySelector('[data-hud-card]');
            this.logEl = root.querySelector('[data-hud-log]');
            this.headerEl = root.querySelector('[data-hud-header]');
            this.objectivesEl = root.querySelector('[data-hud-objectives]');
            this.bannerEl = root.querySelector('[data-hud-banner]');
            this.turnEl = root.querySelector('[data-hud-turn]');
            this.dharmaEl = root.querySelector('[data-hud-dharma]');
        } catch (e) {
            // Silently fail in Node.js
        }
        return this;
    }

    /**
     * Build the complete HUD container with all sub-elements.
     */
    _buildHudContainer() {
        const container = document.createElement('div');
        container.setAttribute('data-yuganta-hud', '');
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            font-family: system-ui, sans-serif;
            z-index: 1000;
        `;

        // Header with node title
        const header = document.createElement('div');
        header.setAttribute('data-hud-header', '');
        header.style.cssText = `
            position: fixed;
            top: 12px;
            left: 12px;
            background: rgba(20, 20, 30, 0.85);
            border: 1px solid #f3d98b;
            border-radius: 4px;
            padding: 8px 12px;
            pointer-events: auto;
            color: #f3d98b;
            font-size: 14px;
            font-weight: bold;
            z-index: 1010;
        `;
        header.innerHTML = '<div style="margin: 0;">Yuganta</div><div style="font-size: 11px; color: #aaa; margin-top: 2px;">—</div>';
        container.appendChild(header);

        // Turn display
        const turn = document.createElement('div');
        turn.setAttribute('data-hud-turn', '');
        turn.style.cssText = `
            position: fixed;
            top: 12px;
            right: 12px;
            background: rgba(20, 20, 30, 0.85);
            border: 1px solid #888;
            border-radius: 4px;
            padding: 8px 12px;
            pointer-events: auto;
            color: #aaa;
            font-size: 12px;
            z-index: 1010;
            min-width: 150px;
            text-align: right;
        `;
        turn.innerHTML = '<div>Round 0</div><div style="font-size: 11px;">—</div>';
        container.appendChild(turn);

        // Dharma meter
        const dharma = document.createElement('div');
        dharma.setAttribute('data-hud-dharma', '');
        dharma.style.cssText = `
            position: fixed;
            top: 70px;
            right: 12px;
            background: rgba(20, 20, 30, 0.85);
            border: 1px solid #f3d98b;
            border-radius: 4px;
            padding: 6px;
            pointer-events: auto;
            z-index: 1010;
            width: 180px;
        `;
        dharma.innerHTML = `
            <div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">Dharma: <span style="color: #f3d98b; font-weight: bold;">100%</span></div>
            <div style="background: #333; height: 12px; border-radius: 2px; overflow: hidden;">
                <div style="background: #f3d98b; height: 100%; width: 100%; transition: width 0.3s;"></div>
            </div>
        `;
        container.appendChild(dharma);

        // Objectives panel
        const objectives = document.createElement('div');
        objectives.setAttribute('data-hud-objectives', '');
        objectives.style.cssText = `
            position: fixed;
            top: 140px;
            right: 12px;
            background: rgba(20, 20, 30, 0.85);
            border: 1px solid #35b6d6;
            border-radius: 4px;
            padding: 8px;
            pointer-events: auto;
            color: #ddd;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            max-width: 240px;
            z-index: 1010;
        `;
        objectives.innerHTML = '<div style="color: #aaa; font-size: 11px;">Objectives</div>';
        container.appendChild(objectives);

        // Action menu
        const menu = document.createElement('div');
        menu.setAttribute('data-hud-menu', '');
        menu.style.cssText = `
            position: fixed;
            background: rgba(20, 20, 30, 0.95);
            border: 2px solid #f3d98b;
            border-radius: 4px;
            padding: 8px;
            display: none;
            pointer-events: auto;
            z-index: 1001;
            min-width: 120px;
        `;
        container.appendChild(menu);

        // Tooltip (unit hover)
        const tip = document.createElement('div');
        tip.setAttribute('data-hud-tip', '');
        tip.style.cssText = `
            position: fixed;
            background: rgba(10, 10, 20, 0.9);
            border: 1px solid #888;
            border-radius: 3px;
            padding: 6px 8px;
            font-size: 12px;
            color: #ddd;
            display: none;
            pointer-events: none;
            white-space: nowrap;
            z-index: 1000;
        `;
        container.appendChild(tip);

        // Info card (selected unit details)
        const card = document.createElement('div');
        card.setAttribute('data-hud-card', '');
        card.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(20, 20, 30, 0.95);
            border: 1px solid #35b6d6;
            border-radius: 4px;
            padding: 12px;
            width: 280px;
            max-height: 200px;
            overflow-y: auto;
            display: none;
            pointer-events: auto;
            color: #ddd;
            font-size: 13px;
            z-index: 999;
        `;
        container.appendChild(card);

        // Combat log
        const log = document.createElement('div');
        log.setAttribute('data-hud-log', '');
        log.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            max-height: 300px;
            background: rgba(10, 10, 15, 0.85);
            border: 1px solid #555;
            border-radius: 4px;
            padding: 8px;
            overflow-y: auto;
            display: block;
            pointer-events: auto;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            color: #aaa;
            z-index: 999;
        `;
        container.appendChild(log);

        // Banner (fullscreen announcements)
        const banner = document.createElement('div');
        banner.setAttribute('data-hud-banner', '');
        banner.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(20, 20, 30, 0.95);
            border: 2px solid #f3d98b;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            display: none;
            pointer-events: auto;
            z-index: 2000;
            min-width: 300px;
        `;
        banner.innerHTML = '<div style="color: #f3d98b; font-size: 28px; font-weight: bold; margin-bottom: 12px;">Title</div><div style="color: #aaa; font-size: 16px;">Subtitle</div>';
        container.appendChild(banner);

        return container;
    }

    // =============================================================
    // SETUP & STATE
    // =============================================================

    setNode(data) {
        this.currentNode = data || {};
        if (this.headerEl && typeof this.headerEl.innerHTML !== 'undefined') {
            this.headerEl.innerHTML = `
                <div style="margin: 0;">${data?.title || 'Yuganta'}</div>
                <div style="font-size: 11px; color: #aaa; margin-top: 2px;">${data?.subtitle || '—'}</div>
            `;
        }
    }

    setTurn(data) {
        this.currentTurn = data || {};
        if (this.turnEl && typeof this.turnEl.innerHTML !== 'undefined') {
            const faction = data?.faction ? `${data.faction} phase` : '—';
            const running = data?.running ? `●` : '○';
            this.turnEl.innerHTML = `
                <div>Round ${data?.round || 0} ${running}</div>
                <div style="font-size: 11px; color: #aaa;">${faction}</div>
            `;
        }
    }

    setDharma(value) {
        if (this.dharmaEl && typeof this.dharmaEl.querySelector !== 'undefined') {
            const percent = Math.max(0, Math.min(100, value));
            const bar = this.dharmaEl.querySelector('div > div:last-child > div');
            const label = this.dharmaEl.querySelector('span');
            if (bar) bar.style.width = percent + '%';
            if (label) label.textContent = Math.round(percent) + '%';
        }
    }

    setObjectives(objectives) {
        this.objectives.clear();
        objectives?.forEach(obj => this.objectives.set(obj.id, { text: obj.text, status: 'ACTIVE' }));
        this._renderObjectives();
    }

    setObjectiveStatus(id, status) {
        const obj = this.objectives.get(id);
        if (obj) {
            obj.status = status;
            this._renderObjectives();
        }
    }

    _renderObjectives() {
        if (!this.objectivesEl || typeof this.objectivesEl.innerHTML === 'undefined') return;
        let html = '<div style="color: #aaa; font-size: 11px; margin-bottom: 6px;">Objectives</div>';
        for (const [id, obj] of this.objectives) {
            const color = obj.status === 'COMPLETED' ? '#3cb371' : (obj.status === 'FAILED' ? '#ff6b6b' : '#ddd');
            const mark = obj.status === 'COMPLETED' ? '✓' : (obj.status === 'FAILED' ? '✗' : '○');
            html += `<div style="color: ${color}; margin: 4px 0; font-size: 12px;">${mark} ${obj.text}</div>`;
        }
        this.objectivesEl.innerHTML = html;
    }

    // =============================================================
    // ACTION MENU
    // =============================================================

    /**
     * Display action menu at screen position.
     * flags: { canMove, canAttack }
     * quiet: if true, don't announce the selection
     */
    showMenu(pos, unit, flags = {}, quiet = false) {
        if (!this.menuEl || typeof this.menuEl.innerHTML === 'undefined') return;

        const { canMove, canAttack } = flags;
        let html = '';

        html += `<button data-action="move" ${canMove ? '' : 'disabled'} style="
            display: block;
            width: 100%;
            padding: 6px;
            margin: 4px 0;
            background: #35b6d6;
            color: #000;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-weight: bold;
        ">Move</button>`;

        html += `<button data-action="attack" ${canAttack ? '' : 'disabled'} style="
            display: block;
            width: 100%;
            padding: 6px;
            margin: 4px 0;
            background: #e0483a;
            color: #fff;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-weight: bold;
        ">Attack</button>`;

        html += `<button data-action="wait" style="
            display: block;
            width: 100%;
            padding: 6px;
            margin: 4px 0;
            background: #888;
            color: #fff;
            border: none;
            border-radius: 2px;
            cursor: pointer;
        ">Wait</button>`;

        if (flags.astras && flags.astras.length > 0) {
            html += `<hr style="border: 0; border-top: 1px solid #555; margin: 6px 0;" />`;
            flags.astras.forEach(astra => {
                const canUse = astra.allowed;
                html += `<button data-action="astra" data-id="${astra.id}" ${canUse ? '' : 'disabled'} title="${astra.reason || astra.description}" style="
                    display: block;
                    width: 100%;
                    padding: 6px;
                    margin: 4px 0;
                    background: ${canUse ? '#9b4dca' : '#553c66'};
                    color: ${canUse ? '#fff' : '#aaa'};
                    border: 1px solid ${canUse ? '#d0a2f5' : '#666'};
                    border-radius: 2px;
                    cursor: pointer;
                    font-weight: bold;
                ">🌟 ${astra.name}</button>`;
            });
        }

        if (flags.vows && flags.vows.length > 0) {
            html += `<hr style="border: 0; border-top: 1px solid #555; margin: 6px 0;" />`;
            flags.vows.forEach(vow => {
                const active = vow.active;
                html += `<button data-action="vow" data-id="${vow.id}" style="
                    display: block;
                    width: 100%;
                    padding: 6px;
                    margin: 4px 0;
                    background: ${active ? '#dca84d' : '#886d3b'};
                    color: ${active ? '#000' : '#ddd'};
                    border: 1px solid ${active ? '#f5d9a2' : '#666'};
                    border-radius: 2px;
                    cursor: pointer;
                    font-weight: bold;
                ">📜 ${vow.name}</button>`;
            });
        }

        if (flags.charioteerSynergies && flags.charioteerSynergies.length > 0) {
            html += `<hr style="border: 0; border-top: 1px solid #555; margin: 6px 0;" />`;
            flags.charioteerSynergies.forEach(synergy => {
                const ready = synergy.available;
                const usesText = synergy.available ? '(available)' : '(on cooldown)';
                html += `<button data-action="charioteer-synergy" data-id="${synergy.id}" ${ready ? '' : 'disabled'} style="
                    display: block;
                    width: 100%;
                    padding: 6px;
                    margin: 4px 0;
                    background: ${ready ? '#8b4513' : '#553c66'};
                    color: ${ready ? '#fff' : '#aaa'};
                    border: 1px solid ${ready ? '#d2b48c' : '#666'};
                    border-radius: 2px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 11px;
                ">⚔️ ${synergy.name} ${usesText}</button>`;
            });
        }

        html += `<button data-action="cancel" style="
            display: block;
            width: 100%;
            padding: 6px;
            margin: 4px 0;
            background: #444;
            color: #aaa;
            border: 1px solid #666;
            border-radius: 2px;
            cursor: pointer;
        ">Cancel</button>`;

        this.menuEl.innerHTML = html;
        this.menuEl.style.left = pos.x + 'px';
        this.menuEl.style.top = pos.y + 'px';
        this.menuEl.style.display = 'block';

        // Attach button listeners (if querySelectorAll exists)
        if (typeof this.menuEl.querySelectorAll === 'function') {
            this.menuEl.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = btn.getAttribute('data-action');
                    const id = btn.getAttribute('data-id');
                    if (this.callbacks[action]) this.callbacks[action](id);
                });
            });
        }

        this.menuOpen = true;
        if (!quiet) this.log(`${unit.name} ready for action.`, 'info');
    }

    hideMenu() {
        if (this.menuEl && typeof this.menuEl.style !== 'undefined') this.menuEl.style.display = 'none';
        this.menuOpen = false;
    }

    isMenuOpen() {
        return this.menuOpen;
    }

    // =============================================================
    // TOOLTIPS & CARDS
    // =============================================================

    showUnitTip(unit, x, y) {
        if (!this.tipEl || typeof this.tipEl.style === 'undefined') return;
        const hp = `${unit.currentHp}/${unit.maxHp}`;
        const text = `${unit.name}  [${hp}] ATK ${unit.attackPower} DEF ${unit.defense}`;
        this.tipEl.textContent = text;
        this.tipEl.style.left = (x + 15) + 'px';
        this.tipEl.style.top = (y + 15) + 'px';
        this.tipEl.style.display = 'block';
    }

    showTileTip(terrain, x, y) {
        if (!this.tipEl || typeof this.tipEl.style === 'undefined') return;
        const text = `${terrain.name}  [Move: ${terrain.move}  Def: ${terrain.defense}]`;
        this.tipEl.textContent = text;
        this.tipEl.style.left = (x + 15) + 'px';
        this.tipEl.style.top = (y + 15) + 'px';
        this.tipEl.style.display = 'block';
    }

    hideTip() {
        if (this.tipEl && typeof this.tipEl.style !== 'undefined') this.tipEl.style.display = 'none';
    }

    showCard(unit, extra = {}) {
        if (!this.cardEl || typeof this.cardEl.innerHTML === 'undefined') return;
        let html = `<strong>${unit.name}</strong><br/>`;
        html += `Faction: <span style="color: ${unit.faction === 'PANDAVA' ? '#35b6d6' : '#e0483a'}">${unit.faction}</span><br/>`;
        html += `HP: ${unit.currentHp}/${unit.maxHp}<br/>`;
        html += `ATK: ${unit.attackPower} · DEF: ${unit.defense}<br/>`;
        html += `Move: ${unit.movement} · Range: ${unit.attackRange}<br/>`;
        if (extra.terrain) html += `<em style="color: #aaa">${extra.terrain}</em><br/>`;
        this.cardEl.innerHTML = html;
        this.cardEl.style.display = 'block';
    }

    hideCard() {
        if (this.cardEl && typeof this.cardEl.style !== 'undefined') this.cardEl.style.display = 'none';
    }

    // =============================================================
    // COMBAT LOG
    // =============================================================

    log(text, level = 'default') {
        if (!this.logEl || typeof this.logEl.appendChild === 'undefined') return;

        const entry = document.createElement('div');
        entry.style.cssText = `
            margin: 4px 0;
            padding: 4px;
            border-left: 3px solid;
            border-color: ${this._levelColor(level)};
            color: ${this._levelTextColor(level)};
        `;
        entry.textContent = text;
        this.logEl.appendChild(entry);

        // Keep only last 50 entries
        while (this.logEl.children.length > 50) {
            this.logEl.removeChild(this.logEl.firstChild);
        }

        // Auto-scroll to bottom
        this.logEl.scrollTop = this.logEl.scrollHeight;
        this.logEntries.push({ text, level, timestamp: Date.now() });
    }

    _levelColor(level) {
        const map = {
            'info': '#35b6d6',
            'good': '#3cb371',
            'bad': '#e0483a',
            'warn': '#f3d98b',
            'system': '#888',
            'story': '#d4a574',
            'damage': '#ff6b6b',
            'heal': '#3cb371'
        };
        return map[level] || '#666';
    }

    _levelTextColor(level) {
        const map = {
            'info': '#35b6d6',
            'good': '#3cb371',
            'bad': '#ff6b6b',
            'warn': '#f3d98b',
            'system': '#aaa',
            'story': '#d4a574',
            'damage': '#ff9999',
            'heal': '#5fd38b'
        };
        return map[level] || '#ddd';
    }

    // =============================================================
    // BANNER (fullscreen announcements)
    // =============================================================

    banner(title, subtitle, duration = 2000) {
        if (!this.bannerEl || typeof this.bannerEl.style === 'undefined') return;
        const titleEl = this.bannerEl.querySelector('div:first-child');
        const subtitleEl = this.bannerEl.querySelector('div:last-child');
        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle;
        this.bannerEl.style.display = 'block';
        if (duration > 0) {
            setTimeout(() => { if (this.bannerEl && typeof this.bannerEl.style !== 'undefined') this.bannerEl.style.display = 'none'; }, duration);
        }
    }

    // =============================================================
    // UTILITIES
    // =============================================================

    insets() {
        return this.insets_;
    }

    clearLog() {
        if (this.logEl && typeof this.logEl.innerHTML !== 'undefined') this.logEl.innerHTML = '';
        this.logEntries = [];
    }

    destroy() {
        try {
            if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
            const hud = document.querySelector('[data-yuganta-hud]');
            if (hud) hud.remove();
        } catch (e) {
            // Silently fail in Node.js
        }
    }
}
