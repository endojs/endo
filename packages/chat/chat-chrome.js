// @ts-check

// Confined Preact views for the chat shell's chrome regions. These used to be
// imperative `innerHTML` + `createElement` blocks inside `chat.js`. They render
// through the sanitizing `renderConfined`, so attacker-influenced values (pet
// names, message text) reach the DOM as escaped text children rather than
// interpolated `innerHTML`. `chat.js` stays the trusted imperative root: it
// owns the powers, prompts, and navigation, and bridges to these views through
// plain props and small controller objects (the same setter-bridge pattern the
// chat bar's modeline uses).

import harden from '@endo/harden';

import {
  Fragment,
  h,
  renderConfined,
  useEffect,
  useRef,
  useState,
} from './setup-preact-container.js';

// ---------------------------------------------------------------------------
// Profile breadcrumb bar
// ---------------------------------------------------------------------------

/**
 * The profile breadcrumb trail: "Home › a › b". The last segment (or "Home"
 * when the path is empty) is marked `current`. Clicking a crumb navigates to
 * that depth.
 *
 * @param {object} props
 * @param {string[]} props.path
 * @param {(depth: number) => void} props.onNavigate
 */
const ProfileBar = ({ path, onNavigate }) => {
  /** @type {import('preact').ComponentChild[]} */
  const children = [
    h(
      'span',
      {
        key: 'home',
        class:
          path.length === 0
            ? 'profile-breadcrumb current'
            : 'profile-breadcrumb',
        onClick: () => onNavigate(0),
      },
      'Home',
    ),
  ];
  for (let i = 0; i < path.length; i += 1) {
    const depth = i + 1;
    children.push(
      h('span', { key: `sep-${i}`, class: 'profile-separator' }, '›'),
      h(
        'span',
        {
          key: `crumb-${i}`,
          class:
            i === path.length - 1
              ? 'profile-breadcrumb current'
              : 'profile-breadcrumb',
          onClick: () => onNavigate(depth),
        },
        path[i],
      ),
    );
  }
  return h(Fragment, null, ...children);
};
harden(ProfileBar);

/**
 * Mount (or reconcile) the profile breadcrumb bar into its dedicated host
 * element. Drop-in replacement for the former imperative `renderProfileBar`.
 *
 * @param {HTMLElement} $profileBar
 * @param {string[]} path
 * @param {(depth: number) => void} onNavigate
 */
export const renderProfileBar = ($profileBar, path, onNavigate) => {
  renderConfined(h(ProfileBar, { path, onNavigate }), $profileBar);
};
harden(renderProfileBar);

// ---------------------------------------------------------------------------
// Mention notification area
// ---------------------------------------------------------------------------

/**
 * A bridge the host populates to push invite prompts and toasts into the
 * confined {@link MentionNotifyArea}.
 *
 * @typedef {object} MentionNotifyController
 * @property {(opts: { petName: string, onYes: () => Promise<void> }) => void} [showInvitePrompt]
 * @property {(petName: string) => (() => void)} [showToast] Returns a dismiss
 *   function that removes the toast early (e.g. when the deferred send fails).
 */

/**
 * One "Invite & notify `@name`?" prompt. Owns its send lifecycle locally: the
 * Yes button disables and shows "Sending…" while `onYes` runs, then either
 * collapses to a "Notification sent" confirmation (auto-removed after 3s) or
 * re-enables and surfaces the error.
 *
 * @param {object} props
 * @param {string} props.petName
 * @param {() => Promise<void>} props.onYes
 * @param {() => void} props.onRemove
 */
const InvitePrompt = ({ petName, onYes, onRemove }) => {
  const [status, setStatus] = useState(
    /** @type {'idle' | 'sending' | 'sent'} */ ('idle'),
  );

  if (status === 'sent') {
    return h(
      'div',
      { class: 'mention-notify-prompt' },
      h(
        'span',
        { class: 'mention-notify-text mention-notify-sent' },
        '✓ Notification sent to ',
        h('strong', null, `@${petName}`),
      ),
    );
  }

  const onYesClick = async () => {
    setStatus('sending');
    try {
      await onYes();
      setStatus('sent');
      setTimeout(onRemove, 3000);
    } catch (err) {
      setStatus('idle');
      window.alert(
        `Failed to send notification: ${/** @type {Error} */ (err).message}`,
      );
    }
  };

  return h(
    'div',
    { class: 'mention-notify-prompt' },
    h(
      'span',
      { class: 'mention-notify-text' },
      '📨 Invite & notify ',
      h('strong', null, `@${petName}`),
      '?',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'mention-notify-yes',
        disabled: status === 'sending',
        onClick: onYesClick,
      },
      status === 'sending' ? 'Sending…' : 'Yes, invite',
    ),
    h(
      'button',
      { type: 'button', class: 'mention-notify-no', onClick: onRemove },
      'No',
    ),
  );
};
harden(InvitePrompt);

