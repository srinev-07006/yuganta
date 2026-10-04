// Synthesised Indian-modal soundscape (WebAudio, no files). Drop assets/audio/<bgm_key>.mp3 to override a track with a real recording.
const SA = 130.81;                                         // C3
const RATIO = { sa: 1, re: 16 / 15, ga: 6 / 5, ma: 4 / 3, pa: 3 / 2, dha: 8 / 5, ni: 9 / 5 };  // Bhairavi-ish, just intonation
const MOODS = [
  ['battle', 'combat|clash|chaos|wrath|tandava|tension|duel'], ['tragic', 'tragic|sorrow|lament|somber|sadness|final|end'],
  ['sacred', 'chant|spiritual|mystic|gita|discourse|hero|riddle'], ['ominous', 'ominous|horror|dharma|crisis|break'],
];
export const moodFor = key => (MOODS.find(([, re]) => new RegExp(re).test(key)) ?? ['court'])[0];

export class Sound {
  ctx = null; muted = false; currentKey = undefined; #mood = null; #timer = null; #group = null; #file = null;
  init() {
    if (this.ctx) return this.ctx.resume();
    const want = this.currentKey;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (want !== undefined) this.play(want);   // music requested before the first click starts now
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.05); return this.muted; }
  #osc(type, f, t, dur, vol, dest, opt = {}) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opt.slide) o.frequency.exponentialRampToValueAtTime(opt.slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (opt.atk ?? 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (opt.vib) { const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = f * 0.012; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur); }
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  #drum(t, dest, vol = 0.5, f = 90) {
    this.#osc('sine', f * 1.8, t, 0.35, vol, dest, { slide: f, atk: 0.005 });
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), bp = this.ctx.createBiquadFilter();
    s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 900; g.gain.setValueAtTime(vol * 0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.connect(bp).connect(g).connect(dest); s.start(t); s.stop(t + 0.1);
  }
  #bowl(t, f, dest, vol = 0.18) { [1, 2.76, 5.4].forEach((m, i) => this.#osc('sine', f * m, t, 6 - i * 1.5, vol / (i + 1), dest, { atk: 0.01 })); }
  #drone(dest, minor2) {  // tanpura-like: Sa, Pa (or Re for tension), detuned saws through a low-pass
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(dest);
    [[SA / 2, 0], [SA * (minor2 ? RATIO.re : RATIO.pa) / 2, 4], [SA, -5]].forEach(([f, det], i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; g.gain.value = 0.05 / (i + 1);
      o.connect(g).connect(lp); o.start(); (this.#group.stop ??= []).push(o);
    });
  }
  async play(key = '') {
    this.currentKey = key;                      // remembered even before audio is unlocked, so the first click starts the right music
    if (!this.ctx) return;
    const mood = moodFor(key); if (`${mood}|${key}` === this.#mood) return; this.#mood = `${mood}|${key}`;
    this.#stopGroup();
    if (key) for (const ext of ['mp3', 'ogg']) {   // real recording wins if present
      try { const r = await fetch(`./assets/audio/${key}.${ext}`, { method: 'HEAD' }); if (r.ok) { this.#file = new Audio(`./assets/audio/${key}.${ext}`); this.#file.loop = true; this.#file.volume = 0.6; this.#file.play().catch(() => {}); return; } } catch { /* fall through */ }
    }
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master); g.gain.setTargetAtTime(1, this.ctx.currentTime, 1.2);
    this.#group = { gain: g }; this.#drone(g, mood === 'ominous' || mood === 'horror');
    const scale = ['sa', 're', 'ga', 'ma', 'pa', 'dha', 'ni'], beat = { battle: 0.34, tragic: 0.9, sacred: 0.8, ominous: 1.1, court: 0.6 }[mood];
    let step = 0, deg = 4, next = this.ctx.currentTime + 0.2;
    const tick = () => {
      while (next < this.ctx.currentTime + 0.5) {
        const t = next; step++;
        if (mood === 'battle') { this.#drum(t, g, step % 4 === 0 ? 0.7 : 0.35, step % 2 ? 110 : 70); if (step % 8 === 0) this.#osc('sawtooth', SA * 2, t, 0.8, 0.05, g, { slide: SA * 2.2 }); }
        else if (mood === 'court' && step % 4 === 0) this.#drum(t, g, 0.32, 80);
        else if (mood === 'ominous' && step % 6 === 0) this.#drum(t, g, 0.6, 55);
        if (mood === 'tragic' || mood === 'sacred' || mood === 'court') {   // bansuri-like phrase, random walk
          if (step % (mood === 'court' ? 3 : 2) === 0 && Math.random() < 0.75) { deg = Math.max(0, Math.min(6, deg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)])); this.#osc('sine', SA * 2 * RATIO[scale[deg]], t, beat * 1.9, mood === 'court' ? 0.05 : 0.09, g, { vib: true, atk: 0.12 }); }
        }
        if (mood === 'sacred' && step % 8 === 1) this.#bowl(t, SA * 2, g);
        if (mood === 'ominous' && step % 10 === 3) this.#osc('sine', SA * 1.06, t, 4, 0.08, g, { atk: 1.5 });
        next += beat;
      }
    };
    tick(); this.#timer = setInterval(tick, 200);
  }
  #stopGroup() {
    clearInterval(this.#timer); this.#file?.pause(); this.#file = null;
    const grp = this.#group; if (!grp) return; this.#group = null;
    grp.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); setTimeout(() => { grp.stop?.forEach(o => { try { o.stop(); } catch {} }); grp.gain.disconnect(); }, 2000);
  }
  stop() { this.#stopGroup(); this.#mood = null; }
  sfx(kind) {  // ui sounds
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (kind === 'choice') { this.#osc('sine', 660, t, 0.5, 0.12, this.master, { atk: 0.005 }); this.#osc('sine', 990, t + 0.06, 0.6, 0.08, this.master); }
    else if (kind === 'advance') this.#osc('triangle', 440, t, 0.08, 0.05, this.master, { atk: 0.003 });
    else if (kind === 'imbalance') { this.#osc('sawtooth', 110, t, 1.6, 0.12, this.master, { slide: 40 }); this.#drum(t, this.master, 0.9, 50); }
  }
}
