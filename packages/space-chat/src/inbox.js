// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { Fragment, createContext, h } from 'preact';
import {
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'preact/hooks';

import { playChime } from '@endo/chat-kit/chime.js';
import { idFromLocator } from '@endo/chat-kit/locator.js';
import { prepareTextWithPlaceholders } from '@endo/chat-kit/markdown-render.js';
import { markdownToVnodes } from '@endo/chat-kit/markdown-vnodes.js';
import { valueToVnodes } from '@endo/chat-kit/value-vnodes.js';
import {
  dateFormatter,
  timeFormatter,
  relativeTime,
} from '@endo/chat-kit/time-formatters.js';

// 1:1 recipient-filtered default inbox view, migrated from imperative DOM to a
// confined Preact component rendered through a single `renderConfined`.
//
// STAGE 1 of a staged migration. The exported entry keeps its async signature
// (`inboxComponent($parent, $end, powers, options)`) so the caller (chat.js)
// needs no changes. The whole message list renders confined into a DEDICATED
// mount child appended inside `$parent`; siblings (the scroll `$end` anchor,
// any connecting indicators chat.js inserts) are never reconciled away because
// `renderConfined` only reconciles against the children of the node it renders
// into.
//
// Scroll is handled imperatively against `$parent` (the host's own container)
// by the entry closure, which exposes `measureNearBottom()` / `scrollToBottom()`
// callbacks to the confined tree. The component itself never receives a host DOM
// node, so it holds no DOM authority (and refs are stripped there anyway).
//
// DEFERRED (see inline TODOs):
//   - Monaco `colorize` of source (definition / package types) — code fences
//     still render as plain `<pre>` text.

/**
 * Compare two locator URLs by identity (node + id), ignoring address
 * hints (`at` params) that vary between `locate()` and message fields.
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
const locatorsMatch = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    // Compare the formula address: the first `@`-delimited URL-encoded
    // path component after the hostname.
    const [aFormula] = ua.pathname
      .replace(/^\//, '')
      .split('@')
      .map(decodeURIComponent);
    const [bFormula] = ub.pathname
      .replace(/^\//, '')
      .split('@')
      .map(decodeURIComponent);
    return ua.hostname === ub.hostname && aFormula === bFormula;
  } catch {
    return false;
  }
};
harden(locatorsMatch);

/**
 * @typedef {object} InboxMessage
 * @property {bigint} number
 * @property {string} type
 * @property {string} date
 * @property {string} from
 * @property {string} to
 * @property {string} [messageId]
 * @property {string} [replyTo]
 * @property {Promise<unknown>} dismissed
 * @property {boolean} isSent
 * @property {boolean} isPending - True when the message's `done` field is
 *   explicitly `false` (a partial / streaming submission still in progress).
 * @property {string | null} senderChip - `@name` (resolved async) or null.
 * @property {Record<string, unknown>} raw - The original message fields.
 */

/**
 * Reducer over the displayed message list, keyed by message `number`.
 *
 * @param {InboxMessage[]} state
 * @param {{ type: 'add', message: InboxMessage }
 *   | { type: 'replace', number: bigint, patch: Partial<InboxMessage> }
 *   | { type: 'remove', number: bigint }} action
 * @returns {InboxMessage[]}
 */
const messagesReducer = (state, action) => {
  if (action.type === 'add') {
    const i = state.findIndex(m => m.number === action.message.number);
    if (i >= 0) {
      const next = [...state];
      next[i] = action.message;
      return next;
    }
    // Keep the list ordered by message number so envelopes render in order.
    const next = [...state, action.message];
    next.sort((a, b) =>
      a.number < b.number ? -1 : a.number > b.number ? 1 : 0,
    );
    return next;
  }
  if (action.type === 'replace') {
    const i = state.findIndex(m => m.number === action.number);
    if (i < 0) return state;
    const next = [...state];
    next[i] = { ...next[i], ...action.patch };
    return next;
  }
  if (action.type === 'remove') {
    if (!state.some(m => m.number === action.number)) return state;
    return state.filter(m => m.number !== action.number);
  }
  return state;
};
harden(messagesReducer);

/**
 * Clipboard capability, injected via context so the deep leaf copy controls
 * (`TimestampLine`, `FormFieldRow`) never reach the ambient `navigator`.
 * Defaults to the platform clipboard; a host can override it with a Provider.
 *
 * @type {import('preact').Context<(text: string) => Promise<void>>}
 */
const ClipboardContext = createContext(text =>
  navigator.clipboard.writeText(text),
);

/**
 * The collapsible timestamp tooltip: message number, dismiss button, and the
 * copyable time lines. Class names match the original imperative markup so the
 * existing CSS continues to apply.
 *
 * When the message is the local agent's own package message, also renders:
 * - A history button (⏱) — visible only after at least one revision.
 * - An edit button (✎) — hidden while the message is pending (done: false).
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(text: string) => void} props.setError
 * @param {boolean} [props.isEdited] - True when at least one revision exists.
 * @param {(open: boolean) => void} [props.onEditToggle] - Called when the edit
 *   button is clicked; parent owns the open/close state.
 * @param {(open: boolean) => void} [props.onHistoryToggle] - Called when the
 *   history button is clicked; parent owns the panel open/close state.
 * @param {boolean} [props.editOpen] - Whether the edit panel is currently open.
 * @param {boolean} [props.historyOpen] - Whether the history panel is open.
 */
const Timestamp = ({
  message,
  powers,
  setError,
  isEdited,
  onEditToggle,
  onHistoryToggle,
  editOpen,
  historyOpen,
}) => {
  const { number, date, isSent, type: msgType, isPending } = message;
  const parsedDate = new Date(date);
  const relative = relativeTime(parsedDate);
  const timeLines = [date, dateFormatter.format(parsedDate), relative].filter(
    Boolean,
  );

  // Edit and history controls only appear on the local agent's own package msgs.
  const showEditControls = isSent && msgType === 'package';

  return h(
    'span',
    { class: 'timestamp' },
    timeFormatter.format(parsedDate),
    h(
      'span',
      { class: 'timestamp-tooltip' },
      h(
        'span',
        { class: 'timestamp-controls' },
        h('span', { class: 'timestamp-num' }, `#${number}`),
        h(
          'button',
          {
            class: 'dismiss-button',
            title: 'Dismiss',
            onClick: () => {
              E(powers)
                .dismiss(number)
                .catch(error => {
                  setError(` ${/** @type {Error} */ (error).message}`);
                });
            },
          },
          '×',
        ),
        showEditControls
          ? h(
              'button',
              {
                class: 'history-button',
                type: 'button',
                title: 'View edit history',
                style: isEdited ? '' : 'display:none',
                onClick: () => onHistoryToggle && onHistoryToggle(!historyOpen),
              },
              '⏱',
            )
          : null,
        showEditControls
          ? h(
              'button',
              {
                class: 'edit-button',
                type: 'button',
                title: 'Edit message',
                style: isPending ? 'display:none' : '',
                onClick: () => onEditToggle && onEditToggle(!editOpen),
              },
              editOpen ? '×' : '✎',
            )
          : null,
      ),
      h(
        'span',
        { class: 'timestamp-times' },
        timeLines.map(line => h(TimestampLine, { key: line, line })),
      ),
    ),
  );
};
harden(Timestamp);

/**
 * A single copyable time line. Owns its own "copied" feedback state.
 *
 * @param {object} props
 * @param {string} props.line
 */
const TimestampLine = ({ line }) => {
  const copy = useContext(ClipboardContext);
  const [copied, setCopied] = useState(false);
  return h(
    'div',
    {
      class: 'timestamp-line',
      onClick: () => {
        copy(line).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        });
      },
    },
    h('span', null, line),
    h('span', { class: 'timestamp-copy' }, copied ? '✓' : '⧉'),
  );
};
harden(TimestampLine);

