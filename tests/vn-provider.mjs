// Role 2 provider test (jsdom): plays EVERY dialogue file through YugantaVN by clicking, checks the bridge contract.
//   node tests/vn-provider.mjs
import { JSDOM } from 'jsdom'; import fs from 'node:fs'; import path from 'node:path';
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Image: dom.window.Image });
dom.window.Image = class { style = {}; set src(v) { setTimeout(() => this.onerror?.(), 0); } };   // no real art in tests
globalThis.Image = dom.window.Image;
const { YugantaVN } = await import('../src/vn/YugantaVN.js');
const { GameState } = await import('../src/core/GameState.js');
const { VNBridge } = await import('../src/core/VNBridge.js');
const root = path.resolve('public/data/parvas'); const files = [];
for (const p of fs.readdirSync(root)) { const d = path.join(root, p, 'dialogues'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) files.push(path.join(d, f)); }
const chars = new Map(JSON.parse(fs.readFileSync('public/data/global/characters.json', 'utf8')).characters.map(c => [c.character_id, c]));
// every timeline node must be playable: authored dialogue, or Sanjaya's narration card
const { narrationFor } = await import('../src/vn/narration.js');
const { buildManifest } = await import('../tools/buildManifest.js');
const nodes = buildManifest(path.resolve('public/data')).parvas.flatMap(p => p.nodes);
const narr = nodes.map(n => narrationFor(n));
let bad = 0, total = 0, gs = new GameState();
const vn = new YugantaVN({ getCharacters: () => chars, getGameState: () => gs });   // one instance, like the real game
vn.sound.sfx = () => {}; vn.sound.play = () => {};
for (const f of [...files, ...narr.map((n, i) => ({ narr: n, i }))]) {
  const seq = f.narr ?? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  gs = new GameState();
  const bridge = new VNBridge({ gameState: gs, timeoutMs: 4000 }); bridge.setProvider(vn);
  const before = gs.snapshot(); const run = bridge.play(seq);
  let guard = 0, picks = 0;
  const tick = setInterval(() => {                 // act like a player: finish typing, click first choice or the frame
    const layer = document.getElementById('yvn-layer'); if (!layer || layer.hidden) return;
    const frame = layer.querySelector('.vn-frame'); if (!frame) return;
    const btn = layer.querySelector('.vn-choice'); if (btn) { btn.click(); picks++; } else frame.click();
    if (++guard > 3000) clearInterval(tick);
  }, 1);
  const r = await run; clearInterval(tick); total++;
  const expected = {}; ['dharma', 'artha', 'kama', 'moksha'].forEach(k => (expected[k] = r.choicesMade.reduce((s, c) => s + (c[`${k}_impact`] || 0), 0)));
  const okApplied = Math.max(0, Math.min(100, before.dharmaMeter + expected.dharma)) === gs.dharmaMeter && before.artha + expected.artha === gs.artha;
  if (r.skipped || !okApplied || !document.getElementById('yvn-layer').hidden) { bad++; console.log('FAIL', f.narr ? f.narr.sequence_id : path.basename(f), { skipped: r.skipped, okApplied }); }
}
console.log(`${total - bad}/${total} sequences played through the real VNBridge; impacts applied exactly once.`); process.exit(bad ? 1 : 0);
