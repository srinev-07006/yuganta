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

## Update — maps, objectives, story links, balance
- **Done:** all 10 battles now have a map (`map_kurukshetra_day1`, `map_kurukshetra_grinding`, `map_bhishma_stand` are new) and node-scoped objectives. Bhishma Parva's directives were rewritten (the old ones had no `directive_id`/`directive_type`).
- **Done:** the 3 trigger scenes (`seq_abhimanyu_death`, `seq_night_slaughter`, `seq_brahmashira_standoff`) and all deviation scenes now exist, plus `dev-bhishma-falls-early`. The four old-format Bhishma dialogues were rewritten in the current format (`npm run test:vn`: 87/87 play).
- **Done:** `npm run test:balance` plays every battle N times with the same AI on both sides. Per-hero strength is tunable with `stat_mods` in `characters.json`; per-battle rosters in `src/core/MapConverter.js` (`NODE_PLAYER_LEADS`, `NODE_ENEMY_LEADS`, `NODE_SUPPORT`).
- **Not tuned:** Dharma costs. The AI never casts astras or makes dialogue choices, so the simulator cannot exercise them; tune by hand-playing.
- **Still open:** `npm run test:links` still reports 20 data-hygiene problems (speakers `indra`/`yaksha`/`ulupi`/`babruvahana` missing from `characters.json`, dialogue `node_id`s that do not match their timeline, tutorial triggers without `linked_sequence_id`).

## Audit findings (checked by running the project; each item says how to re-check it)

### Blockers / high priority
1. **The schemas describe a different format from the data the engine reads (Role 4 + Role 1).** `npm run validate` fails on ~40 files: 43 × `narrative_choices` and 43 × `dialogue_nodes` required (the schema expects the old dialogue format; live files use `sequence_id` + `nodes`), 36 × `timeline_nodes` and 36 × `canonical_directives` required (live files use `nodes` / `directives`), plus `id`/`name`/`description`/`applies_to` on `lore.json`. Fix: rewrite the three schemas to the format `src/core/normalize.js` accepts, then make `validate` (and `test:links`) a required check before every merge. Until then a green `validate` means nothing.
2. **22 of 44 timeline nodes have no authored dialogue** (they fall back to Sanjaya narration). Re-check with the node list below. Highest value first: `dp-day13-abhimanyu-fall`, `dp-day14-jayadratha-vow`, `dp-day14-artificial-eclipse`, `shp-bed-of-arrows` (Bhishma on the arrow bed), `shp-lake-hiding`, `kp-ghatotkacha`, `vip-incognito`, `ap-house-of-wax`. Two of the 22 are battles with no intro scene: `vp-arjuna-penance`, `day-2-kurukshetra-battle`. The rest: `udp-vishvarupa`, `udp-karna-origins`, `sp-lament`, `shp-mokshadharma`, `ap-final-teachings`, `avp-yagna-start`, `asp-retirement`, `asp-forest-fire`, `mp-balarama-death`, `mhp-journey-begins`, `mhp-the-dog`, `svp-moksha`.
3. **The Chakravyuha does not spawn the army its map describes.** `map_chakravyuha.json` lists ring_1 (12 infantry), ring_2 (8 cavalry), ring_3 (6 chariots) and a six-Maharathi core (Drona, Karna, Duhshasana, Kripa, Ashwatthama, Shalya), but the converter only reads rectangular zones, so the battle starts with Jayadratha and Drona only (see `NODE_ENEMY_LEADS` in `src/core/MapConverter.js`). Needs: ring spawning (`spawn_zones.KAURAVA.ring_*`) and the rotation/perimeter rule (already listed under Engine). Rebalance with `npm run test:balance` afterwards.
4. **20 data problems remain in `npm run test:links`.**
   - Speakers missing from `characters.json`: `indra`, `yaksha`, `ulupi`, `babruvahana`.
   - Unknown vows: `duryodhana` → `never-share-kingdom`, `drupada` → `destroy-drona`.
   - Dialogue files whose `node_id` is not in their timeline, so they can never play: `dp-day13-end`, `dp-day15-drona-fall`, `dp-fall-of-drona` (drona-parva); `kp-day17-final-duel` (karna); `spp-night18-brahmashira` (sauptika); `shp-day18-lake` (shalya); `up-kunti-karna` (udyoga); `vp-kirata` (vana); `vip-cattle-raid` (virata). Either add the nodes or re-point the files (e.g. `vip-cattle-raid` → `vip-virata-war`, which has a MID_BATTLE slot).
   - Tutorial triggers `tutorial-welcome` and `tutorial-attack-ready` have no `linked_sequence_id` (they use `sequence_id`).