/**
 * The sender/recipient chip injected ahead of message content.
 * @param {object} props
 * @param {string | null} props.chip
 */
const SenderChip = ({ chip }) =>
  chip ? h(Fragment, null, h('b', null, chip), ' ') : null;
harden(SenderChip);

/**
 * Request message body: description, a pet-name input, and resolve / reject
 * controls. Once settled, the controls are replaced with the settled status.
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(text: string) => void} props.setError
 */
const RequestBody = ({ message, powers, setError }) => {
  const { number, senderChip } = message;
  const { description, settled } = /** @type {any} */ (message.raw);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    let disposed = false;
    Promise.resolve(settled).then(
      s => {
        if (!disposed) setStatus(String(s));
      },
      () => {},
    );
    return () => {
      disposed = true;
    };
  }, [settled]);

  return h(
    Fragment,
    null,
    h(
      'span',
      null,
      h(SenderChip, { chip: senderChip }),
      JSON.stringify(description),
    ),
    status !== null
      ? h('span', null, ` ${status} `)
      : h(
          'span',
          null,
          h('input', {
            autocomplete: 'off',
            'data-form-type': 'other',
            'data-lpignore': 'true',
            value,
            /** @param {{ target: { value: string } }} e */
            onInput: e => setValue(e.target.value),
          }),
          h(
            'button',
            {
              onClick: () => {
                setError('');
                E(powers)
                  .resolve(number, value)
                  .catch(error => {
                    setError(` ${/** @type {Error} */ (error).message}`);
                  });
              },
            },
            'resolve',
          ),
          h(
            'button',
            {
              onClick: () => {
                E(powers).reject(number, value).catch(window.reportError);
              },
            },
            'reject',
          ),
        ),
  );
};
harden(RequestBody);

/**
 * An interactive token / pet-name chip inside a package message body. Replaces
 * one markdown placeholder. Clicking (or Enter / Space) looks the referenced
 * value up by its locator and opens it via `showValue`; hovering shows the
 * value's current pet names (resolved async via `reverseLocate`).
 *
 * Replicates the original imperative `$token` behavior: a `<span class="token"
 * role="button" tabindex="0">` wrapping `<b>@{edgeName}</b>`, default title
 * "Open value" upgraded to the comma-joined pet names once resolved.
 *
 * @param {object} props
 * @param {string} props.edgeName - The `@name` to display.
 * @param {string | undefined} props.locator - The value's `endo://` locator
 *   (from `message.ids[index]`), or undefined when not available.
 * @param {bigint} props.number - The message number, passed to `showValue`.
 * @param {ERef<EndoHost>} props.powers
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} props.showValue
 * @param {(text: string) => void} props.setError
 */
