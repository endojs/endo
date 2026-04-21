// @ts-check
/* eslint-disable no-bitwise, no-continue, import/no-unresolved */
/* global performance, setInterval, clearInterval */

/**
 * Animated ASCII logo for the goblin-chat TUI.
 *
 * Renders the "OCAPN CHAT" figlet as a 2D glyph map and shades each
 * non-space cell every frame using a small lighting model:
 *
 *   - **Diagonal sweep**: a Gaussian band of bright light travels
 *     across the logo along a vector that itself slowly rotates, so
 *     successive sweeps approach from slightly different angles.
 *   - **Counter sweep**: a fainter, warmer band crosses the opposite
 *     way at a different speed. The two never quite line up, so the
 *     interference pattern never visibly repeats.
 *   - **Volumetric density**: each cell's "matter density" is the
 *     fraction of non-space neighbours in a 5×3 stencil, computed
 *     once at module load. Dense regions glow more, mimicking
 *     subsurface scattering — letter bodies fluoresce, decorative
 *     thin strokes stay cooler.
 *   - **Plasma shimmer**: three layered sin/cos terms with
 *     incommensurate frequencies add a low-amplitude wandering
 *     perturbation. Keeps the surface alive even when the sweeps
 *     are far away.
 *   - **Specular desaturation**: peaks of the sweep bleach toward
 *     white instead of just brightening the hue, so the highlight
 *     reads as a hot reflection rather than a colour shift.
 *   - **Breath**: a long-period (~9s) global brightness oscillation
 *     gives the whole sign a slow lung-like rise and fall.
 *   - **Sparkle**: a deterministic per-cell hash gates a brief
 *     overshoot when both the sweep and the sin-locked sparkle clock
 *     line up. Most cells never sparkle; a handful pop occasionally.
 *
 * Output is 24-bit colour (`\u001B[38;2;R;G;Bm`). Each row is built
 * as one string with the per-cell escapes embedded, then handed to a
 * single `<Text>` node. Spaces emit no escape so the row stays sparse.
 *
 * Falls back to a plain "goblin-chat" line when the terminal is too
 * narrow to fit the glyph (avoids ugly mid-line wraps).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';

const h = React.createElement;

// The ASCII art. Carefully transcribed — single-quoted strings with
// `\\` for backslash, `\'` for apostrophe; backticks pass through.
const LOGO_LINES = [
  '   )\\.-.      .-./(     /(,-.   .\')      .\'(   )\\  )\\          )\\.-.       .\'(     /`-.   .-,.-.,-. ',
  ' ,\' ,-,_)   ,\'     )  ,\' _   ) ( /       \\  ) (  \\, /        ,\' ,-,_)  ,\') \\  )  ,\' _  \\  ) ,, ,. ( ',
  '(  .   __  (  .-, (  (  \'-\' (   ))       ) (   ) \\ (        (  .   _  (  \'-\' (  (  \'-\' (  \\( |(  )/ ',
  ' ) \'._\\ _)  ) \'._\\ )  )  _   )  )\'._.-.  \\  ) ( ( \\ \\        ) \'..\' )  ) .-.  )  )   _  )    ) \\    ',
  '(  ,   (   (  ,   (  (  \'-\' /  (       )  ) \\  `.)/  )      (  ,   (  (  ,  ) \\ (  ,\' ) \\    \\ (    ',
  ' )/\'._.\'    )/ ._.\'   )/._.\'    )/,__.\'    )/     \'.(        )/\'._.\'   )/    )/  )/    )/     )/    ',
];

const LOGO_WIDTH = Math.max(...LOGO_LINES.map(l => l.length));
const LOGO_HEIGHT = LOGO_LINES.length;

// Precomputed density field. For each cell, the fraction of non-space
// cells in a 5×3 stencil centred on (x, y). Used to make dense glyph
// regions glow more — the "matter" in the ASCII has volume, the
// surrounding void doesn't.
const DENSITY = LOGO_LINES.map((line, y) => {
  /** @type {number[]} */
  const row = [];
  for (let x = 0; x < line.length; x += 1) {
    let count = 0;
    let total = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= LOGO_LINES.length) continue;
      const lineYY = LOGO_LINES[yy];
      for (let dx = -2; dx <= 2; dx += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= lineYY.length) continue;
        total += 1;
        if (lineYY[xx] !== ' ') count += 1;
      }
    }
    row.push(total === 0 ? 0 : count / total);
  }
  return row;
});

