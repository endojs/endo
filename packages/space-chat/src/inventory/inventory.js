// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { isSpecialName } from '@endo/daemon/pet-name.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { lookupPath } from '@endo/spaces-util';

import { h } from 'preact';
import { useEffect, useReducer, useState } from 'preact/hooks';

import { DropMenu } from './drop-menu.js';
import { ItemActions } from './item-actions.js';
import { ItemDisclosure } from './item-disclosure.js';
import { ItemLabel } from './item-label.js';
import {
  CONVERSABLE_TYPES,
  HUB_TYPES,
  INVENTORY_GROUPS,
  NON_EXPANDABLE_TYPES,
  groupKeyForType,
  makeStaticTreePowers,
} from './tree-source.js';

// MIME used to carry the dragged item's absolute pet-name path (JSON).
const ENDO_PETNAME_MIME = 'application/x-endo-petname';

/**
 * Compute the absolute destination path for a drop, or undefined when the drop
 * is a no-op or would move an item into itself or its own descendant. Mirrors
 * the helper in dnd.js (not re-exported there), inlined here so the pure-Preact
 * tree depends only on string-level path arithmetic.
 *
 * @param {string[]} sourceAbsPath - Absolute path of the dragged item.
 * @param {string[]} targetDirAbs - Absolute path of the destination directory.
 * @returns {string[] | undefined}
 */
const dropTargetPath = (sourceAbsPath, targetDirAbs) => {
  // Reject dropping an item into itself or any of its own descendants: the
  // case where the source path is a prefix of the target dir.
  const intoSelf =
    sourceAbsPath.length <= targetDirAbs.length &&
    sourceAbsPath.every((seg, i) => seg === targetDirAbs[i]);
  if (intoSelf) return undefined;
  const sourceLeaf = sourceAbsPath[sourceAbsPath.length - 1];
  const targetAbsPath = [...targetDirAbs, sourceLeaf];
  // No-op when the item already lives at exactly this location.
  if (
    targetAbsPath.length === sourceAbsPath.length &&
    targetAbsPath.every((seg, i) => seg === sourceAbsPath[i])
  ) {
    return undefined;
  }
  return targetAbsPath;
};
harden(dropTargetPath);

/**
 * @typedef {object} InventoryOptions
 * @property {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} showValue
 * @property {((petName: string | string[], formulaId: string) => void)} [onSelectConversation]
 * @property {string | null} [activeConversationPetName]
 * @property {(error: unknown) => void} reportError - Host-supplied sink for
 *   background errors (inspect/remove failures), so this confined tree never
 *   reaches for the ambient `reportError` global.
 * @property {() => void} clearDropHighlights - Host-supplied sweep that clears
 *   any lingering `.drop-target` / `.drop-target-list` highlight the browser's
 *   per-element dragleave model left in the app's own DOM. Lives in the host
 *   wrapper so the confined tree holds no ambient `document` authority.
 * @property {boolean} [showSpecial] - Whether special (`@`-prefixed system)
 *   names are currently revealed by the host's show-special toggle. Drives the
 *   per-group header count and empty-group hiding so the count agrees with what
 *   actually renders when the section is expanded. The host wrapper threads the
 *   live toggle state in and re-renders on change; the items themselves are
 *   still shown/hidden by CSS, so the body markup is unchanged.
 */

/**
 * Reducer over the set of pet names discovered from `followNameChanges`.
 * Discovery (insertion) order is preserved.
 *
 * @param {string[]} state
 * @param {{ type: 'add', name: string } | { type: 'remove', name: string }} action
 * @returns {string[]}
 */
