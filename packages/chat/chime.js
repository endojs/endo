// @ts-check

import harden from '@endo/harden';

/** @type {AudioContext | null} */
let audioContext = null;

/**
 * Return a random float in [min, max].
 * @param {number} min
 * @param {number} max
 */
const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Play a brief synthesized meow chime with randomized parameters.
 * Each call produces a unique variant. No-op if the browser has not
 * yet permitted audio (user gesture requirement).
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

    // Randomize the six parameters within their slider ranges.
    const f0 = rand(300, 900);
    const dur = rand(0.3, 1.5);
    const sweepAmt = rand(0.3, 3);
    const nasality = rand(0, 1);
    const brightness = rand(0, 1);
    const vibratoDepth = rand(0, 30);

    const attackEnd = now + 0.06;
    const sustainEnd = now + dur * 0.35;
    const end = now + dur;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.35, attackEnd);
    master.gain.setValueAtTime(0.35, attackEnd);
    master.gain.linearRampToValueAtTime(0.3, sustainEnd);
    master.gain.exponentialRampToValueAtTime(0.001, end);
    master.connect(ctx.destination);

    // Vibrato LFO
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = vibratoDepth;
    lfo.connect(lfoGain);
    lfo.start(now);
    lfo.stop(end);

    // Main voice: sawtooth for harmonic richness
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(f0 * 0.98, now);
    saw.frequency.linearRampToValueAtTime(f0, attackEnd);
    saw.frequency.linearRampToValueAtTime(f0 * 1.05, sustainEnd);
    saw.frequency.linearRampToValueAtTime(f0 * 0.9, end);
    lfoGain.connect(saw.frequency);
    saw.start(now);
    saw.stop(end);

    // Second voice slightly detuned for thickness
    const saw2 = ctx.createOscillator();
    saw2.type = 'sawtooth';
    saw2.frequency.setValueAtTime(f0 * 1.003, now);
    saw2.frequency.linearRampToValueAtTime(f0 * 1.003, attackEnd);
    saw2.frequency.linearRampToValueAtTime(f0 * 1.053, sustainEnd);
    saw2.frequency.linearRampToValueAtTime(f0 * 0.903, end);
    lfoGain.connect(saw2.frequency);
    saw2.start(now);
    saw2.stop(end);

    const saw2Gain = ctx.createGain();
    saw2Gain.gain.value = 0.7;
    saw2.connect(saw2Gain);

    // Sub oscillator for body
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(f0 * 0.5, now);
    sub.frequency.linearRampToValueAtTime(f0 * 0.5, attackEnd);
    sub.frequency.linearRampToValueAtTime(f0 * 0.525, sustainEnd);
    sub.frequency.linearRampToValueAtTime(f0 * 0.45, end);
    lfoGain.connect(sub.frequency);
    sub.start(now);
    sub.stop(end);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.3;
    sub.connect(subGain);

    // Noise for breathiness
    const noiseLen = Math.ceil(ctx.sampleRate * dur);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i += 1) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(
      0.02 + brightness * 0.03,
      attackEnd,
    );
    noiseGain.gain.exponentialRampToValueAtTime(0.001, end);
    const noiseFilt = ctx.createBiquadFilter();
    noiseFilt.type = 'bandpass';
    noiseFilt.frequency.value = 2500;
    noiseFilt.Q.value = 2;
    noise.connect(noiseFilt);
    noiseFilt.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(now);
    noise.stop(end);

    // Formant 1 (F1): low vowel formant
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 5;
    f1.frequency.setValueAtTime(400 * sweepAmt, now);
    f1.frequency.linearRampToValueAtTime(800 * sweepAmt, attackEnd);
    f1.frequency.linearRampToValueAtTime(700 * sweepAmt, sustainEnd);
    f1.frequency.linearRampToValueAtTime(350 * sweepAmt, end);
    const f1Gain = ctx.createGain();
    f1Gain.gain.value = 1.0;

    // Formant 2 (F2): mid vowel formant
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 8;
    f2.frequency.setValueAtTime(2200 * sweepAmt, now);
    f2.frequency.linearRampToValueAtTime(1800 * sweepAmt, attackEnd);
    f2.frequency.linearRampToValueAtTime(1200 * sweepAmt, sustainEnd);
    f2.frequency.linearRampToValueAtTime(800 * sweepAmt, end);
    const f2Gain = ctx.createGain();
    f2Gain.gain.value = 0.7;

    // Formant 3 (F3): high formant for brightness
    const f3 = ctx.createBiquadFilter();
    f3.type = 'bandpass';
    f3.Q.value = 10;
    f3.frequency.setValueAtTime(3200, now);
    f3.frequency.linearRampToValueAtTime(2800, sustainEnd);
    f3.frequency.linearRampToValueAtTime(2400, end);
    const f3Gain = ctx.createGain();
    f3Gain.gain.value = 0.2 + brightness * 0.4;

    // Nasal formant
    const nasal = ctx.createBiquadFilter();
    nasal.type = 'bandpass';
    nasal.Q.value = 15;
    nasal.frequency.value = 1000;
    const nasalGain = ctx.createGain();
    nasalGain.gain.value = nasality * 0.5;

    // Anti-formant (nasal zero) for realism
    const antiFormant = ctx.createBiquadFilter();
    antiFormant.type = 'notch';
    antiFormant.frequency.value = 1500;
    antiFormant.Q.value = 5;
    const antiGain = ctx.createGain();
    antiGain.gain.value = nasality;

    // Route oscillators through formants
    for (const src of [saw, saw2Gain, subGain]) {
      src.connect(f1);
      f1.connect(f1Gain);
      f1Gain.connect(master);

      src.connect(f2);
      f2.connect(f2Gain);
      f2Gain.connect(master);

      src.connect(f3);
      f3.connect(f3Gain);
      f3Gain.connect(master);

      src.connect(nasal);
      nasal.connect(nasalGain);
      nasalGain.connect(antiFormant);
      antiFormant.connect(antiGain);
      antiGain.connect(master);
    }
  } catch {
    // Audio not available — silently ignore.
  }
};
harden(playChime);