### Gameplay and balance
5. **Dharma costs are untuned.** The balance simulator's AI never casts astras or makes dialogue choices, so Dharma never moved. Needs a scripted player policy (cast the best affordable astra, pick the first choice) in `tests/balance-sim.mjs`, then tune `dharma_cost` and the Dharma gain/loss per choice against full battles.
6. **Only Arjuna and Karna have `stat_mods`** (31 characters in total). Every other hero is the plain 300 HP / 40 attack / 20 defense MAHARATHI block, including Bhima, Drona, Ashwatthama, Duryodhana, Abhimanyu and Jayadratha. Suggested pass: Bhima and Duryodhana (mace duel), Drona and Ashwatthama (Drona/Sauptika), Abhimanyu (glass cannon: high attack, low HP). Re-run `npm run test:balance` after each change.
7. **The simulator is a mirror match.** Both sides use the same AI, so it measures the numbers and not human play. Targets used: roughly even in the hard battles (Virata, Chakravyuha), a clear win in the duels. A real play-through by 2-3 people is still needed; the AI has no sense of terrain or objectives.
8. **Soft objectives only advance the story when missed.** A missed `REACH_TILE`/`ESCORT` on day 1, 2 or 9 resolves as "canon progress" with no penalty and no feedback beyond a banner. Decide whether that is intended, or whether it should cost Dharma or an Artha/Kama/Moksha point.
9. **`vp-arjuna-penance` has no fight in the simulation.** The Kirata (a generic MAHARATHI placed by `NODE_ENEMY_HINTS`) never attacks, so "survive 5 rounds" completes with both sides at 100% HP. Check why the AI holds back (likely a faction/target rule for tagged units) and give the Kirata a real behaviour.
10. **Starting positions are a straight line.** `deriveSpawns` fills the free tile nearest the zone centre, so units start in a column. `maps/formations.json` exists; use it (or a simple wedge/line pattern) so armies look like armies.
11. **Roster variety is thin.** Derived rosters use only PADATI_MELEE and ASHVA. No archers, elephants (GAJA) or chariot battalions, although the unit classes exist.
12. **Per-battle rosters are hard-coded in `MapConverter.js`** (`NODE_PLAYER_LEADS`, `NODE_ENEMY_LEADS`, `NODE_SUPPORT`). Long term they belong in the data (`node.pandava_formation` / `kaurava_formation`, which the scene already supports) so Role 3/4 can edit them without touching code.
13. **Jayadratha's `BlockAllPandavasExceptArjuna()` and Duryodhana's `LowerBodyInvulnerable()` need a hand test.** The balance run only shows the duels end; it does not prove the boons gate damage and movement as the lore says.

### Art and presentation
14. **Terrain art is in, but unreviewed in a real browser.** All 29 ground tiles (`public/tiles/`), 14 props and the fire animation (`public/props/`) are wired through `src/data/TerrainArt.js`, `GridSystem` and `BootScene`; rebuild with `python3 tools/buildTerrainArt.py` (needs `Maptiles/`, `Props/`, Pillow, numpy, ffmpeg). `npm run test:art` checks the wiring headless only. Needs an eyes-on pass for: prop scale and anchor per terrain (`width`/`originY` in `TERRAIN_PROPS`), prop density (forest is 1 per tile and may hide units behind it; fortified 0.5, snow fir 0.35), tall props (mountain, pillar, wall) occluding the tile behind them, and seams between the raised-tile art and its flat-shaded side walls. The fire animation was keyed out of a fake checkerboard by colour, so zoom in on the flame tips for a grey fringe; replace `fire_animation.mp4` with a real-alpha video or PNG sequence if it shows. Terrains with no art yet: `desert`, `cloud`, and the Chakravyuha ring formations. `moutain1.webp` is misspelled in the source folder (the build fixes it to `mountain1`); rename the source.
15. **Backgrounds:** `public/assets/bg/` has 1 file, while sequences reference ~25 `bg_*` keys (generated placeholders are used).
16. **Dialogue text I wrote needs a lore pass** (Role 4): the 3 trigger scenes, the 9 deviation scenes (8 + `dev-bhishma-falls-early`), and the four rewritten Bhishma Parva scenes (`seq_gita_visada`, `seq_krishna_rage`, `seq_bhishma_fall`). They are working drafts; wording, speaker emotions and the Dharma impacts of the Gita choices are placeholders.

### Testing and tooling
17. **No real-browser test.** Everything above was checked headless in Node with stubbed Phaser objects, so rendering, the camera, mouse picking and audio are unverified in this branch. Add a Playwright smoke test (load `?node=kp-final-duel`, assert the canvas draws and a click selects a unit) and run it in CI.
18. **No CI.** `validate`, `test:maps`, `test:logic`, `test:vn`, `test:links`, `test:input`, `test:scene`, `test:balance` and `build` are all manual. A single `npm test` plus a GitHub Action would stop regressions like the ones fixed in this round.
19. **`test:balance` takes ~1.5 minutes** for 8 runs × 10 nodes because battles run in real time against 40 ms polls. Fine for tuning, too slow for CI; add a quick mode (2 runs) for pull requests.
20. **Main bundle is 1.66 MB** (Vite warns). Split Phaser and the VN module into separate chunks, and lazy-load the VN screens.

### Repo hygiene (additions)
- `Characters/` (12 MB) duplicates the art now in `public/sprites/` and `public/portraits/`. Confirm nothing reads it, then delete it, along with the root `data/`, `Scenes/`, `Systems/`, `files.zip`, `image.png` and `yuganta-combat-menu-and-art.patch`.
- **Dead code:** `src/systems/TimelineManager.js`, `src/systems/TurnManager.js` and `src/systems/MapLoader.js` are not imported by the game (it uses the `src/core/` versions; the only reference is `systems/TimelineManager.js` importing its own `systems/MapLoader.js`). Delete them so nobody edits the wrong copy (the region-map converter lives only in `src/core/MapLoader.js`).