const namesReducer = (state, action) => {
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
harden(namesReducer);

/**
 * A collapsible group section rendered in the top-level inventory. Shows only
 * when at least one item belongs to the group (the FRB `filter{items.length >
 * 0}` projection, applied declaratively by returning null when the item list
 * is empty).
 *
 * @param {object} props
 * @param {import('./tree-source.js').InventoryGroup} props.group
 * @param {string[]} props.names - Names assigned to this group.
 * @param {ERef<EndoHost>} props.powers
 * @param {InventoryOptions} props.options
 * @param {string[]} props.path
 * @param {ERef<EndoHost>} props.rootPowers
 * @param {string[]} props.rootPrefix
 * @param {(x: number, y: number, from: string[], to: string[]) => void} props.openDropMenu
 * @param {(name: string, formulaType: string) => void} props.onTypeResolved
 */
const InventoryGroupSection = ({
  group,
  names,
  powers,
  options,
  path,
  rootPowers,
  rootPrefix,
  openDropMenu,
  onTypeResolved,
}) => {
  const [expanded, setExpanded] = useState(true);

  // The header count and empty-group decision must honor the same special-name
  // filter that hides `@`-prefixed system names from the body by default, so the
  // count agrees with what actually renders when the section is expanded. When
  // the host's show-special toggle is on, specials are counted too. The body
  // markup still renders every name (specials carry `.special` and are hidden by
  // CSS), so toggling re-renders only the count and the empty-group decision.
  const visibleNames = options.showSpecial
    ? names
    : names.filter(name => !isSpecialName(name));
  const visibleCount = visibleNames.length;

  // An empty group is entirely hidden — no header, no body. This mirrors the
  // FRB `filter{items.length > 0}` projection: the group is absent from the
  // rendered tree when it has no visible items, reappearing the moment the first
  // matching item arrives. A group whose only members are hidden special names
  // disappears until the show-special toggle reveals them.
  if (visibleCount === 0) return null;

  const caretClass = ['pet-group-caret', expanded && 'expanded']
    .filter(Boolean)
    .join(' ');

  const bodyClass = ['pet-group-body', expanded && 'expanded']
    .filter(Boolean)
    .join(' ');

  return h(
    'div',
    { class: `pet-group pet-group-${group.key}`, 'data-group-key': group.key },
    h(
      'button',
      {
        class: 'pet-group-header',
        type: 'button',
        title: `Toggle ${group.label}`,
        onClick: () => setExpanded(e => !e),
      },
      h('span', { class: caretClass }, '▶'),
      h('span', { class: 'pet-group-label' }, group.label),
      h('span', { class: 'pet-group-count' }, String(visibleCount)),
    ),
    h(
      'div',
      { class: bodyClass },
      names.map(name =>
        h(InventoryItem, {
          key: name,
          name,
          powers,
          options,
          path,
          rootPowers,
          rootPrefix,
          openDropMenu,
          onTypeResolved,
        }),
      ),
    ),
  );
};
harden(InventoryGroupSection);

/**
 * One inventory item: its disclosure triangle, label (name + type badge),
 * action buttons, drag source / drop target behavior, and — when expanded —
 * a nested {@link InventoryList} mounted into its children. All visual state
 * (drop-target highlight, dragging, disclosure expand) is Preact state, since
 * confined event handlers receive a frozen SafeEvent with no DOM nodes.
 *
 * @param {object} props
 * @param {string} props.name
 * @param {ERef<EndoHost>} props.powers
 * @param {InventoryOptions} props.options
 * @param {string[]} props.path - Current path for this level.
 * @param {ERef<EndoHost>} props.rootPowers - Top-level powers for the whole
 *   tree, against which drag-and-drop link/move operate.
 * @param {string[]} props.rootPrefix - Absolute pet-name path from `rootPowers`
 *   to this level.
 * @param {(x: number, y: number, from: string[], to: string[]) => void} props.openDropMenu
 *   - Ask the enclosing list to open the link/move menu.
 * @param {((name: string, formulaType: string) => void) | undefined} [props.onTypeResolved]
 *   - Called once when the item's formula type is resolved via `locate()`.
 *   The enclosing list uses this to update its type-to-group mapping for
 *   daemons that do not include `type` in `followNameChanges` add events.
 */
const InventoryItem = ({
  name,
  powers,
  options,
  path,
  rootPowers,
  rootPrefix,
  openDropMenu,
  onTypeResolved,
}) => {
  const {
    showValue,
    onSelectConversation,
    activeConversationPetName,
    reportError,
    clearDropHighlights,
  } = options;

  const itemPath = [...path, name];
  // Absolute path from the tree root, used for cross-level drag-and-drop.
  const absPath = [...rootPrefix, name];
  const special = isSpecialName(name);

  // Type/decoration state, resolved asynchronously by the locate probe below.
  const [type, setType] = useState(/** @type {string | null} */ (null));
  // null = not yet probed; false = no locator (immutable); true = has locator.
  const [hasLocator, setHasLocator] = useState(
    /** @type {boolean | null} */ (null),
  );
  const [locator, setLocator] = useState(/** @type {string | null} */ (null));

  // Disclosure (expand/collapse) state.
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /** @type {[ERef<EndoHost> | null, (p: ERef<EndoHost> | null) => void]} */
  const [nestedPowers, setNestedPowers] = useState(
    /** @type {ERef<EndoHost> | null} */ (null),
  );

  // Drop-target highlight for this (hub) row.
  const [dropTarget, setDropTarget] = useState(false);
  // Dragging-source highlight for this row.
  const [dragging, setDragging] = useState(false);

  // Probe the formula type once the item mounts. Items without a locator are
  // immutable (cannot be removed or dragged); items with a locator expose a
  // `type` query parameter used for the badge, hub-gating, and conversation
  // decoration. A disposed flag guards the async continuation.
  useEffect(() => {
    let disposed = false;
    E(powers)
      .locate(.../** @type {[string, ...string[]]} */ (itemPath))
      .then(probed => {
        if (disposed) return;
        if (!probed) {
          setHasLocator(false);
          return;
        }
        setHasLocator(true);
        setLocator(/** @type {string} */ (probed));
        const probedType = new URL(
          /** @type {string} */ (probed),
        ).searchParams.get('type');
        setType(probedType);
        // Report the resolved type back to the enclosing list so it can
        // update its group mapping. This covers daemons that do not include
        // `type` in `followNameChanges` add events — the group assignment
        // lands as soon as `locate()` resolves rather than requiring a page
        // reload. The FRB analogy: this is the `observe` callback that fires
        // when a derived property's value changes.
        if (probedType && onTypeResolved) {
          onTypeResolved(name, probedType);
        }
      })
      .catch(() => {
        // Item may have been removed before its locator resolved.
      });
    return () => {
      disposed = true;
    };
  }, [powers, name]);

  // Inspect: resolve the item's id + value and hand them to the host viewer.
  const inspectItem = () => {
    const idP = E(powers).identify(
      .../** @type {[string, ...string[]]} */ (itemPath),
    );
    const valueP = lookupPath(powers, itemPath);
    Promise.all([idP, valueP]).then(
      ([id, value]) => showValue(value, id, itemPath, undefined),
      reportError,
    );
  };

  // Whether a probed (non-immutable) item is a hub that can accept a drop.
  const acceptsDrop = type !== null && HUB_TYPES.includes(type);
  // Whether this is a conversable item that opens a conversation on click.
  const conversable =
    !!onSelectConversation && type !== null && CONVERSABLE_TYPES.includes(type);
  const activeConversation =
    conversable &&
    !!activeConversationPetName &&
    path.length === 0 &&
    name === activeConversationPetName;

  // Disclosure visibility: hidden for known non-expandable types, hidden once
  // an expand attempt finds no children, otherwise shown.
  const [disclosureHidden, setDisclosureHidden] = useState(false);
  useEffect(() => {
    if (type !== null && NON_EXPANDABLE_TYPES.includes(type)) {
      setDisclosureHidden(true);
    }
  }, [type]);

  const onToggle = async () => {
    if (expanded) {
      // Collapse — drop the nested powers; the nested list unmounts with it.
      setExpanded(false);
      setNestedPowers(null);
      return;
    }
    // Expand — try to load children.
    setLoading(true);
    // The first await must not be nested (jessie safe-await rule), so we
    // perform the lookup before entering the try/catch. The literal `ok`
    // discriminant lets TypeScript narrow to the `value` arm after the guard
    // below.
    /** @type {{ ok: true, value: unknown } | { ok: false, error: unknown }} */
    const targetOrError = await lookupPath(powers, itemPath).then(
      v => ({ ok: true, value: v }),
      e => ({ ok: false, error: e }),
    );
    if (!targetOrError.ok) {
      setLoading(false);
      setDisclosureHidden(true);
      return;
    }
    try {
      const target =
        /** @type {ERef<{ __getMethodNames__: () => string[], list?: () => string[], followNameChanges?: () => AsyncIterator<{ add?: string, remove?: string }> }>} */ (
          targetOrError.value
        );
      // Detect capabilities via __getMethodNames__ to avoid CapTP noise.
      // eslint-disable-next-line no-underscore-dangle
      const methods = await E(target).__getMethodNames__();

      /** @type {ERef<EndoHost> | undefined} */
      let nested;

      if (methods.includes('followNameChanges')) {
        // NameHub (directory, host, guest): use a live subscription. Delegate
        // each capability with the `itemPath` prefix so the nested list reads
        // and writes through this level's powers.
        const changesIterator = E(
          /** @type {ERef<EndoHost>} */ (/** @type {unknown} */ (target)),
        ).followNameChanges();

        nested = /** @type {ERef<EndoHost>} */ (
          /** @type {unknown} */ ({
            /** @param {string | string[]} subPathOrName */
            lookup: subPathOrName => {
              const subPath =
                typeof subPathOrName === 'string'
                  ? [subPathOrName]
                  : subPathOrName;
              return lookupPath(powers, [...itemPath, ...subPath]);
            },
            /** @param {string[]} subPath */
            remove: (...subPath) => {
              const fullPath = [...itemPath, ...subPath];
              return E(powers).remove(
                .../** @type {[string, ...string[]]} */ (fullPath),
              );
            },
            /** @param {string[]} subPath */
            identify: (...subPath) => {
              const fullPath = [...itemPath, ...subPath];
              return E(powers).identify(
                .../** @type {[string, ...string[]]} */ (fullPath),
              );
            },
            /** @param {string[]} subPath */
            locate: (...subPath) => {
              const fullPath = [...itemPath, ...subPath];
              return E(powers).locate(
                .../** @type {[string, ...string[]]} */ (fullPath),
              );
            },
            followNameChanges: () => changesIterator,
          })
        );
      } else if (methods.includes('list')) {
        // Static tree (ReadableTree, etc.): populate from list().
        const names = await E(target).list();
        nested = makeStaticTreePowers(target, names);
      }

      if (nested) {
        setLoading(false);
        setNestedPowers(nested);
        setExpanded(true);
      } else {
        // Not expandable (no list or followNameChanges).
        setLoading(false);
        setDisclosureHidden(true);
      }
    } catch {
      // Lookup or introspection failed.
      setLoading(false);
      setDisclosureHidden(true);
    }
  };

  // Drag source: non-special, non-immutable rows carry their absolute path.
  const draggable = !special && hasLocator !== false;
  /** @param {{ dataTransfer?: { setData: (t: string, v: string) => void, effectAllowed: string } }} e */
  const onDragStart = e => {
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', absPath.join('/'));
      e.dataTransfer.setData(ENDO_PETNAME_MIME, JSON.stringify(absPath));
      e.dataTransfer.effectAllowed = 'copyMove';
    }
    setDragging(true);
  };
  const onDragEnd = () => {
    setDragging(false);
    clearDropHighlights();
  };

  // Drop target: only hub rows accept a drop; leaf rows let the event bubble
  // to the containing list's drop zone.
  /** @param {{ preventDefault: () => void, stopPropagation: () => void, dataTransfer?: { types: string[] | readonly string[], dropEffect: string } }} e */
  const onDragOver = e => {
    if (!acceptsDrop) return;
    if (!e.dataTransfer) return;
    if (!e.dataTransfer.types.includes(ENDO_PETNAME_MIME)) return;
    e.preventDefault();
    // Don't also light up the enclosing list-level drop zone.
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDropTarget(true);
  };
  const onDragLeave = () => {
    if (!acceptsDrop) return;
    setDropTarget(false);
  };
  /** @param {{ preventDefault: () => void, stopPropagation: () => void, clientX: number, clientY: number, dataTransfer?: { types: string[] | readonly string[], getData: (t: string) => string } }} e */
  const onDrop = e => {
    if (!acceptsDrop) return;
    setDropTarget(false);
    if (!e.dataTransfer) return;
    if (!e.dataTransfer.types.includes(ENDO_PETNAME_MIME)) return;
    e.preventDefault();
    // Handle here so the enclosing list-level drop zone does not also fire.
    e.stopPropagation();
    const raw = e.dataTransfer.getData(ENDO_PETNAME_MIME);
    // Narrow the try to JSON.parse alone; a broad try would mask errors from
    // dropTargetPath or openDropMenu.
    let sourceAbsPath;
    try {
      sourceAbsPath = JSON.parse(raw);
    } catch (err) {
      console.error(
        `[inventory] Cannot parse drag payload from ${ENDO_PETNAME_MIME} onto row ${absPath.join('/')}: ${
          /** @type {Error} */ (err).message
        }`,
      );
      return;
    }
    const targetAbsPath = dropTargetPath(sourceAbsPath, absPath);
    if (!targetAbsPath) return;
    openDropMenu(e.clientX, e.clientY, sourceAbsPath, targetAbsPath);
  };

  // Label decoration: a conversable item opens a conversation on click; an
  // immutable or non-conversable item makes its name selectable to inspect.
  /** @type {{ title: string, selectable: boolean, type: string | null, onClick: (() => void) | undefined }} */
  let labelState;
  if (conversable) {
    labelState = {
      title: 'Open conversation',
      selectable: false,
      type,
      onClick: () => {
        if (onSelectConversation) {
          onSelectConversation(name, /** @type {string} */ (locator));
        }
      },
    };
  } else if (hasLocator === false) {
    // Immutable: not draggable, but its name can be clicked to inspect.
    labelState = {
      title: 'Click to view',
      selectable: true,
      type: null,
      onClick: inspectItem,
    };
  } else if (onSelectConversation && type !== null) {
    // Non-conversable with conversation mode on: clicking inspects.
    labelState = {
      title: 'Click to view',
      selectable: true,
      type,
      onClick: inspectItem,
    };
  } else {
    labelState = {
      title: 'Click to view',
      selectable: false,
      type,
      onClick: undefined,
    };
  }

  const removeDisabled = special || hasLocator === false;
  const removeTitle = special
    ? 'Cannot remove system name'
    : hasLocator === false
      ? 'Cannot remove (immutable)'
      : 'Remove';

  const wrapperClass = [
    'pet-item-wrapper',
    special && 'special',
    conversable && 'conversable',
    activeConversation && 'active-conversation',
  ]
    .filter(Boolean)
    .join(' ');

  const rowClass = [
    'pet-item-row',
    dragging && 'dragging',
    dropTarget && 'drop-target',
  ]
    .filter(Boolean)
    .join(' ');

  return h(
    'div',
    { class: wrapperClass },
    h(
      'div',
      {
        class: rowClass,
        draggable,
        onDragStart: draggable ? onDragStart : undefined,
        onDragEnd: draggable ? onDragEnd : undefined,
        onDragOver,
        onDragLeave,
        onDrop,
      },
      h(ItemDisclosure, {
        hidden: disclosureHidden,
        loading,
        expanded,
        onToggle,
      }),
      h(ItemLabel, { name, ...labelState }),
      h(
        'span',
        { class: 'pet-buttons' },
        h(ItemActions, {
          cancelDisabled: special,
          removeDisabled,
          removeTitle,
          onInspect: inspectItem,
          onCancel: () =>
            E(powers).cancel(/** @type {[string, ...string[]]} */ (itemPath)),
          onRemove: () =>
            E(powers)
              .remove(.../** @type {[string, ...string[]]} */ (itemPath))
              .catch(reportError),
        }),
      ),
    ),
    h(
      'div',
      {
        class: ['pet-children', expanded && 'expanded']
          .filter(Boolean)
          .join(' '),
      },
      expanded && nestedPowers
        ? h(InventoryList, {
            powers: nestedPowers,
            // nestedPowers handles the prefix, so reset the local path.
            options: {
              showValue,
              onSelectConversation: onSelectConversation
                ? (
                    /** @type {string | string[]} */ leafName,
                    /** @type {string} */ leafLocator,
                  ) => {
                    const leafPath =
                      typeof leafName === 'string' ? [leafName] : leafName;
                    onSelectConversation(
                      [...itemPath, ...leafPath],
                      leafLocator,
                    );
                  }
                : undefined,
              activeConversationPetName,
              reportError,
              clearDropHighlights,
            },
            path: [],
            rootPowers,
            // DnD stays in the root's coordinate space so items can move up.
            rootPrefix: absPath,
            // Nested expansions are always flat: grouping applies only at the
            // root inventory level.
            grouped: false,
          })
        : null,
    ),
  );
};
harden(InventoryItem);