const TokenChip = ({
  edgeName,
  locator,
  number,
  powers,
  showValue,
  setError,
}) => {
  const [title, setTitle] = useState('Open value');

  useEffect(() => {
    let disposed = false;
    if (!locator) return undefined;
    E(powers)
      .reverseLocate(locator)
      .then(
        petNames => {
          if (disposed) return;
          if (Array.isArray(petNames) && petNames.length > 0) {
            setTitle(petNames.join(', '));
          }
        },
        () => {
          // Keep the default title on failure.
        },
      );
    return () => {
      disposed = true;
    };
  }, [powers, locator]);

  const openValue = () => {
    if (!locator) {
      setError(' Value not available');
      return;
    }
    // `message.ids` are delivered as endo:// locators, not bare ids.
    E(powers)
      .lookupByLocator(locator)
      .then(
        value => {
          // showValue's id arg feeds reverseIdentify, which expects a bare
          // formula id; derive it from the locator for name display.
          let valueId = locator;
          try {
            valueId = idFromLocator(locator);
          } catch {
            // Leave as the locator if it can't be parsed.
          }
          showValue(value, valueId, undefined, { number, edgeName });
        },
        (/** @type {Error} */ error) => {
          setError(` ${error.message}`);
        },
      );
  };

  return h(
    'span',
    {
      class: 'token',
      role: 'button',
      tabindex: 0,
      title,
      onClick: openValue,
      /** @param {{ repeat?: boolean, metaKey?: boolean, key: string, preventDefault: () => void }} event */
      onKeyDown: event => {
        if (event.repeat || event.metaKey) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openValue();
        }
      },
    },
    h('b', null, `@${edgeName}`),
  );
};
harden(TokenChip);

/**
 * Package message body. STAGE 2: parse the message body as markdown into a
 * Preact vnode tree (NO dangerouslySetInnerHTML — the confined renderer strips
 * it) and substitute an interactive {@link TokenChip} at each `@name`
 * placeholder. The sender chip is injected into the first paragraph / heading,
 * or prepended as a fresh `<p class="md-paragraph">` when the first block is a
 * code fence or list (matching the original imperative renderer).
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} props.showValue
 * @param {(text: string) => void} props.setError
 */
const PackageBody = ({ message, powers, showValue, setError }) => {
  const { number, senderChip } = message;
  const { strings, names, ids } = /** @type {any} */ (message.raw);
  const stringParts = Array.isArray(strings) ? strings : [];
  const nameParts = Array.isArray(names) ? names : [];
  const idParts = Array.isArray(ids) ? ids : [];

  // TODO(inbox stage 3): Monaco `colorize` of code fences within the markdown
  // (markdown-vnodes emits fences as plain `<pre class="md-code-fence">` text).
  const textWithPlaceholders = prepareTextWithPlaceholders(
    stringParts.map(String),
  );

  /** @type {import('@endo/chat-kit/markdown-vnodes.js').RenderToken} */
  const renderToken = index => {
    const edgeName = String(nameParts[index]);
    const locator =
      idParts[index] !== undefined ? String(idParts[index]) : undefined;
    return h(TokenChip, {
      key: `chip-${index}`,
      edgeName,
      locator,
      number,
      powers,
      showValue,
      setError,
    });
  };

  const { nodes, placeholderCount, firstBlockKind } = markdownToVnodes(
    textWithPlaceholders,
    { renderToken },
  );

  // Inject the sender chip into the first paragraph / heading; otherwise (code
  // fence or list first) prepend a dedicated paragraph for it.
  /** @type {import('preact').ComponentChild[]} */
  let body = nodes;
  if (senderChip) {
    if (
      (firstBlockKind === 'paragraph' || firstBlockKind === 'heading') &&
      nodes.length > 0 &&
      nodes[0]
    ) {
      const $first = /** @type {import('preact').VNode} */ (nodes[0]);
      const { children: existingChildren, ...firstProps } = /** @type {any} */ (
        $first.props
      );
      const childArray = Array.isArray(existingChildren)
        ? existingChildren
        : existingChildren === undefined
          ? []
          : [existingChildren];
      const $withChip = h(
        /** @type {any} */ ($first.type),
        firstProps,
        h(SenderChip, { chip: senderChip }),
        ...childArray,
      );
      body = [$withChip, ...nodes.slice(1)];
    } else {
      const $chipPara = h(
        'p',
        { class: 'md-paragraph', key: 'sender-chip' },
        h(SenderChip, { chip: senderChip }),
      );
      body = [$chipPara, ...nodes];
    }
  }

  // Attachments without an inline placeholder slot (e.g. one text string and one
  // attached value) are appended at the end of the body rather than dropped.
  for (let index = placeholderCount; index < nameParts.length; index += 1) {
    const chip = renderToken(index);
    if (chip) body = [...body, ' ', chip];
  }

  return h(Fragment, null, ...body);
};
harden(PackageBody);

