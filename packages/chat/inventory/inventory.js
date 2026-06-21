// @ts-check
/* eslint-disable no-continue */

import harden from '@endo/harden';

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { isSpecialName } from '@endo/daemon/pet-name.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  CONVERSABLE_TYPES,
  HUB_TYPES,
  NON_EXPANDABLE_TYPES,
  makeStaticTreePowers,
} from './tree-source.js';
import { makeItemDragDrop } from './dnd.js';
import { ItemActions } from './item-actions.js';
import { ItemDisclosure } from './item-disclosure.js';
import { ItemLabel } from './item-label.js';
import { h, renderConfined, unmount } from '../setup-preact-container.js';

/**
 * A `sidebar` plugs alternate rendering into the otherwise pet-name-tree
 * inventory: the channel sidebar (channel-sidebar.js) supplies one. All of its
 * hooks are optional.
 *
 * @typedef {object} InventorySidebar
 * @property {boolean} [prepend] - Insert new items at the top of the list.
 * @property {boolean} [itemInitiallyHidden] - Hide items until `decorateItem`
 *   chooses to show them.
 * @property {($parent: HTMLElement) => void} [setupHeader] - Decorate the
 *   header once, at the top level.
 * @property {(ctx: import('./channel-sidebar.js').ItemContext) => void} [decorateItem]
 *   - Decorate each item after its type is probed (replaces the default
 *   conversation decoration).
 * @property {($list: HTMLElement) => void} [setupList] - Wire list-level
 *   behavior (replaces the default link/move drop zone).
 */

/**
 * @typedef {object} InventoryOptions
 * @property {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} showValue
 * @property {((petName: string | string[], formulaId: string) => void)} [onSelectConversation]
 * @property {string | null} [activeConversationPetName]
 * @property {InventorySidebar} [sidebar] - Alternate rendering (e.g. channels).
 */

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} _end
 * @param {ERef<EndoHost>} powers
 * @param {InventoryOptions} options
 * @param {string[]} [path] - Current path for nested inventories
 * @param {ERef<EndoHost>} [rootPowers] - Top-level powers for the whole tree,
 *   against which drag-and-drop link/move operate. Defaults to `powers` so the
 *   outermost level is its own root.
 * @param {string[]} [rootPrefix] - Absolute pet-name path from `rootPowers` to
 *   this level. Drag-and-drop addresses items by `[...rootPrefix, name]` so that
 *   items can be moved both up and down the tree in one coordinate space.
 */
