// @ts-check

import harden from '@endo/harden';

import {
  Fragment,
  h,
  renderConfined,
  unmount,
  useEffect,
  useState,
} from './setup-preact-container.js';

import {
  interpolateHeatColor,
  formatDuration,
  LOCKOUT_THRESHOLD,
} from './heat-engine.js';

// Heat bar, migrated from imperative DOM manipulation to a confined Preact
// component rendered through a single `renderConfined`. The exported entry,
// `createHeatBar($container, $sendButton)`, keeps its API
// (`{ update, dispose }`) so the caller (send-form.js) needs no changes.
//
// The bar's own visuals — fill, per-hop segments, and status text — render
// confined into `$container` and are driven by Preact state. The send button
// is an EXTERNAL, trusted host DOM node: it is NEVER passed into the confined
// vnode tree (refs are stripped there). Instead `createHeatBar` keeps it in
// closure and updates its classes imperatively, OUTSIDE the Preact tree, the
// way the original code did. `update(state)` computes both the bar view-state
// (pushed into Preact) and the send-button classes (applied imperatively).
//
// The same `.heat-bar-*` CSS classes are reused so index.css styling continues
// to apply and the bar looks identical.

/**
 * @typedef {import('./heat-engine.js').HeatState} HeatState
 */

/**
 * @typedef {import('./composite-heat-engine.js').CompositeState} CompositeState
 */

/**
 * @typedef {import('./composite-heat-engine.js').PerHopView} PerHopView
 */

/**
 * @typedef {object} HeatBarAPI
 * @property {(state: HeatState | CompositeState) => void} update - Update the heat bar
 * @property {() => void} dispose - Remove the heat bar from the DOM
 */

/**
 * A rendered segment of the multi-hop bar.
 * @typedef {object} SegmentView
 * @property {number} flex - Proportional flex grow for the segment.
 * @property {string} color - Background color for the segment.
 * @property {boolean} isSelf - True if this is the user's own hop.
 * @property {string} title - Hover title for the segment.
 */

/**
 * The bar's view state, held in Preact and re-rendered on `update`.
 * @typedef {object} HeatBarView
 * @property {number} valueNow - aria-valuenow (rounded heat).
 * @property {number} opacity - Bar opacity (0 or 1).
 * @property {string} status - Status text (empty hides the status line).
 * @property {'single' | 'composite'} mode - Which visual to show.
 * @property {number} fillWidthPct - Single-fill width as a percentage.
 * @property {string} fillColor - Single-fill background color.
 * @property {number} segmentsWidthPct - Segment container width as a percentage.
 * @property {SegmentView[]} segments - Multi-hop segments.
 */

/** @type {HeatBarView} */
const INITIAL_VIEW = harden({
  valueNow: 0,
  opacity: 0,
  status: '',
  mode: 'single',
  fillWidthPct: 0,
  fillColor: interpolateHeatColor(0),
  segmentsWidthPct: 0,
  segments: [],
});

/**
 * Desaturate a heat color for ancestor hops.
 * @param {string} rgb - e.g. "rgb(245,166,35)"
 * @returns {string}
 */
const desaturateColor = rgb => {
  const match = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  // Blend toward gray (reduce saturation by 40%, add transparency)
  const gray = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  const dr = Math.round(r * 0.6 + gray * 0.4);
  const dg = Math.round(g * 0.6 + gray * 0.4);
  const db = Math.round(b * 0.6 + gray * 0.4);
  return `rgba(${dr},${dg},${db},0.7)`;
};
harden(desaturateColor);

/**
 * Check if state is a CompositeState (has hops array).
 * @param {HeatState | CompositeState} state
 * @returns {state is CompositeState}
 */
const isComposite = state =>
  'hops' in state && Array.isArray(/** @type {any} */ (state).hops);
harden(isComposite);

/**
 * The confined bar view. Pure: it renders only from its `view` prop, holds no
 * external DOM node, and mutates nothing outside the Preact tree.
 *
 * @param {object} props
 * @param {HeatBarView} props.view
 */