/**
 * Definition message body: a plain (un-colorized in stage 1) source fence plus
 * the slot-binding inputs and a Submit button calling `endow`.
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(text: string) => void} props.setError
 */
const DefinitionBody = ({ message, powers, setError }) => {
  const { number, isSent, senderChip } = message;
  const { source, slots } = /** @type {any} */ (message.raw);
  const slotEntries = Object.entries(
    /** @type {Record<string, { label: string }>} */ (slots || {}),
  );

  /** @type {[Record<string, string>, (v: Record<string, string>) => void]} */
  const [bindings, setBindings] = useState(
    /** @type {Record<string, string>} */ ({}),
  );

  const doSubmit = () => {
    /** @type {Record<string, string>} */
    const collected = {};
    for (const [codeName] of slotEntries) {
      const val = (bindings[codeName] || '').trim();
      if (!val) {
        setError(` Missing binding for ${codeName}`);
        return;
      }
      collected[codeName] = val;
    }
    setError('');
    E(powers)
      .endow(number, collected)
      .catch(error => {
        setError(` ${/** @type {Error} */ (error).message}`);
      });
  };

  return h(
    'div',
    { class: 'definition-message' },
    senderChip
      ? h(
          'div',
          { class: 'definition-from' },
          h('b', null, senderChip),
          ' proposes to define:',
        )
      : null,
    // TODO(inbox stage 3): Monaco `colorize` the source instead of plain text.
    h(
      'div',
      { class: 'md-paragraph md-code-fence-wrapper' },
      h(
        'pre',
        { class: 'md-code-fence' },
        h('span', { class: 'md-code-fence-language' }, 'javascript'),
        h(
          'code',
          {
            class: 'language-javascript',
            'data-language': 'javascript',
          },
          String(source),
        ),
      ),
    ),
    slotEntries.length > 0
      ? h(
          'div',
          { class: 'definition-slots' },
          h('div', { class: 'definition-slots-label' }, 'Slots to fill:'),
          h(
            'div',
            { class: 'definition-slots-list' },
            slotEntries.map(([codeName, { label }]) =>
              h(
                'div',
                { class: 'definition-slot-row', key: codeName },
                h('code', null, codeName),
                h('span', null, ' ← '),
                h('input', {
                  type: 'text',
                  class: 'definition-slot-input',
                  placeholder: label,
                  value: bindings[codeName] || '',
                  /** @param {{ target: { value: string } }} e */
                  onInput: e =>
                    setBindings({ ...bindings, [codeName]: e.target.value }),
                  onKeyDown: e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      doSubmit();
                    }
                  },
                }),
              ),
            ),
          ),
        )
      : null,
    h(
      'div',
      { class: 'definition-actions' },
      !isSent
        ? h(
            'button',
            { class: 'definition-submit', onClick: doSubmit },
            'Submit',
          )
        : null,
    ),
  );
};
harden(DefinitionBody);

/**
 * A single form field row. Owns its own value and (for secrets) show/hide
 * state. Reports value changes up via `onChange`.
 *
 * @param {object} props
 * @param {{ name: string, label?: string, example?: string, default?: string, secret?: boolean }} props.field
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 */
const FormFieldRow = ({ field, value, onChange }) => {
  const copy = useContext(ClipboardContext);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const $input = h('input', {
    type: field.secret && !shown ? 'password' : 'text',
    class: 'form-request-field-input',
    placeholder: field.example || field.name,
    autocomplete: 'off',
    'data-form-type': 'other',
    'data-lpignore': 'true',
    value,
    /** @param {{ target: { value: string } }} e */
    onInput: e => onChange(e.target.value),
  });

  return h(
    'div',
    { class: 'form-request-field-row' },
    h(
      'label',
      { class: 'form-request-field-label' },
      field.label || field.name,
    ),
    field.secret
      ? h(
          'div',
          { class: 'form-field-input-group' },
          $input,
          h(
            'button',
            {
              type: 'button',
              class: 'form-field-toggle',
              onClick: () => setShown(s => !s),
            },
            shown ? 'Hide' : 'Show',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'form-field-copy',
              onClick: () => {
                copy(value).catch(error =>
                  console.error('Failed to copy:', error),
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
            },
            copied ? 'Copied' : 'Copy',
          ),
        )
      : $input,
  );
};
harden(FormFieldRow);

/**
 * Form-request message body: description, field inputs (incl. secret toggles),
 * and a Submit button calling `submit`.
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(text: string) => void} props.setError
 */
const FormBody = ({ message, powers, setError }) => {
  const { number, isSent, senderChip } = message;
  const { description, fields } = /** @type {any} */ (message.raw);
  const fieldArray =
    /** @type {Array<{ name: string, label?: string, example?: string, default?: string, secret?: boolean }>} */ (
      Array.isArray(fields) ? fields : []
    );

  const [values, setValues] = useState(() => {
    /** @type {Record<string, string>} */
    const initial = {};
    for (const field of fieldArray) {
      if (field.default) initial[field.name] = field.default;
    }
    return initial;
  });

  const submitForm = () => {
    /** @type {Record<string, string>} */
    const collected = {};
    for (const field of fieldArray) {
      collected[field.name] = values[field.name] || '';
    }
    E(powers)
      .submit(number, collected)
      .catch(err => {
        setError(` ${/** @type {Error} */ (err).message}`);
      });
  };

  return h(
    'div',
    { class: 'form-request-message' },
    h(
      'div',
      { class: 'form-request-description' },
      h(SenderChip, { chip: senderChip }),
      `${isSent ? 'form' : 'sent form'}: ${JSON.stringify(description)}`,
    ),
    h(
      'div',
      {
        class: 'form-request-fields',
        onKeyDown: e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitForm();
          }
        },
      },
      fieldArray.map(field =>
        h(FormFieldRow, {
          key: field.name,
          field,
          value: values[field.name] || '',
          onChange: v => setValues(prev => ({ ...prev, [field.name]: v })),
        }),
      ),
    ),
    h(
      'div',
      { class: 'form-request-actions' },
      h(
        'button',
        { class: 'form-request-submit', onClick: submitForm },
        'Submit',
      ),
    ),
  );
};
harden(FormBody);

