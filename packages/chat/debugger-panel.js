// @ts-check

/**
 * @file Debugger panel — a modal overlay for interactive XS worker
 * debugging in the Chat application.
 *
 * The panel attaches to a Debugger exo (a CapTP remotable) and
 * provides stepping controls, call stack, local variable inspection,
 * breakpoint management, and an eval console.
 *
 * Migrated from imperative DOM to a confined Preact component rendered through
 * a single `renderConfined`. The exported entry keeps its synchronous signature
 * (`createDebuggerPanel({ $container, $backdrop }) => DebuggerPanelAPI`) so the
 * caller (chat-bar-component.js) needs no changes. The whole panel renders into
 * a DEDICATED mount child appended inside `$container`; the host's own
 * `$container` / `$backdrop` nodes are NEVER put into the confined vnode tree
 * (refs are stripped there) — their `display` visibility, the backdrop click,
 * and console scroll geometry are handled imperatively in the entry closure /
 * effects, as inbox-component.js does for its scroll container.
 *
 * Show/hide and `open(ref, label)` reach the mounted component through a
 * mutable `controller` bridge (the channel-list.js idiom), so re-opening for a
 * new Debugger ref updates the live component without re-mounting.
 */

import { E } from '@endo/far';
import harden from '@endo/harden';

import {
  Fragment,
  h,
  renderConfined,
  useEffect,
  useState,
} from './setup-preact-container.js';

/**
 * The Debugger exo's CapTP interface. Calls go out via `E(debuggerRef)`; the
 * ref is held untyped (`unknown`) and narrowed to this shape at each use.
 *
 * @typedef {object} Debugger
 * @property {() => Promise<boolean>} isBroken
 * @property {() => Promise<BreakEvent | null>} getLastBreak
 * @property {() => Promise<string>} getTitle
 * @property {() => Promise<string>} getTag
 * @property {() => Promise<Frame[]>} getFrames
 * @property {() => Promise<Property[]>} getLocals
 * @property {() => Promise<Property[]>} getGlobals
 * @property {(id: string) => Promise<Property[]>} selectFrame
 * @property {() => Promise<void>} go
 * @property {() => Promise<void>} step
 * @property {() => Promise<void>} stepIn
 * @property {() => Promise<void>} stepOut
 * @property {() => Promise<void>} abort
 * @property {(mode: 'none'|'all'|'uncaught') => Promise<void>} setExceptionBreakMode
 * @property {(path: string, line: number) => Promise<void>} setBreakpoint
 * @property {(path: string, line: number) => Promise<void>} clearBreakpoint
 * @property {() => Promise<void>} clearAllBreakpoints
 * @property {(source: string) => Promise<unknown>} evaluate
 */

/**
 * @typedef {object} BreakEvent
 * @property {string} path
 * @property {number} line
 * @property {string} message
 */

/**
 * @typedef {object} Frame
 * @property {string} name
 * @property {string} value
 * @property {string} path
 * @property {number} line
 */

/**
 * @typedef {object} Property
 * @property {string} name
 * @property {string} value
 * @property {string} flags
 * @property {Property[]} [children]
 */

/**
 * @typedef {object} Breakpoint
 * @property {string} path
 * @property {number} line
 */

/**
 * @typedef {object} ConsoleLine
 * @property {number} key
 * @property {string} text
 * @property {string} className
 */

/**
 * @typedef {object} DebuggerPanelAPI
 * @property {(debuggerRef: unknown, label?: string) => void} open
 * @property {() => void} hide
 * @property {() => boolean} isVisible
 */

/**
 * Mutable bridge between the entry factory and the mounted root component (the
 * channel-list.js idiom). The component publishes `open`; the factory publishes
 * `hideRequest`. Intentionally a plain object, not hardened.
 *
 * @typedef {object} DebuggerController
 * @property {(ref: unknown, label?: string) => void} [open]
 * @property {{ ref: unknown, label?: string }} [pending]
 * @property {() => void} [hideRequest]
 */

// ---------------------------------------------------------------------------
// Property tree renderer
// ---------------------------------------------------------------------------

