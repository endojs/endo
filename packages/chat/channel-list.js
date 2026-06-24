// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  Fragment,
  h,
  renderConfined,
  unmount,
  useCallback,
  useEffect,
  useReducer,
  useState,
} from './setup-preact-container.js';

// Standalone channel list. This is the channel-mode behavior that used to be
// woven through inventory.js (behind `channelMode`) and then through
// channel-sidebar.js's imperative `decorateItem`, extracted here as its own
// self-contained Preact component that owns its enumeration, state, and
// rendering. It depends on nothing in inventory/ — it probes pet names itself,
// keeps only `type === 'channel'` ones, and renders them with their own
// independent CSS classes (`.channel-list-*`, not `.pet-item-*`).
//
// Reorder is idiomatic Preact (a `dragOverIndex` in state plus a rendered
// drop-indicator element) rather than imperative DOM measurement, so the list
// owns no detached DOM. The drag carries string-only data (`text/plain` = the
// channel name) through the sanitizing `SafeDataTransfer` facade, which is all
// reorder needs.

/**
 * @typedef {'chat' | 'forum' | 'outliner' | 'microblog'} ChannelViewMode
 */

/**
 * @typedef {object} ChannelBookmark
 * @property {string} key
 * @property {string} channelPetName
 * @property {string} label
 */

/**
 * @typedef {object} ChannelListOptions
 * @property {(channelPetName: string) => void} [onSelectChannel]
 * @property {string | null} [activeChannelPetName]
 * @property {string[]} [channelOrder]
 * @property {(order: string[]) => void} [onChannelReorder]
 * @property {ChannelBookmark[]} [bookmarks]
 * @property {(channelPetName: string, threadKey: string) => void} [onSelectBookmark]
 * @property {(bookmark: ChannelBookmark) => void} [onRemoveBookmark]
 * @property {ChannelViewMode} [viewMode]
 * @property {(mode: ChannelViewMode) => void} [onViewModeChange]
 */

/** @type {ChannelViewMode[]} */
const VIEW_MODES = harden(['chat', 'forum', 'outliner', 'microblog']);

/**
 * Order the discovered channel names. When a `channelOrder` is supplied, names
 * present in it sort by their position there; names absent from it keep their
 * discovery order and trail the ordered ones. Without a `channelOrder`, the
 * discovery order is preserved as-is.
 *
 * Discovery order here is insertion order (oldest first) rather than the old
 * sidebar's newest-first prepend; this is the documented simplification — the
 * persisted `channelOrder` is the source of truth for arrangement, and the
 * unordered tail is stable rather than reversed.
 *
 * @param {string[]} names - Channel pet names in discovery order.
 * @param {string[] | undefined} channelOrder
 * @returns {string[]}
 */
const orderChannels = (names, channelOrder) => {
  if (!channelOrder || channelOrder.length === 0) {
    return names;
  }
  const indexOf = name => {
    const i = channelOrder.indexOf(name);
    return i < 0 ? Infinity : i;
  };
  return [...names].sort((a, b) => {
    const ia = indexOf(a);
    const ib = indexOf(b);
    if (ia !== ib) return ia - ib;
    // Stable for the unordered tail: fall back to discovery order.
    return names.indexOf(a) - names.indexOf(b);
  });
};
harden(orderChannels);

/**
 * The per-channel view-mode menu (⋮). State-driven and rendered inline; it
 * dismisses on outside click or Escape via a document-level listener installed
 * only while open.
 *
 * @param {object} props
 * @param {ChannelViewMode} [props.viewMode]
 * @param {(mode: ChannelViewMode) => void} props.onViewModeChange
 */