/**
 * Value message body. STAGE 3: render the looked-up value as a real Preact
 * vnode tree via {@link valueToVnodes} (mirroring `value-render.js`'s pass-style
 * cases and `.number` / `.string` / `.entries` / etc. class names — NO
 * dangerouslySetInnerHTML), plus the "Show Value" inspect button.
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} props.showValue
 * @param {Map<string, string>} props.formDescriptions
 * @param {(text: string) => void} props.setError
 */
const ValueBody = ({
  message,
  powers,
  showValue,
  formDescriptions,
  setError,
}) => {
  const { number, senderChip } = message;
  const { valueId, replyTo } = /** @type {any} */ (message.raw);
  const formTitle =
    replyTo !== undefined ? formDescriptions.get(String(replyTo)) : undefined;
  const responseText =
    formTitle !== undefined
      ? `responded to form: ${JSON.stringify(formTitle)}`
      : 'responded to form';

  // `loaded` distinguishes "still looking up" (render nothing) from a resolved
  // value (which may legitimately be `undefined`/`null`). On lookup failure we
  // fall back to a plain error string.
  const [state, setState] = useState(
    /** @type {{ loaded: boolean, value: unknown, error: string | null }} */ ({
      loaded: false,
      value: undefined,
      error: null,
    }),
  );

  useEffect(() => {
    let disposed = false;
    E(powers)
      .lookupById(valueId)
      .then(
        value => {
          if (disposed) return;
          setState({ loaded: true, value, error: null });
        },
        (/** @type {Error} */ err) => {
          if (!disposed) {
            setState({ loaded: true, value: undefined, error: err.message });
          }
        },
      );
    return () => {
      disposed = true;
    };
  }, [powers, valueId]);

  let inlineValue = null;
  if (state.error !== null) {
    inlineValue = h('span', { class: 'error' }, `Error: ${state.error}`);
  } else if (state.loaded) {
    inlineValue = valueToVnodes(state.value);
  }

  return h(
    'div',
    { class: 'form-request-message' },
    h(
      'div',
      { class: 'form-request-description' },
      h(SenderChip, { chip: senderChip }),
      responseText,
    ),
    h('div', { class: 'form-request-inline-value' }, inlineValue),
    h(
      'div',
      { class: 'form-request-actions' },
      h(
        'button',
        {
          class: 'form-request-show-result',
          title: 'Inspect the submitted value',
          onClick: () => {
            E(powers)
              .lookupById(valueId)
              .then(
                value => {
                  showValue(value, valueId, undefined, {
                    number,
                    edgeName: 'value',
                  });
                },
                (/** @type {Error} */ err) => {
                  setError(` ${err.message}`);
                },
              );
          },
        },
        'Show Value',
      ),
    ),
  );
};
harden(ValueBody);

/**
 * Dispatch a message to its type-specific body component.
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} props.showValue
 * @param {Map<string, string>} props.formDescriptions
 * @param {(text: string) => void} props.setError
 */
const MessageContent = ({
  message,
  powers,
  showValue,
  formDescriptions,
  setError,
}) => {
  switch (message.type) {
    case 'request':
      return h(RequestBody, { message, powers, setError });
    case 'package':
      return h(PackageBody, { message, powers, showValue, setError });
    case 'definition':
      return h(DefinitionBody, { message, powers, setError });
    case 'form':
      return h(FormBody, { message, powers, setError });
    case 'value':
      return h(ValueBody, {
        message,
        powers,
        showValue,
        formDescriptions,
        setError,
      });
    default:
      return null;
  }
};
harden(MessageContent);

/**
 * Inline editor for a sent package message. Pre-fills with the current text
 * (the concatenation of `raw.strings`). On Save, calls `editMessage` with
 * pet-name-resolved token bindings; on Cancel, calls `onClose`.
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(text: string) => void} props.setError
 * @param {() => void} props.onClose
 */
