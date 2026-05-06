/**
 * Sound effects layer — non-melodic NES/arcade SFX.
 *
 * Synth-only via Web Audio. Three primitives:
 *   - tone:  fixed-frequency oscillator with envelope
 *   - sweep: oscillator with frequency ramp (zips, drops, whooshes)
 *   - noise: white-noise burst through a low-pass filter
 *
 * No arpeggios, no chord changes, no melodic content. Each event is a
 * single percussive gesture — the kind of thing you'd find on an NES
 * for "menu move", "item get", "power up", "door open".
 */

import { useUi } from "../store";

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  if (!ctx) {
    // Safari < 14 still ships the webkit-prefixed constructor.
    type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) {
      throw new Error("Web Audio API not available in this browser");
    }
    ctx = new Ctor();
  }
  return ctx;
}

function enabled(): boolean {
  return useUi.getState().soundEnabled;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

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

interface SweepOpts {
  from: number;
  to: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
}

/**
 * Pitch-sweep tone — single oscillator, frequency ramps from `from` to
 * `to` over `duration`. Powers all the "zip", "drop", and "power-up"
 * effects that used to be melodic arpeggios.
 */
function sweep(opts: SweepOpts) {
  if (!enabled()) return;
  const a = audio();
  const now = a.currentTime;
  const osc = a.createOscillator();
  const gainNode = a.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(opts.from, now);
  // exponentialRamp can't reach exactly 0; clamp the floor.
  osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, opts.to), now + opts.duration);
  const peak = opts.gain ?? 0.1;
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
// Variation helpers
//
// Game audio rule of thumb: identical SFX firing in rapid succession
// causes the "machine gun" effect — your ear locks on to the repetition
// and it sounds robotic. Two standard fixes, both used here:
//   1. Round-robin variants — each public call randomly picks 1 of N
//      pre-designed variants of that effect. Variants differ in pitch
//      shape, timbre, or composition.
//   2. Per-call jitter — within the chosen variant, add ±X% to pitch
//      and small offsets to durations so even the same variant never
//      sounds exactly the same twice.
//
// `pickRR` keeps a per-key "last picked" cursor so we never play the
// same variant twice in a row even when the random draw collides.
// ---------------------------------------------------------------------------

function jitter(value: number, pct: number): number {
  // Returns `value` ±pct * value, uniformly distributed.
  return value * (1 + (Math.random() * 2 - 1) * pct);
}

const lastVariant: Record<string, number> = {};
function pickRR(key: string, n: number): number {
  if (n <= 1) return 0;
  let i = Math.floor(Math.random() * n);
  if (i === lastVariant[key]) i = (i + 1) % n;
  lastVariant[key] = i;
  return i;
}

// ---------------------------------------------------------------------------
// Public API — every call is a single gesture, no melodies.
// ---------------------------------------------------------------------------

