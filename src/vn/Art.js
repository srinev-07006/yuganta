// Procedural SVG art. Drop real files in assets/bg/<key>.jpg|png to override any background automatically.
const PAL = { PANDAVA: ['#D35400', '#7D6608', '#145A32', '#E5E7E9'], KAURAVA: ['#4A235A', '#900C3F', '#FFC300', '#1C2833'], NEUTRAL: ['#FDFEFE', '#BDC3C7', '#78281F', '#3b2f2a'] };
const rng = seed => { let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const has = (k, re) => new RegExp(re).test(k);

function sky(k) {
  if (has(k, 'court|assembly|hall|sabha|panchala')) return ['#120a08', '#2a1710', '#4a2a16'];
  if (has(k, 'naraka|fire|flame|blood|horror')) return ['#1a0500', '#7a1a08', '#e0501a'];
  if (has(k, 'dusk|sunset|shore|abhimanyu|corpse')) return ['#2b1642', '#a3402a', '#f0a04b'];
  if (has(k, 'night|camp')) return ['#05060f', '#141a33', '#2b3157'];
  if (has(k, 'snow|himalaya|sunlight|cosmic')) return ['#9fb6c9', '#d8e2ea', '#fbf6e6'];
  return ['#2a3d5c', '#8a7a6a', '#e3b96e'];
}
function scene(k, r, W, H) {
  const g = H * 0.68; let o = '';
  const indoor = has(k, 'court|assembly|hall|sabha|panchala');
  if (indoor) {
    o += `<rect y="${g}" width="${W}" height="${H - g}" fill="#2a1c12"/>`;
    for (let i = 0; i < 7; i++) { if (i === 3) continue; const x = 90 + i * 230; o += `<rect x="${x}" y="120" width="46" height="${g - 120}" fill="#5a3d24"/><rect x="${x - 12}" y="105" width="70" height="24" fill="#c9a24b"/><rect x="${x - 12}" y="${g - 14}" width="70" height="16" fill="#3a271a"/>`; }
    o += `<rect x="${W / 2 - 150}" y="${g - 60}" width="300" height="60" fill="#7a1f2e"/><rect x="${W / 2 - 60}" y="${g - 190}" width="120" height="130" fill="#c9a24b" opacity=".85"/>`;
  } else if (has(k, 'lake|river|ganges|shore|poison|sorrowful')) {
    o += `<rect y="${g}" width="${W}" height="${H - g}" fill="#12303f"/>`;
    for (let i = 0; i < 26; i++) o += `<rect x="${r() * W}" y="${g + 10 + r() * (H - g - 20)}" width="${60 + r() * 140}" height="3" fill="#ffffff" opacity=".13"/>`;
    o += mountains(r, W, g, '#1c2a3a');
  } else if (has(k, 'forest|tree|manipura|ascetic|sami|virata|plains')) {
    o += `<rect y="${g}" width="${W}" height="${H - g}" fill="#17301c"/>` + mountains(r, W, g, '#1d3a2a');
    for (let i = 0; i < 16; i++) { const x = r() * W, h = 160 + r() * 240; o += `<rect x="${x}" y="${g - h + 40}" width="16" height="${h}" fill="#2b1d12"/><ellipse cx="${x + 8}" cy="${g - h + 30}" rx="${60 + r() * 40}" ry="${50 + r() * 30}" fill="#1f5a2c" opacity=".92"/>`; }
  } else if (has(k, 'snow|himalaya|mountain')) {
    o += mountains(r, W, g, '#e9eef2', true) + `<rect y="${g}" width="${W}" height="${H - g}" fill="#f4f7f9"/>`;
  } else {  // battlefield
    o += `<rect y="${g}" width="${W}" height="${H - g}" fill="#3a2a1a"/>` + mountains(r, W, g, '#2a2018');
    for (let i = 0; i < 22; i++) { const x = r() * W, y = g + 10 + r() * (H - g - 30), s = 0.6 + r() * 0.7; o += `<g transform="translate(${x} ${y}) scale(${s})" fill="#120c08"><circle cx="0" cy="0" r="22"/><rect x="-46" y="-6" width="92" height="10"/><rect x="0" y="-90" width="4" height="90"/><path d="M4 -90 l40 12 l-40 14z" fill="${i % 2 ? '#D35400' : '#900C3F'}"/></g>`; }
  }
  if (has(k, 'fire|flame|naraka|blood|camp')) for (let i = 0; i < 40; i++) { const x = r() * W, h = 60 + r() * 160; o += `<path d="M${x} ${H} q-30 -${h / 2} 0 -${h} q30 ${h / 2} 0 ${h}z" fill="${i % 2 ? '#e0501a' : '#ffb03a'}" opacity=".55"/>`; }
  if (has(k, 'arrow')) for (let i = 0; i < 30; i++) { const x = 300 + r() * 1000, y = g + r() * (H - g); o += `<line x1="${x}" y1="${y}" x2="${x + 70}" y2="${y - 70 - r() * 40}" stroke="#1a1208" stroke-width="3"/>`; }
  return o;
}
function mountains(r, W, g, c, snow) {
  let d = `M0 ${g}`; for (let x = 0; x <= W; x += 120) d += ` L${x} ${g - 60 - r() * (snow ? 300 : 140)}`; return `<path d="${d} L${W} ${g}z" fill="${c}"/>`;
}
export function backgroundSVG(key = '') {
  const W = 1600, H = 900, r = rng(key), [a, b, c] = sky(key);
  const indoor = has(key, 'court|assembly|hall|sabha|panchala');
  const sun = indoor ? [200, 700, 1400].map(x => `<circle cx="${x}" cy="230" r="90" fill="#ffb03a" opacity=".16"/><circle cx="${x}" cy="230" r="14" fill="#ffd27a"/>`).join('') : has(key, 'night|camp') ? `<circle cx="${W * 0.8}" cy="150" r="46" fill="#dfe6ff" opacity=".85"/>` : `<circle cx="${W * 0.22}" cy="${has(key, 'dusk|sunset|shore|corpse') ? 440 : 210}" r="70" fill="${c}" opacity=".9"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#s)"/>${sun}${scene(key, r, W, H)}<rect width="${W}" height="${H}" fill="url(#v)" opacity="0"/></svg>`;
}
const CHAR = {  // skin, hair, headgear, extras
  bhishma: { hair: '#eee', beard: 1, gear: 'jata' }, drona: { hair: '#ddd', beard: 1, gear: 'jata' }, vyasa: { hair: '#ccc', beard: 1, gear: 'jata' }, vidura: { hair: '#bbb', beard: 1, gear: 'none' },
  kripacharya: { hair: '#ccc', beard: 1, gear: 'jata' }, sanjaya: { hair: '#999', beard: 0, gear: 'none' }, dhritarashtra: { hair: '#bbb', beard: 1, gear: 'crown', blind: 1 },
  yudhishthira: { gear: 'crown' }, duryodhana: { gear: 'crown', big: 1 }, drupada: { gear: 'crown' }, virata: { gear: 'crown' }, arjuna: { gear: 'mukut' }, karna: { gear: 'kavach' }, krishna: { gear: 'peacock', skin: '#4b6a8c' },
  draupadi: { fem: 1, hair: '#120a08', gear: 'bindi' }, kunti: { fem: 1, hair: '#555', gear: 'veil' }, gandhari: { fem: 1, hair: '#333', gear: 'blindfold' }, uttara: { fem: 1, hair: '#120a08', gear: 'bindi' },
  bhima: { big: 1, gear: 'none' }, shakuni: { gear: 'none', beard: 1, hair: '#222' }, duhshasana: { gear: 'none', big: 1 }, ashwatthama: { gear: 'gem' }, shikhandi: { gear: 'none' },
};
export function portraitSVG(id, faction = 'NEUTRAL', emotion = 'NEUTRAL') {
  const c = { skin: '#c68a5c', hair: '#140c08', ...(CHAR[id] ?? {}) }, p = PAL[faction] ?? PAL.NEUTRAL;
  const cloth = faction === 'NEUTRAL' ? p[1] : p[0], trim = faction === 'KAURAVA' ? p[2] : p[3];
  const brow = { ANGRY: ['M34 46 l16 6', 'M86 46 l-16 6'], GRIEF: ['M34 52 l16 -6', 'M86 52 l-16 -6'], SMUG: ['M34 48 l16 0', 'M86 46 l-16 -3'] }[emotion] ?? ['M34 48 l16 0', 'M86 48 l-16 0'];
  const mouth = { ANGRY: 'M48 92 q12 -6 24 0', GRIEF: 'M48 94 q12 -8 24 0', SMUG: 'M48 90 q14 6 26 -4', ENLIGHTENED: 'M50 90 q10 4 20 0' }[emotion] ?? 'M50 91 l20 0';
  const w = c.big ? 1.12 : 1;
  let s = `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">`;
  if (emotion === 'ENLIGHTENED') s += `<circle cx="60" cy="62" r="52" fill="#fff" opacity=".18"/>`;
  if (c.fem || c.gear === 'jata') s += `<path d="M22 60 q0 -50 38 -50 q38 0 38 50 v${c.fem ? 80 : 30} h-76z" fill="${c.hair}"/>`;
  s += `<path d="M6 160 q4 -44 54 -44 q50 0 54 44z" fill="${cloth}" transform="translate(${60 - 60 * w} 0) scale(${w} 1)"/><path d="M40 118 l20 22 l20 -22" fill="none" stroke="${trim}" stroke-width="5"/>`;
  s += `<rect x="50" y="98" width="20" height="24" fill="${c.skin}"/><ellipse cx="60" cy="66" rx="30" ry="36" fill="${c.skin}"/>`;
  if (!c.fem && c.gear !== 'jata') s += `<path d="M30 58 q0 -34 30 -34 q30 0 30 34 q-10 -16 -30 -16 q-20 0 -30 16z" fill="${c.hair}"/>`;
  if (c.beard) s += `<path d="M32 74 q4 44 28 44 q24 0 28 -44 q-10 20 -28 20 q-18 0 -28 -20z" fill="${c.hair}"/>`;
  s += c.blind || c.gear === 'blindfold' ? `<rect x="32" y="56" width="56" height="12" fill="${c.gear === 'blindfold' ? '#f0e6d2' : '#0000'}"/>` : `<circle cx="46" cy="60" r="3.5" fill="#160d08"/><circle cx="74" cy="60" r="3.5" fill="#160d08"/>`;
  s += `<path d="${brow[0]} M${brow[1].slice(1)}" stroke="#160d08" stroke-width="3" fill="none"/><path d="${mouth}" stroke="#4a1a10" stroke-width="3" fill="none"/>`;
  if (c.gear === 'crown') s += `<path d="M30 30 l8 -20 l12 14 l10 -22 l10 22 l12 -14 l8 20z" fill="${p[2] ?? '#c9a24b'}" stroke="#7a5a10"/>`;
  if (c.gear === 'mukut') s += `<path d="M34 30 q26 -34 52 0z" fill="#c9a24b"/><circle cx="60" cy="14" r="4" fill="#3ac"/>`;
  if (c.gear === 'peacock') s += `<path d="M60 28 q-6 -24 0 -30 q6 6 0 30z" fill="#1f8a70"/><path d="M34 30 q26 -20 52 0z" fill="#e8c14a"/>`;
  if (c.gear === 'kavach') s += `<path d="M20 124 q40 -20 80 0 v10 h-80z" fill="#d9b13a" opacity=".9"/><circle cx="26" cy="72" r="6" fill="#ffd45a"/>`;
  if (c.gear === 'gem') s += `<circle cx="60" cy="34" r="5" fill="#e33"/>`;
  if (c.gear === 'bindi') s += `<circle cx="60" cy="44" r="3" fill="#b0122a"/>`;
  if (c.gear === 'veil') s += `<path d="M22 66 q0 -56 38 -56 q38 0 38 56 q-8 -34 -38 -34 q-30 0 -38 34z" fill="#eee"/>`;
  return s + '</svg>';
}
const svgUrl = s => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;
export class Art {
  #tried = new Map();
  portrait(id, faction, emotion) { return portraitSVG(id, faction, emotion); }
  /** Real art wins if present: public/portraits/<id>_<EMOTION>.webp, then <id>.webp (`prefer` names are tried first), then the battle sprite. */
  upgradePortrait(el, id, emotion = 'NEUTRAL', prefer = []) {
    const tries = [...prefer, `${id}_${emotion}`, id].map(n => `./portraits/${n}.webp`).concat(`./sprites/characters/${id}.webp`);
    const next = () => { const u = tries.shift(); if (!u) return;
      const img = new Image(); img.alt = ''; img.style.cssText = 'width:100%;height:100%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 6px 14px #000c)';
      img.onload = () => { if (el.isConnected) { el.replaceChildren(img); el.style.background = 'transparent'; el.style.border = '0'; } };
      img.onerror = next; img.src = u; };
    next();
  }
  applyBackground(el, key = '') {
    el.style.backgroundImage = `linear-gradient(#0000 45%, #000b), ${svgUrl(backgroundSVG(key))}`;
    el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
    if (!key) return;
    for (const ext of ['jpg', 'png', 'webp']) {  // real art overrides procedural if present in assets/bg/
      const img = new Image(); img.onload = () => { if (el.dataset.bg === key) el.style.backgroundImage = `linear-gradient(#0000 45%, #000b), url(./assets/bg/${key}.${ext})`; };
      img.src = `./assets/bg/${key}.${ext}`;
    }
  }
}
