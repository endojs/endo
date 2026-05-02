// @ts-check

/**
 * @file Debugger panel — a modal overlay for interactive XS worker
 * debugging in the Chat application.
 *
 * The panel attaches to a Debugger exo (a CapTP remotable) and
 * provides stepping controls, call stack, local variable inspection,
 * breakpoint management, and an eval console.
 */

/** @import { ERef } from '@endo/far' */

import { E } from '@endo/far';

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
 * @typedef {object} DebuggerPanelAPI
 * @property {(debuggerRef: unknown, label?: string) => void} open
 * @property {() => void} hide
 * @property {() => boolean} isVisible
 */

const panelHTML = `
<div class="debugger-panel">
  <div class="debugger-header">
    <div class="debugger-title-area">
      <span class="debugger-title">Debugger</span>
      <span class="debugger-tag"></span>
      <span class="debugger-status">Idle</span>
    </div>
    <div class="debugger-header-actions">
      <button class="debugger-close" title="Close (Esc)">&times;</button>
    </div>
  </div>

  <div class="debugger-toolbar">
    <button class="debugger-btn debugger-go" title="Resume (F8)">&#9654; Go</button>
    <button class="debugger-btn debugger-step" title="Step Over (F10)">&#8677; Step</button>
    <button class="debugger-btn debugger-step-in" title="Step In (F11)">&#8615; In</button>
    <button class="debugger-btn debugger-step-out" title="Step Out (Shift+F11)">&#8613; Out</button>
    <button class="debugger-btn debugger-btn-danger debugger-abort" title="Abort">&#10005; Abort</button>
    <span class="debugger-toolbar-spacer"></span>
    <select class="debugger-exception-mode" title="Exception break mode">
      <option value="none">Exceptions: none</option>
      <option value="uncaught">Exceptions: uncaught</option>
      <option value="all">Exceptions: all</option>
    </select>
  </div>

  <div class="debugger-body">
    <div class="debugger-sidebar">
      <div class="debugger-frames-section">
        <h4 class="debugger-section-title">Call Stack</h4>
        <div class="debugger-frames-list"></div>
      </div>
      <div class="debugger-locals-section">
        <h4 class="debugger-section-title">
          <span>Variables</span>
          <button class="debugger-show-globals" title="Show globals">Globals</button>
        </h4>
        <div class="debugger-locals-tree"></div>
      </div>
    </div>

    <div class="debugger-main">
      <div class="debugger-break-section">
        <h4 class="debugger-section-title">Break Location</h4>
        <div class="debugger-break-info">Not paused</div>
      </div>
      <div class="debugger-breakpoints-section">
        <h4 class="debugger-section-title">
          <span>Breakpoints</span>
          <button class="debugger-clear-all-bp" title="Clear all breakpoints">Clear All</button>
        </h4>
        <div class="debugger-breakpoints-list"></div>
        <div class="debugger-add-breakpoint">
          <input class="debugger-bp-path" placeholder="file path" />
          <input class="debugger-bp-line" type="number" placeholder="line" min="1" />
          <button class="debugger-bp-add">Add</button>
        </div>
      </div>
      <div class="debugger-console-section">
        <h4 class="debugger-section-title">Console</h4>
        <div class="debugger-console-output"></div>
        <div class="debugger-console-input-row">
          <input class="debugger-console-input" placeholder="Evaluate expression..." />
          <button class="debugger-console-eval">Eval</button>
        </div>
      </div>
    </div>
  </div>
</div>
`;

// ---------------------------------------------------------------------------
// Property tree renderer
// ---------------------------------------------------------------------------

/**
 * Render a nested property tree into a container.
 *
 * @param {HTMLElement} $container
 * @param {Property[]} properties
 * @param {number} depth
 */
