class GameManager {
  constructor(directivesData = null) {
    this.directivesData = directivesData || { directives: [], triggers: [] };
    this.unitRegistry = new Map();
    this.completedDirectives = new Set();
    this.firedTriggers = new Set();
    this.isPaused = false;
    this.currentTurn = 0;

    // Dharma Balance Meter
    this.dharmaScore = 0;
    this.arthaScore = 0;
    this.kamaScore = 0;
    this.mokshaScore = 0;

    // Event bus for communication between systems
    this.eventBus = new EventEmitter();

    // Bind event handlers
    this._bindEvents();
  }

  _bindEvents() {
    // Listen for canonical deviation from Role 3
    this.eventBus.on('CANONICAL_DEVIATION', (data) => {
      this.isPaused = true;
      console.log(`[GameManager] Canonical deviation triggered: ${data.directive_id}`);
      // Notify Role 2 to show dialogue
      this.eventBus.emit('SHOW_NARRATIVE_DIALOGUE', data);
    });

    // Listen for tactical scene pause/resume
    this.eventBus.on('PAUSE_TACTICAL_SCENE', () => {
      this.isPaused = true;
      console.log('[GameManager] Tactical scene paused');
    }

    this.eventBus.on('RESUME_TACTICAL_SCENE', () => {
      this.isPaused = false;
      console.log('[GameManager] Tactical scene resumed');
    });
  }

  updateUnit(unitId, state) {
    const existing = this.unitRegistry.get(unitId) || {};
    this.unitRegistry.set(unitId, { ...existing, ...state });
  }

  advanceTurn() {
    if (this.isPaused) return;

    this.currentTurn += 1;
    console.log(`[GameManager] Turn ${this.currentTurn} started`);

    // Evaluate battle triggers (e.g., HP thresholds, unit death)
    this._evaluateTriggers();

    // Evaluate directives (objectives)
    this._evaluateDirectives();
  }

  _evaluateTriggers() {
    const triggers = this.directivesData.triggers || [];

    for (const trig of triggers) {
      if (this.firedTriggers.has(trig.trigger_id)) continue;

      let conditionMet = false;

      switch (trig.condition_type) {
        case 'TURN_COUNT_EQUAL':
          if (trig.condition_value === 'EVERY_TURN' || this.currentTurn === trig.condition_value) {
            conditionMet = true;
          }
          break;
        case 'UNIT_HP_BELOW_PERCENT': {
          const unit = this.unitRegistry.get(trig.target_unit_id);
          if (unit && unit.max_hp > 0) {
            const currentPct = (unit.hp / unit.max_hp) * 100;
            if (currentPct <= trig.condition_value) {
              conditionMet = true;
            }
          }
          break;
        }
        case 'UNIT_DEATH': {
          const unit = this.unitRegistry.get(trig.target_unit_id);
          if (unit && unit.hp <= 0) {
            conditionMet = true;
          }
          break;
        }
        default:
          break;
      }

      if (conditionMet) {
        this.firedTriggers.add(trig.trigger_id);
        if (trig.pauses_tactical_scene) {
          this.isPaused = true;
          this.eventBus.emit('PAUSE_TACTICAL_SCENE', { trigger_id: trig.trigger_id });
        }
        this.eventBus.emit('BATTLE_EVENT_TRIGGER', {
          trigger_id: trig.trigger_id,
          sequence_id: trig.linked_sequence_id,
          target_unit_id: trig.target_unit_id
        });
      }
    }
  }

  _evaluateDirectives() {
    const directives = this.directivesData.directives || [];

    for (const dir of directives) {
      if (this.completedDirectives.has(dir.directive_id)) continue;

      switch (dir.directive_type) {
        case 'SURVIVE_TURNS':
          if (this.currentTurn >= dir.target_turns) {
            this.completedDirectives.add(dir.directive_id);
            this._emit('DIRECTIVE_COMPLETE', { directive_id: dir.directive_id });
          }
          break;

        case 'DEFEAT_UNIT': {
          const target = this.unitRegistry.get(dir.target_unit_id);
          if (target && target.hp <= 0) {
            this.completedDirectives.add(dir.directive_id);
            this._emit('DIRECTIVE_COMPLETE', { directive_id: dir.directive_id });
          } else if (dir.target_turns && this.currentTurn > dir.target_turns) {
            this._handleDeviation(dir);
          }
          break;
        }

        case 'ESCORT': {
          const escortee = this.unitRegistry.get(dir.target_unit_id);
          const bhishma = this.unitRegistry.get('bhishma');
          if (escortee && bhishma && escortee.tile && bhishma.tile) {
            const isAdjacent = this._isAdjacent(escortee.tile, bhishma.tile);
            if (isAdjacent) {
              this.completedDirectives.add(dir.directive_id);
              this._emit('DIRECTIVE_COMPLETE', { directive_id: dir.directive_id });
              break;
            }
          }

          if (dir.target_turns && this.currentTurn > dir.target_turns) {
            this._handleDeviation(dir);
          }
          break;
        }

        case 'SACRIFICE':
          // Interactive choice - handled via UI
          this._emit('DIRECTIVE_ACTIVE', { directive_id: dir.directive_id });
          break;

        default:
          break;
      }
    }
  }

  _handleDeviation(directive) {
    if (directive.fail_on_deviation) {
      this.isPaused = true;
      this.eventBus.emit('CANONICAL_DEVIATION', {
        directive_id: directive.directive_id,
        dialogue_id: directive.deviation_dialogue_id
      });
    } else {
      this._emit('CANONICAL_PROGRESSION', {
        directive_id: directive.directive_id,
        note: 'Canonical defeat processed'
      });
    }
  }

  _isAdjacent(tileA, tileB) {
    const dx = Math.abs(tileA.x - tileB.x);
    const dy = Math.abs(tileA.y - tileB.y);
    return (dx <= 1 && dy <= 1) && !(dx === 0 && dy === 0);
  }

  _emit(event, data) {
    if (this.eventBus) {
      this.eventBus.emit(event, data);
    }
  }
}

module.exports = GameManager;