/**
 * A single property row in the locals / globals tree. Owns its own
 * expand/collapse state and renders its children recursively when expanded.
 * Class names match the original imperative markup so existing CSS applies.
 *
 * @param {object} props
 * @param {Property} props.prop
 * @param {number} props.depth
 */
const PropertyRow = ({ prop, depth }) => {
  const [open, setOpen] = useState(false);
  const hasChildren = !!(prop.children && prop.children.length > 0);

  return h(
    Fragment,
    null,
    h(
      'div',
      {
        class: 'debugger-prop-row',
        style: `padding-left:${12 + depth * 16}px`,
      },
      h(
        'span',
        {
          class: hasChildren
            ? 'debugger-prop-disc'
            : 'debugger-prop-disc debugger-prop-disc-empty',
          onClick: hasChildren ? () => setOpen(v => !v) : undefined,
        },
        // eslint-disable-next-line no-nested-ternary
        hasChildren ? (open ? '▼' : '▶') : ' ',
      ),
      h('span', { class: 'debugger-prop-name' }, prop.name),
      h('span', { class: 'debugger-prop-sep' }, ': '),
      h('span', { class: 'debugger-prop-value' }, prop.value),
    ),
    hasChildren && open
      ? h(
          'div',
          { class: 'debugger-prop-children' },
          (prop.children || []).map((child, i) =>
            h(PropertyRow, {
              key: `${child.name}-${i}`,
              prop: child,
              depth: depth + 1,
            }),
          ),
        )
      : null,
  );
};
harden(PropertyRow);

/**
 * The locals / globals property tree, or an empty / error placeholder.
 *
 * @param {object} props
 * @param {Property[] | null} props.properties - `null` while loading / cleared.
 * @param {string | null} props.error - Placeholder text on load failure.
 */
const PropertyTree = ({ properties, error }) => {
  if (error !== null) {
    return h('div', { class: 'debugger-empty' }, error);
  }
  if (!properties) {
    return null;
  }
  return h(
    Fragment,
    null,
    properties.map((prop, i) =>
      h(PropertyRow, { key: `${prop.name}-${i}`, prop, depth: 0 }),
    ),
  );
};
harden(PropertyTree);

// ---------------------------------------------------------------------------
// Call stack
// ---------------------------------------------------------------------------

/**
 * The call-stack frame list, or an empty / error / running placeholder.
 *
 * @param {object} props
 * @param {Frame[] | null} props.frames
 * @param {string | null} props.placeholder - Non-null replaces the list.
 * @param {number} props.activeIndex
 * @param {(index: number) => void} props.onSelectFrame
 */
const FrameList = ({ frames, placeholder, activeIndex, onSelectFrame }) => {
  if (placeholder !== null) {
    return h('div', { class: 'debugger-empty' }, placeholder);
  }
  if (!frames || frames.length === 0) {
    return h('div', { class: 'debugger-empty' }, 'No frames');
  }
  return h(
    Fragment,
    null,
    frames.map((frame, i) =>
      h(
        'div',
        {
          key: i,
          class:
            i === activeIndex
              ? 'debugger-frame-item debugger-frame-active'
              : 'debugger-frame-item',
          onClick: () => onSelectFrame(i),
        },
        h(
          'span',
          { class: 'debugger-frame-name' },
          frame.name || '(anonymous)',
        ),
        h(
          'span',
          { class: 'debugger-frame-loc' },
          `${frame.path}:${frame.line}`,
        ),
      ),
    ),
  );
};
harden(FrameList);

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

/**
 * The breakpoint list with per-row remove buttons, or an empty placeholder.
 *
 * @param {object} props
 * @param {Breakpoint[]} props.breakpoints
 * @param {(bp: Breakpoint) => void} props.onRemove
 */