/**
 * A passive "✓ Notified `@name`" toast.
 *
 * @param {object} props
 * @param {string} props.petName
 */
const Toast = ({ petName }) =>
  h(
    'div',
    { class: 'mention-notify-prompt' },
    h(
      'span',
      { class: 'mention-notify-text mention-notify-sent' },
      '✓ Notified ',
      h('strong', null, `@${petName}`),
    ),
  );
harden(Toast);

/**
 * The stack of mention-notify prompts and toasts. The host drives it through
 * `controller.showInvitePrompt` / `controller.showToast`, wired up on mount.
 *
 * @param {object} props
 * @param {MentionNotifyController} props.controller
 */
const MentionNotifyArea = ({ controller }) => {
  const [items, setItems] = useState(
    /** @type {Array<{ id: string, kind: 'invite' | 'toast', petName: string, onYes?: () => Promise<void> }>} */ ([]),
  );
  const nextId = useRef(0);

  useEffect(() => {
    const remove = id => setItems(prev => prev.filter(it => it.id !== id));
    const add = item => {
      nextId.current += 1;
      const id = `n${nextId.current}`;
      setItems(prev => [...prev, { ...item, id }]);
      return id;
    };

    controller.showInvitePrompt = ({ petName, onYes }) => {
      add({ kind: 'invite', petName, onYes });
    };
    controller.showToast = petName => {
      const id = add({ kind: 'toast', petName });
      const timer = setTimeout(() => remove(id), 3000);
      return () => {
        clearTimeout(timer);
        remove(id);
      };
    };

    return () => {
      delete controller.showInvitePrompt;
      delete controller.showToast;
    };
  }, [controller]);

  return h(
    Fragment,
    null,
    ...items.map(item =>
      item.kind === 'invite'
        ? h(InvitePrompt, {
            key: item.id,
            petName: item.petName,
            onYes: /** @type {() => Promise<void>} */ (item.onYes),
            onRemove: () =>
              setItems(prev => prev.filter(it => it.id !== item.id)),
          })
        : h(Toast, { key: item.id, petName: item.petName }),
    ),
  );
};
harden(MentionNotifyArea);

/**
 * Mount the mention-notify area into `$area` and return the controller the
 * host uses to push prompts and toasts.
 *
 * @param {HTMLElement} $area
 * @returns {MentionNotifyController}
 */
export const mountMentionNotifyArea = $area => {
  /** @type {MentionNotifyController} */
  const controller = {};
  renderConfined(h(MentionNotifyArea, { controller }), $area);
  return controller;
};
harden(mountMentionNotifyArea);

// ---------------------------------------------------------------------------
// Sidebar inbox
// ---------------------------------------------------------------------------

/**
 * @typedef {object} InboxEntry
 * @property {bigint} number
 * @property {string} text
 * @property {string[]} names
 */

/**
 * @typedef {object} InboxHandlers
 * @property {() => Promise<{ entries: InboxEntry[], totalCount: number }>} loadEntries
 *   Fetches the adoptable inbox entries. `totalCount` is the total message
 *   count, used to distinguish "no messages" from "nothing adoptable".
 * @property {(number: bigint, name: string) => Promise<boolean>} onAdopt
 *   Runs the adopt flow (prompt + adopt). Resolves true when the inbox changed
 *   and should be reloaded.
 * @property {(number: bigint, name: string) => Promise<boolean>} onJoin
 *   Runs the join-as-channel flow. Resolves true when the inbox changed.
 */