const HeatBarView = ({ view }) => {
  const {
    valueNow,
    opacity,
    status,
    mode,
    fillWidthPct,
    fillColor,
    segmentsWidthPct,
    segments,
  } = view;

  return h(
    'div',
    {
      class: 'heat-bar',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(valueNow),
      style: `opacity:${opacity}`,
    },
    h('div', {
      class: 'heat-bar-fill',
      style:
        mode === 'single'
          ? `display:block;width:${fillWidthPct}%;background-color:${fillColor}`
          : 'display:none',
    }),
    h(
      'div',
      {
        class: 'heat-bar-segments',
        style:
          mode === 'composite'
            ? `display:flex;width:${segmentsWidthPct}%`
            : 'display:none',
      },
      segments.map((seg, i) =>
        h('div', {
          // Index keys are stable here: segments are positional (one per hop)
          // and the hop count is fixed for a given channel.
          key: i,
          class: `heat-bar-segment${seg.isSelf ? ' self' : ' ancestor'}`,
          title: seg.title,
          style: `background-color:${seg.color};flex:${seg.flex} 0 2px;height:100%`,
        }),
      ),
    ),
    h(
      'div',
      {
        class: 'heat-bar-status',
        'aria-live': 'polite',
        role: 'status',
      },
      status,
    ),
  );
};
harden(HeatBarView);

/**
 * Root component: owns the bar's view state and exposes its setter to the host
 * via a mutable controller, mirroring profile-popup.js / channel-list.js.
 *
 * @param {object} props
 * @param {{ setView?: (view: HeatBarView) => void }} props.controller
 */
const HeatBarRoot = ({ controller }) => {
  const [view, setView] = useState(INITIAL_VIEW);

  useEffect(() => {
    controller.setView = setView;
    return () => {
      if (controller.setView === setView) delete controller.setView;
    };
  }, [controller]);

  return h(Fragment, null, h(HeatBarView, { view }));
};
harden(HeatBarRoot);

/**
 * Create a heat bar component that shows the current heat level above the input.
 * Supports both single-hop (legacy HeatState) and multi-hop (CompositeState)
 * modes.
 *
 * `$container` receives the confined bar visuals. `$sendButton` is trusted host
 * DOM kept in closure and updated imperatively (heat-glow / heat-jitter /
 * heat-locked / heat-shake classes); it is never passed into the confined tree.
 *
 * @param {HTMLElement} $container - The container to insert the bar into
 * @param {HTMLElement} $sendButton - The send button for visual feedback
 * @returns {HeatBarAPI}
 */
