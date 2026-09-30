// =============================================================
// TacticalScene.js — Tactical Battlefield Scene
// =============================================================

import { TERRAIN_CONFIG } from '../data/TerrainConfig.js';
import { executeHandler } from '../handlers/TraitHandlers.js';
import { GridSystem } from '../systems/GridSystem.js';
import { CombatResolver } from '../systems/CombatResolver.js';
import { UnitManager } from '../systems/UnitManager.js';
import { DirectiveManager, DIRECTIVE_EVENTS } from '../systems/DirectiveManager.js';
import { TriggerEvaluator, TRIGGER_EVENTS } from '../systems/TriggerEvaluator.js';

export class TacticalScene extends Phaser.Scene {

    constructor() {
        super({ key: 'TacticalScene' });
    }

    // =============================================================
    // CREATE
    // =============================================================

    create() {
        console.log('[TacticalScene] Building battlefield...');

        this.characterMap = this.registry.get('characterMap');
        this.traitMap = this.registry.get('traitMap');
        this.gameState = this.registry.get('gameState');

        // State Machine
        this.currentState = 'IDLE';
        this.selectedUnit = null;
        this.selectedAstraId = null;
        this.currentTurn = 1;
        this.activePhase = 'PLAYER';

        // CUMULATIVE COMBAT LOG HISTORY
        this.fullCombatLog = ['=== WAR COMMENCES AT KURUKSHETRA ==='];

        this.currentMovementRange = [];
        this.currentAttackTargets = [];
        this._aiTimerEvents = [];

        // 5x5 Grid
        const terrainData = [
            ['plains',   'plains',   'forest',   'plains',   'river'  ],
            ['plains',   'forest',   'forest',   'plains',   'plains' ],
            ['plains',   'plains',   'mountain', 'plains',   'plains' ],
            ['plains',   'plains',   'plains',   'forest',   'plains' ],
            ['desert',   'plains',   'plains',   'plains',   'plains' ]
        ];

        this.grid = new GridSystem(this, {
            cols: 5,
            rows: 5,
            tileSize: 96,
            terrainData: terrainData
        });

        this.combat = new CombatResolver(this, this.grid);
        this.unitManager = new UnitManager(this, this.grid);

        // ----------------------------------------------------------
        // SPAWN UNITS
        // ----------------------------------------------------------
        // Arjuna at (1,4)
        this.unitManager.spawnCharacter('arjuna', 1, 4);
        
        // Shikhandi at (1,3) — Standing near Arjuna to break Bhishma's invulnerability!
        this.unitManager.spawnCharacter('shikhandi', 1, 3);
        
        // Bhishma at (3,0)
        this.unitManager.spawnCharacter('bhishma', 3, 0);

        // Directives
        const prototypeDirectives = [{
            directive_id: 'proto-arjuna-endures',
            directive_type: 'SURVIVE_TURNS',
            target_turns: 3,
            target_unit_id: 'arjuna',
            fail_on_deviation: true,
            deviation_dialogue_id: 'seq_proto_imbalance'
        }];

        this.directives = new DirectiveManager(this, this.grid, prototypeDirectives, {
            nodeId: 'prototype-5x5',
            playerFaction: 'PANDAVA'
        });
        this._bindDirectiveEvents();

        // Triggers (Bhishma fall on <= 50% HP)
        const prototypeTriggers = [{
            trigger_id: 'trigger-bhishma-fall',
            condition_type: 'UNIT_HP_BELOW_PERCENT',
            condition_value: 50,
            target_unit_id: 'bhishma',
            linked_sequence_id: 'seq_day10_fall',
            pauses_tactical_scene: true,
            is_repeatable: false
        }];

        this.triggerEvaluator = new TriggerEvaluator(this, this.grid, prototypeTriggers);
        this._bindTriggerEvents();

        this._setupInput();
        this._createUI();
        this._refreshDirectivePanel();

        console.log('[TacticalScene] Battlefield ready.');
    }

    // =============================================================
    // EVENT BINDINGS
    // =============================================================

