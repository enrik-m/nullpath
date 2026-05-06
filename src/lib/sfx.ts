/**
 * Sound effects layer — chunky chiptune.
 *
 * Synth-only via Web Audio. Square waves dominate (NES-era feel) with
 * triangle bass. Short attacks, short decays. No reverb — dry pixel sound.
 */

import { useUi } from "../store";

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

function enabled(): boolean {
  return useUi.getState().soundEnabled;
}

interface ToneOpts {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  detune?: number;
}

function tone(opts: ToneOpts) {
  if (!enabled()) return;
  const a = audio();
  const now = a.currentTime;
  const osc = a.createOscillator();
  const gainNode = a.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.value = opts.freq;
  if (opts.detune) osc.detune.value = opts.detune;
  const peak = opts.gain ?? 0.12;
  const attack = opts.attack ?? 0.005;
  const release = opts.release ?? 0.04;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(peak, now + attack);
  gainNode.gain.setValueAtTime(peak, now + opts.duration);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration + release);
  osc.connect(gainNode).connect(a.destination);
  osc.start(now);
  osc.stop(now + opts.duration + release + 0.05);
}

function arpeggio(freqs: number[], stepMs: number, opts: Partial<ToneOpts> = {}) {
  freqs.forEach((f, i) => {
    setTimeout(
      () => tone({ freq: f, duration: stepMs / 1000 - 0.005, type: "square", gain: 0.1, ...opts }),
      i * stepMs,
    );
  });
}

function noise(duration: number, gainPeak = 0.08, filterFreq = 1500) {
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
// Public API
// ---------------------------------------------------------------------------

const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568.0,
};

export const sfx = {
  hover() {
    tone({ freq: NOTE.E5, duration: 0.02, type: "square", gain: 0.04 });
  },
  click() {
    tone({ freq: NOTE.A5, duration: 0.04, type: "square", gain: 0.08 });
  },
  navigate() {
    arpeggio([NOTE.C5, NOTE.E5, NOTE.G5], 30, { gain: 0.09 });
  },
  success() {
    arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 60, { gain: 0.12 });
  },
  complete() {
    arpeggio([NOTE.E5, NOTE.G5, NOTE.B5, NOTE.E6], 50, { gain: 0.13 });
  },
  levelUp() {
    arpeggio([NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6], 80, { gain: 0.14 });
    setTimeout(() => tone({ freq: NOTE.C6, duration: 0.5, type: "triangle", gain: 0.15 }), 600);
  },
  warn() {
    tone({ freq: NOTE.A4, duration: 0.06, type: "square", gain: 0.1 });
    setTimeout(() => tone({ freq: NOTE.E4, duration: 0.1, type: "square", gain: 0.1 }), 80);
  },
  zoneUnlock() {
    noise(0.08, 0.06, 800);
    arpeggio([NOTE.G4, NOTE.B4, NOTE.D5, NOTE.G5], 50, { gain: 0.11 });
  },
  bootStart() {
    tone({ freq: 80, duration: 0.3, type: "triangle", gain: 0.08 });
    noise(0.15, 0.04, 400);
  },
  bootChunk() {
    tone({
      freq: 600 + Math.random() * 800,
      duration: 0.015,
      type: "square",
      gain: 0.05,
    });
  },
  glitch() {
    for (let i = 0; i < 8; i++) {
      setTimeout(
        () =>
          tone({
            freq: 100 + Math.random() * 1800,
            duration: 0.025,
            type: "square",
            gain: 0.05,
          }),
        i * 18,
      );
    }
  },
  /** Soft typewriter for boot text */
  type() {
    if (Math.random() < 0.4) {
      tone({ freq: 1200 + Math.random() * 600, duration: 0.008, type: "square", gain: 0.025 });
    }
  },
};

export function unlockAudio() {
  const a = audio();
  if (a.state === "suspended") a.resume().catch(() => {});
}
