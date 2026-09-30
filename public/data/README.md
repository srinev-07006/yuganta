# Yuganta Narrative Data Layer

The `data/` folder contains pure JSON data defining the narrative structure, lore limits, canonical history, and branching dialogues for the game. This serves as the single source of truth for both the visual novel frontend and the tactical engine.

## Structure

*   **`schemas/`**: JSON Draft-07 schemas. Validation tools will reject any data that breaks these rules.
*   **`global/`**: Cross-campaign arrays (e.g. all characters in `characters.json`, all divine weapons/vows in `lore.json`).
*   **`parvas/`**: Episodic data. The combat and story are grouped here for each of the 18 Parvas.

## How the Game Uses This Data

1.  **Dharma Balance Meter**: Tracked via `narrative_choice` objects inside `dialogues/`. Each choice defines integer shifts to `dharma_impact` and other Puruṣārthas.
2.  **Canonical Directives**: Located in `directives.json` (e.g., escorting Shikhandi, surviving X turns). If a directive has `fail_on_deviation: true`, the player failing this goal triggers a timeline rewind (Dharma Imbalance) because they attempted to rewrite canonical history.
3.  **Battle Triggers**: `directives.json` also holds `triggers`. If a tactical condition is met (e.g., Bhishma dropping to 50% HP), the engine pauses and forcibly loads the sequence defined by `linked_sequence_id`.
4.  **Maharathi Traits/Astras**: Characters list traits inside `global/characters.json`. If Bhishma has the trait `iccha-mrityu`, the tactical engine will reference `lore.json` to see that he has `invulnerable_to_standard_damage: true`, meaning brute-force attacks on the grid will do 0 damage unless a specific trigger/handler matches.

## Writing Dialogues (for Writers)

When constructing dialogue nodes in `parvas/<parva-name>/dialogues/`:
*   `speaker_id` **must** match a `character_id` inside `global/characters.json`.
*   Ensure every choice routes to a valid `next_dialogue_id`.
*   Remember that decisions should balance historical loyalty with tactical changes (e.g., choosing to encourage a routing army can yield a `MORALE_BOOST` tactical override).