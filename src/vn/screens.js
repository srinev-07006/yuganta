// Title + ending screens (plain DOM, styled with the same palette as the VN layer).
const CSS = `
.yvn-screen{position:fixed;inset:0;z-index:6000;display:grid;place-items:center;text-align:center;padding:24px;color:#f1e9d8;font-family:'Noto Serif','Palatino Linotype',Georgia,serif;
 background:radial-gradient(circle at 50% 30%,#4a235a 0,#1a0f14 55%,#050304)}
.yvn-screen h1{font-size:clamp(3rem,10vw,7rem);letter-spacing:.18em;margin:0;color:#c9a24b;text-shadow:0 0 30px #900c3f}
.yvn-screen h2{color:#c9a24b;letter-spacing:.14em;font-size:clamp(1.6rem,4vw,2.6rem);margin:0 0 8px}
.yvn-screen p{opacity:.78;max-width:560px;line-height:1.65;margin:12px auto}
.yvn-btn{all:unset;cursor:pointer;display:block;margin:12px auto 0;min-width:300px;padding:12px 28px;border:1px solid #c9a24b;color:#c9a24b;letter-spacing:.12em;background:#0006}
.yvn-btn:hover,.yvn-btn:focus-visible{background:#c9a24b;color:#140e0a}
.yvn-btn.sub{border-color:#ffffff44;color:#ddd;font-size:.85rem}
.yvn-stats{display:flex;gap:22px;justify-content:center;margin:18px 0;flex-wrap:wrap}.yvn-stats div{min-width:84px}.yvn-stats b{display:block;font-size:2rem;color:#c9a24b}
`;
const mount = (vn, html) => {
  if (!document.getElementById('yvn-screen-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'yvn-screen-css', textContent: CSS }));
  const el = Object.assign(document.createElement('div'), { className: 'yvn-screen' }); el.innerHTML = html; document.body.appendChild(el); return el;
};
const btn = (el, id, fn) => { el.querySelector(id).onclick = fn; };

export function showTitle(vn, { startId, battleId, onStart }) {
  vn.sound.play('bgm_royal_court');            // starts on the first click (browser autoplay rule)
  const el = mount(vn, `<div><h1>YUGANTA</h1><p>The turning of the age. You are Sanjaya, granted sight across the whole war. Walk its moments, lead its battles, and choose what dharma costs.</p>
    <button class="yvn-btn" id="t-start">BEGIN THE CHRONICLE</button>
    ${battleId ? '<button class="yvn-btn sub" id="t-battle">Skip to the Battle of Kurukshetra</button>' : ''}
    <p style="font-size:.78rem;opacity:.5">Best with sound on. Press 1–4 to choose dialogue options. Space or click to advance.</p></div>`);
  const go = id => { el.remove(); onStart(id); };
  btn(el, '#t-start', () => go(startId)); if (battleId) btn(el, '#t-battle', () => go(battleId));
}

const TIERS = [
  [70, 'The Dharma-Keeper', 'You walked the narrow road. The war was still lost and won as it was written, but you held to what was right at each fork. Sanjaya will remember you well.'],
  [40, 'The Weighed Soul', 'You bent when you had to and held when you could. The epic never promised clean hands, only honest accounting.'],
  [0, 'The Fallen from Dharma', 'Victory and loss were the same ash to you in the end. The Yuga turns on those who forget what the war was for.'],
];   // PLACEHOLDER copy: Role 4 should rewrite and decide real endings.
export function showEnding(vn, gs) {
  const d = gs?.dharmaMeter ?? 0, t = TIERS.find(([min]) => d >= min);
  vn.sound.play('bgm_gita_chant');
  const el = mount(vn, `<div><h2>THE CHRONICLE ENDS</h2><h3 style="color:#f1e9d8;letter-spacing:.1em;margin:0">${t[1]}</h3><p>${t[2]}</p>
    <div class="yvn-stats"><div><b>${d}</b>Dharma</div><div><b>${gs?.artha ?? 0}</b>Artha</div><div><b>${gs?.kama ?? 0}</b>Kāma</div><div><b>${gs?.moksha ?? 0}</b>Mokṣa</div></div>
    <button class="yvn-btn" id="e-again">RETURN TO THE BEGINNING</button></div>`);
  btn(el, '#e-again', () => { location.href = location.pathname; });
}
