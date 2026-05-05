import { setAudioModeAsync } from 'expo-audio';

/**
 * Configure the iOS audio session so TTS isn't muted by the silent switch.
 * Without this, expo-speech runs under the "ambient" category which respects
 * the hardware mute — surprising for a vocabulary app where users tap
 * "listen" expecting to hear the word. Android isn't affected by the silent
 * switch but still benefits from `duckOthers` (background music dims during
 * playback). Call once at app boot.
 */
export async function setupAudioMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    interruptionMode: 'duckOthers',
    shouldRouteThroughEarpiece: false,
  });
}
