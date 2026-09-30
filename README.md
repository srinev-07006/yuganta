# Yuganta — Tactical Engine Core

This repository contains the Phase 1 Engine for **Yuganta**, a browser-based Tactical Turn-Based Strategy (TBS) / Visual Novel (VN) hybrid based on the Mahābhārata.

## 🚀 Quick Start

**Prerequisites:** You must have [Node.js](https://nodejs.org/) installed. No Python virtual environments (`venv`) are required.

1. **Install Dependencies:**
   ```bash
   npm install
Validate Lore & Schemas:
Bash

npm run validate
(Ensures all JSON files in public/data/ match the Draft-07 schemas).
Run the Game:
Bash

npm run dev
(Opens http://localhost:5173/ in your browser with hot-reloading).
🏗️ Architecture & The Four Pillars
The engine is built on Phaser 3 (WebGL) and uses a decoupled, data-driven architecture.

1. Grid & Terrain (GridSystem.js & TerrainConfig.js)
Orthogonal Grid: Supports A* / BFS pathfinding and Manhattan-distance targeting.
Data-Driven Terrain: Plains, Forest, Mountain, Desert, River, Lake. Fully extensible. Terrain dictates movement costs, defense buffs, ranged visibility, and attrition damage.
Unit Overrides: Heavy units (GAJA/Elephants) are blocked by forests; RATHA (Chariots) are blocked by rivers/mountains.
2. Chaturanga Units (UnitManager.js & Unit.js)
4-Fold Army: Ratha (Chariot), Gaja (Elephant), Ashva (Cavalry), Padati (Infantry).
Chariot Pairs: Warrior and Charioteer (e.g., Arjuna + Krishna) occupy a single grid tile. The driver's support traits (like movement buffs) are scaled and applied to the warrior.
Maharathi Heroes: Extend the base Unit class to support Astras, complex trait stacking, and dual-HP pools.
3. Combat & Traits (CombatResolver.js & TraitHandlers.js)
8-Step Damage Pipeline: Processes Invulnerability checks → Defender Traits → Terrain Defense → Attacker Traits → Astra Multipliers.
Divine Astras: Triggered via Action Menu, consumes global Dharma points.
Trait Registry: JSON strings (e.g., CheckShikhandiPresence()) are mapped to executable JavaScript functions without hardcoding logic into the main scene.
4. Canonical Referee (DirectiveManager.js)
Canon Enforcement: Parses directives.json (e.g., SURVIVE_TURNS, ESCORT).
Dharma Imbalance: If a player violates Mahābhārata canon (e.g., killing Drona early), the manager halts combat, flags a Dharma Imbalance, and triggers a timeline reset.
📂 Directory Structure
text

Yuganta/
├── public/
│   └── data/               <-- JSON data served to the browser
│       ├── global/         <-- lore.json, characters.json
│       ├── parvas/         <-- 18 Parvas (timelines, dialogues, directives)
│       └── schemas/        <-- AJV JSON schemas
├── src/
│   ├── main.js             <-- Phaser config & bootstrap
│   ├── scenes/             <-- BootScene (Loader) & TacticalScene (Gameplay)
│   ├── systems/            <-- Grid, Combat, Unit, and Directive managers
│   ├── entities/           <-- OOP Unit classes
│   ├── handlers/           <-- Trait script mappings
│   └── data/               <-- Engine-side configurations (Terrain/Classes)
├── index.html              <-- Canvas host + DOM UI Action Menu overlay
├── package.json            <-- Node dependencies
├── validate.cjs            <-- CLI data validator
└── vite.config.js          <-- Dev server config
text


---

### 2. Create `BATONPASS.md` in your project root

```markdown
# 🤝 BATON PASS: Phase 1 Engine Handoff

**To:** Role 2 (Frontend/UI), Role 3 (Level Design), Role 4 (Lore Lead)
**From:** Role 1 (Tactical Engine)
**Status:** Core Engine COMPLETE & VALIDATED. Ready for integration.

The WebGL tactical engine is now fully operational. Pathfinding, terrain rules, the Chaturanga unit hierarchy, trait interactions, and canonical survival directives are all functioning on the 5x5 prototype board.

Here is what you need to know and do next.

---

## 🎨 Role 2: Frontend, UI & Visual Novel Bridge

The engine uses a DOM-based overlay (`#ui-overlay` in `index.html`) sitting on top of the Phaser WebGL canvas. This ensures text remains crisp and scales natively.

**Your Action Items:**
1. **The Action Menu:** I have built a functional HTML action menu (`[Attack]`, `[Use Astra]`, `[Wait]`). Feel free to completely reskin this in `index.html` using the color palettes from `aesthetics.schema.json`.
2. **Combat Log:** The engine maintains a cumulative history array (`this.fullCombatLog`). I need you to design a scrollable DOM panel to display this history cleanly.
3. **VN Pause/Resume Hooks:** `TacticalScene.js` uses `this.scene.pause('TacticalScene')` when a battle trigger trips. We need to finalize the `EventRegistry` payload format so you can launch `VNScene`, render the dialogue, and emit a `vn_complete` event for the engine to resume.

---

## 🗺️ Role 3: Level & Systems Design

The engine accurately translates Chaturanga army rules. Note: **Warrior + Charioteer (e.g., Arjuna & Krishna) share a single tile on the grid.** Krishna's `sarathi` buffs apply to the chariot at a 70% scale, while Arjuna handles the attacking.

**Your Action Items:**
1. **Map Data Format:** I am ready to load custom maps. Please format your level designs as a 2D array of terrain strings (`plains`, `forest`, `mountain`, `desert`, `river`, `lake`).
2. **Scale Up to 10x10:** Design an 8x8 or 10x10 skirmish map for our next test. Include a mix of Maharathis and generic battalions (`PADATI_MELEE`, `GAJA`, etc.).
3. *Note on 50x50 Maps:* Please hold off on massive campaign maps until we implement Camera Pan/Zoom and the TimelineManager.

---

## 📜 Role 4: Lore Lead

Your data architecture is brilliant. The `validate.cjs` script successfully checks your data against Draft-07 schemas every time we run the game. Traits like `iccha-mrityu` and Astras like `Pashupatastra` are math-accurate in the `CombatResolver`. 

**I have 3 minor requests regarding your tactical data:**
1. **Directive Node Links:** In `directives.json`, directives currently lack a `node_id`. Since some Parvas (like Bhishma Parva) have multiple tactical battles, the engine needs to know *which* battle a directive belongs to. Can we add an optional `node_id` field to the schema?
2. **Escort / Reach Tile Destinations:** For `REACH_TILE`, the engine needs exact `{x,y}` coordinates. For `ESCORT`, it needs a target unit or tile. Let's confirm the JSON key names for these destinations.
3. **The "EVERY_TURN" Trigger:** In Sauptika Parva, Ashwatthama has a turn trigger set to `"EVERY_TURN"`. The engine can handle this, but it might be cleaner to add a new `condition_type` (e.g., `TURN_START`) rather than mixing strings and integers in `condition_value`. Let me know your thoughts.

---
*Let's build a masterpiece.*