const ChannelMenu = ({ viewMode, onViewModeChange }) => {
  const [open, setOpen] = useState(false);

  return h(
    'span',
    { class: 'channel-list-menu-wrap' },
    h(
      'button',
      {
        class: 'channel-list-menu-btn',
        title: 'Channel options',
        /** @param {{ stopPropagation: () => void }} e */
        onClick: e => {
          e.stopPropagation();
          setOpen(v => !v);
        },
      },
      '⋮',
    ),
    // A focusable full-screen backdrop dismisses the menu on an outside click or
    // Escape, declaratively, instead of `document`-level listeners. `autofocus`
    // lets the keydown reach it even with nothing else focused.
    open
      ? h('div', {
          class: 'channel-list-menu-backdrop',
          tabindex: -1,
          autofocus: true,
          onClick: () => setOpen(false),
          /** @param {{ key?: string }} e */
          onKeyDown: e => {
            if (e.key === 'Escape') setOpen(false);
          },
        })
      : null,
    open
      ? h(
          'div',
          {
            class: 'channel-list-menu',
            /** @param {{ stopPropagation: () => void }} e */
            onClick: e => e.stopPropagation(),
          },
          VIEW_MODES.map(mode =>
            h(
              'button',
              {
                key: mode,
                class: ['channel-list-menu-item', mode === viewMode && 'active']
                  .filter(Boolean)
                  .join(' '),
                onClick: () => {
                  setOpen(false);
                  onViewModeChange(mode);
                },
              },
              mode.charAt(0).toUpperCase() + mode.slice(1),
            ),
          ),
        )
      : null,
  );
};
harden(ChannelMenu);

/**
 * A single bookmarked thread row beneath its channel. Left-click selects it;
 * right-click opens a state-driven "Remove bookmark" context menu.
 *
 * @param {object} props
 * @param {ChannelBookmark} props.bookmark
 * @param {(channelPetName: string, threadKey: string) => void} [props.onSelectBookmark]
 * @param {(bookmark: ChannelBookmark) => void} [props.onRemoveBookmark]
 */
const ChannelBookmarkRow = ({
  bookmark,
  onSelectBookmark,
  onRemoveBookmark,
}) => {
  const [menuPos, setMenuPos] = useState(
    /** @type {{ x: number, y: number } | null} */ (null),
  );

  return h(
    'div',
    {
      class: 'channel-bookmark',
      title: `Thread #${bookmark.key} in ${bookmark.channelPetName}`,
      onClick: onSelectBookmark
        ? () => onSelectBookmark(bookmark.channelPetName, bookmark.key)
        : undefined,
      /** @param {{ preventDefault: () => void, clientX: number, clientY: number }} e */
      onContextMenu: onRemoveBookmark
        ? e => {
            e.preventDefault();
            setMenuPos({ x: e.clientX, y: e.clientY });
          }
        : undefined,
    },
    h('span', { class: 'channel-bookmark-label' }, `★ ${bookmark.label}`),
    // Focusable backdrop dismisses the context menu on an outside click or
    // Escape (no `document` listeners). stopPropagation keeps the dismissing
    // click from also selecting the bookmark row.
    menuPos && onRemoveBookmark
      ? h('div', {
          class: 'channel-list-menu-backdrop',
          tabindex: -1,
          autofocus: true,
          /** @param {{ stopPropagation: () => void }} e */
          onClick: e => {
            e.stopPropagation();
            setMenuPos(null);
          },
          /** @param {{ key?: string }} e */
          onKeyDown: e => {
            if (e.key === 'Escape') setMenuPos(null);
          },
        })
      : null,
    menuPos && onRemoveBookmark
      ? h(
          'div',
          {
            class: 'channel-bookmark-menu',
            style: `left:${menuPos.x}px;top:${menuPos.y}px`,
            /** @param {{ stopPropagation: () => void }} e */
            onClick: e => e.stopPropagation(),
          },
          h(
            'button',
            {
              class: 'channel-bookmark-menu-item',
              onClick: () => {
                setMenuPos(null);
                onRemoveBookmark(bookmark);
              },
            },
            'Remove bookmark',
          ),
        )
      : null,
  );
};
harden(ChannelBookmarkRow);

/**
 * One channel row: name (selectable), the ⋮ view-mode menu, its bookmarked
 * threads, drag-to-reorder, and a drop indicator above the row when something
 * is being dragged onto its gap.
 *
 * @param {object} props
 * @param {string} props.name
 * @param {number} props.index
 * @param {boolean} props.active
 * @param {boolean} props.dragging
 * @param {boolean} props.dropBefore - Render a drop indicator above this row.
 * @param {ChannelBookmark[]} props.bookmarks
 * @param {ChannelListOptions} props.options
 * @param {(index: number) => void} props.onDragStartRow
 * @param {(index: number) => void} props.onDragOverRow
 * @param {() => void} props.onDragEndRow
 * @param {(index: number) => void} props.onDropRow
 */
