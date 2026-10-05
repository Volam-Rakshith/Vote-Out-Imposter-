// Procedural audio — every sound and the background music are synthesized with
// the Web Audio API (no audio files, works fully offline).
//
// - Music and SFX have independent enabled + 0-100% volume settings.
// - Browsers block audio until a user gesture: call unlock() from a click.
// - The game is fully playable with all audio off — audio never carries
//   information that is not also visible on screen.

const DEFAULT_PREFS = Object.freeze({
  music: { enabled: true, volume: 40 },
  sfx: { enabled: true, volume: 70 },
});

const CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [130.81, 164.81, 196.0], // C
];

export function createAudioManager(getPrefs, { audioContextFactory } = {}) {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let unlocked = false;
  let musicTimer = null;
  let chordIndex = 0;
  let lastTickSecond = -1;

  function ensureContext() {
    if (ctx) return ctx;
    try {
      if (audioContextFactory) {
        ctx = audioContextFactory();
      } else {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (!ctx || typeof ctx.createGain !== 'function') { ctx = null; return null; }
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0;
      sfxBus.connect(master);
      applyVolumes();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const p = getPrefs();
    musicBus.gain.setTargetAtTime(p.music.enabled ? p.music.volume / 100 : 0, ctx.currentTime, 0.15);
    sfxBus.gain.setTargetAtTime(p.sfx.enabled ? p.sfx.volume / 100 : 0, ctx.currentTime, 0.05);
  }

  function unlock() {
    // The user gesture always counts, even without WebAudio support.
    unlocked = true;
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    applyVolumes();
  }

  /** Schedule a synthesized note. */
  function tone({ bus, freq, start, duration, type = 'sine', peak = 0.6, attack = 0.01, release = 0.2, detune = 0 }) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    const t0 = Math.max(ctx.currentTime, start);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.setTargetAtTime(0.0001, t0 + attack + Math.max(0.01, duration - release), release / 3);
    osc.connect(gain).connect(bus);
    osc.start(t0);
    osc.stop(t0 + duration + release + 0.1);
  }

  function noise({ bus, start, duration, peak = 0.3 }) {
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = peak;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    src.connect(filter).connect(gain).connect(bus);
    src.start(Math.max(ctx.currentTime, start));
  }

  const SFX = {
    gameStart() {
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ bus: sfxBus, freq: f, start: t + i * 0.09, duration: 0.16, type: 'triangle', peak: 0.5, release: 0.3 }));
    },
    roleReveal() {
      const t = ctx.currentTime;
      tone({ bus: sfxBus, freq: 440, start: t, duration: 0.4, type: 'sine', peak: 0.4, release: 0.5 });
      tone({ bus: sfxBus, freq: 659.25, start: t + 0.12, duration: 0.5, type: 'sine', peak: 0.3, release: 0.6 });
    },
    tick() {
      const t = ctx.currentTime;
      tone({ bus: sfxBus, freq: 1250, start: t, duration: 0.03, type: 'square', peak: 0.14, release: 0.02 });
    },
    voteStart() {
      const t = ctx.currentTime;
      tone({ bus: sfxBus, freq: 392, start: t, duration: 0.14, type: 'triangle', peak: 0.4 });
      tone({ bus: sfxBus, freq: 587.33, start: t + 0.13, duration: 0.22, type: 'triangle', peak: 0.4 });
    },
    speakerTurn() {
      const t = ctx.currentTime;
      tone({ bus: sfxBus, freq: 659.25, start: t, duration: 0.12, type: 'sine', peak: 0.42, release: 0.25 });
      tone({ bus: sfxBus, freq: 987.77, start: t + 0.12, duration: 0.2, type: 'sine', peak: 0.36, release: 0.35 });
    },
    voteLock() {
      const t = ctx.currentTime;
      tone({ bus: sfxBus, freq: 880, start: t, duration: 0.06, type: 'square', peak: 0.3, release: 0.05 });
      tone({ bus: sfxBus, freq: 110, start: t, duration: 0.18, type: 'sine', peak: 0.5, release: 0.1 });
    },
    eliminate() {
      const t = ctx.currentTime;
      [392, 329.63, 261.63].forEach((f, i) =>
        tone({ bus: sfxBus, freq: f, start: t + i * 0.12, duration: 0.2, type: 'sawtooth', peak: 0.25, release: 0.25 }));
      noise({ bus: sfxBus, start: t, duration: 0.35, peak: 0.18 });
    },
    guessStart() {
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) tone({ bus: sfxBus, freq: 311.13, start: t + i * 0.09, duration: 0.05, type: 'triangle', peak: 0.2, release: 0.04 });
    },
    guessCorrect() {
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone({ bus: sfxBus, freq: f, start: t + i * 0.08, duration: 0.22, type: 'triangle', peak: 0.5, release: 0.4 }));
    },
    guessWrong() {
      const t = ctx.currentTime;
      [329.63, 293.66, 246.94].forEach((f, i) =>
        tone({ bus: sfxBus, freq: f, start: t + i * 0.16, duration: 0.26, type: 'sawtooth', peak: 0.22, release: 0.3 }));
    },
    chaosReveal() {
      const t = ctx.currentTime;
      [277.18, 293.66, 311.13, 466.16].forEach((f, i) =>
        tone({ bus: sfxBus, freq: f, start: t + i * 0.05, duration: 0.9, type: 'sawtooth', peak: 0.16, release: 0.8 }));
    },
    victory() {
      const t = ctx.currentTime;
      const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      seq.forEach((f, i) =>
        tone({ bus: sfxBus, freq: f, start: t + i * 0.11, duration: 0.2, type: 'triangle', peak: 0.5, release: 0.5 }));
    },
    roundEnd() {
      const t = ctx.currentTime;
      tone({ bus: sfxBus, freq: 196, start: t, duration: 0.9, type: 'sine', peak: 0.4, release: 0.9 });
      tone({ bus: sfxBus, freq: 392, start: t + 0.02, duration: 0.7, type: 'sine', peak: 0.2, release: 0.9 });
    },
    uiClick() {
      const t = ctx.currentTime;
      tone({ bus: sfxBus, freq: 640, start: t, duration: 0.025, type: 'sine', peak: 0.12, release: 0.02 });
    },
  };

  function play(name) {
    if (!unlocked || !ctx) return;
    const p = getPrefs();
    if (!p.sfx.enabled) return;
    if (SFX[name]) SFX[name]();
  }

  /* ---------------- generative background music ---------------- */
  function musicStep() {
    if (!ctx || !unlocked) return;
    const p = getPrefs();
    if (!p.music.enabled) return;
    const t = ctx.currentTime + 0.05;
    const chord = CHORDS[chordIndex % CHORDS.length];
    chordIndex++;
    // soft pad chord
    chord.forEach((f, i) => tone({
      bus: musicBus, freq: f, start: t, duration: 3.4, type: 'sine',
      peak: 0.09 - i * 0.015, attack: 1.1, release: 2.2, detune: i * 4 - 4,
    }));
    // sparse arp accent
    if (chordIndex % 2 === 0) {
      tone({ bus: musicBus, freq: chord[2] * 2, start: t + 1.7, duration: 0.5, type: 'triangle', peak: 0.05, attack: 0.02, release: 0.5 });
    }
  }

  function startMusic() {
    if (musicTimer || !ctx) return;
    musicStep();
    musicTimer = setInterval(musicStep, 3600);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function updateVolumes() {
    applyVolumes();
    const p = getPrefs();
    if (p.music.enabled && unlocked && !musicTimer) startMusic();
    if (!p.music.enabled) stopMusic();
  }

  /** Countdown ticking for the final 10 seconds (never the only cue). */
  function tickIfUrgent(secondsLeft) {
    const sec = Math.ceil(secondsLeft);
    if (sec <= 10 && sec > 0 && sec !== lastTickSecond) {
      lastTickSecond = sec;
      play('tick');
    }
  }

  return {
    unlock,
    play,
    updateVolumes,
    tickIfUrgent,
    get unlocked() { return unlocked; },
  };
}

export { DEFAULT_PREFS };
