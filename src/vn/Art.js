// Procedural art for the VN layer. Real art always wins:
//   portraits  -> public/portraits/<character_id>[_EMOTION].webp   (listed in public/portraits/index.json)
//   backgrounds-> public/assets/bg/<background_asset_key>.jpg|png|webp
const FACTION_PAL = { PANDAVA: ['#D35400', '#7D6608', '#145A32', '#E5E7E9'], KAURAVA: ['#4A235A', '#900C3F', '#FFC300', '#1C2833'], NEUTRAL: ['#FDFEFE', '#BDC3C7', '#78281F', '#3b2f2a'] };
// ───────────────────────────── BACKGROUNDS (procedural, layered SVG) ─────────────────────────────
// Real art always wins: drop public/assets/bg/<background_asset_key>.jpg|png|webp and it replaces the generated scene.
const W = 1600, H = 900;
const N = x => Math.round(x * 10) / 10;
const rng = seed => { let s = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const has = (k, re) => new RegExp(re).test(k);
const PAL = {
  day:   { sky: ['#4d84c4', '#a8cbe6', '#f6ecd2'], sun: '#fff3c4', haze: '#eadfc4', far: '#7088a8', mid: '#4e6c58', near: '#2a3a2a', ground: ['#86924e', '#4a5530'] },
  dusk:  { sky: ['#1b1440', '#8a3a4c', '#f7a24a'], sun: '#ffd08a', haze: '#eaa66c', far: '#5c3a5e', mid: '#3a2648', near: '#1c1224', ground: ['#5e3c2a', '#2a1a14'] },
  night: { sky: ['#03040b', '#0c1330', '#27315c'], sun: '#dfe8ff', haze: '#3b4b7c', far: '#161e40', mid: '#0d132b', near: '#05081a', ground: ['#18203a', '#070a14'] },
  fire:  { sky: ['#150300', '#6e1204', '#ff7a22'], sun: '#ffb347', haze: '#ff7a22', far: '#3a0a04', mid: '#240602', near: '#0c0201', ground: ['#40100a', '#120301'] },
  sick:  { sky: ['#0b1a14', '#2f5a3a', '#a9c27a'], sun: '#d6e8a0', haze: '#7fa060', far: '#1d3a2c', mid: '#12261c', near: '#08130d', ground: ['#20402c', '#0a160f'] },
};
function classify(k) {
  k = String(k || '').toLowerCase();
  const kind = has(k, 'cosmic|vishwa|viswa') ? 'cosmic' : has(k, 'naraka|flame|burning') ? 'fire' : has(k, 'arrows') ? 'arrows'
    : has(k, 'camp') ? 'camp' : has(k, 'court|assembly|hall|sabha|palace|panchala|lakshagriha') ? 'hall'
    : has(k, 'snow|himalaya|meru|ascent|mountain') ? 'snow' : has(k, 'lake|river|ganga|ganges|poison|shore|prabhasa|dvaipayana|celestial|water') ? 'water'
    : has(k, 'sami|tree') ? 'tree' : has(k, 'forest|ascetic|manipura|penance|meditat|outskirts') ? 'forest'
    : has(k, 'virata_plains|plains|border') ? 'plain' : 'battle';
  let tod = has(k, 'night|camp') ? 'night' : has(k, 'poison') ? 'sick' : has(k, 'blood|naraka|flame|rampage') ? 'fire'
    : has(k, 'sunlight|snow|himalaya|plain|ascetic|manipura|forest_penance|deep|sami') ? 'day' : 'dusk';
  if (kind === 'fire') tod = 'fire';
  if (kind === 'hall' || kind === 'cosmic') tod = 'dusk';
  return { kind, tod, mood: { red: has(k, 'blood|rampage'), dead: has(k, 'corpse|aftermath|surrounded') } };
}
// ── small drawing helpers (all return SVG strings)
const ridge = (r, base, amp, col, step = 80, op = 1) => { let d = `M-50 ${H} L-50 ${N(base)}`; for (let x = -50; x <= W + 50; x += step) d += ` L${x} ${N(base - amp * (0.25 + 0.75 * r()))}`; return `<path d="${d} L${W + 50} ${H}z" fill="${col}" opacity="${op}"/>`; };
const hills = (r, base, amp, col, op = 1) => { let d = `M-50 ${H} L-50 ${N(base)}`; for (let x = -50; x < W + 150; x += 220) d += ` Q${x + 110} ${N(base - amp * (0.4 + r() * 0.6))} ${x + 220} ${N(base - amp * 0.2 * r())}`; return `<path d="${d} L${W + 50} ${H}z" fill="${col}" opacity="${op}"/>`; };
const stars = (r, n, ymax) => Array.from({ length: n }, () => `<circle cx="${N(r() * W)}" cy="${N(r() * ymax)}" r="${N(0.4 + r() * 1.4)}" fill="#fff" opacity="${N(0.3 + r() * 0.7)}"/>`).join('');
const clouds = (r, n, y0, y1, col, op) => Array.from({ length: n }, () => { const x = r() * W, y = y0 + r() * (y1 - y0), s = 0.6 + r() * 1.2; return `<g fill="${col}" opacity="${op}"><ellipse cx="${N(x)}" cy="${N(y)}" rx="${N(130 * s)}" ry="${N(20 * s)}"/><ellipse cx="${N(x + 50 * s)}" cy="${N(y - 14 * s)}" rx="${N(80 * s)}" ry="${N(22 * s)}"/><ellipse cx="${N(x - 60 * s)}" cy="${N(y - 8 * s)}" rx="${N(70 * s)}" ry="${N(16 * s)}"/></g>`; }).join('');
const glow = (id, cx, cy, rad, col, op = 1) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${rad}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
const soldier = (x, y, s, c, flag) => `<g transform="translate(${N(x)} ${N(y)}) scale(${N(s)})" fill="${c}"><circle cy="-31" r="4.4"/><path d="M-5 -26 h10 l4 26 h-18z"/><rect x="7" y="-52" width="1.8" height="52" transform="rotate(${N(-4 + (x % 9))} 7 0)"/>${flag ? `<path d="M9 -50 l16 5 l-16 6z" fill="${flag}"/>` : ''}</g>`;
const elephant = (x, y, s, c, flag) => `<g transform="translate(${N(x)} ${N(y)}) scale(${N(s)})" fill="${c}"><ellipse cy="-40" rx="50" ry="32"/><ellipse cx="-50" cy="-48" rx="22" ry="24"/><path d="M-66 -40 q-22 14 -16 46 q4 8 8 0 q-2 -26 16 -34z"/><path d="M-58 -30 q-14 6 -20 16" stroke="#e8ddc2" stroke-width="3" fill="none"/>${[-30, -8, 16, 36].map(l => `<rect x="${l}" y="-12" width="12" height="42"/>`).join('')}<rect x="-24" y="-82" width="52" height="16" rx="3"/><rect x="-6" y="-114" width="2" height="34"/><path d="M-4 -113 l22 7 l-22 8z" fill="${flag || c}"/></g>`;
const chariot = (x, y, s, c, flag) => `<g transform="translate(${N(x)} ${N(y)}) scale(${N(s)})" fill="${c}"><circle cy="-20" r="20" fill="none" stroke="${c}" stroke-width="4"/>${[0, 45, 90, 135].map(a => `<line x1="-20" y1="-20" x2="20" y2="-20" stroke="${c}" stroke-width="2.4" transform="rotate(${a} 0 -20)"/>`).join('')}<rect x="-26" y="-56" width="52" height="26" rx="3"/><rect x="-2" y="-96" width="2.4" height="42"/><path d="M0 -95 l26 8 l-26 9z" fill="${flag || c}"/><ellipse cx="-62" cy="-30" rx="26" ry="13"/><path d="M-80 -34 q-16 -16 -8 -34 l8 3 q-2 14 8 24z"/><ellipse cx="-92" cy="-60" rx="9" ry="6"/><rect x="-74" y="-18" width="4" height="22"/><rect x="-52" y="-18" width="4" height="22"/></g>`;
const tree = (x, y, s, trunk, can, can2) => `<g transform="translate(${N(x)} ${N(y)}) scale(${N(s)})"><path d="M-9 0 q3 -60 -2 -120 l14 0 q-5 60 2 120z" fill="${trunk}"/><ellipse cy="-150" rx="92" ry="64" fill="${can}"/><ellipse cx="-44" cy="-120" rx="58" ry="40" fill="${can2 || can}"/><ellipse cx="52" cy="-126" rx="54" ry="38" fill="${can2 || can}"/></g>`;
const tent = (x, y, s, c, lit) => `<g transform="translate(${N(x)} ${N(y)}) scale(${N(s)})"><path d="M-70 0 L0 -90 L70 0z" fill="${c}"/><path d="M-70 0 L0 -90 L0 0z" fill="#000" opacity=".25"/>${lit ? `<path d="M-16 0 L0 -44 L16 0z" fill="#ffc15a"/><ellipse cy="2" rx="46" ry="10" fill="#ffb347" opacity=".35"/>` : ''}<rect x="-1.5" y="-118" width="3" height="30" fill="#2a1a10"/></g>`;
const flame = (x, y, s, a, b) => `<g transform="translate(${N(x)} ${N(y)}) scale(${N(s)})"><path d="M0 0 C-30 -20 -22 -60 -4 -96 C-2 -64 20 -56 18 -28 C26 -40 30 -20 0 0z" fill="${a}"/><path d="M0 0 C-14 -10 -10 -34 0 -54 C6 -36 16 -28 0 0z" fill="${b}"/></g>`;
const arrow = (x, y, s, rot) => `<g transform="translate(${N(x)} ${N(y)}) rotate(${N(rot)}) scale(${N(s)})"><rect x="-1.4" y="-96" width="2.8" height="96" fill="#2a1a0e"/><path d="M-1.6 -96 l-6 -10 l6 5 l6 -5 l-6 10z" fill="#c9b27a"/><path d="M0 0 l-4 -14 l4 7 l4 -7z" fill="#a88a4a"/></g>`;
const pillar = (x, yb, h, w, c1, c2) => `<g><rect x="${N(x - w / 2)}" y="${N(yb - h)}" width="${N(w)}" height="${N(h)}" fill="url(#pil)"/><rect x="${N(x - w * 0.75)}" y="${N(yb - h - w * 0.45)}" width="${N(w * 1.5)}" height="${N(w * 0.5)}" fill="${c1}"/><rect x="${N(x - w * 0.7)}" y="${N(yb - w * 0.35)}" width="${N(w * 1.4)}" height="${N(w * 0.4)}" fill="${c2}"/>${[0.2, 0.5, 0.8].map(t => `<rect x="${N(x - w / 2)}" y="${N(yb - h * t)}" width="${N(w)}" height="${N(w * 0.1)}" fill="${c1}" opacity=".5"/>`).join('')}</g>`;
const lamp = (x, y, id) => `<circle cx="${x}" cy="${y}" r="120" fill="url(#${id})"/><circle cx="${x}" cy="${y}" r="8" fill="#ffe2a0"/><path d="M${x} ${y - 200} V${y - 10}" stroke="#3a2812" stroke-width="2"/>`;

function scene(kind, tod, mood, r, p, k) {
  const gy = kind === 'water' ? H * 0.58 : H * 0.66;      // horizon
  let o = '', defs = '';
  const night = tod === 'night', fire = tod === 'fire';
  // sky furniture
  const sunX = N(W * (0.2 + r() * 0.6)), sunY = N(gy - (tod === 'day' ? 330 : tod === 'dusk' ? 60 : 250));
  defs += glow('sunG', sunX, sunY, 420, p.sun, night ? 0.5 : 0.95);
  const skyArt = (kind !== 'hall' && kind !== 'cosmic' && kind !== 'camp' || night)
    ? `${night ? stars(r, 160, gy - 80) : ''}<circle cx="${sunX}" cy="${sunY}" r="440" fill="url(#sunG)"/><circle cx="${sunX}" cy="${sunY}" r="${night ? 46 : 70}" fill="${p.sun}"/>${night ? '' : clouds(r, 7, 80, gy - 120, tod === 'day' ? '#fff' : p.haze, tod === 'day' ? 0.5 : 0.28)}` : '';
  o += skyArt;

  if (kind === 'hall') {
    const vx = W / 2, vy = H * 0.5;
    defs += `<linearGradient id="pil" x1="0" x2="1"><stop offset="0" stop-color="#3a2412"/><stop offset=".45" stop-color="#9a6a38"/><stop offset="1" stop-color="#2a180c"/></linearGradient>${glow('lampG', 0, 0, 120, '#ffb347', 0.55)}<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".35"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></linearGradient><linearGradient id="flr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a10"/><stop offset="1" stop-color="#5a3a22"/></linearGradient>`;
    const house = has(k, 'panchala') ? ['#D35400', '#f0b060'] : has(k, 'kuru|hastinapura|assembly|sabha') ? ['#7a1f4a', '#ffc300'] : ['#7a1f2e', '#c9a24b'];
    o += `<rect width="${W}" height="${H}" fill="#150b07"/>`;
    // back wall: three arched windows onto the sky
    for (const [cx, w] of [[W * 0.2, 150], [W / 2, 190], [W * 0.8, 150]]) o += `<path d="M${cx - w} ${vy + 40} V${vy - 160} Q${cx} ${vy - 330} ${cx + w} ${vy - 160} V${vy + 40}z" fill="url(#bgSky)"/><path d="M${cx - w - 14} ${vy + 40} V${vy - 164} Q${cx} ${vy - 350} ${cx + w + 14} ${vy - 164} V${vy + 40}" fill="none" stroke="#c9a24b" stroke-width="8" opacity=".85"/>`;
    defs += `<linearGradient id="bgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".6" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient>`;
    o += `<rect y="${vy + 40}" width="${W}" height="60" fill="#241409"/>`;
    // floor in perspective
    o += `<polygon points="0,${vy + 100} ${W},${vy + 100} ${W},${H} 0,${H}" fill="url(#flr)"/>`;
    for (let i = -10; i <= 10; i++) o += `<line x1="${vx}" y1="${vy + 100}" x2="${N(vx + i * 210)}" y2="${H}" stroke="#000" stroke-opacity=".22" stroke-width="2"/>`;
    for (let i = 0; i < 9; i++) { const y = vy + 100 + Math.pow(i / 8, 1.8) * (H - vy - 100); o += `<line x1="0" y1="${N(y)}" x2="${W}" y2="${N(y)}" stroke="#000" stroke-opacity=".2"/>`; }
    // carpet
    o += `<polygon points="${vx - 70},${vy + 100} ${vx + 70},${vy + 100} ${vx + 330},${H} ${vx - 330},${H}" fill="${house[0]}"/><polygon points="${vx - 70},${vy + 100} ${vx - 58},${vy + 100} ${vx - 300},${H} ${vx - 330},${H}" fill="${house[1]}"/><polygon points="${vx + 58},${vy + 100} ${vx + 70},${vy + 100} ${vx + 330},${H} ${vx + 300},${H}" fill="${house[1]}"/>`;
    // dais + throne
    o += `<rect x="${vx - 150}" y="${vy + 62}" width="300" height="40" fill="#3a2412"/><rect x="${vx - 120}" y="${vy + 36}" width="240" height="28" fill="#5a3a1c"/><path d="M${vx - 46} ${vy + 36} V${vy - 70} Q${vx} ${vy - 130} ${vx + 46} ${vy - 70} V${vy + 36}z" fill="#c9a24b"/><path d="M${vx - 30} ${vy + 36} V${vy - 52} Q${vx} ${vy - 90} ${vx + 30} ${vy - 52} V${vy + 36}z" fill="${house[0]}"/>`;
    // pillars in perspective, both sides
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { const t = i / 3, depth = 1 - t * 0.62, x = vx + side * (210 + (1 - depth) * 0 + t * -0 + (3 - i) * 0) + side * (i === 3 ? 0 : 0); const px = vx + side * (130 + (1 - t) * 560 * (1 - t * 0.3)), yb = vy + 100 + (1 - t) * (H - vy - 100) * 0.62, h = 520 * depth + 80, w = 70 * depth + 14; o += pillar(px, yb, h, w, '#d6b05a', '#8a6a2c'); if (i < 3) o += `<path d="M${px - side * w * 0.5} ${yb - h * 0.8} l${side * -26 * depth} ${60 * depth} l${side * 26 * depth} 0z" fill="${house[0]}" opacity=".9"/>`; }
    for (const [lx, ly] of [[W * 0.14, 330], [W * 0.34, 380], [W * 0.66, 380], [W * 0.86, 330]]) { defs += ''; o += `<g transform="translate(${N(lx)} ${ly})">${lamp(0, 0, 'lampG')}</g>`; }
    o += `<polygon points="${W * 0.2 - 100},${vy - 120} ${W * 0.2 + 100},${vy - 120} ${W * 0.2 + 360},${H} ${W * 0.2 - 200},${H}" fill="url(#beam)"/><polygon points="${W * 0.8 - 100},${vy - 120} ${W * 0.8 + 100},${vy - 120} ${W * 0.8 + 200},${H} ${W * 0.8 - 360},${H}" fill="url(#beam)"/>`;
    return { defs, o };
  }

  if (kind === 'cosmic') {
    defs += `<radialGradient id="cosm" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#fff3c4"/><stop offset=".12" stop-color="#ffb347"/><stop offset=".4" stop-color="#7a1f6a"/><stop offset="1" stop-color="#05020c"/></radialGradient>`;
    o += `<rect width="${W}" height="${H}" fill="url(#cosm)"/>${stars(r, 220, H)}`;
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; o += `<line x1="${W / 2}" y1="${H / 2}" x2="${N(W / 2 + Math.cos(a) * 1200)}" y2="${N(H / 2 + Math.sin(a) * 1200)}" stroke="#ffe2a0" stroke-opacity="${i % 2 ? 0.07 : 0.16}" stroke-width="${i % 3 ? 2 : 5}"/>`; }
    for (let i = 1; i <= 7; i++) o += `<circle cx="${W / 2}" cy="${H / 2}" r="${i * 78}" fill="none" stroke="#ffd27a" stroke-opacity="${N(0.5 - i * 0.05)}" stroke-width="${i % 2 ? 2 : 5}" stroke-dasharray="${i % 2 ? '' : '12 10'}"/>`;
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, rr = 250 + (i % 3) * 70; o += `<circle cx="${N(W / 2 + Math.cos(a) * rr)}" cy="${N(H / 2 + Math.sin(a) * rr * 0.8)}" r="${i % 3 ? 14 : 24}" fill="#ffe2a0" opacity=".55"/>`; }
    return { defs, o };
  }

  // far/mid landscape per kind
  const ground = `<rect y="${gy}" width="${W}" height="${H - gy}" fill="url(#gnd)"/>`;
  defs += `<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.ground[0]}"/><stop offset="1" stop-color="${p.ground[1]}"/></linearGradient>`;

  if (kind === 'snow') {
    const peaks = (base, amp, lit, shade, n) => { let s = ''; for (let i = 0; i < n; i++) { const cx = (i + 0.3 + r() * 0.5) * (W / n), h = amp * (0.55 + r() * 0.45), w = 260 + r() * 220; s += `<polygon points="${N(cx - w)},${base} ${N(cx)},${N(base - h)} ${N(cx + w)},${base}" fill="${lit}"/><polygon points="${N(cx)},${N(base - h)} ${N(cx + w)},${base} ${N(cx + w * 0.1)},${base}" fill="${shade}"/><polygon points="${N(cx - w * 0.22)},${N(base - h * 0.78)} ${N(cx)},${N(base - h)} ${N(cx + w * 0.2)},${N(base - h * 0.8)} ${N(cx + w * 0.05)},${N(base - h * 0.7)}" fill="#fff"/>`; } return s; };
    o += `<path d="M0 260 Q400 160 800 250 T1600 220 V330 H0z" fill="#7fe0c0" opacity=".12"/><path d="M0 330 Q500 210 900 320 T1600 300 V400 H0z" fill="#a89cff" opacity=".1"/>`;
    o += peaks(gy + 40, 420, '#cdd9e6', '#8da0b8', 4) + `<rect y="${gy - 60}" width="${W}" height="120" fill="${p.haze}" opacity=".25"/>` + peaks(gy + 120, 340, '#e8eef5', '#a8b8cc', 5) + `<rect y="${gy + 50}" width="${W}" height="${H}" fill="#eef3f8"/>`;
    for (let i = 0; i < 16; i++) o += `<ellipse cx="${N(r() * W)}" cy="${N(gy + 120 + r() * 380)}" rx="${N(120 + r() * 220)}" ry="${N(10 + r() * 22)}" fill="#cfdcea" opacity=".6"/>`;
    for (let i = 0; i < 110; i++) o += `<circle cx="${N(r() * W)}" cy="${N(r() * H)}" r="${N(1 + r() * 2.4)}" fill="#fff" opacity="${N(0.3 + r() * 0.6)}"/>`;
    return { defs, o };
  }

  if (kind === 'water') {
    o += ridge(r, gy, 150, p.far, 90, 0.9) + hills(r, gy, 80, p.mid, 0.95);
    defs += `<linearGradient id="wat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[2]}"/><stop offset=".35" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[0]}"/></linearGradient>`;
    o += `<rect y="${gy}" width="${W}" height="${H - gy}" fill="url(#wat)"/><rect x="${sunX - 60}" y="${gy}" width="120" height="${H - gy}" fill="${p.sun}" opacity=".35"/>`;
    for (let i = 0; i < 70; i++) { const y = gy + 6 + Math.pow(r(), 1.4) * (H - gy - 20), w = 30 + (y - gy) * 0.8 * r(); o += `<rect x="${N(sunX - w / 2 + (r() - 0.5) * 220)}" y="${N(y)}" width="${N(w)}" height="${N(1.5 + (y - gy) / 90)}" fill="${r() > 0.5 ? p.sun : '#fff'}" opacity="${N(0.12 + r() * 0.3)}"/>`; }
    if (has(k, 'prabhasa')) for (let i = 0; i < 6; i++) o += `<path d="M-20 ${H - 40 - i * 52} q200 -30 400 0 t400 0 t400 0 t400 0" fill="none" stroke="#fff" stroke-opacity="${N(0.45 - i * 0.06)}" stroke-width="${6 - i}"/>`;
    o += `<path d="M0 ${H} V${H - 110} Q300 ${H - 160} 700 ${H - 100} T1600 ${H - 130} V${H}z" fill="${p.near}"/>`;
    for (let i = 0; i < 46; i++) { const x = r() * W, h = 70 + r() * 150; o += `<path d="M${N(x)} ${H - 90} q${N((r() - 0.5) * 40)} ${-h / 2} ${N((r() - 0.5) * 60)} ${-h}" stroke="${p.near}" stroke-width="${N(2 + r() * 3)}" fill="none"/>`; }
    if (tod === 'sick') for (let i = 0; i < 4; i++) o += tree(180 + i * 430, H - 80, 1.1, '#0a0f0a', 'none', 'none');
    return { defs, o };
  }

  // land kinds share a base
  o += ridge(r, gy - 10, kind === 'plain' ? 90 : 190, p.far, 90, 0.9);
  defs += `<linearGradient id="hz0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.haze}" stop-opacity="0"/><stop offset="1" stop-color="${p.haze}" stop-opacity=".45"/></linearGradient>`;
  o += `<rect y="${gy - 130}" width="${W}" height="150" fill="url(#hz0)"/>`;
  o += hills(r, gy + 10, 70, p.mid, 1) + ground;

  if (kind === 'plain') {
    for (let i = 0; i < 30; i++) { const y = gy + 20 + r() * (H - gy - 30); o += `<rect x="${N(r() * W)}" y="${N(y)}" width="${N(120 + r() * 300)}" height="${N(2 + (y - gy) / 40)}" fill="${r() > 0.5 ? '#c9b866' : '#5a6a30'}" opacity=".3"/>`; }
    for (let i = 0; i < 9; i++) o += tree(r() * W, gy + 30 + r() * 80, 0.35 + r() * 0.35, '#2b1d12', '#2f4a28', '#3a5a30');
  } else if (kind === 'forest') {
    defs += `<linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4" stop-opacity=".45"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></linearGradient>`;
    for (const [n, sc, c1, c2, yo, op] of [[10, 0.7, p.far, p.mid, -10, 0.85], [8, 1.05, p.mid, p.near, 30, 1], [6, 1.6, p.near, p.near, 90, 1]]) { for (let i = 0; i < n; i++) o += tree((i + r() * 0.8) * (W / n), gy + yo + r() * 40, sc, p.near, c1, c2); if (n === 10) o += `<rect y="${gy - 60}" width="${W}" height="200" fill="${p.haze}" opacity=".22"/>`; }
    for (let i = 0; i < 5; i++) { const x = 200 + i * 300 + r() * 80; o += `<polygon points="${N(x)},0 ${N(x + 70)},0 ${N(x + 330)},${H} ${N(x + 120)},${H}" fill="url(#ray)" opacity="${N(0.35 + r() * 0.3)}"/>`; }
    if (has(k, 'meditat')) o += `<ellipse cx="${W / 2}" cy="${H - 150}" rx="46" ry="14" fill="#000" opacity=".5"/><path d="M${W / 2 - 34} ${H - 150} q34 -120 68 0z" fill="#1a100a"/><circle cx="${W / 2}" cy="${H - 238}" r="19" fill="#1a100a"/><circle cx="${W / 2}" cy="${H - 238}" r="70" fill="url(#sunG)" opacity=".6"/>`;
  } else if (kind === 'tree') {
    o += tree(W * 0.5, gy + 150, 3.1, '#1d130a', p.near, p.mid);
    for (let i = 0; i < 9; i++) { const a = -80 + i * 22, x = W * 0.5 + (i - 4) * 62; o += `<g transform="translate(${N(x)} ${N(gy - 150 - (i % 3) * 36)})"><line y2="48" stroke="#3a2812" stroke-width="2.4"/><rect x="-5" y="48" width="10" height="64" fill="#2a2a32"/><path d="M-9 112 h18 l-9 18z" fill="#8c93a4"/></g>`; }
  } else if (kind === 'camp') {
    defs += glow('fireG', 0, 0, 340, fire ? '#ff5a1f' : '#ffb347', 0.75);
    for (let i = 0; i < 7; i++) { const x = 90 + i * 240 + (i % 2) * 40, y = gy + 40 + (i % 3) * 26; o += tent(x, y, 1.3 - (i % 3) * 0.18, i % 2 ? '#3a2a4a' : '#4a2a2a', true); }
    o += `<g transform="translate(${W * 0.5} ${H - 110})"><circle r="340" fill="url(#fireG)"/>${flame(0, 0, 1.4, '#ff7a1f', '#ffd27a')}${flame(-26, 8, 0.9, '#ff5a1f', '#ffb347')}${flame(26, 8, 0.8, '#ff5a1f', '#ffb347')}<path d="M-50 6 L50 -4 M-50 -4 L50 6" stroke="#2a1a0e" stroke-width="9"/></g>`;
  } else if (kind === 'fire') {
    defs += `<linearGradient id="lava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#8a1a04"/></linearGradient>`;
    o += ridge(r, gy + 30, 220, '#1a0502', 70) + `<path d="M-20 ${gy + 120} Q400 ${gy + 40} 800 ${gy + 120} T1620 ${gy + 80} V${gy + 220} Q1200 ${gy + 250} 800 ${gy + 200} T-20 ${gy + 230}z" fill="url(#lava)"/>`;
    for (let i = 0; i < 12; i++) o += `<ellipse cx="${N(r() * W)}" cy="${N(80 + r() * (gy - 100))}" rx="${N(80 + r() * 160)}" ry="${N(26 + r() * 40)}" fill="#1c0603" opacity="${N(0.25 + r() * 0.3)}"/>`;
    for (let i = 0; i < 34; i++) o += flame(r() * W, H - 10 - r() * 260, 0.9 + r() * 1.5, r() > 0.4 ? '#ff6a1a' : '#c2310a', '#ffd27a');
    for (let i = 0; i < 90; i++) o += `<circle cx="${N(r() * W)}" cy="${N(r() * H)}" r="${N(1 + r() * 2.4)}" fill="#ffc15a" opacity="${N(0.3 + r() * 0.6)}"/>`;
  } else if (kind === 'arrows') {
    o += `<ellipse cx="${W / 2}" cy="${H - 170}" rx="520" ry="80" fill="#000" opacity=".35"/>`;
    for (let i = 0; i < 150; i++) o += arrow(r() * W, gy + 20 + r() * (H - gy - 10), 0.6 + (r() * (H - gy)) / 380, (r() - 0.5) * 44);
    for (let i = 0; i < 70; i++) { const t = i / 69, x = W / 2 - 330 + t * 660, y = H - 200 - Math.sin(t * Math.PI) * 52; o += arrow(x, y + 92, 0.9, -60 + t * 120); }
    o += `<path d="M${W / 2 - 150} ${H - 258} q150 -38 300 0 l16 22 q-166 -34 -332 0z" fill="#1a100a"/><circle cx="${W / 2 - 128}" cy="${H - 276}" r="19" fill="#1a100a"/><circle cx="${W / 2 - 128}" cy="${H - 276}" r="100" fill="url(#sunG)" opacity=".55"/>`;
    if (has(k, 'sunlight')) for (let i = 0; i < 4; i++) o += `<polygon points="${N(sunX - 24)},${N(sunY)} ${N(sunX + 24)},${N(sunY)} ${N(sunX + 320 + i * 190 - 500)},${H} ${N(sunX + 100 + i * 190 - 500)},${H}" fill="${p.sun}" opacity=".12"/>`;
  } else {   // battle
    defs += `<linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.haze}" stop-opacity="0"/><stop offset=".5" stop-color="${p.haze}" stop-opacity=".5"/><stop offset="1" stop-color="${p.haze}" stop-opacity="0"/></linearGradient>`;
    o += `<rect y="${gy - 60}" width="${W}" height="120" fill="url(#hz)"/>`;
    const dark = p.near, kauravaFlag = '#900c3f', pandavaFlag = '#d35400';
    for (let i = 0; i < 190; i++) { const x = r() * W, y = gy - 2 + r() * 34; o += soldier(x, y, 0.32 + r() * 0.12, p.far, i % 7 === 0 ? (x < W / 2 ? pandavaFlag : kauravaFlag) : null); }
    o += `<rect y="${gy - 30}" width="${W}" height="190" fill="url(#hz)" opacity=".8"/>`;
    for (let i = 0; i < 6; i++) o += (i % 2 ? elephant : chariot)(100 + i * 290 + r() * 80, gy + 80 + r() * 30, 0.55, p.mid, i < 3 ? pandavaFlag : kauravaFlag);
    for (let i = 0; i < 28; i++) o += soldier(r() * W, gy + 60 + r() * 110, 0.8 + r() * 0.4, p.mid, i % 6 === 0 ? (i % 12 === 0 ? pandavaFlag : kauravaFlag) : null);
    if (mood.dead) { for (let i = 0; i < 26; i++) { const x = r() * W, y = H - 30 - r() * 140; o += `<ellipse cx="${N(x)}" cy="${N(y)}" rx="${N(22 + r() * 26)}" ry="${N(5 + r() * 5)}" fill="${dark}" opacity=".85"/>`; } }
    if (has(k, 'surrounded')) for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; o += soldier(W / 2 + Math.cos(a) * 330, gy + 150 + Math.sin(a) * 74, 1.05 + Math.sin(a) * 0.2, p.near, null); }
    if (has(k, 'wheel|chariot_stuck')) o += `<g transform="translate(${W * 0.62} ${H - 120}) rotate(-14)"><circle r="104" fill="none" stroke="${dark}" stroke-width="16"/>${[0, 30, 60, 90, 120, 150].map(a => `<line x1="-104" x2="104" stroke="${dark}" stroke-width="8" transform="rotate(${a})"/>`).join('')}<circle r="18" fill="${dark}"/></g><ellipse cx="${W * 0.62}" cy="${H - 22}" rx="190" ry="26" fill="#2a1a10"/>`;
    for (let i = 0; i < 40; i++) o += arrow(r() * W, H - 8 - r() * 150, 0.5 + r() * 0.9, (r() - 0.5) * 50);
    if (mood.red || fire) for (let i = 0; i < 9; i++) o += flame(r() * W, gy + 40 + r() * 120, 0.7 + r() * 0.8, '#ff6a1a', '#ffd27a');
    o += `<rect y="${gy + 40}" width="${W}" height="360" fill="url(#hz)" opacity=".45"/>`;
  }
  return { defs, o };
}

