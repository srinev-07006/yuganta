# src/vn — Role 2 (VN layer, art, sound, title/ending)

Plugs into the engine through the contract in `CONTRACTS.md` §3. Entry point: `install.js`, called once from `BootScene`.

| File | What it does |
|---|---|
| `YugantaVN.js` | The VN provider: `play(sequence) → { choicesMade, visitedNodeIds }`. Applies **no** impacts (VNBridge does). Shows a display-only meter preview. |
| `narration.js` | Sanjaya narrates any node with no authored NODE_START dialogue, so no moment is skipped. |
| `screens.js` | Title screen and ending screen (ending copy is placeholder for Role 4). |
| `Art.js` | Portraits + backgrounds. Real art wins, generated SVG is the fallback. |
| `Sound.js` | WebAudio synthesised music/sfx. A real file wins if present. |
| `vnStyles.js` | CSS for the VN layer (a JS string so Node tests never import a `.css`). |

## Replacing placeholders with real assets (no code changes)

- **Portraits:** (list every file name in `public/portraits/index.json`, or just run `tools/prepare-portraits.sh`, which regenerates it) `public/portraits/<character_id>.webp` (or `<id>_<EMOTION>.webp`, e.g. `krishna_ANGRY.webp`). Source art lives in `CharacterPotraits/`; `tools/prepare-portraits.sh` converts it. Emotions: NEUTRAL ANGRY GRIEF ENLIGHTENED SMUG CONFUSED.
- **Backgrounds:** `public/assets/bg/<background_asset_key>.jpg|png|webp` (keys are in each dialogue file, e.g. `bg_hastinapura_assembly`; narration cards use the node's `map_id`).
- **Music:** `public/assets/audio/<bgm_asset_key>.mp3|ogg` (e.g. `bgm_gita_chant.mp3`).

## Events
Listens: `yuganta:node-started`, `yuganta:chronicle-end` (on `game.events`).
Test: `npm run test:vn` (plays all dialogue + every node's narration through the real VNBridge in jsdom).


The generated face is a last resort: it only appears when NO real portrait exists for a character. While a real portrait is loading the slot stays empty, and all portraits are preloaded at startup.