const ChannelRow = ({
  name,
  index,
  active,
  dragging,
  dropBefore,
  bookmarks,
  options,
  onDragStartRow,
  onDragOverRow,
  onDragEndRow,
  onDropRow,
}) => {
  const {
    onSelectChannel,
    onSelectBookmark,
    onRemoveBookmark,
    viewMode,
    onViewModeChange,
  } = options;

  return h(
    Fragment,
    null,
    dropBefore ? h('div', { class: 'channel-list-drop-indicator' }) : null,
    h(
      'div',
      {
        class: ['channel-list-row', active && 'active', dragging && 'dragging']
          .filter(Boolean)
          .join(' '),
        draggable: true,
        /** @param {{ dataTransfer?: { setData: (t: string, v: string) => void, effectAllowed: string } }} e */
        onDragStart: e => {
          if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', name);
            e.dataTransfer.effectAllowed = 'move';
          }
          onDragStartRow(index);
        },
        /** @param {{ preventDefault: () => void, dataTransfer?: { dropEffect: string } }} e */
        onDragOver: e => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          onDragOverRow(index);
        },
        /** @param {{ preventDefault: () => void }} e */
        onDrop: e => {
          e.preventDefault();
          onDropRow(index);
        },
        onDragEnd: () => onDragEndRow(),
      },
      h(
        'span',
        {
          class: 'channel-list-name',
          title: 'Switch to this channel',
          onClick: onSelectChannel ? () => onSelectChannel(name) : undefined,
        },
        name,
      ),
      onViewModeChange ? h(ChannelMenu, { viewMode, onViewModeChange }) : null,
    ),
    bookmarks.length > 0
      ? h(
          'div',
          { class: 'channel-bookmark-list' },
          bookmarks.map(bm =>
            h(ChannelBookmarkRow, {
              key: bm.key,
              bookmark: bm,
              onSelectBookmark,
              onRemoveBookmark,
            }),
          ),
        )
      : null,
  );
};
harden(ChannelRow);

/**
 * Reducer over the discovered channel set. Adds and removes are reported by the
 * `followNameChanges` subscription after a per-name `locate` probe confirms
 * `type === 'channel'`. Order here is discovery order; visual ordering is
 * applied at render time via `orderChannels`.
 *
 * @param {string[]} state
 * @param {{ type: 'add', name: string } | { type: 'remove', name: string }} action
 * @returns {string[]}
 */
const channelsReducer = (state, action) => {
  if (action.type === 'add') {
    if (state.includes(action.name)) return state;
    return [...state, action.name];
  }
  if (action.type === 'remove') {
    if (!state.includes(action.name)) return state;
    return state.filter(n => n !== action.name);
  }
  return state;
};
harden(channelsReducer);

/**
 * Root component: owns the `followNameChanges` subscription (in `useEffect`),
 * keeps the discovered channel set in a reducer, and renders the ordered rows
 * with their reorder drag state.
 *
 * @param {object} props
 * @param {ERef<EndoHost>} props.powers
 * @param {ChannelListOptions} props.options
 * @param {{ setActive?: (name: string | null) => void }} props.controller
 *   - Mutable handle the host uses to update the active highlight live (e.g.
 *   when the user switches channels) without re-mounting the list.
 */
