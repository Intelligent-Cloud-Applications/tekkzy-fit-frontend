import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

type AudioApi = {
  setAudioModeAsync: (mode: {
    playsInSilentMode?: boolean;
    shouldPlayInBackground?: boolean;
    interruptionMode?: 'mixWithOthers' | 'doNotMix' | 'duckOthers';
  }) => Promise<void>;
  createAudioPlayer: (source: number) => {
    volume: number;
    play: () => void;
    release: () => void;
  };
};

let audioApi: AudioApi | null | undefined;

function getAudio(): AudioApi | null {
  if (audioApi !== undefined) return audioApi;
  try {
    audioApi = require('expo-audio') as AudioApi;
  } catch {
    audioApi = null;
  }
  return audioApi;
}

function playSound(source: number) {
  const audio = getAudio();
  if (!audio) return;
  void (async () => {
    try {
      await audio.setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
      });
      const player = audio.createAudioPlayer(source);
      player.volume = 0.4;
      player.play();
      setTimeout(() => {
        try {
          player.release();
        } catch {
          /* ignore */
        }
      }, 800);
    } catch {
      /* Expo Go without native audio */
    }
  })();
}

function vibe(pattern: number | number[]) {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    /* Expo Go or unsupported device */
  }
  try {
    Vibration.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function feedbackAdded() {
  vibe(35);
  playSound(require('../assets/sounds/pop.wav'));
}

export function feedbackDeleted() {
  vibe([0, 40, 50, 40]);
  playSound(require('../assets/sounds/thud.wav'));
}
