// Role 2's VN provider for VNBridge:  provider.play(sequence, ctx) -> Promise<{ choicesMade, visitedNodeIds }>
// It returns whole choice OBJECTS and applies NO impacts itself (the bridge applies them to GameState).
// The on-screen meter preview is display-only.
import { Art } from './Art.js';
import { Sound } from './Sound.js';
import { VN_CSS } from './vnStyles.js';

const FACTION = { PANDAVA: 'PANDAVA', KAURAVA: 'KAURAVA', NEUTRAL: 'NEUTRAL_SAGES' };
const ACCENT = { PANDAVA: '#D35400', KAURAVA: '#FFC300', NEUTRAL: '#BDC3C7' };
const AXES = [['dharma', 'Dharma'], ['artha', 'Artha'], ['kama', 'Kāma'], ['moksha', 'Mokṣa']];
const pretty = id => String(id || '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export class YugantaVN {
  constructor({ getCharacters = () => new Map(), getGameState = () => null, sound = new Sound(), art = new Art() } = {}) {
    Object.assign(this, { getCharacters, getGameState, sound, art });
    this.root = null;
    const wake = () => { this.sound.init(); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
    window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake);   // browsers need a gesture before audio
  }
  #mount() {
    if (this.root) return;
    const st = document.createElement('style'); st.textContent = VN_CSS; document.head.appendChild(st);
    this.art.preloadPortraits?.();   // decode every portrait up front so none pops in
    this.root = Object.assign(document.createElement('div'), { id: 'yvn-layer' }); this.root.hidden = true;
    this.pm = Object.assign(document.createElement('div'), { className: 'yvn-pm' }); this.pm.hidden = true;
    this.mute = Object.assign(document.createElement('button'), { id: 'yvn-mute', textContent: '🔊' });
    this.mute.onclick = () => { this.mute.textContent = this.sound.toggleMute() ? '🔇' : '🔊'; };
    document.body.append(this.root, this.pm, this.mute);
  }
  #el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  #meter(pending) {   // display-only preview: current GameState + this sequence's picks so far
    const gs = this.getGameState(); if (!gs) return;
    const base = { dharma: gs.dharmaMeter, artha: gs.artha, kama: gs.kama, moksha: gs.moksha };
    this.pm.replaceChildren(...AXES.map(([k, label]) => {
      const v = base[k] + (pending[k] || 0), shown = k === 'dharma' ? Math.max(0, Math.min(100, v)) : v;
      const row = this.#el('div', 'pm-row'); row.dataset.axis = k;
      const track = this.#el('div', 'pm-track'), fill = this.#el('i', 'pm-fill');
      const pct = k === 'dharma' ? shown / 2 : Math.min(Math.abs(shown) / 50, 1) * 50;       // dharma 0..100 fills from left; others centre-based
      fill.style.left = k === 'dharma' ? '0' : (shown >= 0 ? '50%' : `${50 - pct}%`); fill.style.width = pct * (k === 'dharma' ? 2 : 1) + '%';
      track.append(fill); row.classList.toggle('neg', shown < 0);
      const d = this.#el('em', 'pm-delta', pending[k] ? (pending[k] > 0 ? '+' : '') + pending[k] : ''); if (pending[k]) d.classList.add('go');
      row.append(this.#el('span', 'pm-label', label), track, this.#el('b', 'pm-val', String(shown)), d); return row;
    }));
  }

  play(sequence) {
    this.#mount();
    const byId = new Map(sequence.nodes.map(n => [n.dialogue_id, n]));
    const choicesMade = [], visitedNodeIds = [], pending = { dharma: 0, artha: 0, kama: 0, moksha: 0 };
    const mid = sequence.trigger_event !== 'NODE_START';           // MID_BATTLE: keep the frozen battlefield visible behind the text
    const prevBgm = this.sound.currentKey;
    this.root.className = mid ? 'mid' : ''; this.root.dataset.bg = sequence.background_asset_key ?? '';
    if (mid) this.root.style.backgroundImage = ''; else this.art.applyBackground(this.root, sequence.background_asset_key);
    if (sequence.bgm_asset_key) this.sound.play(sequence.bgm_asset_key);
    this.root.hidden = false; this.pm.hidden = false; this.#meter(pending);

    return new Promise(resolve => {
      let typer = null, keys = null;
      const stop = () => { clearInterval(typer); if (keys) window.removeEventListener('keydown', keys); keys = null; };
      const finish = () => {
        stop(); this.root.hidden = true; this.pm.hidden = true; this.root.replaceChildren();
        if (prevBgm !== undefined && sequence.bgm_asset_key && prevBgm !== sequence.bgm_asset_key) this.sound.play(prevBgm);   // back to the battle music
        resolve({ choicesMade, visitedNodeIds });
      };
      const show = node => {
        if (!node || visitedNodeIds.length > 500) return finish();    // dangling / dev-* exits / cycle guard end gracefully
        visitedNodeIds.push(node.dialogue_id); this.sound.sfx('advance'); stop();
        const ch = this.getCharacters().get(node.speaker_id);
        const frame = this.#el('div', 'vn-frame'); frame.style.setProperty('--accent', ACCENT[ch?.default_faction] ?? '#c9a24b');
        frame.dataset.emotion = node.speaker_emotion ?? 'NEUTRAL';
        const portrait = this.#el('div', 'vn-portrait');   // starts EMPTY: the real portrait is placed in as soon as it is decoded
        const young = node.speaker_id === 'kunti' && (this.getGameState()?.currentParva ?? 99) <= 1;   // Kunti: young portrait only in the Adi Parva
        this.art.showPortrait(portrait, node.speaker_id, ch?.default_faction, node.speaker_emotion || 'NEUTRAL', young ? ['kunti_young'] : []);
        const box = this.#el('div', 'vn-box'), text = this.#el('p', 'vn-text');
        box.append(this.#el('h3', 'vn-name', ch?.canonical_name ?? pretty(node.speaker_id)), text);
        frame.append(portrait, box); this.root.replaceChildren(frame);

        const full = node.dialogue_text || '', choices = node.choices || []; let i = 0, typing = true;
        const next = () => {
          if (node.is_endpoint) return finish();
          const n = node.next_dialogue_id ? byId.get(node.next_dialogue_id) : sequence.nodes[sequence.nodes.indexOf(node) + 1];
          show(n);
        };
        const pick = c => { choicesMade.push(c);
          AXES.forEach(([k]) => (pending[k] += c[`${k}_impact`] || 0)); this.#meter(pending); this.sound.sfx('choice'); show(byId.get(c.next_dialogue_id)); };
        const controls = () => {
          if (!choices.length) return box.append(this.#el('span', 'vn-hint', node.is_endpoint ? '■' : '▶'));
          const list = this.#el('div', 'vn-choices');
          choices.forEach((c, n) => { const b = this.#el('button', 'vn-choice', `${n + 1}. ${c.choice_text}`); b.onclick = e => { e.stopPropagation(); pick(c); }; list.append(b); });
          box.append(list);
        };
        const complete = () => { clearInterval(typer); typing = false; text.textContent = full; controls(); };
        typer = setInterval(() => { text.textContent = full.slice(0, ++i); if (i >= full.length) complete(); }, 16);
        const advance = () => { if (typing) return complete(); if (!choices.length) next(); };
        frame.onclick = advance;
        keys = e => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); advance(); }
          else if (!typing && /^[1-9]$/.test(e.key) && choices[+e.key - 1]) pick(choices[+e.key - 1]);
        };
        window.addEventListener('keydown', keys);
      };
      show(sequence.nodes[0]);
    });
  }
}
