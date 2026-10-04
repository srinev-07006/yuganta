# Yuganta Data Layer

This directory contains the JSON-based data architecture for the Yuganta game, translating the Mahābhārata's narrative and tactical elements into engine-agnostic data structures.

## Directory Structure

```
data/
├── schemas/                             # JSON Schemas for validation
│   ├── narrative.schema.json            # Dialogues, Choices, Puruṣārthas impacts
│   ├── tactical.schema.json             # Timelines, Directives, Nodes, Battle Triggers
│   └── lore.schema.json                 # Characters, Astras, Traits, Vows, Boons
├── global/                              # Shared, campaign-wide data
│   ├── characters.json                  # Roster with Factions, IDs, and Sprite keys
│   ├── lore.json                        # Catalog of Astras, Vows & Traits
│   └── unit_classes.json                # Base unit archetype definitions
├── parvas/                              # Episodic Parva Data
│   └── bhishma-parva/                   # Vertical Slice (Parva 6)
│       ├── _meta.json                   # Parva lock/unlock state & description
│       ├── timeline.json                # Sequence of days and battle phases
│       ├── directives.json              # Canonical objectives per timeline node
│       ├── events.json                  # Mid-battle narrative triggers
│       └── dialogues/                   # Dialogue tree sequences
│           ├── day-1-kuru-kshetra.json
│           ├── day-1-gita-visada.json   # Moral branching (Puruṣārtha choices)
│           ├── day-9-krishna-rage.json
│           └── day-10-fall.json
```

## Key Data Structures

### 1. Dialogue & Puruṣārthas (`narrative.schema.json`)
Defines `dialogue_node` and `narrative_choice`. Choices track impact scores for the Dharma meter:
- `dharma_impact`: Moral duty/righteousness
- `artha_impact`: Material prosperity/wealth
- `kama_impact`: Desire/pleasure
- `moksha_impact`: Spiritual liberation

### 2. Timeline & Directives (`tactical.schema.json`)
Defines `timeline_node` and `canonical_directive`. Includes `fail_on_deviation` flag:
- If true and the player fails a directive, triggers a canonical rewind via associated dialogue

### 3. Lore & Constraints (`lore.schema.json`)
Defines characters, factions, and attachments to lore entries. Includes:
- Special traits (e.g., "iccha-mrityu")
- Limitations on astra usage (dharma cost/restrictions)

## Vertical Slice (Bhishma Parva)

The Bhishma Parva (Parva 6) is implemented as a vertical slice to validate the schemas:

- **Bhagavad Gita Sequence (Day 1)**: Branching dialogue node guiding Arjuna's moral awakening.
- **Fall of Bhishma (Day 10)**: Tactical directive to escort Shikhandi. A battle trigger freezes combat when Bhishma's HP drops <50% and Shikhandi is adjacent, forcing Arjuna's canonical choice.

## Validation

1. All JSON files should be valid against their respective JSON Schema (Draft-07).
2. Cross-references (e.g., speaker IDs in dialogues) must match strings defined in `global/characters.json`.
3. The JSON schemas strictly cover the Entity-Relationship structures outlined in the Game Design Document (GDD).

## Data Entry Guide for Writers

When adding new content:
1. Ensure all IDs are unique within their scope.
2. Validate JSON against the appropriate schema.
3. Confirm cross-references exist (e.g., a dialogue's speaker must be a character ID).
4. For narrative choices, define clear Puruṣārtha impacts.
5. For directives, set `fail_on_deviation` appropriately based on canonical importance.