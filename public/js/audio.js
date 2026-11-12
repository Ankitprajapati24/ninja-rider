// Synthesised sound and music; nothing to download. The context is created on the first
// user gesture (browsers refuse to start audio before one).
const MUSIC_KEY = 'ninjaRider.music';
const BPM = 104, STEPS = 64, LOOKAHEAD = 0.25;
const ROOT = 220;                       // A3
const HIRAJOSHI = [0, 2, 3, 7, 8];      // the classic koto scale: A B C E F
const BASS = [0, -4, -5, 0];            // one bass note per bar: A F E A

function loadMusicPref() {
  try { return localStorage.getItem(MUSIC_KEY) !== 'off'; } catch { return true; }
}

export function createAudio() {
  let ctx = null, master = null, sfx = null, music = null, noiseBuffer = null;
  let muted = false, musicOn = loadMusicPref();
  let timer = null, nextTime = 0, step = 0, intensity = 0, motif = [], motifAge = 0;

  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = 0.85;
      sfx.connect(master);
      music = ctx.createGain();
      music.gain.value = 0.42;
      music.connect(master);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (musicOn) startMusic();
  }

  function envelope(volume, duration, at, bus) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(bus);
    return gain;
  }

  function tone(freq, duration, { type = 'sine', volume = 0.3, to = freq, delay = 0, at, bus = sfx } = {}) {
    if (!ctx) return;
    const start = at ?? ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    osc.connect(envelope(volume, duration, start, bus));
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noise(duration, { volume = 0.3, freq = 1000, q = 1, delay = 0, at, bus = sfx, type = 'bandpass' } = {}) {
    if (!ctx) return;
    const start = at ?? ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    src.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    src.connect(filter);
    filter.connect(envelope(volume, duration, start, bus));
    src.start(start, Math.random() * 0.5, duration + 0.02);
  }

  // --- music: a koto melody over a bass drone, with taiko that builds with `intensity`
  const scaleFreq = (degree) => {
    const octave = Math.floor(degree / HIRAJOSHI.length);
    const semis = 12 * octave + HIRAJOSHI[((degree % HIRAJOSHI.length) + HIRAJOSHI.length) % HIRAJOSHI.length];
    return ROOT * 2 ** (semis / 12);
  };

  function koto(freq, at, volume = 0.13) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, at);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, at);
    filter.frequency.exponentialRampToValueAtTime(500, at + 0.9);
    osc.connect(filter);
    filter.connect(envelope(volume, 1.2, at, music));
    osc.start(at);
    osc.stop(at + 1.25);
    tone(freq * 2, 0.5, { volume: volume * 0.3, at, bus: music });
  }

  function taiko(at, volume) {
    tone(95, 0.45, { volume, to: 45, at, bus: music });
    noise(0.08, { volume: volume * 0.6, freq: 220, q: 0.7, at, bus: music });
  }

  // A 16-step phrase; it repeats with small changes so the tune feels written, not random.
  function newMotif() {
    let degree = 5 + Math.floor(Math.random() * 3);
    motif = Array.from({ length: 16 }, (_, i) => {
      const rest = i % 4 === 3 ? 0.6 : 0.3;
      if (Math.random() < rest) return null;
      degree = Math.max(2, Math.min(11, degree + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
      return degree;
    });
    motif[0] = motif[0] ?? 5;
    motifAge = 0;
  }

  function playStep(s, at) {
    const inBar = s % 16;
    if (inBar === 0) {
      if (s === 0 && (motif.length === 0 || ++motifAge >= 2)) newMotif();
      const bass = ROOT / 2 * 2 ** (BASS[Math.floor(s / 16)] / 12);
      tone(bass, 2.2, { type: 'triangle', volume: 0.16, at, bus: music });
      tone(bass / 2, 2.2, { volume: 0.12, at, bus: music });
    }
    const note = motif[inBar];
    if (note != null && !(motifAge === 1 && s >= 48 && Math.random() < 0.3)) koto(scaleFreq(note), at);
    if (intensity >= 1 && (inBar === 0 || inBar === 6 || inBar === 8)) taiko(at, inBar === 0 ? 0.5 : 0.32);
    if (intensity >= 2) {
      if (inBar === 12 || inBar === 14) taiko(at, 0.28);
      if (s % 2 === 1) noise(0.04, { volume: 0.05, freq: 7000, q: 1.5, at, bus: music });
    }
  }

  function schedule() {
    const stepTime = 60 / BPM / 2 / (intensity >= 2 ? 1.12 : 1);
    // after the tab was in the background, skip ahead instead of playing a burst of late notes
    if (nextTime < ctx.currentTime - 0.1) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      playStep(step, nextTime);
      nextTime += stepTime;
      step = (step + 1) % STEPS;
    }
  }

  function startMusic() {
    if (!ctx || timer) return;
    nextTime = ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(schedule, 50);
  }

  function stopMusic() {
    clearInterval(timer);
    timer = null;
  }

  return {
    unlock,
    get muted() { return muted; },
    get musicOn() { return musicOn; },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.7;
    },
    setMusic(value) {
      musicOn = value;
      try { localStorage.setItem(MUSIC_KEY, value ? 'on' : 'off'); } catch { /* not remembered */ }
      if (value) startMusic(); else stopMusic();
    },
    // 0 menu, 1 riding, 2 final seconds
    setIntensity(level) { intensity = level; },

    hoof(strength) { noise(0.07, { volume: 0.12 + 0.2 * strength, freq: 150 + Math.random() * 70, q: 1.4 }); },
    slash() {
      noise(0.22, { volume: 0.32, freq: 2600, q: 0.8 });
      tone(900, 0.18, { volume: 0.06, to: 300, type: 'sawtooth' });
    },
    throwStar() { noise(0.12, { volume: 0.22, freq: 4200, q: 2 }); },
    hit() {
      tone(190, 0.14, { type: 'triangle', volume: 0.45, to: 80 });
      noise(0.09, { volume: 0.3, freq: 900 });
    },
    gold() {
      [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.3, { type: 'triangle', volume: 0.22, delay: i * 0.06 }));
    },
    orb() {
      tone(1320, 0.4, { volume: 0.18, delay: 0 });
      tone(1760, 0.5, { volume: 0.15, delay: 0.07 });
      tone(2640, 0.6, { volume: 0.08, delay: 0.14 });
    },
    combo(level) { tone(440 * 2 ** (level / 6), 0.25, { type: 'triangle', volume: 0.2, to: 880 * 2 ** (level / 6) }); },
    jump() { tone(220, 0.18, { volume: 0.2, to: 440 }); },
    land() { noise(0.14, { volume: 0.45, freq: 110, q: 0.8 }); },
    clear() {
      tone(523, 0.1, { type: 'triangle', volume: 0.25 });
      tone(784, 0.2, { type: 'triangle', volume: 0.25, delay: 0.08 });
    },
    knock() {
      tone(140, 0.25, { type: 'sawtooth', volume: 0.25, to: 60 });
      noise(0.2, { volume: 0.35, freq: 300 });
    },
    countdown(final) { tone(final ? 988 : 659, final ? 0.5 : 0.15, { type: 'square', volume: 0.12 }); },
    tick() { tone(1000, 0.05, { type: 'square', volume: 0.12 }); },
    over() {
      tone(587, 0.2, { type: 'triangle', volume: 0.25 });
      tone(440, 0.2, { type: 'triangle', volume: 0.25, delay: 0.2 });
      tone(294, 0.5, { type: 'triangle', volume: 0.25, delay: 0.4 });
    },
    record() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, { type: 'triangle', volume: 0.2, delay: 0.5 + i * 0.09 }));
    },
  };
}
