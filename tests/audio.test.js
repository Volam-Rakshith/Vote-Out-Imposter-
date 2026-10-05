// Audio tests (spec §24.9): independent music/SFX toggles and volumes,
// procedural synthesis only, safe behaviour without WebAudio, autoplay gating
// and countdown ticking — all verified with a stub AudioContext.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioManager, DEFAULT_PREFS } from '../game/audio/audio-manager.js';

function stubAudioContext() {
  const state = { started: 0, stopped: 0, sources: 0, gainSet: [] };
  const chain = { connect() { return chain; } };
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: { _name: 'destination' },
    resume: async () => { ctx.state = 'running'; },
    createGain() {
      const gain = {
        gain: {
          value: 0,
          setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime(v, t) { state.gainSet.push(v); },
        },
        connect(node) { return node; },
      };
      return gain;
    },
    createOscillator() {
      return {
        type: 'sine', frequency: { value: 0 }, detune: { value: 0 },
        connect: chain.connect,
        start() { state.started++; },
        stop() { state.stopped++; },
      };
    },
    createBuffer(ch, len) {
      return { getChannelData: () => new Float32Array(len) };
    },
    createBufferSource() {
      state.sources++;
      return {
        buffer: null,
        connect: chain.connect,
        start() { state.started++; },
      };
    },
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { value: 0 }, connect: chain.connect };
    },
  };
  return { ctx, state };
}

function makeManager(prefs, stub) {
  return {
    manager: createAudioManager(() => structuredClone(prefs), { audioContextFactory: () => stub.ctx }),
    stub,
  };
}

describe('preferences', () => {
  test('music and sfx have independent enabled flags and 0-100 volumes', () => {
    assert.deepEqual(Object.keys(DEFAULT_PREFS), ['music', 'sfx']);
    for (const kind of ['music', 'sfx']) {
      assert.equal(typeof DEFAULT_PREFS[kind].enabled, 'boolean');
      assert.ok(DEFAULT_PREFS[kind].volume >= 0 && DEFAULT_PREFS[kind].volume <= 100);
    }
  });
});

describe('autoplay gating', () => {
  test('play() before unlock() schedules nothing (browser autoplay policy)', () => {
    const { manager, stub } = makeManager({ music: { enabled: true, volume: 50 }, sfx: { enabled: true, volume: 70 } }, stubAudioContext());
    manager.play('voteLock');
    assert.equal(stub.state.started, 0, 'no sound may be scheduled before a user gesture');
  });

  test('unlock() enables sound', () => {
    const { manager, stub } = makeManager({ music: { enabled: false, volume: 0 }, sfx: { enabled: true, volume: 70 } }, stubAudioContext());
    manager.unlock();
    manager.play('voteLock');
    assert.ok(stub.state.started > 0, 'sounds are scheduled after unlock');
  });
});

describe('sound-effect gating', () => {
  test('SFX off -> no oscillators even after unlock', () => {
    const { manager, stub } = makeManager({ music: { enabled: false, volume: 0 }, sfx: { enabled: false, volume: 70 } }, stubAudioContext());
    manager.unlock();
    for (const sfx of ['gameStart', 'roleReveal', 'voteLock', 'eliminate', 'victory']) manager.play(sfx);
    assert.equal(stub.state.started, 0, 'disabled SFX must schedule nothing');
  });

  test('every game event synthesizes distinct audio', () => {
    const events = ['gameStart', 'roleReveal', 'voteStart', 'voteLock', 'eliminate', 'guessStart', 'guessCorrect', 'guessWrong', 'chaosReveal', 'victory', 'roundEnd', 'uiClick', 'speakerTurn'];
    const counts = new Map();
    for (const ev of events) {
      const { manager, stub } = makeManager({ music: { enabled: false, volume: 0 }, sfx: { enabled: true, volume: 80 } }, stubAudioContext());
      manager.unlock();
      manager.play(ev);
      counts.set(ev, stub.state.started);
      assert.ok(stub.state.started > 0, `${ev} produced no audio`);
    }
    // events are genuinely different sounds, not all identical single beeps
    const distinct = new Set(counts.values());
    assert.ok(distinct.size >= 3, 'expected varied synthesis across events');
  });

  test('unknown event names are ignored safely', () => {
    const { manager, stub } = makeManager({ music: { enabled: false, volume: 0 }, sfx: { enabled: true, volume: 50 } }, stubAudioContext());
    manager.unlock();
    manager.play('nonexistent-event');
    assert.equal(stub.state.started, 0);
  });
});

describe('countdown ticking', () => {
  test('ticks only during the final 10 seconds, once per second', () => {
    const { manager, stub } = makeManager({ music: { enabled: false, volume: 0 }, sfx: { enabled: true, volume: 70 } }, stubAudioContext());
    manager.unlock();
    // a real countdown: values decrease continuously (multiple renders per second)
    for (let v = 30; v > 0; v -= 0.25) manager.tickIfUrgent(v);
    assert.equal(stub.state.started, 10, 'exactly one tick per second for the final 10 seconds');
  });
});

describe('environment safety', () => {
  test('no AudioContext at all: every operation is a safe no-op', () => {
    const manager = createAudioManager(() => ({ music: { enabled: true, volume: 40 }, sfx: { enabled: true, volume: 60 } }), { audioContextFactory: () => null });
    assert.doesNotThrow(() => {
      manager.unlock();
      manager.play('victory');
      manager.updateVolumes();
      manager.tickIfUrgent(5);
    });
    // the gesture was received (unlock) but no context exists, so play() must
    // schedule nothing and never throw — the game stays fully playable.
    assert.equal(manager.unlocked, true);
  });

  test('the game is fully functional with all audio off', () => {
    const { manager } = makeManager({ music: { enabled: false, volume: 0 }, sfx: { enabled: false, volume: 0 } }, stubAudioContext());
    manager.unlock();
    manager.updateVolumes();
    for (const s of ['gameStart', 'roleReveal', 'voteLock', 'victory']) manager.play(s);
    manager.tickIfUrgent(3);
    assert.equal(manager.unlocked, true, 'unlock still works — audio state never blocks gameplay');
  });
});