const BreakpointList = ({ breakpoints, onRemove }) => {
  if (breakpoints.length === 0) {
    return h('div', { class: 'debugger-empty' }, 'No breakpoints set');
  }
  return h(
    Fragment,
    null,
    breakpoints.map(bp =>
      h(
        'div',
        { key: `${bp.path}:${bp.line}`, class: 'debugger-bp-item' },
        h('span', { class: 'debugger-bp-loc' }, `${bp.path}:${bp.line}`),
        h(
          'button',
          {
            class: 'debugger-bp-del',
            title: 'Remove breakpoint',
            onClick: () => onRemove(bp),
          },
          '×',
        ),
      ),
    ),
  );
};
harden(BreakpointList);

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

/**
 * The whole debugger panel body. Owns every piece of panel state via hooks and
 * issues all `E(debuggerRef)` eventual sends. The host's `$container` is passed
 * effect-only for console scroll geometry — it is NEVER placed in the vnode
 * tree. `controller.open` is published so the entry's `open(ref, label)` can
 * drive a fresh session into the live component.
 *
 * @param {object} props
 * @param {HTMLElement} props.$container - Host node; effect-only (console scroll).
 * @param {() => boolean} props.isLive - False once the host detaches `$mount`.
 * @param {DebuggerController} props.controller - Bridge for the entry's `open`.
 */
