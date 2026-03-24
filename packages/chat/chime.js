// @ts-check

import harden from '@endo/harden';

/** @type {AudioContext | null} */
let audioContext = null;

/**
 * Play a brief, gentle two-tone chime using the Web Audio API.
 * No-op if the browser has not yet permitted audio (user gesture
 * requirement).
 */
export const playChime = () => {
  try {
    if (!audioContext) {
      // @ts-expect-error webkitAudioContext for older Safari
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
    }
    const ctx = audioContext;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Bell-like tone: prominent fundamental and high partials,
    // dampened middle harmonics.
    const partials = [
      { freq: 660, gain: 0.06, decay: 0.15 }, // fundamental
      { freq: 1320, gain: 0.015, decay: 0.1 }, // 2nd harmonic (quiet)
      { freq: 1980, gain: 0.01, decay: 0.08 }, // 3rd harmonic (quiet)
      { freq: 3960, gain: 0.04, decay: 0.06 }, // 6th harmonic (bright)
      { freq: 5280, gain: 0.03, decay: 0.05 }, // 8th harmonic (shimmer)
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = p.freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(p.gain, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + p.decay + 0.02);
    }
  } catch {
    // Audio not available — silently ignore.
  }
};
harden(playChime);