/**
 * "Join as Channel" button with a local in-flight state, mirroring the former
 * imperative `disabled` + "Joining…" toggle.
 *
 * @param {object} props
 * @param {() => Promise<void>} props.onJoin
 */
const JoinButton = ({ onJoin }) => {
  const [joining, setJoining] = useState(false);
  return h(
    'button',
    {
      class: 'inbox-join-channel-btn',
      disabled: joining,
      onClick: async () => {
        setJoining(true);
        try {
          await onJoin();
        } finally {
          setJoining(false);
        }
      },
    },
    joining ? 'Joining…' : 'Join as Channel',
  );
};
harden(JoinButton);

/**
 * A single adoptable inbox entry: optional text plus an adopt / join button row
 * per embedded name.
 *
 * @param {object} props
 * @param {InboxEntry} props.entry
 * @param {(name: string) => Promise<void>} props.onAdopt
 * @param {(name: string) => Promise<void>} props.onJoin
 */
const InboxEntryView = ({ entry, onAdopt, onJoin }) =>
  h(
    'div',
    { class: 'sidebar-inbox-entry' },
    entry.text ? h('div', { class: 'sidebar-inbox-text' }, entry.text) : null,
    ...entry.names.map(name =>
      h(
        'div',
        { key: name, class: 'inbox-btn-row' },
        h(
          'button',
          { class: 'inbox-adopt-btn', onClick: () => onAdopt(name) },
          `Adopt “${name}”`,
        ),
        h(JoinButton, { onJoin: () => onJoin(name) }),
      ),
    ),
  );
harden(InboxEntryView);

/**
 * The collapsible sidebar inbox. Loads lazily on first expand; reloads after a
 * successful adopt or join.
 *
 * @param {object} props
 * @param {InboxHandlers} props.handlers
 */
const InboxSection = ({ handlers }) => {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(
    /** @type {'idle' | 'loading' | 'loaded' | 'error'} */ ('idle'),
  );
  const [entries, setEntries] = useState(/** @type {InboxEntry[]} */ ([]));
  const [totalCount, setTotalCount] = useState(0);
  const loadedRef = useRef(false);

  const refresh = async () => {
    setStatus('loading');
    try {
      const result = await handlers.loadEntries();
      setEntries(result.entries);
      setTotalCount(result.totalCount);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
    loadedRef.current = true;
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loadedRef.current) {
      refresh().catch(() => {});
    }
  };

  /** @param {Promise<boolean>} changed */
  const afterAction = async changed => {
    if (await changed) {
      loadedRef.current = false;
      await refresh();
    }
  };

  /** @type {import('preact').ComponentChild} */
  let body;
  if (status === 'idle') {
    // Not yet expanded/loaded — the body stays empty, as the imperative
    // version did until `loadInbox` first ran.
    body = null;
  } else if (status === 'loading') {
    body = 'Loading…';
  } else if (status === 'error') {
    body = 'Unable to load inbox.';
  } else if (entries.length === 0) {
    body = h(
      'div',
      { class: 'sidebar-inbox-empty' },
      totalCount === 0 ? 'No messages yet.' : 'No adoptable values.',
    );
  } else {
    body = h(
      Fragment,
      null,
      ...entries.map((entry, i) =>
        h(InboxEntryView, {
          key: `${entry.number}-${i}`,
          entry,
          onAdopt: name => afterAction(handlers.onAdopt(entry.number, name)),
          onJoin: name => afterAction(handlers.onJoin(entry.number, name)),
        }),
      ),
    );
  }

  return h(
    'div',
    { class: 'sidebar-inbox-section' },
    h(
      'div',
      { class: 'sidebar-inbox-header', onClick: toggle },
      h('span', { class: 'sidebar-inbox-toggle' }, expanded ? '▼' : '▶'),
      ' ',
      h('span', null, 'Inbox'),
    ),
    h(
      'div',
      {
        class: 'sidebar-inbox-body',
        style: expanded ? undefined : 'display: none',
      },
      body,
    ),
  );
};
harden(InboxSection);

/**
 * Mount the sidebar inbox into `$mount`.
 *
 * @param {HTMLElement} $mount
 * @param {InboxHandlers} handlers
 */
export const mountInboxSection = ($mount, handlers) => {
  renderConfined(h(InboxSection, { handlers }), $mount);
};
harden(mountInboxSection);