const DebuggerRoot = ({ $container, isLive, controller }) => {
  /** @type {[Debugger | null, (v: Debugger | null) => void]} */
  const [debuggerRef, setDebuggerRef] = useState(
    /** @type {Debugger | null} */ (null),
  );
  const [title, setTitle] = useState('Debugger');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState(
    /** @type {{ text: string, cls: string }} */ ({
      text: 'Idle',
      cls: 'debugger-status',
    }),
  );
  const [pending, setPending] = useState(false);
  const [broken, setBroken] = useState(false);
  const [breakInfo, setBreakInfo] = useState('Not paused');
  const [frames, setFrames] = useState(/** @type {Frame[] | null} */ (null));
  const [framePlaceholder, setFramePlaceholder] = useState(
    /** @type {string | null} */ (null),
  );
  const [activeFrame, setActiveFrame] = useState(0);
  const [locals, setLocals] = useState(
    /** @type {{ properties: Property[] | null, error: string | null }} */ ({
      properties: null,
      error: null,
    }),
  );
  const [breakpoints, setBreakpoints] = useState(
    /** @type {Breakpoint[]} */ ([]),
  );
  const [bpPath, setBpPath] = useState('');
  const [bpLine, setBpLine] = useState('');
  const [exceptionMode, setExceptionMode] = useState('none');
  const [consoleLines, setConsoleLines] = useState(
    /** @type {ConsoleLine[]} */ ([]),
  );
  const [consoleInput, setConsoleInput] = useState('');

  // Append to the console log and scroll the host console-output node to the
  // bottom imperatively (the output element lives in the confined tree, so its
  // ref is stripped; scroll geometry is read off the host `$container`).
  /**
   * @param {string} text
   * @param {string} className
   */
  const appendConsole = (text, className) => {
    setConsoleLines(prev => [
      ...prev,
      { key: (prev[prev.length - 1]?.key ?? 0) + 1, text, className },
    ]);
  };

  useEffect(() => {
    const $out = $container.querySelector('.debugger-console-output');
    if ($out) {
      /** @type {HTMLElement} */ ($out).scrollTop = /** @type {HTMLElement} */ (
        $out
      ).scrollHeight;
    }
  }, [consoleLines, $container]);

  // ---- Eventual-send helpers (each guards on the current ref + isLive) ----

  const refreshState = async () => {
    const ref = debuggerRef;
    if (!ref) return;
    try {
      const [isBroken, lastBreak, fetchedTitle, fetchedTag] = await Promise.all(
        [
          E(ref).isBroken(),
          E(ref).getLastBreak(),
          E(ref).getTitle(),
          E(ref).getTag(),
        ],
      );
      if (!isLive()) return;
      if (fetchedTitle) setTitle(`Debugger: ${fetchedTitle}`);
      if (fetchedTag) setTag(/** @type {string} */ (fetchedTag));
      if (isBroken) {
        setBroken(true);
        setStatus({
          text: 'Paused',
          cls: 'debugger-status debugger-status-paused',
        });
        const lb = /** @type {BreakEvent | null} */ (lastBreak);
        if (lb) {
          const location = `${lb.path}:${lb.line}`;
          setBreakInfo(lb.message ? `${location} — ${lb.message}` : location);
        }
      } else {
        setBroken(false);
        setStatus({
          text: 'Running',
          cls: 'debugger-status debugger-status-running',
        });
        setBreakInfo('Not paused');
      }
    } catch {
      if (!isLive()) return;
      setBroken(false);
      setStatus({
        text: 'Disconnected',
        cls: 'debugger-status debugger-status-error',
      });
    }
  };

  const refreshFrames = async () => {
    const ref = debuggerRef;
    if (!ref) return;
    try {
      const fetched = /** @type {Frame[]} */ (await E(ref).getFrames());
      if (!isLive()) return;
      setFramePlaceholder(null);
      setActiveFrame(0);
      setFrames(fetched);
    } catch {
      if (!isLive()) return;
      setFrames(null);
      setFramePlaceholder('Unable to load frames');
    }
  };

  const refreshLocals = async () => {
    const ref = debuggerRef;
    if (!ref) return;
    try {
      const fetched = /** @type {Property[]} */ (await E(ref).getLocals());
      if (!isLive()) return;
      setLocals({ properties: fetched, error: null });
    } catch {
      if (!isLive()) return;
      setLocals({ properties: null, error: 'Unable to load locals' });
    }
  };

  const refreshGlobals = async () => {
    const ref = debuggerRef;
    if (!ref) return;
    try {
      const fetched = /** @type {Property[]} */ (await E(ref).getGlobals());
      if (!isLive()) return;
      setLocals({ properties: fetched, error: null });
    } catch {
      if (!isLive()) return;
      setLocals({ properties: null, error: 'Unable to load globals' });
    }
  };

  /** @param {number} index */
  const selectFrame = async index => {
    const ref = debuggerRef;
    if (!ref) return;
    setActiveFrame(index);
    try {
      const fetched = /** @type {Property[]} */ (
        await E(ref).selectFrame(String(index))
      );
      if (!isLive()) return;
      setLocals({ properties: fetched, error: null });
    } catch {
      if (!isLive()) return;
      setLocals({ properties: null, error: 'Unable to load frame locals' });
    }
  };

  const handleGo = async () => {
    const ref = debuggerRef;
    if (!ref || pending) return;
    setPending(true);
    try {
      await E(ref).go();
      if (!isLive()) return;
      setStatus({
        text: 'Running',
        cls: 'debugger-status debugger-status-running',
      });
      setBreakInfo('Not paused');
      setBroken(false);
      setFrames(null);
      setFramePlaceholder('Running...');
      setLocals({ properties: null, error: null });
    } catch (err) {
      if (isLive()) appendConsole(`go error: ${err}`, 'debugger-console-error');
    } finally {
      if (isLive()) setPending(false);
    }
  };

  /** @param {'step'|'stepIn'|'stepOut'} method */
  const handleStep = async method => {
    const ref = debuggerRef;
    if (!ref || pending) return;
    setPending(true);
    try {
      await E(ref)[method]();
      if (!isLive()) return;
      await refreshState();
      await Promise.all([refreshFrames(), refreshLocals()]);
    } catch (err) {
      if (isLive()) {
        appendConsole(`${method} error: ${err}`, 'debugger-console-error');
      }
    } finally {
      if (isLive()) setPending(false);
    }
  };

  const handleAbort = async () => {
    const ref = debuggerRef;
    if (!ref || pending) return;
    setPending(true);
    try {
      await E(ref).abort();
      if (!isLive()) return;
      setStatus({
        text: 'Aborted',
        cls: 'debugger-status debugger-status-error',
      });
    } catch (err) {
      if (isLive()) {
        appendConsole(`abort error: ${err}`, 'debugger-console-error');
      }
    } finally {
      if (isLive()) setPending(false);
    }
  };

  /** @param {'none'|'all'|'uncaught'} mode */
  const onExceptionModeChange = mode => {
    setExceptionMode(mode);
    const ref = debuggerRef;
    if (ref) E(ref).setExceptionBreakMode(mode);
  };

  const addBreakpoint = () => {
    const path = bpPath.trim();
    const line = Number(bpLine);
    if (!path || !line || line < 1) return;
    const ref = debuggerRef;
    if (!ref) return;
    E(ref).setBreakpoint(path, line);
    setBreakpoints(prev => [...prev, { path, line }]);
    setBpPath('');
    setBpLine('');
  };

  /** @param {Breakpoint} bp */
  const removeBreakpoint = bp => {
    const ref = debuggerRef;
    if (ref) E(ref).clearBreakpoint(bp.path, bp.line);
    setBreakpoints(prev =>
      prev.filter(b => b.path !== bp.path || b.line !== bp.line),
    );
  };

  const clearAllBreakpoints = () => {
    const ref = debuggerRef;
    if (ref) E(ref).clearAllBreakpoints();
    setBreakpoints([]);
  };

  const evalExpr = () => {
    const source = consoleInput.trim();
    const ref = debuggerRef;
    if (!source || !ref) return;
    setConsoleInput('');
    appendConsole(`> ${source}`, 'debugger-console-input-line');
    E(ref)
      .evaluate(source)
      .then(
        result => {
          if (isLive()) {
            appendConsole(String(result), 'debugger-console-result');
          }
        },
        err => {
          if (isLive()) appendConsole(String(err), 'debugger-console-error');
        },
      );
  };

  // Publish `open(ref, label)` so the entry's API drives a fresh session into
  // the live component, resetting all panel state and loading initial state.
  // `controller.open` is set in an effect (after the first render), so the
  // entry's `open()` may run BEFORE this effect flushes; it then stashes the
  // request in `controller.pending`, which this effect drains on registration.
  useEffect(() => {
    /** @param {unknown} ref @param {string} [label] */
    const apply = (ref, label) => {
      setDebuggerRef(/** @type {Debugger} */ (ref));
      setTitle(label ? `Debugger: ${label}` : 'Debugger');
      setTag('');
      setStatus({ text: 'Connecting...', cls: 'debugger-status' });
      setPending(false);
      setBroken(false);
      setBreakInfo('Loading...');
      setFrames(null);
      setFramePlaceholder(null);
      setActiveFrame(0);
      setLocals({ properties: null, error: null });
      setBreakpoints([]);
      setConsoleLines([]);
      setConsoleInput('');
      setExceptionMode('none');
    };
    controller.open = apply;
    if (controller.pending) {
      const { ref, label } = controller.pending;
      controller.pending = undefined;
      apply(ref, label);
    }
    return () => {
      if (controller.open === apply) delete controller.open;
    };
  }, [controller]);

  // Once a new ref is set, load its initial state.
  useEffect(() => {
    if (!debuggerRef) return undefined;
    let disposed = false;
    refreshState()
      .then(() => {
        if (disposed || !isLive()) return undefined;
        return Promise.all([refreshFrames(), refreshLocals()]);
      })
      .catch(err => {
        if (!disposed && isLive()) {
          console.error('[debugger-panel] initial load failed:', err);
        }
      });
    return () => {
      disposed = true;
    };
  }, [debuggerRef]);

  const stepDisabled = !broken || pending;

  return h(
    'div',
    {
      class: 'debugger-panel',
      /** @param {{ key: string, shiftKey?: boolean, preventDefault: () => void }} e */
      onKeyDown: e => {
        if (e.key === 'F8') {
          e.preventDefault();
          handleGo();
        } else if (e.key === 'F10') {
          e.preventDefault();
          handleStep('step');
        } else if (e.key === 'F11' && !e.shiftKey) {
          e.preventDefault();
          handleStep('stepIn');
        } else if (e.key === 'F11' && e.shiftKey) {
          e.preventDefault();
          handleStep('stepOut');
        }
      },
    },
    h(
      'div',
      { class: 'debugger-header' },
      h(
        'div',
        { class: 'debugger-title-area' },
        h('span', { class: 'debugger-title' }, title),
        h('span', { class: 'debugger-tag' }, tag),
        h('span', { class: status.cls }, status.text),
      ),
      h(
        'div',
        { class: 'debugger-header-actions' },
        h(
          'button',
          {
            class: 'debugger-close',
            title: 'Close (Esc)',
            onClick: () => controller.hideRequest && controller.hideRequest(),
          },
          '×',
        ),
      ),
    ),
    h(
      'div',
      { class: 'debugger-toolbar' },
      h(
        'button',
        {
          class: 'debugger-btn debugger-go',
          title: 'Resume (F8)',
          disabled: pending,
          onClick: handleGo,
        },
        '▶ Go',
      ),
      h(
        'button',
        {
          class: 'debugger-btn debugger-step',
          title: 'Step Over (F10)',
          disabled: stepDisabled,
          onClick: () => handleStep('step'),
        },
        '↭ Step',
      ),
      h(
        'button',
        {
          class: 'debugger-btn debugger-step-in',
          title: 'Step In (F11)',
          disabled: stepDisabled,
          onClick: () => handleStep('stepIn'),
        },
        '↗ In',
      ),
      h(
        'button',
        {
          class: 'debugger-btn debugger-step-out',
          title: 'Step Out (Shift+F11)',
          disabled: stepDisabled,
          onClick: () => handleStep('stepOut'),
        },
        '↕ Out',
      ),
      h(
        'button',
        {
          class: 'debugger-btn debugger-btn-danger debugger-abort',
          title: 'Abort',
          disabled: pending,
          onClick: handleAbort,
        },
        '✕ Abort',
      ),
      h('span', { class: 'debugger-toolbar-spacer' }),
      h(
        'select',
        {
          class: 'debugger-exception-mode',
          title: 'Exception break mode',
          value: exceptionMode,
          /** @param {{ target: { value: string } }} e */
          onChange: e =>
            onExceptionModeChange(
              /** @type {'none'|'all'|'uncaught'} */ (e.target.value),
            ),
        },
        h('option', { value: 'none' }, 'Exceptions: none'),
        h('option', { value: 'uncaught' }, 'Exceptions: uncaught'),
        h('option', { value: 'all' }, 'Exceptions: all'),
      ),
    ),
    h(
      'div',
      { class: 'debugger-body' },
      h(
        'div',
        { class: 'debugger-sidebar' },
        h(
          'div',
          { class: 'debugger-frames-section' },
          h('h4', { class: 'debugger-section-title' }, 'Call Stack'),
          h(
            'div',
            { class: 'debugger-frames-list' },
            h(FrameList, {
              frames,
              placeholder: framePlaceholder,
              activeIndex: activeFrame,
              onSelectFrame: selectFrame,
            }),
          ),
        ),
        h(
          'div',
          { class: 'debugger-locals-section' },
          h(
            'h4',
            { class: 'debugger-section-title' },
            h('span', null, 'Variables'),
            h(
              'button',
              {
                class: 'debugger-show-globals',
                title: 'Show globals',
                onClick: refreshGlobals,
              },
              'Globals',
            ),
          ),
          h(
            'div',
            { class: 'debugger-locals-tree' },
            h(PropertyTree, {
              properties: locals.properties,
              error: locals.error,
            }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'debugger-main' },
        h(
          'div',
          { class: 'debugger-break-section' },
          h('h4', { class: 'debugger-section-title' }, 'Break Location'),
          h('div', { class: 'debugger-break-info' }, breakInfo),
        ),
        h(
          'div',
          { class: 'debugger-breakpoints-section' },
          h(
            'h4',
            { class: 'debugger-section-title' },
            h('span', null, 'Breakpoints'),
            h(
              'button',
              {
                class: 'debugger-clear-all-bp',
                title: 'Clear all breakpoints',
                onClick: clearAllBreakpoints,
              },
              'Clear All',
            ),
          ),
          h(
            'div',
            { class: 'debugger-breakpoints-list' },
            h(BreakpointList, { breakpoints, onRemove: removeBreakpoint }),
          ),
          h(
            'div',
            { class: 'debugger-add-breakpoint' },
            h('input', {
              class: 'debugger-bp-path',
              placeholder: 'file path',
              value: bpPath,
              /** @param {{ target: { value: string } }} e */
              onInput: e => setBpPath(e.target.value),
            }),
            h('input', {
              class: 'debugger-bp-line',
              type: 'number',
              placeholder: 'line',
              min: '1',
              value: bpLine,
              /** @param {{ target: { value: string } }} e */
              onInput: e => setBpLine(e.target.value),
              /** @param {{ key: string }} e */
              onKeyDown: e => {
                if (e.key === 'Enter') addBreakpoint();
              },
            }),
            h(
              'button',
              { class: 'debugger-bp-add', onClick: addBreakpoint },
              'Add',
            ),
          ),
        ),
        h(
          'div',
          { class: 'debugger-console-section' },
          h('h4', { class: 'debugger-section-title' }, 'Console'),
          h(
            'div',
            { class: 'debugger-console-output' },
            consoleLines.map(line =>
              h('div', { key: line.key, class: line.className }, line.text),
            ),
          ),
          h(
            'div',
            { class: 'debugger-console-input-row' },
            h('input', {
              class: 'debugger-console-input',
              placeholder: 'Evaluate expression...',
              value: consoleInput,
              /** @param {{ target: { value: string } }} e */
              onInput: e => setConsoleInput(e.target.value),
              /** @param {{ key: string }} e */
              onKeyDown: e => {
                if (e.key === 'Enter') evalExpr();
              },
            }),
            h(
              'button',
              { class: 'debugger-console-eval', onClick: evalExpr },
              'Eval',
            ),
          ),
        ),
      ),
    ),
  );
};
harden(DebuggerRoot);

// ---------------------------------------------------------------------------
// Panel factory (entry — signature preserved)
// ---------------------------------------------------------------------------

/**
 * Create the debugger panel.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container
 * @param {HTMLElement} options.$backdrop
 * @returns {DebuggerPanelAPI}
 */
export const createDebuggerPanel = ({ $container, $backdrop }) => {
  let visible = false;

  // Render into a DEDICATED child of the host `$container` so the host's own
  // `$container` / `$backdrop` nodes never enter the confined vnode tree.
  // `renderConfined` reconciles only against this mount's children.
  const $mount = document.createElement('div');
  $mount.style.display = 'contents';
  $container.appendChild($mount);
  const isLive = () => $mount.isConnected;

  // Mutable bridge to the root component (the channel-list.js idiom). The
  // component publishes `open` from an effect (draining any `pending` request
  // the entry stashed before that effect ran); `createDebuggerPanel` writes
  // `hideRequest` so the in-tree close button can ask the host to hide.
  // Intentionally NOT hardened — the component writes its setter onto it.
  /** @type {DebuggerController} */
  const controller = {};

  const hide = () => {
    visible = false;
    $backdrop.style.display = 'none';
    $container.style.display = 'none';
  };
  controller.hideRequest = hide;

  renderConfined(h(DebuggerRoot, { $container, isLive, controller }), $mount);

  // Backdrop click closes the panel (host node — imperative, not in the tree).
  $backdrop.addEventListener('click', hide);

  /**
   * Open the debugger panel for a Debugger exo reference.
   *
   * @param {unknown} ref - The Debugger exo (CapTP remotable)
   * @param {string} [label]
   */
  const open = (ref, label) => {
    visible = true;
    $backdrop.style.display = 'block';
    $container.style.display = 'flex';
    if (controller.open) {
      controller.open(ref, label);
    } else {
      // The root component's effect has not registered its setter yet (the
      // first render's effects flush a tick after `renderConfined`). Stash the
      // request; the effect drains `pending` once it runs.
      controller.pending = { ref, label };
    }
  };

  return harden({
    open,
    hide,
    isVisible: () => visible,
  });
};
harden(createDebuggerPanel);