const renderPropertyTree = ($container, properties, depth) => {
  for (const prop of properties) {
    const $row = document.createElement('div');
    $row.className = 'debugger-prop-row';
    $row.style.paddingLeft = `${12 + depth * 16}px`;

    const hasChildren = prop.children && prop.children.length > 0;

    const $disc = document.createElement('span');
    if (hasChildren) {
      $disc.className = 'debugger-prop-disc';
      $disc.textContent = '\u25B6'; // right-pointing triangle
    } else {
      $disc.className = 'debugger-prop-disc debugger-prop-disc-empty';
      $disc.textContent = ' ';
    }
    $row.appendChild($disc);

    const $name = document.createElement('span');
    $name.className = 'debugger-prop-name';
    $name.textContent = prop.name;
    $row.appendChild($name);

    const $sep = document.createElement('span');
    $sep.className = 'debugger-prop-sep';
    $sep.textContent = ': ';
    $row.appendChild($sep);

    const $val = document.createElement('span');
    $val.className = 'debugger-prop-value';
    $val.textContent = prop.value;
    $row.appendChild($val);

    $container.appendChild($row);

    if (hasChildren && prop.children) {
      const $children = document.createElement('div');
      $children.className = 'debugger-prop-children';
      $children.style.display = 'none';
      renderPropertyTree($children, prop.children, depth + 1);
      $container.appendChild($children);

      $disc.addEventListener('click', () => {
        const open = $children.style.display !== 'none';
        $children.style.display = open ? 'none' : 'block';
        $disc.textContent = open ? '\u25B6' : '\u25BC';
      });
    }
  }
};