const EditPanel = ({ message, powers, setError, onClose }) => {
  const { number } = message;
  const { strings, names, ids } = /** @type {any} */ (message.raw);
  const stringParts = Array.isArray(strings) ? strings : [];
  const nameParts = /** @type {string[]} */ (Array.isArray(names) ? names : []);
  const idParts = /** @type {string[]} */ (Array.isArray(ids) ? ids : []);

  const [text, setText] = useState(() => stringParts.join(''));

  const doSave = () => {
    // Preserve token bindings for @edgeNames still present in the new text.
    // Resolve each kept locator to a pet name via reverseLocate; drop bindings
    // whose locator has no pet name mapping.
    const candidateNames = nameParts.filter(name => text.includes(`@${name}`));
    Promise.all(
      candidateNames.map(async name => {
        const index = nameParts.indexOf(name);
        const locator = idParts[index];
        if (!locator) return undefined;
        try {
          const petNames = await E(powers).reverseLocate(locator);
          if (Array.isArray(petNames) && petNames.length > 0) {
            return { name, petName: /** @type {string} */ (petNames[0]) };
          }
        } catch {
          // Drop binding if lookup fails.
        }
        return undefined;
      }),
    )
      .then(resolved => {
        const kept = /** @type {Array<{ name: string, petName: string }>} */ (
          resolved.filter(entry => entry !== undefined)
        );
        return E(powers).editMessage(
          number,
          [text],
          kept.map(e => e.name),
          kept.map(e => e.petName),
        );
      })
      .then(
        () => {
          onClose();
        },
        (/** @type {Error} */ err) => {
          setError(` ${err.message}`);
        },
      );
  };

  return h(
    'div',
    { class: 'edit-editor' },
    h('textarea', {
      class: 'edit-input',
      value: text,
      /** @param {{ target: { value: string } }} e */
      onInput: e => setText(e.target.value),
    }),
    h(
      'div',
      { class: 'edit-actions' },
      h(
        'button',
        { type: 'button', class: 'edit-submit', onClick: doSave },
        'Save',
      ),
      h(
        'button',
        { type: 'button', class: 'edit-cancel', onClick: onClose },
        'Cancel',
      ),
    ),
  );
};
harden(EditPanel);

/**
 * History panel: fetches `messageHistory(number)` and renders the revision
 * list with timestamps and a "(partial)" tag on not-done revisions.
 *
 * @param {object} props
 * @param {bigint} props.number
 * @param {ERef<EndoHost>} props.powers
 */
const HistoryPanel = ({ number, powers }) => {
  const [state, setState] = useState(
    /** @type {{ loading: boolean, revisions: Array<{envelope?: {strings?: string[]}, done?: boolean, date?: string}>, error: string | null }} */
    ({ loading: true, revisions: [], error: null }),
  );

  useEffect(() => {
    let disposed = false;
    E(powers)
      .messageHistory(number)
      .then(
        revisions => {
          if (!disposed) {
            setState({
              loading: false,
              revisions: /** @type {any[]} */ (
                Array.isArray(revisions) ? revisions : []
              ),
              error: null,
            });
          }
        },
        (/** @type {Error} */ err) => {
          if (!disposed) {
            setState({ loading: false, revisions: [], error: err.message });
          }
        },
      );
    return () => {
      disposed = true;
    };
  }, [number, powers]);

  if (state.loading) {
    return h('div', { class: 'history-panel' }, 'Loading history…');
  }
  if (state.error !== null) {
    return h('div', { class: 'history-panel' }, `Error: ${state.error}`);
  }

  return h(
    'div',
    { class: 'history-panel' },
    h(
      'ol',
      { class: 'history-list' },
      state.revisions.map((revision, i) => {
        const strings = Array.isArray(revision.envelope?.strings)
          ? revision.envelope.strings.join('')
          : '';
        const stamp = revision.date ? `[${revision.date}] ` : '';
        const doneTag = revision.done === false ? ' (partial)' : '';
        return h(
          'li',
          { class: 'history-item', key: i },
          `${stamp}${strings}${doneTag}`,
        );
      }),
    ),
  );
};
harden(HistoryPanel);

/**
 * A single message envelope, preserving the original class names and dataset
 * attributes so existing CSS and tests continue to match.
 *
 * @param {object} props
 * @param {InboxMessage} props.message
 * @param {ERef<EndoHost>} props.powers
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} props.showValue
 * @param {Map<string, string>} props.formDescriptions
 * @param {boolean} [props.isEdited] - True when at least one revision exists.
 */
