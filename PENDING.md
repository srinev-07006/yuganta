# Yuganta — what is still pending (as of this commit)

Checked by running the project: `npm run validate`, `test:scene`, `test:maps`, `test:logic`, `test:vn`, `vite build`.
Not yet checked: a full play-through in a real browser (no browser was available when this was written).

## Playable today
Title screen -> 50 timeline nodes in order (33 story, 17 battles) -> ending screen. Portraits for all 31 characters. Every story node plays (authored dialogue, or Sanjaya narration). Music and UI sounds are generated in the browser.

## Blockers / high priority
1. **Dialogue format split (Role 4 + Role 1).** Four files in `bhishma-parva/dialogues` use the old format (`dialogue_nodes`, `narrative_choices`, no `sequence_id`): `day-1-gita-visada`, `day-1-kuru-kshetra`, `day-9-krishna-rage`, `day-10-fall`. The engine cannot see them, so the Gita opening and two Bhishma Parva scenes never play. `narrative.schema.json` was also changed to describe the old format, which is why `npm run validate` reports 66 errors on files that load fine. Decide on ONE format; either convert the four files or revert the schema.
2. **10 of 17 battles have no map and no directives (Role 3 + Role 4).** `day-1` to `day-10` of Bhishma Parva run on the built-in 10x10 demo map and are won by wiping the enemy. They need real `map_*.json` files and `node_id` directives.
3. **Missing story content (Role 4).** 23 of 33 story nodes have no authored dialogue (narration is used instead). Triggers point at 3 sequences that do not exist: `seq_abhimanyu_death`, `seq_night_slaughter`, `seq_brahmashira_standoff`. All 8 deviation (Dharma Imbalance) dialogues are missing: `dev-refuse-dice`, `dev-karna-survives`, `dev-jayadratha-survives`, `dev-yudhishthira-turns-back`, `dev-duryodhana-wins`, `dev-chooses-heaven`, `dev-premature-reveal`, `sp_camp_destroyed_canon`.
4. **Data hygiene (Role 4).** 30 directive entries are dropped for missing `directive_id`/`directive_type`; 12 parvas have directives without `node_id`; the tutorial triggers lack `condition_type`/`linked_sequence_id`; speakers `narrator`, `indra`, `yaksha`, `ulupi`, `babruvahana` are not in `characters.json`.

## Engine (Role 1)
- Tactical override effects are placeholders (`DRONA_RAMPAGE_CONTINUES` does nothing); Role 4 must confirm the real effects.
- No astra button in the player menu (the resolver supports it).
- `chakravyuha` rotation / perimeter rules, and `special_mechanics` on two maps, are not implemented.
- `GameState.consumedAstras` is unused (astra use is tracked per unit and resets on node reload).
- Artha / Kama / Moksha are only shown during dialogue; the battle HUD shows Dharma only.
- No save/load; a refresh restarts the chronicle.
- No combat sound (hits, deaths, astras) — the engine does not announce these events yet.
- Build warns that the main bundle is ~1.6 MB; consider code-splitting before deployment.

## Content / art
- Portraits: one image per character (plus `krishna_ANGRY`). Emotion variants (ANGRY, GRIEF...) are not drawn yet; the same face is shown for every emotion.
- Backgrounds are generated placeholders. Real art goes in `public/assets/bg/`.
- Music is synthesised. Real Sanskrit shloka recordings go in `public/assets/audio/` and need to be sourced and licensed.
- Ending screen copy is placeholder; the real endings and what the four meters should decide are a Role 4 decision.

## Repo hygiene
- Root `data/` is a stale copy of `public/data/` (the game reads `public/data/`). Root `Scenes/`, `Systems/`, `Characters/` and `files.zip`, `image.png`, `*.patch` look like leftovers.
- Two validators: `validate.js` (old) and `validate.cjs` (used by `npm run validate`).
- No deployment set up yet (GitHub Pages / Netlify). `vite.config.js` already uses `base: './'`, so a static host works.