    _bindDirectiveEvents() {
        this.directives.on(DIRECTIVE_EVENTS.COMPLETED, ({ directive, reason }) => {
            this._updateCombatLog([`✅ DIRECTIVE COMPLETE: ${reason}`]);
            this._refreshDirectivePanel();
        });

        this.directives.on(DIRECTIVE_EVENTS.FAILED, ({ directive, reason }) => {
            this._updateCombatLog([`❌ DIRECTIVE FAILED: ${reason}`]);
            this._refreshDirectivePanel();
        });

        this.directives.on(DIRECTIVE_EVENTS.ALL_COMPLETE, (payload) => {
            this._endBattle('VICTORY', payload);
        });

        this.directives.on(DIRECTIVE_EVENTS.DHARMA_IMBALANCE, (payload) => {
            this._endBattle('DHARMA_IMBALANCE', payload);
        });

        this.directives.on(DIRECTIVE_EVENTS.CANON_PROGRESS, (payload) => {
            this._endBattle('CANON_PROGRESS', payload);
        });

        this.directives.on(DIRECTIVE_EVENTS.DEFEAT, (payload) => {
            this._endBattle('DEFEAT', payload);
        });
    }

    _bindTriggerEvents() {
        this.triggerEvaluator.on(TRIGGER_EVENTS.FIRE_VN_SEQUENCE, (payload) => {
            this._updateCombatLog([`⏸️ PAUSING BATTLE for Narrative Sequence: ${payload.sequenceId}`]);
            this._deselectUnit();
            this.scene.pause('TacticalScene');
            
            // Prototype VN resume timeout (3 seconds)
            setTimeout(() => {
                this._updateCombatLog(['▶️ Narrative sequence finished. Battle resuming.']);
                this.scene.resume('TacticalScene');
            }, 3000);
        });

        this.triggerEvaluator.on(TRIGGER_EVENTS.FIRE_SYSTEM_EVENT, (payload) => {
            if (payload.systemActionId === 'SYSTEM_HEAL_FULL' && payload.context.target) {
                payload.context.target.heal(9999);
                this._updateCombatLog([`✨ System Event: Fully healed ${payload.context.target.name}`]);
            }
        });
    }

    // =============================================================
    // UNIT REMOVAL & BATTLE END
    // =============================================================

    _removeDefeatedUnit(unit) {
        if (!unit) return;

        if (this.grid.isValidTile(unit.gridX, unit.gridY)) {
            if (this.grid.unitMap[unit.gridY][unit.gridX] === unit) {
                this.grid.unitMap[unit.gridY][unit.gridX] = null;
            }
        }

        if (unit.gameObject) { unit.gameObject.destroy(); unit.gameObject = null; }
        if (unit.labelObject) { unit.labelObject.destroy(); unit.labelObject = null; }

        unit.isAlive = false;

        if (this.directives) this.directives.onUnitDefeated(unit);
    }

    _endBattle(outcome, payload = {}) {
        if (this.currentState === 'COMBAT_OVER') return;

        this.currentState = 'COMBAT_OVER';
        this.activePhase = 'NONE';
        this._deselectUnit();
        this._cancelAiTimers();

        const reason = payload.reason || outcome;

        let banner = '';
        let color = '#ffffff';
        let willRestart = false;

        switch (outcome) {
            case 'VICTORY':
                banner = 'VICTORY — Canonical directives fulfilled.';
                color = '#88ff88';
                break;
            case 'DHARMA_IMBALANCE':
                banner = 'DHARMA IMBALANCE — Canon broken. Timeline resetting…';
                color = '#ff6666';
                willRestart = true;
                break;
            case 'CANON_PROGRESS':
                banner = 'CANON — Defeat was written. Story advances…';
                color = '#e8d5b7';
                break;
            case 'DEFEAT':
                banner = 'DEFEAT — All forces fallen. Retrying…';
                color = '#ff4444';
                willRestart = true;
                break;
        }

        this._showEndBanner(banner, color);
        this._refreshDirectivePanel();

        if (willRestart) {
            this.time.delayedCall(3000, () => {
                if (this.directives) this.directives.destroy();
                if (this.triggerEvaluator) this.triggerEvaluator.destroy();
                this.scene.restart();
            });
        }
    }