// Cheap deterministic per-cell hash in (0, 1). Uses a Weyl-like
// integer scramble so neighbouring cells get uncorrelated values
// without needing a real PRNG.
/**
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
const cellHash = (x, y) => {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 0x100000000;
};

/**
 * HSL→RGB. hue, sat, light in [0, 1]; returns each channel in [0, 255].
 * Single-pass formulation (Wikipedia "Alternative HSL→RGB").
 *
 * @param {number} hue
 * @param {number} sat
 * @param {number} light
 * @returns {[number, number, number]}
 */
const hslToRgb = (hue, sat, light) => {
  const a = sat * Math.min(light, 1 - light);
  /** @param {number} n */
  const f = n => {
    const k = (n + hue * 12) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
};

/**
 * Wrap a signed offset into the half-open interval (-period/2, period/2].
 * Used to pick the "nearest" sweep so a band coming in from the left
 * is treated symmetrically with one leaving on the right.
 *
 * @param {number} x
 * @param {number} period
 */
const wrapCentred = (x, period) => {
  const m = ((x % period) + period * 1.5) % period;
  return m - period / 2;
};

/**
 * Compute the 24-bit ANSI foreground escape for a single cell at
 * time `t` seconds. Returns the escape sequence including the
 * leading `\u001B[`.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @returns {string}
 */
const cellColor = (x, y, t) => {
  // --- primary sweep -------------------------------------------------
  // The light direction itself rotates very slowly (~30s period), so
  // the band tilts from "almost horizontal" up to "steeply diagonal"
  // and back. The y axis is stretched ×4 because terminal cells are
  // roughly twice as tall as wide; without that compensation the band
  // looks nearly horizontal regardless of the chosen angle.
  const rot = t * 0.21;
  const cosA = Math.cos(rot);
  const sinA = 0.25 + 0.18 * Math.sin(rot * 0.7);
  const proj1 = x * cosA + y * 4 * sinA;
  const period1 = LOGO_WIDTH + 28;
  const sweepPos1 = (t * 13) % period1;
  const d1 = wrapCentred(proj1 - sweepPos1, period1);
  const sigma1 = 7.5;
  const sweep1 = Math.exp(-(d1 * d1) / (2 * sigma1 * sigma1));

  // --- counter sweep -------------------------------------------------
  // Going the other way, slower, narrower, dimmer; warm-tinted via
  // the hue mix below. Two non-commensurate sweep speeds (13 vs 7)
  // mean the interference pattern never visibly repeats over a
  // session.
  const proj2 = -x * 0.85 + y * 4 * 0.5;
  const period2 = LOGO_WIDTH + 47;
  const sweepPos2 = (t * 7) % period2;
  const d2 = wrapCentred(proj2 - sweepPos2, period2);
  const sigma2 = 5.5;
  const sweep2 = Math.exp(-(d2 * d2) / (2 * sigma2 * sigma2)) * 0.55;

  // --- plasma shimmer ------------------------------------------------
  // Three layers, frequencies chosen to be mutually irrational-ish.
  const shimmer =
    0.05 * Math.sin(x * 0.27 + t * 1.7) * Math.cos(y * 0.9 + t * 1.1) +
    0.04 * Math.sin((x + y * 3) * 0.11 + t * 0.9) +
    0.03 * Math.cos((x * 0.6 - y * 1.7) * 0.15 + t * 0.6);

  // --- breath --------------------------------------------------------
  // Long-period global brightness wave — a bit like a slow inhale.
  const breath = 0.06 * Math.sin(t * 0.7);

  // --- ambient + density --------------------------------------------
  // Static fill light fades upper-left → lower-right. Density
  // multiplier ranges 0.55..1.25 so empty cells (which we won't draw
  // anyway) sit cool, while dense centres of letters bloom.
  const density = DENSITY[y][x];
  const fill = 0.30 + 0.10 * (1 - x / LOGO_WIDTH) + 0.06 * (1 - y / (LOGO_HEIGHT - 1));
  const ambient = fill * (0.55 + 0.7 * density);

  // --- sparkle -------------------------------------------------------
  // Most cells: zero. A few cells: a brief overshoot when the cell's
  // private clock (driven off its hash) lines up with the global
  // sparkle phase. The hash also picks each cell's frequency, so the
  // sparkles fire asynchronously across the sign.
  const hash = cellHash(x, y);
  const sparkleFreq = 0.6 + hash * 1.4;
  const sparklePhase = hash * Math.PI * 2;
  const sparkleRaw = Math.sin(t * sparkleFreq + sparklePhase);
  // Threshold high so only the top few percent of the cycle fires.
  const sparkle = sparkleRaw > 0.985 ? (sparkleRaw - 0.985) * 60 : 0;

  // --- combine to lightness -----------------------------------------
  let l = ambient + shimmer + breath + sweep1 * 0.55 + sweep2 * 0.30 + sparkle * 0.4;
  if (l < 0.04) l = 0.04;
  if (l > 0.96) l = 0.96;

  // --- hue -----------------------------------------------------------
  // Anchored at cyan (0.55), drifts ±0.10 across width, slow time
  // wobble, plus a warm push from the counter sweep so the second
  // band reads as a different "colour" of light. Always wrapped into
  // [0, 1).
  let hue =
    0.55 +
    0.10 * (x / LOGO_WIDTH - 0.5) +
    0.05 * Math.sin(t * 0.25) -
    0.18 * sweep2;
  hue -= Math.floor(hue);

  // --- saturation ----------------------------------------------------
  // Spec highlight bleaches toward white; sparkle does too.
  const sat = Math.max(
    0.10,
    0.78 - 0.55 * sweep1 - 0.30 * sweep2 - 0.40 * sparkle,
  );

  const [r, g, b] = hslToRgb(hue, sat, l);
  // Quantise to 16 levels per channel. Dropping the low nibble means
  // adjacent cells with very similar lighting share an escape, so the
  // run-length collapse in `renderLogoRow` actually helps. Visually
  // indistinguishable from full 8-bit at this scale.
  const qr = r & 0xf0;
  const qg = g & 0xf0;
  const qb = b & 0xf0;
  return `\u001B[38;2;${qr};${qg};${qb}m`;
};

const ANSI_RESET = '\u001B[0m';

/**
 * Render one logo row as a single string with embedded 24-bit colour
 * escapes. Spaces emit no escape (and reset `lastColor` so the next
 * non-space cell always re-establishes its colour explicitly — a
 * conservative choice that keeps the row valid even if the terminal
 * resets state on whitespace).
 *
 * @param {string} line
 * @param {number} rowIdx
 * @param {number} t
 * @returns {string}
 */
const renderLogoRow = (line, rowIdx, t) => {
  let out = '';
  let lastColor = '';
  for (let x = 0; x < line.length; x += 1) {
    const ch = line[x];
    if (ch === ' ') {
      out += ' ';
      lastColor = '';
      continue;
    }
    const color = cellColor(x, rowIdx, t);
    if (color !== lastColor) {
      out += color;
      lastColor = color;
    }
    out += ch;
  }
  return out + ANSI_RESET;
};

/**
 * @typedef {{
 *   cols: number,
 *   fps?: number,
 * }} AnimatedLogoProps
 */

/**
 * Animated logo component. Re-renders at ~14fps by default; the
 * timer is owned by the component itself so the rest of the app
 * doesn't pay the re-render cost.
 *
 * The first frame is computed synchronously on mount so a slow
 * terminal still shows a fully-coloured logo before the first tick.
 *
 * @param {AnimatedLogoProps} props
 */
export const AnimatedLogo = ({ cols, fps = 14 }) => {
  const startedAt = useRef(/** @type {number | undefined} */ (undefined));
  if (startedAt.current === undefined) {
    startedAt.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
  const [, setFrame] = useState(0);

  useEffect(() => {
    const intervalMs = Math.max(20, Math.round(1000 / fps));
    const id = setInterval(() => {
      // Mask to 16 bits so the counter never grows unboundedly. We
      // only need it to change; the actual value is unused.
      setFrame(f => (f + 1) & 0xffff);
    }, intervalMs);
    return () => clearInterval(id);
  }, [fps]);

  // Too narrow: collapse to a single cyan line. Picking the threshold
  // at LOGO_WIDTH + 4 (logo + Box paddingX of 2 on each side) ensures
  // we never half-draw a row.
  if (cols < LOGO_WIDTH + 4) {
    return h(
      Box,
      { paddingX: 2, paddingY: 1 },
      h(Text, { color: 'cyan', bold: true }, 'goblin-chat'),
    );
  }

  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const t = (now - /** @type {number} */ (startedAt.current)) / 1000;

  return h(
    Box,
    { flexDirection: 'column', paddingX: 2, paddingTop: 1 },
    ...LOGO_LINES.map((line, i) =>
      h(
        Text,
        { key: `logo-${i}`, wrap: 'truncate-end' },
        renderLogoRow(line, i, t),
      ),
    ),
  );
};