export const createHeatBar = ($container, $sendButton) => {
  // The caller passes a SHARED host element (e.g. #chat-input-wrapper, which
  // also holds the input, token menu, and error nodes). Preact's render
  // reconciles against ALL children of its parent DOM, so rendering directly
  // into `$container` would destroy those siblings. Instead, create a
  // dedicated mount node, append it (matching the original code, which
  // appended its own `$bar` child without clearing the container), and render
  // the confined tree into that node alone.
  const $mount = document.createElement('div');
  $container.appendChild($mount);

  // Mutable bridge to the root component's view setter (populated by the
  // component's effect). Intentionally NOT hardened — the component writes its
  // setter onto it.
  /** @type {{ setView?: (view: HeatBarView) => void }} */
  const controller = {};

  renderConfined(h(HeatBarRoot, { controller }), $mount);

  /** @type {boolean} */
  let wasLocked = false;

  /**
   * Push a fresh view into the confined tree.
   * @param {HeatBarView} view
   */
  const setView = view => {
    if (controller.setView) {
      controller.setView(harden(view));
    }
  };

  /**
   * Apply the warm-but-not-locked send-button glow/jitter classes. Shared by
   * both single-hop and composite update paths.
   * @param {number} heat
   */
  const applyWarmButtonClasses = heat => {
    if (heat >= LOCKOUT_THRESHOLD * 0.8) {
      $sendButton.classList.add('heat-jitter');
      $sendButton.classList.remove('heat-glow');
    } else if (heat >= LOCKOUT_THRESHOLD * 0.5) {
      $sendButton.classList.add('heat-glow');
      $sendButton.classList.remove('heat-jitter');
    } else {
      $sendButton.classList.remove('heat-glow', 'heat-jitter');
    }
  };

  /**
   * Apply the locked send-button classes and one-shot shake on lock entry.
   */
  const applyLockedButtonClasses = () => {
    $sendButton.classList.add('heat-locked');
    $sendButton.classList.remove('heat-glow', 'heat-jitter');
    if (!wasLocked) {
      $sendButton.classList.add('heat-shake');
      setTimeout(() => $sendButton.classList.remove('heat-shake'), 500);
    }
  };

  /**
   * Update with a single-hop (legacy) HeatState.
   * @param {HeatState} state
   */
  const updateSingleHop = state => {
    const heat = Math.min(100, state.heat);
    const pct = heat / 100;

    /** @type {string} */
    let status = '';
    if (state.locked) {
      applyLockedButtonClasses();
      const remaining = Math.max(0, state.lockEndTime - Date.now());
      status = `Locked: ${formatDuration(remaining)}`;
    } else {
      $sendButton.classList.remove('heat-locked');
      applyWarmButtonClasses(heat);
    }

    setView({
      valueNow: Math.round(heat),
      opacity: heat < 1 ? 0 : 1,
      status,
      mode: 'single',
      fillWidthPct: pct * 100,
      fillColor: interpolateHeatColor(heat),
      segmentsWidthPct: 0,
      segments: [],
    });

    wasLocked = state.locked;
  };

  /**
   * Update with a CompositeState (multi-hop segmented bar).
   * @param {CompositeState} state
   */
  const updateComposite = state => {
    const {
      effectiveHeat,
      effectiveLocked,
      effectiveLockRemaining,
      bottleneckLabel,
      isSelfBottleneck,
      hops,
    } = state;

    // Total heat for proportional widths.
    let totalHeat = 0;
    for (const hop of hops) {
      totalHeat += hop.normalizedHeat;
    }

    /** @type {SegmentView[]} */
    const segments = hops.map(hop => {
      const widthPct =
        totalHeat > 0
          ? (hop.normalizedHeat / totalHeat) * 100
          : 100 / hops.length;
      const color = interpolateHeatColor(hop.normalizedHeat);
      return {
        flex: widthPct,
        color: hop.isSelf ? color : desaturateColor(color),
        isSelf: hop.isSelf,
        title: `${hop.label}: ${Math.round(hop.normalizedHeat)}%`,
      };
    });

    /** @type {string} */
    let status;
    if (effectiveLocked) {
      applyLockedButtonClasses();
      const label = isSelfBottleneck ? '' : `${bottleneckLabel} `;
      status = `${label}cooldown — ${formatDuration(effectiveLockRemaining)}`;
    } else {
      $sendButton.classList.remove('heat-locked');
      if (effectiveHeat < 20) {
        status = '';
      } else if (isSelfBottleneck) {
        status = `heat: ${Math.round(effectiveHeat)}%`;
      } else {
        status = `${bottleneckLabel}: ${Math.round(effectiveHeat)}%`;
      }
      applyWarmButtonClasses(effectiveHeat);
    }

    setView({
      valueNow: Math.round(effectiveHeat),
      opacity: effectiveHeat < 1 ? 0 : 1,
      status,
      mode: 'composite',
      fillWidthPct: 0,
      fillColor: INITIAL_VIEW.fillColor,
      segmentsWidthPct: Math.min(100, effectiveHeat),
      segments,
    });

    wasLocked = effectiveLocked;
  };

  /**
   * @param {HeatState | CompositeState} state
   */
  const update = state => {
    if (isComposite(state)) {
      updateComposite(/** @type {CompositeState} */ (state));
    } else {
      updateSingleHop(/** @type {HeatState} */ (state));
    }
  };

  const dispose = () => {
    unmount($mount);
    $mount.remove();
    $sendButton.classList.remove(
      'heat-locked',
      'heat-glow',
      'heat-jitter',
      'heat-shake',
    );
  };

  return harden({ update, dispose });
};
harden(createHeatBar);
