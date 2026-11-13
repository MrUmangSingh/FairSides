"use client";

/**
 * A referee's pea whistle, synthesised with Web Audio so there's no file to load.
 * Two slightly detuned tones a little under 3 kHz, warbled about 40 times a second
 * (the pea rattling in the chamber), plus a breath of filtered noise.
 *
 * Browsers only let audio start from a tap, so call `unlockWhistle()` from a
 * pointer handler once; whistles that fire later on their own (half time,
 * full time) then play.
 */

export type WhistleCall =
  /** One short blast: kick-off, restart. */
  | "short"
  /** One long blast: goal, foul, card. */
  | "long"
  /** Two short: stoppage. */
  | "double"
  /** Two short and a long: half time and full time. */
  | "final";

const PATTERNS: Record<WhistleCall, [start: number, length: number][]> = {
  short: [[0, 0.32]],
  long: [[0, 0.95]],
  double: [
    [0, 0.22],
    [0.34, 0.22],
  ],
  final: [
    [0, 0.26],
    [0.42, 0.26],
    [0.84, 1.25],
  ],
};

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call from a tap so the browser lets later whistles play. */
export function unlockWhistle() {
  const c = context();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b;
  return b;
}

function blast(c: AudioContext, out: AudioNode, at: number, length: number) {
  const env = c.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(1, at + 0.025);
  env.gain.setValueAtTime(1, at + length - 0.06);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  env.connect(out);

  // The pea: a fast wobble in loudness and pitch.
  const trill = c.createOscillator();
  trill.frequency.value = 38 + Math.random() * 6;
  const trillDepth = c.createGain();
  trillDepth.gain.value = 0.45;
  trill.connect(trillDepth);

  const tremolo = c.createGain();
  tremolo.gain.value = 0.55;
  trillDepth.connect(tremolo.gain);
  tremolo.connect(env);

  const pitchWobble = c.createGain();
  pitchWobble.gain.value = 70;
  trill.connect(pitchWobble);

  for (const [freq, level] of [
    [2750, 0.5],
    [2830, 0.35],
  ] as const) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 0.96, at);
    o.frequency.linearRampToValueAtTime(freq, at + 0.05);
    pitchWobble.connect(o.frequency);
    const g = c.createGain();
    g.gain.value = level;
    o.connect(g).connect(tremolo);
    o.start(at);
    o.stop(at + length + 0.05);
  }

  // Breath through the mouthpiece.
  const air = c.createBufferSource();
  air.buffer = noiseBuffer(c);
  air.loop = true;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2800;
  band.Q.value = 3;
  const airLevel = c.createGain();
  airLevel.gain.value = 0.12;
  air.connect(band).connect(airLevel).connect(tremolo);
  air.start(at);
  air.stop(at + length + 0.05);

  trill.start(at);
  trill.stop(at + length + 0.05);
}

/** Blows the whistle. `volume` is 0 to 1. Returns how long it lasts, in ms. */
export function blowWhistle(call: WhistleCall, volume = 0.8): number {
  const c = context();
  const pattern = PATTERNS[call];
  const last = pattern[pattern.length - 1];
  const ms = (last[0] + last[1]) * 1000;
  if (!c || volume <= 0) return ms;
  if (c.state === "suspended") c.resume().catch(() => {});

  const master = c.createGain();
  // Ears hear loudness roughly logarithmically; square the slider so it feels even.
  master.gain.value = Math.min(1, volume) ** 2 * 0.6;
  const limiter = c.createDynamicsCompressor();
  master.connect(limiter).connect(c.destination);

  const t0 = c.currentTime + 0.02;
  for (const [start, length] of pattern) blast(c, master, t0 + start, length);
  setTimeout(() => master.disconnect(), ms + 400);
  return ms;
}

/** A vibration in the same rhythm as the whistle, where the phone supports it. */
export function buzz(call: WhistleCall) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const pattern = PATTERNS[call];
  const steps: number[] = [];
  let at = 0;
  for (const [start, length] of pattern) {
    if (steps.length) steps.push(Math.round((start - at) * 1000));
    steps.push(Math.round(length * 1000));
    at = start + length;
  }
  try {
    navigator.vibrate(steps);
  } catch {}
}