export const inventoryComponent = async (
  $parent,
  _end,
  powers,
  { showValue, onSelectConversation, activeConversationPetName, sidebar },
  path = [],
  rootPowers = powers,
  rootPrefix = [],
) => {
  const $list = /** @type {HTMLElement} */ (
    $parent.querySelector('.pet-list') || $parent
  );

  // Let a sidebar (e.g. channels) decorate the header once at the top level.
  if (sidebar?.setupHeader && path.length === 0) {
    sidebar.setupHeader($parent);
  }

  /** @type {Map<string, { $wrapper: HTMLElement, cleanup?: () => void }>} */
  const $names = new Map();

  // Item-move drag-and-drop (link/move within the tree). Operates in absolute
  // coordinates against `rootPowers`. See inventory-dnd.js.
  const itemDnd = makeItemDragDrop({ rootPowers });

  /**
   * Create an inventory item with disclosure triangle.
   * @param {string} name
   */
  const createItem = name => {
    const itemPath = [...path, name];
    // Absolute path from the tree root, used for cross-level drag-and-drop.
    const absPath = [...rootPrefix, name];
    // Whether this item is a name hub that can accept a dropped item. Set once
    // the formula type is probed below; until then it rejects row drops, which
    // then fall through to the containing directory's list-level drop zone.
    let acceptsDrop = false;

    const $wrapper = document.createElement('div');
    $wrapper.className = 'pet-item-wrapper';
    if (isSpecialName(name)) {
      $wrapper.classList.add('special');
    }
    // A sidebar may hide items until its decorateItem chooses to show them
    // (channel mode hides everything until confirmed channels).
    if (sidebar?.itemInitiallyHidden) {
      $wrapper.style.display = 'none';
    }

    const $row = document.createElement('div');
    $row.className = 'pet-item-row';

    // Make non-special items draggable (carry the absolute path so the item
    // can be dropped at any level, up or down the tree).
    if (!isSpecialName(name)) {
      itemDnd.attachDragSource($row, absPath);
    }

    // Disclosure triangle — rendered (below, once its toggle handler exists)
    // as a Preact component into this `display: contents` host, kept first in
    // the row.
    const $disclosureMount = document.createElement('span');
    $disclosureMount.style.display = 'contents';
    $row.appendChild($disclosureMount);

    // Inspect: resolve the item's id + value and hand them to the host viewer.
    const inspectItem = () => {
      const idP = E(powers).identify(
        .../** @type {[string, ...string[]]} */ (itemPath),
      );
      const valueP = E(powers).lookup(itemPath);
      Promise.all([idP, valueP]).then(
        ([id, value]) => showValue(value, id, itemPath, undefined),
        window.reportError,
      );
    };

    // Label (pet name + type badge). Mounts into a `display: contents` host so
    // the name and badge stay flex children of the row. Click behavior and the
    // badge resolve after the locate probe below, so `setLabel` re-renders.
    const $labelMount = document.createElement('span');
    $labelMount.style.display = 'contents';
    $row.appendChild($labelMount);
    /** @type {{ title: string, selectable: boolean, type: string | null, onClick: (() => void) | undefined }} */
    const labelState = {
      title: 'Click to view',
      selectable: false,
      type: null,
      onClick: undefined,
    };
    /** @param {Partial<typeof labelState>} [partial] */
    const setLabel = partial => {
      if (partial) Object.assign(labelState, partial);
      renderConfined(h(ItemLabel, { name, ...labelState }), $labelMount);
    };
    setLabel();

    // Action buttons (info / cancel / remove). `.pet-buttons` is an absolutely
    // positioned flex row; ItemActions mounts into a `display: contents`
    // sub-host so Preact owns the three buttons while the channel-mode menu
    // button (still imperative, inserted below) remains a flex sibling and the
    // layout is unchanged. The remove button's disabled state resolves
    // asynchronously (special names up front, immutable items after the locate
    // probe below), so we re-render on change.
    const $actions = document.createElement('span');
    $actions.className = 'pet-buttons';
    $row.appendChild($actions);
    const $actionsMount = document.createElement('span');
    $actionsMount.style.display = 'contents';
    $actions.appendChild($actionsMount);

    let removeDisabled = isSpecialName(name);
    let removeTitle = isSpecialName(name)
      ? 'Cannot remove system name'
      : 'Remove';
    const renderActions = () => {
      renderConfined(
        h(ItemActions, {
          cancelDisabled: isSpecialName(name),
          removeDisabled,
          removeTitle,
          onInspect: inspectItem,
          onCancel: () =>
            E(powers).cancel(/** @type {[string, ...string[]]} */ (itemPath)),
          onRemove: () =>
            E(powers)
              .remove(.../** @type {[string, ...string[]]} */ (itemPath))
              .catch(window.reportError),
        }),
        $actionsMount,
      );
    };
    renderActions();

    $wrapper.appendChild($row);

    // Children container (initially hidden)
    const $children = document.createElement('div');
    $children.className = 'pet-children';
    $wrapper.appendChild($children);

    /** @type {(() => void) | undefined} */
    let childCleanup;

    // Disclosure: the triangle view plus expand/collapse behavior (async lookup
    // of the target's children, then a recursive inventory mount).
    const disclosureState = { hidden: false, loading: false, expanded: false };
    const renderDisclosure = () => {
      renderConfined(
        // eslint-disable-next-line no-use-before-define
        h(ItemDisclosure, { ...disclosureState, onToggle }),
        $disclosureMount,
      );
    };
    /** @param {Partial<typeof disclosureState>} [partial] */
    const setDisclosure = partial => {
      if (partial) Object.assign(disclosureState, partial);
      renderDisclosure();
    };
    const onToggle = async () => {
      if (disclosureState.expanded) {
        // Collapse
        setDisclosure({ expanded: false });
        $children.classList.remove('expanded');
        if (childCleanup) {
          childCleanup();
          childCleanup = undefined;
        }
        $children.innerHTML = '';
        return;
      }
      // Expand — try to load children
      setDisclosure({ loading: true });
      try {
        const target =
          /** @type {ERef<{ __getMethodNames__: () => string[], list?: () => string[], followNameChanges?: () => AsyncIterator<{ add?: string, remove?: string }> }>} */ (
            await E(powers).lookup(itemPath)
          );
        // Use __getMethodNames__ to detect the target's capabilities
        // without probing methods that may not exist (avoids CapTP noise).
        // eslint-disable-next-line no-underscore-dangle
        const methods = await E(target).__getMethodNames__();

        /** @type {ERef<EndoHost> | undefined} */
        let nestedPowers;

        if (methods.includes('followNameChanges')) {
          // NameHub (directory, host, guest): use live subscription
          const changesIterator = E(
            /** @type {import('@endo/far').ERef<EndoHost>} */ (
              /** @type {unknown} */ (target)
            ),
          ).followNameChanges();

          nestedPowers = /** @type {ERef<EndoHost>} */ (
            /** @type {unknown} */ ({
              /** @param {string | string[]} subPathOrName */
              lookup: subPathOrName => {
                const subPath =
                  typeof subPathOrName === 'string'
                    ? [subPathOrName]
                    : subPathOrName;
                return E(powers).lookup([...itemPath, ...subPath]);
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
          // Static tree (ReadableTree, etc.): populate from list()
          const names = await E(target).list();
          nestedPowers = makeStaticTreePowers(target, names);
        }

        if (nestedPowers) {
          setDisclosure({ loading: false, expanded: true });
          $children.classList.add('expanded');

          const wrappedOnSelectConversation = onSelectConversation
            ? (
                /** @type {string | string[]} */ leafName,
                /** @type {string} */ locator,
              ) => {
                const leafPath =
                  typeof leafName === 'string' ? [leafName] : leafName;
                onSelectConversation([...itemPath, ...leafPath], locator);
              }
            : undefined;

          inventoryComponent(
            $children,
            null,
            nestedPowers,
            {
              showValue,
              onSelectConversation: wrappedOnSelectConversation,
              activeConversationPetName,
              sidebar,
            },
            [], // Reset path since nestedPowers handles the prefix
            // Drag-and-drop stays in the root's absolute coordinate space so
            // items can move up out of this directory as well as down into it.
            rootPowers,
            absPath,
          ).catch(() => {
            // Silently handle errors (e.g., if the item is removed)
          });
        } else {
          // Not expandable (no list or followNameChanges)
          setDisclosure({ loading: false, hidden: true });
        }
      } catch {
        // Lookup or introspection failed
        setDisclosure({ loading: false, hidden: true });
      }
    };
    setDisclosure();

    // Drop target: dropping onto a hub row offers to link or move the dragged
    // item into that hub. Non-hub (leaf) rows are not drop targets — the event
    // bubbles to the containing directory's list-level drop zone instead.
    // `acceptsDrop` is probed asynchronously below, so it is read at event time.
    itemDnd.attachRowDropTarget($row, {
      absPath,
      acceptsDrop: () => acceptsDrop,
    });

    if (sidebar?.prepend) {
      // Newest items at top (channels are reordered after type detection)
      $list.prepend($wrapper);
    } else {
      $list.appendChild($wrapper);
    }

    // Probe the formula type to detect conversable items and non-expandable types.
    // Items without a locator (e.g. children of an immutable ReadableTree) get
    // their remove button disabled since they cannot be individually removed.
    E(powers)
      .locate(.../** @type {[string, ...string[]]} */ (itemPath))
      .then(locator => {
        if (!locator) {
          // Immutable items cannot be individually removed; disable the button.
          removeDisabled = true;
          removeTitle = 'Cannot remove (immutable)';
          renderActions();
          // Immutable items cannot be relinked or relocated.
          $row.draggable = false;
          // Still allow clicking the name to inspect the value
          setLabel({ selectable: true, onClick: inspectItem });
          return;
        }
        const url = new URL(/** @type {string} */ (locator));
        const type = url.searchParams.get('type');

        // Show the type badge.
        setLabel({ type });

        // Hide disclosure triangle for known non-expandable types
        if (type && NON_EXPANDABLE_TYPES.includes(type)) {
          setDisclosure({ hidden: true });
        }

        // Only name hubs can accept a dropped item.
        if (type && HUB_TYPES.includes(type)) {
          acceptsDrop = true;
        }

        // A sidebar (e.g. channels) decorates the item; otherwise apply the
        // default conversation decoration.
        if (sidebar?.decorateItem) {
          sidebar.decorateItem({
            name,
            type: type ?? null,
            path,
            $list,
            $wrapper,
            $row,
            setLabel,
            setDisclosure,
            $children,
            $actions,
          });
        } else if (onSelectConversation) {
          if (type && CONVERSABLE_TYPES.includes(type)) {
            $wrapper.classList.add('conversable');
            setLabel({
              title: 'Open conversation',
              onClick: () => {
                onSelectConversation(name, /** @type {string} */ (locator));
              },
            });
            if (
              activeConversationPetName &&
              path.length === 0 &&
              name === activeConversationPetName
            ) {
              $wrapper.classList.add('active-conversation');
            }
          } else {
            // Non-conversable: clicking the name opens the Show Value modal
            setLabel({ selectable: true, onClick: inspectItem });
          }
        }
      })
      .catch(() => {
        // Item may have been removed
      });

    return {
      $wrapper,
      cleanup: () => {
        unmount($labelMount);
        unmount($actionsMount);
        childCleanup?.();
      },
    };
  };

  // List-level behavior: a sidebar wires its own (channels use reordering);
  // otherwise the default link/move drop zone. Dropping onto the background of
  // a directory's list links or moves the dragged item into that directory
  // (`rootPrefix`); at the outermost level `rootPrefix` is empty, so this is
  // how an item is moved *up* to the root.
  if (sidebar?.setupList) {
    sidebar.setupList($list);
  } else {
    itemDnd.attachListDropZone($list, rootPrefix);
  }

  for await (const change of iterateReader(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;
      const item = createItem(name);
      $names.set(name, item);
    } else if ('remove' in change) {
      const item = $names.get(change.remove);
      if (item !== undefined) {
        item.cleanup?.();
        item.$wrapper.remove();
        $names.delete(change.remove);
      }
    }
  }
};
harden(inventoryComponent);
