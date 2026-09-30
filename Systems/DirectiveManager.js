/**
 * DirectiveManager.js
 * Tracks active parva directives and triggers on the tactical battlefield:
 * - Win/Loss Listeners: SURVIVE_TURNS, DEFEAT_UNIT, ESCORT, SACRIFICE
 * - Battle Event Triggers: UNIT_HP_BELOW_PERCENT, UNIT_DEATH, TURN_COUNT_EQUAL
 * - The Canonical Trigger: Fires CANONICAL_DEVIATION on critical failure or CANONICAL_PROGRESSION
 */

class DirectiveManager {
  /**
   * @param {Object} directivesData JSON containing 'directives' and 'triggers' arrays
   * @param {Object} eventBus EventEmitter-compatible interface (Node EventEmitter or Phaser.Events.EventEmitter)
   */
  constructor(directivesData, eventBus) {
    this.directivesData = directivesData || { directives: [], triggers: [] };
    this.eventBus = eventBus;
    this.currentTurn = 0;
    this.unitRegistry = new Map();
    this.firedTriggers = new Set();
    this.completedDirectives = new Set();
    this.isPaused = false;
  }

  /**
   * Updates or registers a unit's state in the manager registry.
   * @param {String} unitId Target unit or character ID
   * @param {Object} state { hp, max_hp, faction, tile: {x, y} }
   */
  updateUnit(unitId, state) {
    const existing = this.unitRegistry.get(unitId) || {};
    this.unitRegistry.set(unitId, { ...existing, ...state });
  }

  /**
   * Main turn advancement loop. Call at the start or end of a turn.
   */
  advanceTurn() {
    if (this.isPaused) return;

    this.currentTurn += 1;
    this._evaluateTriggers();
    this._evaluateDirectives();
  }

  /**
   * Evaluate battle triggers (pauses scene, fires sequences, handles repeating heals)
   */
  _evaluateTriggers() {
    const triggers = this.directivesData.triggers || [];

    for (const trig of triggers) {
      if (!trig.is_repeatable && this.firedTriggers.has(trig.trigger_id)) {
        continue;
      }

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

        // Pause scene if required (for VN dialogue interception)
        if (trig.pauses_tactical_scene) {
          this.isPaused = true;
          this._emit('PAUSE_TACTICAL_SCENE', { trigger_id: trig.trigger_id });
        }

        // Emit linked sequence event
        this._emit('BATTLE_EVENT_TRIGGER', {
          trigger_id: trig.trigger_id,
          sequence_id: trig.linked_sequence_id,
          target_unit_id: trig.target_unit_id
        });
      }
    }
  }

  /**
   * Evaluates canonical mission objectives
   */
  _evaluateDirectives() {
    const directives = this.directivesData.directives || [];

    for (const dir of directives) {
      if (this.completedDirectives.has(dir.directive_id)) {
        continue;
      }

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
            // Turn limit exceeded without defeating unit -> Canonical Deviation!
            this._handleDeviation(dir);
          }
          break;
        }

        case 'ESCORT': {
          const escortee = this.unitRegistry.get(dir.target_unit_id);
          // Check if Shikhandi is adjacent to Bhishma
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
          // VN / Interactive choice directive
          this._emit('DIRECTIVE_ACTIVE', { directive_id: dir.directive_id });
          break;

        default:
          break;
      }
    }
  }

  /**
   * The Canonical Trigger: Handles objective deviations / timeline failure
   */
  _handleDeviation(directive) {
    if (directive.fail_on_deviation) {
      this.isPaused = true;
      this._emit('CANONICAL_DEVIATION', {
        directive_id: directive.directive_id,
        dialogue_id: directive.deviation_dialogue_id
      });
    } else {
      // Failing IS the canonical path (e.g. Abhimanyu death, Night raid wipe)
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
      if (typeof this.eventBus.emit === 'function') {
        this.eventBus.emit(event, data);
      } else if (typeof this.eventBus.dispatch === 'function') {
        this.eventBus.dispatch(event, data);
      }
    }
  }
}

module.exports = DirectiveManager;