export function backgroundSVG(key = '') {
  const { kind, tod, mood } = classify(key), p = PAL[tod], r = rng(key || 'default');
  const { defs, o } = scene(kind, tod, mood, r, p, String(key).toLowerCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>
<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".55" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/></filter>${defs}</defs>
<rect width="${W}" height="${H}" fill="url(#skyG)"/>${o}<rect width="${W}" height="${H}" fill="url(#vig)"/><rect width="${W}" height="${H}" filter="url(#grain)" opacity=".16"/></svg>`;
}

const CHAR = {  // skin, hair, headgear, extras
  bhishma: { hair: '#eee', beard: 1, gear: 'jata' }, drona: { hair: '#ddd', beard: 1, gear: 'jata' }, vyasa: { hair: '#ccc', beard: 1, gear: 'jata' }, vidura: { hair: '#bbb', beard: 1, gear: 'none' },
  kripacharya: { hair: '#ccc', beard: 1, gear: 'jata' }, sanjaya: { hair: '#999', beard: 0, gear: 'none' }, dhritarashtra: { hair: '#bbb', beard: 1, gear: 'crown', blind: 1 },
  yudhishthira: { gear: 'crown' }, duryodhana: { gear: 'crown', big: 1 }, drupada: { gear: 'crown' }, virata: { gear: 'crown' }, arjuna: { gear: 'mukut' }, karna: { gear: 'kavach' }, krishna: { gear: 'peacock', skin: '#4b6a8c' },
  draupadi: { fem: 1, hair: '#120a08', gear: 'bindi' }, kunti: { fem: 1, hair: '#555', gear: 'veil' }, gandhari: { fem: 1, hair: '#333', gear: 'blindfold' }, uttara: { fem: 1, hair: '#120a08', gear: 'bindi' },
  bhima: { big: 1, gear: 'none' }, shakuni: { gear: 'none', beard: 1, hair: '#222' }, duhshasana: { gear: 'none', big: 1 }, ashwatthama: { gear: 'gem' }, shikhandi: { gear: 'none' },
};
export function portraitSVG(id, faction = 'NEUTRAL', emotion = 'NEUTRAL') {
  const c = { skin: '#c68a5c', hair: '#140c08', ...(CHAR[id] ?? {}) }, p = FACTION_PAL[faction] ?? FACTION_PAL.NEUTRAL;
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
const loadImg = url => new Promise(res => { const i = new Image(); i.onload = () => (i.decode ? i.decode().catch(() => {}).then(() => res(i)) : res(i)); i.onerror = () => res(null); i.src = url; });

export class Art {
  #img = new Map();    // url -> Promise<Image|null>   (also remembers misses, so a missing file is requested once)
  #done = new Set();   // urls that are already decoded in memory -> shown instantly, no fade
  #index = null;       // portraits/index.json -> Set of available names, or null if unknown
  #bgCache = new Map();
  #tok = 0;

  #probe(url) { if (!this.#img.has(url)) this.#img.set(url, loadImg(url).then(i => { if (i) this.#done.add(url); return i; })); return this.#img.get(url); }
  #names() { if (!this.#index) this.#index = fetch('./portraits/index.json').then(r => (r.ok ? r.json() : null)).then(j => (Array.isArray(j) ? new Set(j) : null)).catch(() => null); return this.#index; }

  /** Warm the cache so portraits are on screen the instant a line appears (call once at startup). */
  async preloadPortraits() { const idx = await this.#names(); if (idx) await Promise.all([...idx].map(n => this.#probe(`./portraits/${n}.webp`))); }

  /** Fallback only: the generated face. It is never shown while a real portrait exists or is still loading. */
  portrait(id, faction, emotion) { return portraitSVG(id, faction, emotion); }

  /**
   * Fills `el` with the real portrait. The element stays EMPTY (and invisible) until the image is decoded,
   * so the generated placeholder never flashes. Only if no real file exists does the generated face appear.
   */
  async showPortrait(el, id, faction, emotion = 'NEUTRAL', prefer = []) {
    const mine = String(++this.#tok); el.dataset.t = mine; el.classList.remove('fallback'); el.replaceChildren();
    const idx = await this.#names();
    const names = [...prefer, `${id}_${emotion}`, id].filter(n => !idx || idx.has(n));
    const urls = names.map(n => `./portraits/${n}.webp`).concat(`./sprites/characters/${id}.webp`);
    let img = null, url = null;
    for (const u of urls) { img = await this.#probe(u); if (img) { url = u; break; } }
    if (!el.isConnected || el.dataset.t !== mine) return;      // a newer line replaced this one
    if (img) {
      const shown = img.cloneNode(); shown.alt = ''; shown.draggable = false;
      shown.className = this.#done.has(url) && idx ? 'yvn-portrait-img' : 'yvn-portrait-img fade';
      el.replaceChildren(shown); if (shown.classList.contains('fade')) requestAnimationFrame(() => shown.classList.add('in'));
    } else { el.classList.add('fallback'); el.innerHTML = portraitSVG(id, faction, emotion); }
  }

  applyBackground(el, key = '') {
    if (!this.#bgCache.has(key)) this.#bgCache.set(key, svgUrl(backgroundSVG(key)));
    const shade = 'linear-gradient(#0000 45%, #000b)';
    el.style.backgroundImage = `${shade}, ${this.#bgCache.get(key)}`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
    if (!key) return;
    (async () => { for (const ext of ['jpg', 'png', 'webp']) { const u = `./assets/bg/${key}.${ext}`; if (await this.#probe(u)) { if (el.dataset.bg === key) el.style.backgroundImage = `${shade}, url(${u})`; return; } } })();
  }
}