    _showEndBanner(text, color) {
        const veil = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.55).setDepth(100);
        const banner = this.add.text(640, 360, text, {
            fontSize: '22px',
            color: color,
            fontFamily: 'Georgia, serif',
            align: 'center',
            wordWrap: { width: 900 }
        }).setOrigin(0.5).setDepth(101);
    }

    _cancelAiTimers() {
        this._aiTimerEvents.forEach(ev => {
            if (ev && !ev.hasDispatched) ev.remove(false);
        });
        this._aiTimerEvents = [];
    }

    // =============================================================
    // INPUT HANDLING
    // =============================================================

    _setupInput() {
        document.getElementById('btn-attack').onclick = () => this._onMenuAttack();
        document.getElementById('btn-astra').onclick  = () => this._onMenuAstra();
        document.getElementById('btn-wait').onclick   = () => this._onMenuWait();
        document.getElementById('btn-cancel').onclick = () => this._onMenuCancel();
        document.getElementById('btn-astra-cancel').onclick = () => {
            this._hideDOMMenu('astra-menu');
            this.currentState = 'ACTION_MENU';
            this._showDOMMenu('action-menu');
        };

        this.input.on('pointerdown', (pointer) => {
            if (this.currentState === 'COMBAT_OVER') return;
            if (this.currentState === 'ACTION_MENU' || this.currentState === 'ASTRA_MENU') return;
            if (this.currentState === 'AI_TURN') return;

            const gridPos = this.grid.pixelToGrid(pointer.x, pointer.y);
            if (!gridPos) {
                if (this.currentState !== 'ATTACK_TARGET_SELECT') this._deselectUnit();
                return;
            }

            const { x, y } = gridPos;

            if (this.currentState === 'IDLE') {
                const unit = this.grid.getUnitAt(x, y);
                if (unit && unit.faction === 'PANDAVA' && unit.canAct()) {
                    this._selectUnit(unit);
                }
                return;
            }

            if (this.currentState === 'UNIT_SELECTED') {
                const moveTarget = this.currentMovementRange.find(t => t.x === x && t.y === y);
                const isOwnTile  = (x === this.selectedUnit.gridX && y === this.selectedUnit.gridY);

                if (moveTarget || isOwnTile) {
                    this._executeMove(this.selectedUnit, x, y);
                    return;
                }

                const unit = this.grid.getUnitAt(x, y);
                if (unit && unit.faction === 'PANDAVA' && unit.canAct()) {
                    this._deselectUnit();
                    this._selectUnit(unit);
                    return;
                }

                this._deselectUnit();
                return;
            }

            if (this.currentState === 'ATTACK_TARGET_SELECT') {
                const attackTarget = this.currentAttackTargets.find(t => t.x === x && t.y === y);
                if (attackTarget) {
                    this._executeAttack(this.selectedUnit, attackTarget.unit, this.selectedAstraId);
                } else {
                    this.grid.clearHighlights();
                    this.selectedAstraId = null;
                    this.currentState = 'ACTION_MENU';
                    this._showDOMMenu('action-menu');
                }
            }
        });
    }

    _selectUnit(unit) {
        this.selectedUnit = unit;
        this.currentState = 'UNIT_SELECTED';

        unit.originalX = unit.gridX;
        unit.originalY = unit.gridY;

        this.currentMovementRange = this.grid.getMovementRange(unit);
        this.grid.showMovementRange(this.currentMovementRange);
        this._updateInfoPanel(unit);

        if (unit.gameObject) unit.gameObject.setStrokeStyle(3, 0xffff00);
    }

    _deselectUnit() {
        if (this.selectedUnit && this.selectedUnit.gameObject) {
            this.selectedUnit.gameObject.setStrokeStyle(2, 0xffffff);
        }

        this._hideDOMMenu('action-menu');
        this._hideDOMMenu('astra-menu');

        this.selectedUnit = null;
        this.selectedAstraId = null;
        if (this.currentState !== 'COMBAT_OVER' && this.currentState !== 'AI_TURN') {
            this.currentState = 'IDLE';
        }
        this.currentMovementRange = [];
        this.currentAttackTargets = [];
        this.grid.clearHighlights();
        this._clearInfoPanel();
    }

    _executeMove(unit, targetX, targetY) {
        this.grid.moveUnit(unit, targetX, targetY);
        this.grid.clearHighlights();

        if (this.triggerEvaluator) this.triggerEvaluator.evaluateMove(unit);

        this.currentAttackTargets = this.grid.getAttackRange(unit);
        this.currentState = 'ACTION_MENU';
        this.selectedAstraId = null;

        this._positionDOMMenu('action-menu', targetX, targetY);

        const cannotAttack = (this.currentAttackTargets.length === 0 || unit.weaponType === 'none');
        const cannotAstra  = (cannotAttack || !unit.resolvedAstras || unit.resolvedAstras.length === 0);

        document.getElementById('btn-attack').disabled = cannotAttack;
        document.getElementById('btn-astra').disabled  = cannotAstra;
    }

    _positionDOMMenu(menuId, gridX, gridY) {
        const menu = document.getElementById(menuId);
        const pixelPos = this.grid.gridToPixel(gridX, gridY);
        menu.style.left = `${pixelPos.x + 40}px`;
        menu.style.top  = `${pixelPos.y - 40}px`;
        menu.classList.remove('hidden');
    }

    _showDOMMenu(menuId) { document.getElementById(menuId).classList.remove('hidden'); }
    _hideDOMMenu(menuId) { document.getElementById(menuId).classList.add('hidden'); }

    _onMenuAttack() {
        this._hideDOMMenu('action-menu');
        this.currentState = 'ATTACK_TARGET_SELECT';
        this.selectedAstraId = null;
        this.grid.showAttackRange(this.currentAttackTargets);
    }

    _onMenuAstra() {
        this._hideDOMMenu('action-menu');
        this.currentState = 'ASTRA_MENU';

        const astraList = document.getElementById('astra-list');
        astraList.innerHTML = '';

        const currentDharma = this.gameState.dharmaMeter;

        this.selectedUnit.resolvedAstras.forEach(astra => {
            const btn = document.createElement('button');
            btn.className = 'tactical-btn';

            const astraCheck = this.selectedUnit.canUseAstra(astra.astra_id, currentDharma);
            btn.innerHTML = `${astra.name} <span class="astra-cost">☸️ ${astra.dharma_cost}</span>`;

            if (!astraCheck.allowed) {
                btn.disabled = true;
                btn.title = astraCheck.reason;
            } else {
                btn.onclick = () => {
                    this.selectedAstraId = astra.astra_id;
                    this._hideDOMMenu('astra-menu');
                    this.currentState = 'ATTACK_TARGET_SELECT';
                    this.grid.showAttackRange(this.currentAttackTargets);
                };
            }

            astraList.appendChild(btn);
        });

        this._positionDOMMenu('astra-menu', this.selectedUnit.gridX, this.selectedUnit.gridY);
    }

    _onMenuWait() {
        this._hideDOMMenu('action-menu');
        if (this.directives) this.directives.onUnitMoved(this.selectedUnit);
        this.selectedUnit.endAction();
        this._deselectUnit();
        this._checkTurnEnd();
    }

    _onMenuCancel() {
        this._hideDOMMenu('action-menu');
        const originalX = this.selectedUnit.originalX;
        const originalY = this.selectedUnit.originalY;
        this.grid.moveUnit(this.selectedUnit, originalX, originalY);

        this.currentState = 'UNIT_SELECTED';
        this.currentMovementRange = this.grid.getMovementRange(this.selectedUnit);
        this.grid.showMovementRange(this.currentMovementRange);
    }

    // =============================================================
    // COMBAT EXECUTION
    // =============================================================

    _executeAttack(attacker, defender, astraId = null) {
        this._hideDOMMenu('action-menu');
        this._hideDOMMenu('astra-menu');
        this.grid.clearHighlights();

        if (this.directives) this.directives.onUnitMoved(attacker);

        const result = this.combat.resolveAttack(attacker, defender, astraId);

        // APPEND TO CUMULATIVE COMBAT LOG HISTORY
        this._updateCombatLog(result.log);

        if (!defender.isAlive) {
            this._removeDefeatedUnit(defender);
        } else if (defender.gameObject) {
            this.tweens.add({
                targets: defender.gameObject,
                alpha: 0.3,
                duration: 100,
                yoyo: true,
                repeat: 2
            });
        }

        if (this.currentState === 'COMBAT_OVER') return;

        attacker.endAction();
        this.selectedAstraId = null;
        this._deselectUnit();

        this._checkBattleEventTriggers(attacker, defender, result);
        this._checkTurnEnd();
    }

    // =============================================================
    // TURN FLOW
    // =============================================================

    _checkTurnEnd() {
        if (this.currentState === 'COMBAT_OVER') return;

        const playerUnits = this.grid.units.filter(u => u.faction === 'PANDAVA' && u.isAlive);
        if (playerUnits.length === 0) return;

        const allActed = playerUnits.every(u => u.hasActedThisTurn);
        if (allActed) {
            this._endPlayerPhase();
        }
    }

    _endPlayerPhase() {
        if (this.currentState === 'COMBAT_OVER') return;

        this.activePhase = 'AI';
        this.currentState = 'AI_TURN';
        this._updatePhaseDisplay();

        const aiUnits = this.grid.units.filter(u => u.faction === 'KAURAVA' && u.isAlive);

        let delay = 500;
        this._aiTimerEvents = [];

        aiUnits.forEach(aiUnit => {
            const ev = this.time.delayedCall(delay, () => {
                if (this.currentState === 'COMBAT_OVER') return;
                this._executeAITurn(aiUnit);
            });
            this._aiTimerEvents.push(ev);
            delay += 800;
        });

        const endEv = this.time.delayedCall(delay + 500, () => {
            if (this.currentState === 'COMBAT_OVER') return;
            this._startNewTurn();
        });
        this._aiTimerEvents.push(endEv);
    }

    _executeAITurn(aiUnit) {
        if (this.currentState === 'COMBAT_OVER') return;
        if (!aiUnit.isAlive || !aiUnit.canAct()) return;

        const enemies = this.grid.units.filter(u => u.faction === 'PANDAVA' && u.isAlive);
        if (enemies.length === 0) {
            aiUnit.endAction();
            return;
        }

        let closest = null;
        let closestDist = Infinity;
        enemies.forEach(enemy => {
            const dist = this.grid.getDistance(aiUnit.gridX, aiUnit.gridY, enemy.gridX, enemy.gridY);
            if (dist < closestDist) {
                closestDist = dist;
                closest = enemy;
            }
        });

        const attackTargets = this.grid.getAttackRange(aiUnit);
        if (attackTargets.length > 0) {
            const target = attackTargets[0];
            if (this.directives) this.directives.onUnitMoved(aiUnit);

            const result = this.combat.resolveAttack(aiUnit, target.unit);
            this._updateCombatLog(result.log);

            if (!target.unit.isAlive) {
                this._removeDefeatedUnit(target.unit);
            } else if (target.unit.gameObject) {
                this.tweens.add({
                    targets: target.unit.gameObject,
                    alpha: 0.3,
                    duration: 100,
                    yoyo: true,
                    repeat: 2
                });
            }

            if (this.currentState !== 'COMBAT_OVER') {
                this._checkBattleEventTriggers(aiUnit, target.unit, result);
            }
        } else {
            const moveRange = this.grid.getMovementRange(aiUnit);
            if (moveRange.length > 0 && closest) {
                let bestTile = null;
                let bestDist = Infinity;

                moveRange.forEach(tile => {
                    const dist = this.grid.getDistance(tile.x, tile.y, closest.gridX, closest.gridY);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestTile = tile;
                    }
                });

                if (bestTile) {
                    this.grid.moveUnit(aiUnit, bestTile.x, bestTile.y);
                    if (this.directives) this.directives.onUnitMoved(aiUnit);
                    if (this.triggerEvaluator) this.triggerEvaluator.evaluateMove(aiUnit);
                }
            }
        }

        aiUnit.endAction();
    }

    _startNewTurn() {
        if (this.currentState === 'COMBAT_OVER') return;

        if (this.directives) this.directives.onTurnEnd(this.currentTurn);
        if (this.currentState === 'COMBAT_OVER') return;

        this.currentTurn++;
        this.activePhase = 'PLAYER';
        this.currentState = 'IDLE';

        this._updateCombatLog([`\n=== TURN ${this.currentTurn} BEGINS ===`]);

        if (this.triggerEvaluator) {
            this.triggerEvaluator.evaluateTurn(this.currentTurn);
        }
        if (this.currentState === 'COMBAT_OVER') return;

        this.grid.units.forEach(unit => {
            if (unit.isAlive) unit.startTurn();
        });

        this._processStartOfTurnEffects();
        if (this.currentState === 'COMBAT_OVER') return;

        this._updatePhaseDisplay();
        this._refreshDirectivePanel();
    }

    _processStartOfTurnEffects() {
        const units = [...this.grid.units];

        units.forEach(unit => {
            if (!unit.isAlive) return;
            if (this.currentState === 'COMBAT_OVER') return;

            const terrain = this.grid.tiles[unit.gridY][unit.gridX];
            const terrainConfig = TERRAIN_CONFIG[terrain.terrainType];

            if (terrainConfig && terrainConfig.attritionPerTurn > 0) {
                const attrition = Math.floor(unit.maxHp * terrainConfig.attritionPerTurn / 100);
                unit.takeDamage(attrition);
                this._updateCombatLog([`🌵 Attrition: ${unit.name} loses ${attrition} HP from ${terrain.terrainType}.`]);

                if (!unit.isAlive) {
                    this._removeDefeatedUnit(unit);
                    return;
                }
            }

            unit.resolvedTraits.forEach(trait => {
                const result = executeHandler(trait.custom_script_handler, {
                    unit: unit,
                    grid: this.grid,
                    gameState: this.gameState
                });

                if (result.selfHeal) {
                    const healAmount = Math.floor(unit.maxHp * result.healPercent);
                    unit.heal(healAmount);
                    this._updateCombatLog([`✨ Trait: ${unit.name} regenerates ${healAmount} HP (${trait.trait_name}).`]);
                }
            });
        });
    }

    // =============================================================
    // BATTLE EVENT TRIGGERS (Handled by TriggerEvaluator)
    // =============================================================

    _checkBattleEventTriggers(attacker, defender, combatResult) {
        if (!this.triggerEvaluator || this.currentState === 'COMBAT_OVER') return;

        if (!defender.isAlive) {
            this.triggerEvaluator.evaluateDeath(defender);
        } else {
            this.triggerEvaluator.evaluateHP(defender);
        }
    }

    // =============================================================
    // UI CREATION & LOG EXPANSION
    // =============================================================

    _createUI() {
        this.add.text(640, 30, 'YUGANTA — Tactical Prototype', {
            fontSize: '24px',
            color: '#e8d5b7',
            fontFamily: 'Georgia, serif'
        }).setOrigin(0.5);

        this.turnText = this.add.text(20, 20, `Turn: ${this.currentTurn}`, {
            fontSize: '16px',
            color: '#ffffff',
            fontFamily: 'monospace'
        });

        this.phaseText = this.add.text(20, 42, 'Phase: PLAYER', {
            fontSize: '16px',
            color: '#4488ff',
            fontFamily: 'monospace'
        });

        this.infoPanel = this.add.text(960, 100, '', {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: 'monospace',
            lineSpacing: 4,
            wordWrap: { width: 280 }
        });

        this.directivePanel = this.add.text(960, 420, '', {
            fontSize: '12px',
            color: '#e8d5b7',
            fontFamily: 'monospace',
            lineSpacing: 3,
            wordWrap: { width: 300 }
        });

        // CUMULATIVE COMBAT LOG DISPLAY (Positioned at y=520 to allow 12 lines)
        this.combatLogText = this.add.text(20, 510, '=== WAR COMMENCES AT KURUKSHETRA ===', {
            fontSize: '11px',
            color: '#cccccc',
            fontFamily: 'monospace',
            lineSpacing: 2,
            wordWrap: { width: 650 }
        });

        this.add.text(640, 700, 'Click blue unit → tile to move → Action Menu  |  Survive 3 turns', {
            fontSize: '12px',
            color: '#888888',
            fontFamily: 'monospace'
        }).setOrigin(0.5);
    }

    _updateInfoPanel(unit) {
        const traitNames = unit.resolvedTraits.map(t => `  • ${t.trait_name}`).join('\n');
        const astraNames = unit.resolvedAstras?.map(a => `  • ${a.name}`).join('\n') || '  None';

        this.infoPanel.setText(
            `╔══════════════════════╗\n` +
            `  ${unit.name}\n` +
            `  Class: ${unit.unitClass}\n` +
            `  Faction: ${unit.faction}\n` +
            `╠══════════════════════╣\n` +
            `  HP: ${unit.currentHp}/${unit.maxHp}\n` +
            `  ATK: ${unit.attackPower} (${unit.attackType})\n` +
            `  DEF: ${unit.defense}\n` +
            `  MOV: ${unit.movement}\n` +
            `  RNG: ${unit.attackRange}\n` +
            `╠══════════════════════╣\n` +
            `  TRAITS:\n${traitNames || '  None'}\n` +
            `╠══════════════════════╣\n` +
            `  ASTRAS:\n${astraNames}\n` +
            `╠══════════════════════╣\n` +
            `  Invulnerable: ${unit.isInvulnerable() ? 'YES' : 'No'}\n` +
            `╚══════════════════════╝`
        );
    }

    _clearInfoPanel() {
        this.infoPanel.setText('');
    }

    _refreshDirectivePanel() {
        if (!this.directives || !this.directivePanel) return;

        const lines = this.directives.getSummary().map(s => {
            const mark = s.status === 'COMPLETED' ? '✅'
                       : s.status === 'FAILED'    ? '❌'
                       : '•';
            return `${mark} [${s.status}] ${s.text}`;
        });

        this.directivePanel.setText(
            `╔══ DIRECTIVES ═════════╗\n` +
            (lines.join('\n') || '  (none)') +
            `\n╚═══════════════════════╝`
        );
    }

    /**
     * Appends new log lines to fullCombatLog array and displays the last 12 lines.
     */
    _updateCombatLog(logLines) {
        if (!logLines) return;

        if (Array.isArray(logLines)) {
            this.fullCombatLog.push(...logLines);
        } else if (typeof logLines === 'string') {
            this.fullCombatLog.push(logLines);
        }

        // Show the last 12 lines of combat history
        const display = this.fullCombatLog.slice(-12).join('\n');
        if (this.combatLogText) {
            this.combatLogText.setText(display);
        }
    }

    _updatePhaseDisplay() {
        this.turnText.setText(`Turn: ${this.currentTurn}`);
        if (this.activePhase === 'PLAYER') {
            this.phaseText.setText('Phase: PLAYER').setColor('#4488ff');
        } else if (this.activePhase === 'AI') {
            this.phaseText.setText('Phase: AI').setColor('#ff4444');
        } else {
            this.phaseText.setText('Phase: —').setColor('#888888');
        }
    }

    shutdown() {
        this._cancelAiTimers();
        if (this.directives) { this.directives.destroy(); this.directives = null; }
        if (this.triggerEvaluator) { this.triggerEvaluator.destroy(); this.triggerEvaluator = null; }
        this._hideDOMMenu('action-menu');
        this._hideDOMMenu('astra-menu');
    }

    update(time, delta) {}
}