// ---------------------------------------------------------------------------
// Panel factory
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
  /** @type {unknown} */
  let debuggerRef = null;
  let pending = false;
  /** @type {Array<{path: string, line: number}>} */
  let breakpoints = [];
  let initialized = false;

  // DOM references (set on first init)
  /** @type {HTMLElement} */ let $title;
  /** @type {HTMLElement} */ let $tag;
  /** @type {HTMLElement} */ let $status;
  /** @type {HTMLButtonElement} */ let $goBtn;
  /** @type {HTMLButtonElement} */ let $stepBtn;
  /** @type {HTMLButtonElement} */ let $stepInBtn;
  /** @type {HTMLButtonElement} */ let $stepOutBtn;
  /** @type {HTMLButtonElement} */ let $abortBtn;
  /** @type {HTMLSelectElement} */ let $exceptionMode;
  /** @type {HTMLElement} */ let $framesList;
  /** @type {HTMLElement} */ let $localsTree;
  /** @type {HTMLElement} */ let $breakInfo;
  /** @type {HTMLElement} */ let $bpList;
  /** @type {HTMLInputElement} */ let $bpPath;
  /** @type {HTMLInputElement} */ let $bpLine;
  /** @type {HTMLElement} */ let $consoleOutput;
  /** @type {HTMLInputElement} */ let $consoleInput;

  // -------------------------------------------------------------------
  // DOM initialization
  // -------------------------------------------------------------------

  const init = () => {
    if (initialized) return;
    initialized = true;

    $container.innerHTML = panelHTML;

    $title = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-title')
    );
    $tag = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-tag')
    );
    $status = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-status')
    );
    $goBtn = /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-go')
    );
    $stepBtn = /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-step')
    );
    $stepInBtn = /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-step-in')
    );
    $stepOutBtn = /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-step-out')
    );
    $abortBtn = /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-abort')
    );
    $exceptionMode = /** @type {HTMLSelectElement} */ (
      $container.querySelector('.debugger-exception-mode')
    );
    $framesList = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-frames-list')
    );
    $localsTree = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-locals-tree')
    );
    $breakInfo = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-break-info')
    );
    $bpList = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-breakpoints-list')
    );
    $bpPath = /** @type {HTMLInputElement} */ (
      $container.querySelector('.debugger-bp-path')
    );
    $bpLine = /** @type {HTMLInputElement} */ (
      $container.querySelector('.debugger-bp-line')
    );
    $consoleOutput = /** @type {HTMLElement} */ (
      $container.querySelector('.debugger-console-output')
    );
    $consoleInput = /** @type {HTMLInputElement} */ (
      $container.querySelector('.debugger-console-input')
    );

    // Close button
    const $closeBtn = /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-close')
    );
    $closeBtn.addEventListener('click', hide);

    // Toolbar buttons
    $goBtn.addEventListener('click', handleGo);
    $stepBtn.addEventListener('click', () => handleStep('step'));
    $stepInBtn.addEventListener('click', () => handleStep('stepIn'));
    $stepOutBtn.addEventListener('click', () => handleStep('stepOut'));
    $abortBtn.addEventListener('click', handleAbort);

    // Exception mode
    $exceptionMode.addEventListener('change', () => {
      if (!debuggerRef) return;
      const mode = /** @type {'none'|'all'|'uncaught'} */ (
        $exceptionMode.value
      );
      E(debuggerRef).setExceptionBreakMode(mode);
    });

    // Breakpoint add
    const addBp = () => {
      const path = $bpPath.value.trim();
      const line = Number($bpLine.value);
      if (!path || !line || line < 1) return;
      if (!debuggerRef) return;
      E(debuggerRef).setBreakpoint(path, line);
      breakpoints.push({ path, line });
      renderBreakpoints();
      $bpPath.value = '';
      $bpLine.value = '';
    };
    /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-bp-add')
    ).addEventListener('click', addBp);
    $bpLine.addEventListener('keydown', e => {
      if (e.key === 'Enter') addBp();
    });

    // Clear all breakpoints
    /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-clear-all-bp')
    ).addEventListener('click', () => {
      if (!debuggerRef) return;
      E(debuggerRef).clearAllBreakpoints();
      breakpoints = [];
      renderBreakpoints();
    });

    // Show globals
    /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-show-globals')
    ).addEventListener('click', refreshGlobals);

    // Console eval
    const evalExpr = () => {
      const source = $consoleInput.value.trim();
      if (!source || !debuggerRef) return;
      $consoleInput.value = '';
      appendConsole(`> ${source}`, 'debugger-console-input-line');
      E(debuggerRef)
        .evaluate(source)
        .then(
          result => appendConsole(result, 'debugger-console-result'),
          err => appendConsole(String(err), 'debugger-console-error'),
        );
    };
    /** @type {HTMLButtonElement} */ (
      $container.querySelector('.debugger-console-eval')
    ).addEventListener('click', evalExpr);
    $consoleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') evalExpr();
    });

    // Keyboard shortcuts
    $container.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        hide();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        handleGo();
      }
      if (e.key === 'F10') {
        e.preventDefault();
        handleStep('step');
      }
      if (e.key === 'F11' && !e.shiftKey) {
        e.preventDefault();
        handleStep('stepIn');
      }
      if (e.key === 'F11' && e.shiftKey) {
        e.preventDefault();
        handleStep('stepOut');
      }
    });

    // Backdrop click to close
    $backdrop.addEventListener('click', hide);
  };

  // -------------------------------------------------------------------
  // State refresh
  // -------------------------------------------------------------------

  const refreshState = async () => {
    if (!debuggerRef) return;
    try {
      const [broken, lastBreak, title, tag] = await Promise.all([
        E(debuggerRef).isBroken(),
        E(debuggerRef).getLastBreak(),
        E(debuggerRef).getTitle(),
        E(debuggerRef).getTag(),
      ]);

      if (title) $title.textContent = `Debugger: ${title}`;
      if (tag) $tag.textContent = tag;

      if (broken) {
        $status.textContent = 'Paused';
        $status.className = 'debugger-status debugger-status-paused';
        updateStepButtons(true);
        if (lastBreak) {
          const location = `${lastBreak.path}:${lastBreak.line}`;
          $breakInfo.textContent = lastBreak.message
            ? `${location} — ${lastBreak.message}`
            : location;
        }
      } else {
        $status.textContent = 'Running';
        $status.className = 'debugger-status debugger-status-running';
        updateStepButtons(false);
        $breakInfo.textContent = 'Not paused';
      }
    } catch (err) {
      $status.textContent = 'Disconnected';
      $status.className = 'debugger-status debugger-status-error';
      updateStepButtons(false);
    }
  };

  const refreshFrames = async () => {
    if (!debuggerRef) return;
    try {
      const frames = /** @type {Frame[]} */ (await E(debuggerRef).getFrames());
      renderFrames(frames);
    } catch {
      $framesList.innerHTML =
        '<div class="debugger-empty">Unable to load frames</div>';
    }
  };

  const refreshLocals = async () => {
    if (!debuggerRef) return;
    try {
      const locals = /** @type {Property[]} */ (
        await E(debuggerRef).getLocals()
      );
      $localsTree.innerHTML = '';
      renderPropertyTree($localsTree, locals, 0);
    } catch {
      $localsTree.innerHTML =
        '<div class="debugger-empty">Unable to load locals</div>';
    }
  };

  const refreshGlobals = async () => {
    if (!debuggerRef) return;
    try {
      const globals = /** @type {Property[]} */ (
        await E(debuggerRef).getGlobals()
      );
      $localsTree.innerHTML = '';
      renderPropertyTree($localsTree, globals, 0);
    } catch {
      $localsTree.innerHTML =
        '<div class="debugger-empty">Unable to load globals</div>';
    }
  };

  // -------------------------------------------------------------------
  // Rendering helpers
  // -------------------------------------------------------------------

  /**
   * @param {boolean} canStep
   */
  const updateStepButtons = canStep => {
    $stepBtn.disabled = !canStep || pending;
    $stepInBtn.disabled = !canStep || pending;
    $stepOutBtn.disabled = !canStep || pending;
    $goBtn.disabled = pending;
    $abortBtn.disabled = pending;
  };

  /**
   * @param {Frame[]} frames
   */
  const renderFrames = frames => {
    $framesList.innerHTML = '';
    if (frames.length === 0) {
      $framesList.innerHTML = '<div class="debugger-empty">No frames</div>';
      return;
    }
    for (let i = 0; i < frames.length; i += 1) {
      const frame = frames[i];
      const $row = document.createElement('div');
      $row.className = 'debugger-frame-item';
      if (i === 0) $row.classList.add('debugger-frame-active');

      const $name = document.createElement('span');
      $name.className = 'debugger-frame-name';
      $name.textContent = frame.name || '(anonymous)';

      const $loc = document.createElement('span');
      $loc.className = 'debugger-frame-loc';
      $loc.textContent = `${frame.path}:${frame.line}`;

      $row.appendChild($name);
      $row.appendChild($loc);

      $row.addEventListener('click', () => {
        // Deselect previous
        const $prev = $framesList.querySelector('.debugger-frame-active');
        if ($prev) $prev.classList.remove('debugger-frame-active');
        $row.classList.add('debugger-frame-active');
        selectFrame(String(i));
      });

      $framesList.appendChild($row);
    }
  };

  /**
   * @param {string} id
   */
  const selectFrame = async id => {
    if (!debuggerRef) return;
    try {
      const locals = /** @type {Property[]} */ (
        await E(debuggerRef).selectFrame(id)
      );
      $localsTree.innerHTML = '';
      renderPropertyTree($localsTree, locals, 0);
    } catch {
      $localsTree.innerHTML =
        '<div class="debugger-empty">Unable to load frame locals</div>';
    }
  };

  const renderBreakpoints = () => {
    $bpList.innerHTML = '';
    if (breakpoints.length === 0) {
      $bpList.innerHTML =
        '<div class="debugger-empty">No breakpoints set</div>';
      return;
    }
    for (const bp of breakpoints) {
      const $row = document.createElement('div');
      $row.className = 'debugger-bp-item';

      const $loc = document.createElement('span');
      $loc.className = 'debugger-bp-loc';
      $loc.textContent = `${bp.path}:${bp.line}`;

      const $del = document.createElement('button');
      $del.className = 'debugger-bp-del';
      $del.textContent = '\u00D7';
      $del.title = 'Remove breakpoint';
      $del.addEventListener('click', () => {
        if (!debuggerRef) return;
        E(debuggerRef).clearBreakpoint(bp.path, bp.line);
        breakpoints = breakpoints.filter(
          b => b.path !== bp.path || b.line !== bp.line,
        );
        renderBreakpoints();
      });

      $row.appendChild($loc);
      $row.appendChild($del);
      $bpList.appendChild($row);
    }
  };

  /**
   * @param {string} text
   * @param {string} className
   */
  const appendConsole = (text, className) => {
    const $line = document.createElement('div');
    $line.className = className;
    $line.textContent = text;
    $consoleOutput.appendChild($line);
    $consoleOutput.scrollTop = $consoleOutput.scrollHeight;
  };

  // -------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------

  const handleGo = async () => {
    if (!debuggerRef || pending) return;
    pending = true;
    updateStepButtons(false);
    try {
      await E(debuggerRef).go();
      $status.textContent = 'Running';
      $status.className = 'debugger-status debugger-status-running';
      $breakInfo.textContent = 'Not paused';
      $framesList.innerHTML = '<div class="debugger-empty">Running...</div>';
      $localsTree.innerHTML = '';
    } catch (err) {
      appendConsole(`go error: ${err}`, 'debugger-console-error');
    } finally {
      pending = false;
      updateStepButtons(false);
    }
  };

  /**
   * @param {'step'|'stepIn'|'stepOut'} method
   */
  const handleStep = async method => {
    if (!debuggerRef || pending) return;
    pending = true;
    updateStepButtons(false);
    try {
      await E(debuggerRef)[method]();
      await refreshState();
      await Promise.all([refreshFrames(), refreshLocals()]);
    } catch (err) {
      appendConsole(`${method} error: ${err}`, 'debugger-console-error');
    } finally {
      pending = false;
      // refreshState already updated buttons
    }
  };

  const handleAbort = async () => {
    if (!debuggerRef || pending) return;
    pending = true;
    updateStepButtons(false);
    try {
      await E(debuggerRef).abort();
      $status.textContent = 'Aborted';
      $status.className = 'debugger-status debugger-status-error';
    } catch (err) {
      appendConsole(`abort error: ${err}`, 'debugger-console-error');
    } finally {
      pending = false;
    }
  };

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  const hide = () => {
    visible = false;
    $backdrop.style.display = 'none';
    $container.style.display = 'none';
  };

  /**
   * Open the debugger panel for a Debugger exo reference.
   *
   * @param {unknown} ref - The Debugger exo (CapTP remotable)
   * @param {string} [label]
   */
  const open = (ref, label) => {
    init();
    debuggerRef = ref;
    visible = true;
    breakpoints = [];

    $backdrop.style.display = 'block';
    $container.style.display = 'flex';

    if (label) {
      $title.textContent = `Debugger: ${label}`;
    } else {
      $title.textContent = 'Debugger';
    }
    $tag.textContent = '';
    $status.textContent = 'Connecting...';
    $status.className = 'debugger-status';
    $framesList.innerHTML = '';
    $localsTree.innerHTML = '';
    $breakInfo.textContent = 'Loading...';
    $consoleOutput.innerHTML = '';
    renderBreakpoints();

    // Load initial state
    refreshState().then(() => Promise.all([refreshFrames(), refreshLocals()]));
  };

  return harden({
    open,
    hide,
    isVisible: () => visible,
  });
};
harden(createDebuggerPanel);