const MessageEnvelope = ({
  message,
  powers,
  showValue,
  formDescriptions,
  isEdited,
}) => {
  const { number, isSent, isPending } = message;
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  /** @type {Record<string, string>} */
  const dataset = { 'data-number': String(number) };
  if (message.messageId) dataset['data-message-id'] = String(message.messageId);
  if (message.replyTo) dataset['data-reply-to'] = String(message.replyTo);

  // Build the envelope class: base + optional pending/edited modifiers.
  let envelopeClass = 'message-envelope';
  if (isPending) envelopeClass += ' message-envelope-pending';
  if (isEdited) envelopeClass += ' message-envelope-edited';

  return h(
    'div',
    { class: envelopeClass, ...dataset },
    h(
      'div',
      { class: isSent ? 'message sent' : 'message' },
      h(Timestamp, {
        message,
        powers,
        setError,
        isEdited,
        editOpen,
        historyOpen,
        onEditToggle: setEditOpen,
        onHistoryToggle: setHistoryOpen,
      }),
      h(
        'div',
        { class: 'message-body' },
        h('span', { style: 'color:red' }, error),
        h(MessageContent, {
          message,
          powers,
          showValue,
          formDescriptions,
          setError,
        }),
      ),
      editOpen
        ? h(EditPanel, {
            message,
            powers,
            setError,
            onClose: () => setEditOpen(false),
          })
        : null,
      historyOpen ? h(HistoryPanel, { number, powers }) : null,
    ),
  );
};
harden(MessageEnvelope);

/**
 * Translate one raw daemon message into the recipient-filtered, chip-resolved
 * `InboxMessage` the list renders, or `null` if it does not belong to this
 * conversation. Mirrors the original imperative filtering, but the self-reply
 * detection consults the in-memory message list instead of probing the DOM.
 *
 * @param {object} ctx
 * @param {any} ctx.message - The raw daemon message.
 * @param {ERef<EndoHost>} ctx.powers
 * @param {string | undefined} ctx.selfLocator
 * @param {string | null | undefined} ctx.conversationId
 * @param {string | string[] | null | undefined} ctx.conversationPetName
 * @param {() => InboxMessage[]} ctx.getMessages - Current list, for self-reply
 *   thread detection.
 * @param {Map<string, string>} ctx.formDescriptions
 * @returns {Promise<InboxMessage | null>}
 */
const toInboxMessage = async ({
  message,
  powers,
  selfLocator,
  conversationId,
  conversationPetName,
  getMessages,
  formDescriptions,
}) => {
  const { number, from: fromId, to: toId, date, dismissed } = message;
  const isSent = locatorsMatch(fromId, selfLocator);

  if (conversationId) {
    const otherPartyId = isSent ? toId : fromId;
    if (!locatorsMatch(otherPartyId, conversationId)) {
      // Self-to-self messages (e.g. endow result delivery) belong to a
      // conversation when their replyTo references a message already in this
      // conversation thread. The original probed the DOM for the referenced
      // envelope; instead look it up in component STATE.
      const replyTo =
        'replyTo' in message
          ? /** @type {string} */ (message.replyTo)
          : undefined;
      const current = getMessages();
      const isSelfReplyInThread =
        locatorsMatch(fromId, selfLocator) &&
        locatorsMatch(toId, selfLocator) &&
        replyTo &&
        current.some(m => String(m.messageId) === String(replyTo));
      let matchesByPetName = false;
      if (!isSelfReplyInThread && conversationPetName) {
        // ID didn't match directly — try matching by pet name (handles
        // peer/remote/guest formula indirection).
        const names = await E(powers).reverseLocate(otherPartyId);
        const leafName = Array.isArray(conversationPetName)
          ? conversationPetName[conversationPetName.length - 1]
          : conversationPetName;
        matchesByPetName =
          Array.isArray(names) &&
          names.includes(/** @type {import('@endo/daemon').Name} */ (leafName));
      }
      if (!isSelfReplyInThread && !matchesByPetName) {
        // Message does not belong to this conversation; skip it.
        return null;
      }
    }
  }

  // Resolve the sender/recipient chip name (async via reverseLocate).
  /** @type {string | null} */
  let senderChip = null;
  if (!isSent) {
    const fromNames = await E(powers).reverseLocate(fromId);
    const fromName = fromNames?.[0];
    if (fromName !== undefined) senderChip = `@${fromName}`;
  } else {
    const toNames = await E(powers).reverseLocate(toId);
    const toName = toNames?.[0];
    if (toName !== undefined) senderChip = `@${toName}`;
  }

  // Record form descriptions so value messages can title their response.
  if (message.type === 'form' && message.messageId !== undefined) {
    formDescriptions.set(
      String(message.messageId),
      String(message.description),
    );
  }

  // `done` defaults to true on legacy emissions; only emissions explicitly
  // marked `done: false` are partial submissions.
  const isPending =
    'done' in message &&
    /** @type {{ done?: boolean }} */ (message).done === false;

  return harden({
    number,
    type: String(message.type),
    date,
    from: fromId,
    to: toId,
    messageId:
      message.messageId !== undefined ? String(message.messageId) : undefined,
    replyTo:
      'replyTo' in message && message.replyTo !== undefined
        ? String(message.replyTo)
        : undefined,
    dismissed,
    isSent,
    isPending,
    senderChip,
    raw: /** @type {Record<string, unknown>} */ (message),
  });
};
harden(toInboxMessage);