/**
 * A level of the inventory tree: owns the `followNameChanges` subscription for
 * its `powers`, the list-level drop zone, and the link/move drop menu. Renders
 * an {@link InventoryItem} per discovered name. When `grouped` is true (the
 * default at the root level), items are organized into collapsible
 * {@link InventoryGroupSection} sections instead of a flat list.
 *
 * @param {object} props
 * @param {ERef<EndoHost>} props.powers
 * @param {InventoryOptions} props.options
 * @param {string[]} props.path
 * @param {ERef<EndoHost>} props.rootPowers
 * @param {string[]} props.rootPrefix
 * @param {boolean} [props.grouped] - When true (default), render items in
 *   collapsible groups by formula type. Nested InventoryLists pass false.
 */
export const InventoryList = ({
  powers,
  options,
  path,
  rootPowers,
  rootPrefix,
  grouped = true,
}) => {
  const [names, dispatch] = useReducer(
    namesReducer,
    /** @type {string[]} */ ([]),
  );
  // Type-to-group mapping: formula type keyed by pet name. Populated from
  // `followNameChanges` add events (when the daemon includes `type`) and from
  // the `onTypeResolved` callback that each InventoryItem fires when `locate()`
  // resolves for older daemons. The FRB analogy: this is the observable source
  // that drives the `group{groupKeyForType(type)}` projection rendered below.
  const [typesByName, setTypesByName] = useState(
    /** @type {Map<string, string>} */ (new Map()),
  );

  // List-level drop-zone highlight.
  const [dropTargetList, setDropTargetList] = useState(false);
  // The open link/move menu, positioned at {x, y} with whole from/to paths.
  const [menu, setMenu] = useState(
    /** @type {{ x: number, y: number, from: string[], to: string[] } | null} */ (
      null
    ),
  );

  useEffect(() => {
    // A disposed flag guards every async continuation: the subscription loop
    // must not dispatch after teardown.
    let disposed = false;

    const run = async () => {
      // The daemon's name-change reader is loosely typed (Passable); narrow it
      // to the add/remove shape at the boundary, as the rest of the app does.
      const nameChanges = iterateReader(
        /** @type {Parameters<typeof iterateReader>[0]} */ (
          /** @type {unknown} */ (E(powers).followNameChanges())
        ),
        // Prefetch a window of values so the initial name backlog streams
        // without a round-trip acknowledgement per name.
        { buffer: 64 },
      );
      for await (const rawChange of nameChanges) {
        if (disposed) break;
        const change =
          /** @type {{ add?: string, remove?: string, type?: string }} */ (
            rawChange
          );
        if (change.add !== undefined) {
          dispatch({ type: 'add', name: change.add });
          // When the daemon enriches add events with `type` (the daemon change
          // in this PR), record the type immediately so the item renders in the
          // correct group without waiting for the per-item `locate()` probe.
          // This is the primary reactive path for `/mkdir` and other creation
          // commands: the add event carries `type: 'directory'` and the group
          // section updates synchronously with the name list.
          if (change.type !== undefined) {
            const addedName = change.add;
            const formulaType = change.type;
            setTypesByName(prev => {
              const next = new Map(prev);
              next.set(addedName, formulaType);
              return next;
            });
          }
        } else if (change.remove !== undefined) {
          const removedName = change.remove;
          dispatch({ type: 'remove', name: removedName });
          setTypesByName(prev => {
            if (!prev.has(removedName)) return prev;
            const next = new Map(prev);
            next.delete(removedName);
            return next;
          });
        }
      }
    };

    run().catch(err => {
      if (!disposed) {
        console.error('[inventory] subscription failed:', err);
      }
    });

    return () => {
      disposed = true;
    };
  }, [powers]);

  // Called by each InventoryItem when its `locate()` probe resolves and the
  // item's formula type becomes known. This covers daemons that do not include
  // `type` in `followNameChanges` add events. The FRB analogy: this is the
  // `observe` sink that fires when the derived `type` property changes, pushing
  // the update into the parent's grouping map.
  const onTypeResolved = (
    /** @type {string} */ name,
    /** @type {string} */ formulaType,
  ) => {
    setTypesByName(prev => {
      if (prev.get(name) === formulaType) return prev;
      const next = new Map(prev);
      next.set(name, formulaType);
      return next;
    });
  };

  /**
   * @param {number} x
   * @param {number} y
   * @param {string[]} from
   * @param {string[]} to
   */
  const openDropMenu = (x, y, from, to) => {
    // Sweep any lingering ancestor drop-zone highlight the browser's
    // per-element dragleave model left behind (a host-owned DOM sweep), and
    // reset our own list-level highlight. Per-row highlight is each item's own
    // state and is cleared by that row's drop handler before it asks us to open
    // the menu.
    options.clearDropHighlights();
    setDropTargetList(false);
    setMenu({ x, y, from, to });
  };

  // List-level drop zone: dropping onto the background of this directory links
  // or moves the dragged item into `rootPrefix`.
  /** @param {{ preventDefault: () => void, dataTransfer?: { types: string[] | readonly string[], dropEffect: string } }} e */
  const onDragOver = e => {
    if (!e.dataTransfer) return;
    if (!e.dataTransfer.types.includes(ENDO_PETNAME_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetList(true);
  };
  const onDragLeave = () => {
    // Under confinement a handler cannot compare DOM nodes to ignore a
    // dragleave bubbling up from a descendant row (the SafeEvent exposes only
    // frozen target snapshots, never the node). Clear unconditionally; the
    // next dragover re-sets the highlight, so a transient flicker is the only
    // cost and a hub row's own drop handler stops propagation anyway.
    setDropTargetList(false);
  };
  /** @param {{ preventDefault: () => void, stopPropagation: () => void, clientX: number, clientY: number, dataTransfer?: { getData: (t: string) => string } }} e */
  const onDrop = e => {
    setDropTargetList(false);
    if (!e.dataTransfer) return;
    const raw = e.dataTransfer.getData(ENDO_PETNAME_MIME);
    if (!raw) return;
    e.preventDefault();
    // A row handler already ran if the drop landed on an item.
    e.stopPropagation();
    let sourceAbsPath;
    try {
      sourceAbsPath = JSON.parse(raw);
    } catch (err) {
      const at = rootPrefix.length === 0 ? '<root>' : rootPrefix.join('/');
      console.error(
        `[inventory] Cannot parse drag payload from ${ENDO_PETNAME_MIME} onto list at ${at}: ${
          /** @type {Error} */ (err).message
        }`,
      );
      return;
    }
    const targetAbsPath = dropTargetPath(sourceAbsPath, rootPrefix);
    if (!targetAbsPath) return;
    openDropMenu(e.clientX, e.clientY, sourceAbsPath, targetAbsPath);
  };

  const listClass = ['pet-list-zone', dropTargetList && 'drop-target-list']
    .filter(Boolean)
    .join(' ');

  // The grouped layout (FRB `group{groupKeyForType(type)}` projection): derive
  // per-group name arrays from the flat `names` list and the `typesByName` map.
  // Names whose type has not yet been resolved land in `capabilities` until
  // `onTypeResolved` fires, at which point Preact re-renders with the updated
  // group assignment. Empty groups are hidden by InventoryGroupSection (the
  // `filter{items.length > 0}` side of the projection).
  const groupedContent = grouped
    ? INVENTORY_GROUPS.map(group =>
        h(InventoryGroupSection, {
          key: group.key,
          group,
          names: names.filter(
            name => groupKeyForType(typesByName.get(name)) === group.key,
          ),
          powers,
          options,
          path,
          rootPowers,
          rootPrefix,
          openDropMenu,
          onTypeResolved,
        }),
      )
    : names.map(name =>
        h(InventoryItem, {
          key: name,
          name,
          powers,
          options,
          path,
          rootPowers,
          rootPrefix,
          openDropMenu,
          onTypeResolved,
        }),
      );

  const dropMenu = menu
    ? // A full-screen backdrop dismisses the menu on an outside click,
      // declaratively, instead of a `document`-level click listener. The
      // fixed-position DropMenu renders above it.
      h(
        'div',
        {
          class: 'inventory-drop-menu-backdrop',
          onClick: () => setMenu(null),
        },
        h(DropMenu, {
          x: menu.x,
          y: menu.y,
          onLink: () => {
            const { from, to } = menu;
            setMenu(null);
            E(rootPowers)
              .copy(from, to)
              .catch(err => console.error('[inventory] Link failed:', err));
          },
          onMove: () => {
            const { from, to } = menu;
            setMenu(null);
            E(rootPowers)
              .move(from, to)
              .catch(err => console.error('[inventory] Move failed:', err));
          },
        }),
      )
    : null;

  return h(
    'div',
    {
      class: listClass,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ...groupedContent,
    dropMenu,
  );
};
harden(InventoryList);