const ChannelList = ({ powers, options, controller }) => {
  const [channels, dispatch] = useReducer(
    channelsReducer,
    /** @type {string[]} */ ([]),
  );
  // Active channel, initialized from the option and thereafter controllable
  // from outside via `controller.setActive`, so a channel switch updates the
  // highlight without a full re-mount.
  const [active, setActive] = useState(
    /** @type {string | null} */ (options.activeChannelPetName ?? null),
  );
  useEffect(() => {
    controller.setActive = setActive;
    return () => {
      if (controller.setActive === setActive) delete controller.setActive;
    };
  }, [controller]);
  // Reorder drag state: which row is the source and where the indicator sits.
  const [drag, setDrag] = useState(
    /** @type {{ from: number, over: number } | null} */ (null),
  );

  useEffect(() => {
    // A disposed flag guards every async continuation: the subscription loop
    // and each per-name `locate` probe must not dispatch after teardown.
    let disposed = false;

    const run = async () => {
      // The daemon's name-change reader is loosely typed (Passable); narrow it
      // to the add/remove shape at the boundary, as the rest of the app does.
      const nameChanges = iterateReader(
        /** @type {Parameters<typeof iterateReader>[0]} */ (
          /** @type {unknown} */ (E(powers).followNameChanges())
        ),
        // Prefetch a window of values so the channel-name backlog streams
        // without a round-trip acknowledgement per name.
        { buffer: 64 },
      );
      for await (const rawChange of nameChanges) {
        if (disposed) break;
        const change = /** @type {{ add?: string, remove?: string }} */ (
          rawChange
        );
        if (change.add !== undefined) {
          const name = change.add;
          // Probe per-name without blocking the loop on slow/unrelated names.
          E(powers)
            .locate(name)
            .then(locator => {
              if (disposed || !locator) return;
              const type = new URL(
                /** @type {string} */ (locator),
              ).searchParams.get('type');
              if (type === 'channel') {
                dispatch({ type: 'add', name });
              }
            })
            .catch(() => {
              // Name may have been removed before its locator resolved.
            });
        } else if (change.remove !== undefined) {
          dispatch({ type: 'remove', name: change.remove });
        }
      }
    };

    run().catch(err => {
      if (!disposed) {
        console.error('[channel-list] subscription failed:', err);
      }
    });

    return () => {
      disposed = true;
    };
  }, [powers]);

  const { channelOrder, bookmarks, onChannelReorder } = options;

  const ordered = orderChannels(channels, channelOrder);

  /** @type {Map<string, ChannelBookmark[]>} */
  const bookmarksByChannel = new Map();
  for (const bm of bookmarks || []) {
    const list = bookmarksByChannel.get(bm.channelPetName);
    if (list) {
      list.push(bm);
    } else {
      bookmarksByChannel.set(bm.channelPetName, [bm]);
    }
  }

  const onDragStartRow = useCallback(
    /** @param {number} from */ from => setDrag({ from, over: from }),
    [],
  );
  const onDragOverRow = useCallback(
    /** @param {number} over */ over =>
      setDrag(d => (d && d.over !== over ? { ...d, over } : d)),
    [],
  );
  const onDragEndRow = useCallback(() => setDrag(null), []);
  const onDropRow = useCallback(
    /** @param {number} to */ to => {
      setDrag(current => {
        if (current && current.from !== to) {
          const next = [...ordered];
          const [moved] = next.splice(current.from, 1);
          // Dropping onto a row inserts before it; splicing out the source
          // first already shifts later indices, so `to` lands correctly.
          next.splice(to, 0, moved);
          if (onChannelReorder) onChannelReorder(next);
        }
        return null;
      });
    },
    [ordered, onChannelReorder],
  );

  return h(
    'div',
    { class: 'channel-list' },
    ordered.map((name, index) =>
      h(ChannelRow, {
        key: name,
        name,
        index,
        active: active != null && name === active,
        dragging: drag != null && drag.from === index,
        dropBefore: drag != null && drag.over === index && drag.from !== index,
        bookmarks: bookmarksByChannel.get(name) || [],
        options,
        onDragStartRow,
        onDragOverRow,
        onDragEndRow,
        onDropRow,
      }),
    ),
  );
};
harden(ChannelList);

/**
 * Mount the standalone channel list into `$container`, independent of the
 * inventory. Returns `cleanup()` (stops the subscription via the root
 * component's `useEffect` teardown and unmounts the Preact tree) and
 * `setActiveChannel(name)` to update the active highlight live.
 *
 * @param {HTMLElement} $container - The `.pet-list` (or any) host element.
 * @param {ERef<EndoHost>} powers - Powers for the current channel-space profile.
 * @param {ChannelListOptions} [options]
 * @returns {{ cleanup: () => void, setActiveChannel: (name: string | null) => void }}
 */
export const channelListComponent = ($container, powers, options = {}) => {
  // Mutable bridge to the root component's active-channel setter (populated by
  // the component's effect). Intentionally NOT hardened — the component writes
  // its setter onto it.
  /** @type {{ setActive?: (name: string | null) => void }} */
  const controller = {};
  renderConfined(h(ChannelList, { powers, options, controller }), $container);
  return harden({
    cleanup: () => {
      // Unmount runs the root component's useEffect teardown, which sets the
      // disposed flag and aborts the followNameChanges subscription.
      unmount($container);
    },
    /** @param {string | null} name */
    setActiveChannel: name => {
      if (controller.setActive) controller.setActive(name);
    },
  });
};
harden(channelListComponent);