/**
 * Root component: owns the displayed message list, the `followMessages`
 * subscription (in a `useEffect`, so `dispatch` is in scope with no
 * host/effect ordering race), recipient filtering, and the envelopes.
 *
 * Scroll geometry stays with the trusted host: `measureNearBottom()` and
 * `scrollToBottom()` are callbacks the entry closure supplies (they close over
 * the host's own scroll container). This component never receives or touches a
 * host DOM node, so it is authority-free over the DOM.
 *
 * @param {object} props
 * @param {ERef<EndoHost>} props.powers
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} props.showValue
 * @param {Map<string, string>} props.formDescriptions
 * @param {() => Promise<boolean>} props.measureNearBottom - Resolves true when
 *   the host container is scrolled within ~80px of the bottom (read at an
 *   animation frame by the trusted host).
 * @param {() => void} props.scrollToBottom - Pins the host container to the
 *   bottom (host-owned imperative scroll).
 * @param {() => boolean} props.isLive - Returns false once the host has
 *   detached this view (chat.js rebuilds the container rather than always
 *   calling dispose); the subscription stops dispatching once it returns false.
 * @param {string | null | undefined} props.conversationId
 * @param {string | string[] | null | undefined} props.conversationPetName
 */
export const InboxRoot = ({
  powers,
  showValue,
  formDescriptions,
  measureNearBottom,
  scrollToBottom,
  isLive,
  conversationId,
  conversationPetName,
}) => {
  const [messages, dispatch] = useReducer(
    messagesReducer,
    /** @type {InboxMessage[]} */ ([]),
  );

  // Track which message numbers have been revised (editedNumbers). When the
  // daemon re-emits a number the reducer replaces the envelope in place; we
  // additionally set the number in `editedNumbers` so the history-button
  // affordance can appear for the first time on that revision.
  const [editedNumbers, setEditedNumbers] = useState(
    /** @type {Set<string>} */ (new Set()),
  );

  // Keep a live ref to the current list so the (single-run) subscription effect
  // can consult it for self-reply-in-thread detection without re-subscribing.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    // A disposed flag guards every async continuation: the subscription loop
    // and each per-message dismissal callback must not dispatch after teardown.
    // `isLive()` additionally catches host teardown-by-detach, where chat.js
    // rebuilds `$parent` without calling this effect's cleanup.
    let localDisposed = false;
    const disposed = () => localDisposed || !isLive();

    const run = async () => {
      const selfLocator = await E(powers).locate('@self');
      if (disposed()) return;

      for await (const message of iterateReader(
        /** @type {Parameters<typeof iterateReader>[0]} */ (
          /** @type {unknown} */ (E(powers).followMessages())
        ),
        // Prefetch a window of messages so the backlog streams without a
        // round-trip acknowledgement per message.
        { buffer: 64 },
      )) {
        if (disposed()) break;

        // Ask the host (which owns the scroll container) whether we were near
        // the bottom before this envelope renders, so short messages don't make
        // the user "lose" auto-scroll. 80px tolerance lives in the host callback.
        // eslint-disable-next-line no-await-in-loop
        const wasAtEnd = await measureNearBottom();
        if (disposed()) break;

        // eslint-disable-next-line no-await-in-loop
        const inboxMessage = await toInboxMessage({
          message,
          powers,
          selfLocator,
          conversationId,
          conversationPetName,
          getMessages: () => messagesRef.current,
          formDescriptions,
        });
        if (disposed()) break;
        if (!inboxMessage) {
          // eslint-disable-next-line no-continue
          continue;
        }

        // Check before dispatch: if the number is already in the list, this
        // is a revision. The reducer's 'add' branch replaces in place; we
        // separately record the number in editedNumbers so the history-button
        // becomes visible.
        const numberKey = String(inboxMessage.number);
        const isRevision = messagesRef.current.some(
          m => String(m.number) === numberKey,
        );

        dispatch({ type: 'add', message: inboxMessage });

        if (isRevision) {
          setEditedNumbers(prev => {
            const next = new Set(prev);
            next.add(numberKey);
            return next;
          });
        }

        const { number, date, isSent, dismissed } = inboxMessage;

        // Remove the envelope when the message is dismissed.
        Promise.resolve(dismissed).then(
          () => {
            if (!disposed()) {
              dispatch({ type: 'remove', number });
              setEditedNumbers(prev => {
                const next = new Set(prev);
                next.delete(String(number));
                return next;
              });
            }
          },
          () => {},
        );

        if (
          !isSent &&
          !isRevision &&
          Date.now() - new Date(date).getTime() < 2000
        ) {
          playChime();
        }

        // Defer the scroll until after Preact has flushed the new envelope.
        if (wasAtEnd) {
          requestAnimationFrame(() => {
            if (!disposed()) scrollToBottom();
          });
        }
      }
    };

    run().catch(err => {
      if (!disposed()) {
        console.error('[inbox] subscription failed:', err);
      }
    });

    return () => {
      localDisposed = true;
    };
  }, [powers, conversationId, conversationPetName]);

  return h(
    Fragment,
    null,
    messages.map(message =>
      h(MessageEnvelope, {
        key: String(message.number),
        message,
        powers,
        showValue,
        formDescriptions,
        isEdited: editedNumbers.has(String(message.number)),
      }),
    ),
  );
};
harden(InboxRoot);
