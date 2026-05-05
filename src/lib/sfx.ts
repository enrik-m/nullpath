/**
 * Sound effects layer.
 *
 * SFX are synthesized on-the-fly via the Web Audio API rather than
 * shipped as audio files — keeps bundle size small and lets us tune
 * cyberpunk timbres directly. Howler is left in dependencies for
 * future ambient tracks.
 */

import { useUi } from "../store";

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  if (!ctx) {
    // Lazy because some browsers reject creation pre-user-gesture
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

function enabled(): boolean {
  return useUi.getState().soundEnabled;
}

interface ToneOpts {
  freq: number;
  duration: number;       // seconds
  type?: OscillatorType;
  gain?: number;          // 0..1
  attack?: number;        // seconds
  release?: number;       // seconds
  detune?: number;        // cents
}

function tone(opts: ToneOpts) {
  if (!enabled()) return;
  const a = audio();
  const now = a.currentTime;
  const osc = a.createOscillator();
  const gainNode = a.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = opts.freq;
  if (opts.detune) osc.detune.value = opts.detune;
  const peak = opts.gain ?? 0.18;
  const attack = opts.attack ?? 0.01;
  const release = opts.release ?? 0.08;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(peak, now + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration + release);
  osc.connect(gainNode).connect(a.destination);
  osc.start(now);
  osc.stop(now + opts.duration + release + 0.05);
}

function noise(duration: number, gainPeak = 0.1, filterFreq = 1500) {
  if (!enabled()) return;
  const a = audio();
  const now = a.currentTime;
  const buffer = a.createBuffer(1, a.sampleRate * duration, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const gainNode = a.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(filter).connect(gainNode).connect(a.destination);
  src.start(now);
  src.stop(now + duration + 0.05);
}

// ---------------------------------------------------------------------------
// Public API — semantic, not waveform.
// ---------------------------------------------------------------------------

export const sfx = {
  hover() {
    tone({ freq: 880, duration: 0.04, type: "sine", gain: 0.04, attack: 0.005, release: 0.03 });
  },
  click() {
    tone({ freq: 540, duration: 0.05, type: "triangle", gain: 0.08, attack: 0.005 });
  },
  navigate() {
    tone({ freq: 660, duration: 0.07, type: "sine", gain: 0.1 });
    setTimeout(() => tone({ freq: 880, duration: 0.06, type: "sine", gain: 0.08 }), 40);
  },
  success() {
    tone({ freq: 587.33, duration: 0.1, type: "triangle", gain: 0.12 });
    setTimeout(() => tone({ freq: 783.99, duration: 0.12, type: "triangle", gain: 0.12 }), 60);
    setTimeout(() => tone({ freq: 1046.5, duration: 0.18, type: "triangle", gain: 0.12 }), 130);
  },
  complete() {
    // node completed
    tone({ freq: 659.25, duration: 0.12, type: "sine", gain: 0.18 });
    setTimeout(() => tone({ freq: 987.77, duration: 0.18, type: "sine", gain: 0.16 }), 80);
  },
  levelUp() {
    tone({ freq: 523.25, duration: 0.15, type: "triangle", gain: 0.18 });
    setTimeout(() => tone({ freq: 659.25, duration: 0.15, type: "triangle", gain: 0.18 }), 110);
    setTimeout(() => tone({ freq: 783.99, duration: 0.15, type: "triangle", gain: 0.18 }), 220);
    setTimeout(() => tone({ freq: 1046.5, duration: 0.3, type: "triangle", gain: 0.2 }), 330);
  },
  warn() {
    tone({ freq: 220, duration: 0.18, type: "sawtooth", gain: 0.08 });
  },
  zoneUnlock() {
    noise(0.2, 0.07, 600);
    setTimeout(() => tone({ freq: 130, duration: 0.4, type: "sawtooth", gain: 0.14 }), 50);
    setTimeout(() => tone({ freq: 195, duration: 0.4, type: "sawtooth", gain: 0.12 }), 120);
  },
  bootStart() {
    tone({ freq: 110, duration: 0.4, type: "sawtooth", gain: 0.06 });
    noise(0.2, 0.04, 300);
  },
  bootChunk() {
    tone({ freq: 800 + Math.random() * 200, duration: 0.02, type: "square", gain: 0.04 });
  },
  glitch() {
    for (let i = 0; i < 6; i++) {
      setTimeout(
        () =>
          tone({
            freq: 200 + Math.random() * 1500,
            duration: 0.03,
            type: "square",
            gain: 0.06,
          }),
        i * 25,
      );
    }
  },
};

/** Re-init the audio context after a user gesture (some browsers require it). */
export function unlockAudio() {
  const a = audio();
  if (a.state === "suspended") a.resume().catch(() => {});
}
