// Single shared audio manager for the whole app (one AudioContext, shared buses).

import { createAudioManager } from './audio-manager.js';
import { createGameStorage } from '../local/storage.js';

let shared = null;

export function getSharedAudio() {
  if (!shared) {
    shared = createAudioManager(() => createGameStorage().getPrefs());
  }
  return shared;
}