export const sfx = {
  /** Tiny tick when the cursor brushes a hot element. */
  hover() {
    // 3 pitch flavors so a sweep across a list doesn't machine-gun.
    const base = [1700, 1900, 2100][pickRR("hover", 3)] ?? 1900;
    tone({
      freq: jitter(base, 0.05),
      duration: jitter(0.012, 0.2),
      type: "square",
      gain: 0.03,
    });
  },

  /** Sharp blip when a button or list item is selected. Two timbre variants. */
  click() {
    const v = pickRR("click", 2);
    if (v === 0) {
      // Pure square blip
      tone({
        freq: jitter(1100, 0.08),
        duration: jitter(0.025, 0.15),
        type: "square",
        gain: 0.07,
        release: 0.025,
      });
    } else {
      // Triangle blip with a noise pip — softer, "wood" feel
      tone({
        freq: jitter(950, 0.08),
        duration: 0.022,
        type: "triangle",
        gain: 0.08,
        release: 0.02,
      });
      noise(0.008, 0.025, 3000);
    }
  },

  /** Menu-cursor move: short chirp. Direction alternates so list scrolls breathe. */
  navigate() {
    const goingUp = pickRR("nav", 2) === 0;
    const lo = jitter(620, 0.05);
    const hi = jitter(900, 0.05);
    sweep({
      from: goingUp ? lo : hi,
      to: goingUp ? hi : lo,
      duration: jitter(0.05, 0.1),
      type: "square",
      gain: 0.07,
    });
  },

  /** "Got it" — short upward zip with a tiny noise pop at the head. */
  success() {
    // 3 variants: bright square zip, mellow triangle zip, "coin" two-stage
    const v = pickRR("success", 3);
    const start = jitter(700, 0.08);
    const end = jitter(1300, 0.06);
    if (v === 0) {
      noise(0.015, 0.04, 2200);
      sweep({ from: start, to: end, duration: 0.08, type: "square", gain: 0.1 });
    } else if (v === 1) {
      sweep({ from: start, to: end, duration: 0.09, type: "triangle", gain: 0.12 });
    } else {
      // "Coin pickup" feel — short tone then a higher tone
      tone({ freq: jitter(900, 0.05), duration: 0.04, type: "square", gain: 0.09 });
      setTimeout(
        () => tone({ freq: jitter(1350, 0.05), duration: 0.07, type: "square", gain: 0.1 }),
        45,
      );
    }
  },

  /** Bigger "task done" — wider zip + noise hit at the peak. Two variants. */
  complete() {
    const v = pickRR("complete", 2);
    const start = jitter(450, 0.1);
    const end = jitter(1500, 0.06);
    if (v === 0) {
      sweep({
        from: start,
        to: end,
        duration: jitter(0.11, 0.1),
        type: "square",
        gain: 0.12,
      });
      setTimeout(() => noise(0.05, 0.07, 1800), 90);
    } else {
      // Sawtooth body + brighter noise crunch — feels heavier
      sweep({ from: start, to: end, duration: 0.13, type: "sawtooth", gain: 0.1 });
      setTimeout(() => noise(0.06, 0.08, 2400), 70);
    }
  },

  /**
   * "POWER UP" — long pitch sweep with overlapping noise crunch and a
   * low boom at the tail. Deliberately percussive, no melody. Three
   * variants so consecutive level-ups (rare but possible) don't echo.
   */
  levelUp() {
    const v = pickRR("levelUp", 3);
    const startLow = jitter(220, 0.08);
    const endHigh = jitter(1900, 0.05);
    const oscType: OscillatorType = v === 0 ? "sawtooth" : v === 1 ? "square" : "triangle";
    sweep({ from: startLow, to: endHigh, duration: 0.42, type: oscType, gain: 0.11 });
    noise(0.35, 0.045, jitter(3200, 0.1));
    setTimeout(() => {
      sweep({
        from: jitter(140, 0.08),
        to: jitter(80, 0.1),
        duration: 0.3,
        type: "triangle",
        gain: 0.18,
      });
    }, 380);
  },

  /** Buzzer/error — short low rasp, then a second harder rasp. */
  warn() {
    const base = jitter(220, 0.08);
    sweep({
      from: base,
      to: jitter(140, 0.1),
      duration: 0.07,
      type: "sawtooth",
      gain: 0.1,
    });
    setTimeout(() => {
      sweep({
        from: base,
        to: jitter(130, 0.1),
        duration: 0.1,
        type: "sawtooth",
        gain: 0.11,
      });
    }, 90);
  },

  /** "Door whoosh + clunk" — descending noise + low triangle drop + final tick. */
  zoneUnlock() {
    noise(0.22, 0.06, jitter(1600, 0.15));
    sweep({
      from: jitter(600, 0.08),
      to: jitter(180, 0.1),
      duration: 0.2,
      type: "triangle",
      gain: 0.1,
    });
    setTimeout(
      () =>
        tone({
          freq: jitter(1500, 0.08),
          duration: 0.02,
          type: "square",
          gain: 0.05,
        }),
      220,
    );
  },

  /** Old CRT thwomp — sub-bass pop + noise wash. */
  bootStart() {
    tone({ freq: jitter(80, 0.1), duration: 0.3, type: "triangle", gain: 0.08 });
    noise(0.15, 0.04, jitter(400, 0.15));
  },

  /** Per-line typing chatter on the boot screen. */
  bootChunk() {
    tone({
      freq: 600 + Math.random() * 800,
      duration: 0.015,
      type: "square",
      gain: 0.05,
    });
  },

  /** Glitch — staccato burst of randomly-pitched square clicks. */
  glitch() {
    // Vary the burst length too so consecutive glitches aren't identical
    const n = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      setTimeout(
        () =>
          tone({
            freq: 100 + Math.random() * 1800,
            duration: 0.025,
            type: Math.random() < 0.7 ? "square" : "sawtooth",
            gain: 0.05,
          }),
        i * (15 + Math.random() * 10),
      );
    }
  },

  /** Soft typewriter for boot text. Probabilistic so it doesn't sound mechanical. */
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
