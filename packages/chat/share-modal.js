// @ts-check
/* eslint-disable no-use-before-define */

import harden from '@endo/harden';
import { E } from '@endo/far';

/** @import { ChannelMessage } from '@endo/space-channel/channel-utils.js' */

import { Fragment, h, renderConfined } from './setup-preact-container.js';

/**
 * @typedef {object} ShareTarget
 * @property {string} id - Space ID
 * @property {string} name - Display name
 * @property {string} icon - Emoji icon
 * @property {string[]} profilePath - Pet-name path to the agent
 * @property {string} [channelPetName] - Pet name of the channel
 */

/**
 * @typedef {object} ShareModalAPI
 * @property {(opts: ShareModalShowOptions) => void} show
 * @property {() => void} hide
 */

/**
 * @typedef {object} ShareModalShowOptions
 * @property {ChannelMessage[]} heritageChain - Messages to share (root-first)
 * @property {string} previewText - Short preview of the message being shared
 * @property {unknown} powers - Current persona powers for channel creation
 * @property {unknown} rootPowers - Root powers for resolving other personas
 * @property {ShareTarget[]} targets - Available channel spaces to share to
 * @property {(channelName: string) => void} [onNavigate] - Navigate to new channel
 */

/**
 * A single navigation path segment: the profilePath prefix from the root space,
 * plus any deeper drilled-into pet name.
 *
 * @typedef {object} NavSegment
 * @property {string} label
 * @property {string[]} profilePath
 * @property {string} [petName]
 */

/**
 * The async-resolved item list for the current navigation level.
 *
 * @typedef {object} NavLevel
 * @property {boolean} loading
 * @property {string | null} error
 * @property {string[]} petNames
 */

/**
 * @typedef {object} ShareState
 * @property {boolean} open
 * @property {ShareModalShowOptions | null} opts
 * @property {string} name - The share name field value.
 * @property {boolean} canEdit
 * @property {boolean} canComment
 * @property {NavSegment[]} navPath
 * @property {string | null} navSelectedName
 * @property {string | null} selectedTargetId
 * @property {string | null} selectedChannelPetName
 * @property {NavLevel} navLevel
 * @property {boolean} submitting
 */

/**
 * Resolve powers for a given profile path from root.
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @returns {Promise<unknown>}
 */
const resolvePersonaPowers = async (rootPowers, profilePath) => {
  /** @type {unknown} */
  let powers = rootPowers;
  for (const name of profilePath) {
    powers = E(/** @type {any} */ (powers)).lookup(name);
  }
  return powers;
};

/**
 * Fetch pet names from a persona's namespace.
 * @param {unknown} personaPowers
 * @returns {Promise<string[]>}
 */
const listPetNames = async personaPowers => {
  try {
    const names =
      await /** @type {{ list: () => Promise<AsyncIterable<string>> }} */ (
        E(personaPowers)
      ).list();
    /** @type {string[]} */
    const result = [];
    for await (const name of names) {
      result.push(name);
    }
    return result.sort();
  } catch {
    return [];
  }
};

/**
 * Group the channel targets by profilePath to deduplicate personas.
 *
 * @param {ShareTarget[]} targets
 * @returns {Map<string, { profilePath: string[], icon: string, name: string, channels: ShareTarget[] }>}
 */
const groupTargets = targets => {
  const channelTargets = targets.filter(t => t.channelPetName !== undefined);
  /** @type {Map<string, { profilePath: string[], icon: string, name: string, channels: ShareTarget[] }>} */
  const spaceGroups = new Map();
  for (const t of channelTargets) {
    const pathKey = t.profilePath.join('/');
    const group = spaceGroups.get(pathKey);
    if (group) {
      group.channels.push(t);
    } else {
      spaceGroups.set(pathKey, {
        profilePath: t.profilePath,
        icon: t.icon,
        name: t.name,
        channels: [t],
      });
    }
  }
  return spaceGroups;
};

/**
 * The breadcrumb bar for the navigator.
 *
 * @param {object} props
 * @param {NavSegment[]} props.navPath
 * @param {(depth: number) => void} props.onNavigateTo - Jump to crumb at depth
 *   (`0` = root, `i+1` = navPath index `i`).
 * @returns {import('preact').VNode}
 */
const NavBreadcrumb = ({ navPath, onNavigateTo }) =>
  h(
    'div',
    { class: 'share-nav-breadcrumb' },
    h(
      'button',
      {
        class: 'share-nav-crumb',
        type: 'button',
        onClick: () => onNavigateTo(0),
      },
      '⌂ Spaces',
    ),
    ...navPath.flatMap((segment, i) => {
      const sep = h('span', { class: 'share-nav-sep', key: `sep-${i}` }, ' › ');
      const crumb =
        i < navPath.length - 1
          ? h(
              'button',
              {
                class: 'share-nav-crumb',
                type: 'button',
                key: `crumb-${i}`,
                onClick: () => onNavigateTo(i + 1),
              },
              segment.label,
            )
          : h(
              'span',
              { class: 'share-nav-crumb-current', key: `crumb-${i}` },
              segment.label,
            );
      return [sep, crumb];
    }),
  );
harden(NavBreadcrumb);

/**
 * The item list for the current navigation level.
 *
 * @param {object} props
 * @param {ShareState} props.state
 * @param {Map<string, { profilePath: string[], icon: string, name: string, channels: ShareTarget[] }>} props.spaceGroups
 * @param {(group: { profilePath: string[], icon: string, name: string, channels: ShareTarget[] }, key: string) => void} props.onEnterSpace
 * @param {(petName: string) => void} props.onSelectItem
 * @param {(petName: string) => void} props.onDrillItem
 * @returns {import('preact').VNode}
 */
const NavList = ({
  state,
  spaceGroups,
  onEnterSpace,
  onSelectItem,
  onDrillItem,
}) => {
  const { navPath, navSelectedName, navLevel } = state;

  if (navPath.length === 0) {
    if (spaceGroups.size === 0) {
      return h(
        'div',
        { class: 'share-nav-list' },
        h('div', { class: 'share-target-empty' }, 'No spaces available'),
      );
    }
    return h(
      'div',
      { class: 'share-nav-list' },
      ...[...spaceGroups.entries()].map(([key, group]) =>
        h(
          'button',
          {
            class: 'share-nav-item',
            type: 'button',
            key,
            onClick: () => onEnterSpace(group, key),
          },
          h('span', { class: 'share-nav-item-icon' }, group.icon),
          h('span', { class: 'share-nav-item-name' }, group.name),
          h('span', { class: 'share-nav-item-chevron' }, '›'),
        ),
      ),
    );
  }

  if (navLevel.loading) {
    return h(
      'div',
      { class: 'share-nav-list' },
      h('div', { class: 'share-channel-loading' }, 'Loading…'),
    );
  }

  if (navLevel.error) {
    return h(
      'div',
      { class: 'share-nav-list' },
      h('div', { class: 'share-channel-loading' }, navLevel.error),
    );
  }

  if (navLevel.petNames.length === 0) {
    return h(
      'div',
      { class: 'share-nav-list' },
      h('div', { class: 'share-target-empty' }, 'No items found'),
    );
  }

  return h(
    'div',
    { class: 'share-nav-list' },
    ...navLevel.petNames.map(petName =>
      h(
        'button',
        {
          class: `share-nav-item ${
            navSelectedName === petName ? 'share-target-selected' : ''
          }`,
          type: 'button',
          key: petName,
          // Select this item as the share target. Chevron clicks call
          // `stopPropagation` so they drill in without also selecting.
          onClick: () => onSelectItem(petName),
        },
        h('span', { class: 'share-nav-item-name' }, petName),
        h(
          'span',
          {
            class: 'share-nav-item-chevron',
            /** @param {{ stopPropagation: () => void }} e */
            onClick: e => {
              e.stopPropagation();
              onDrillItem(petName);
            },
          },
          '›',
        ),
      ),
    ),
  );
};
harden(NavList);

/**
 * @typedef {object} SpaceGroup
 * @property {string[]} profilePath
 * @property {string} icon
 * @property {string} name
 * @property {ShareTarget[]} channels
 */

/**
 * @typedef {object} ShareHandlers
 * @property {() => void} onClose
 * @property {(patch: Partial<ShareState>) => void} onPatch
 * @property {(depth: number) => void} onNavigateTo
 * @property {(group: SpaceGroup, key: string) => void} onEnterSpace
 * @property {(petName: string) => void} onSelectItem
 * @property {(petName: string) => void} onDrillItem
 * @property {() => void} onSubmit
 */

/**
 * The confined modal body — a pure function of `state` plus controller
 * callbacks. Host DOM nodes never enter this tree.
 *
 * @param {object} props
 * @param {ShareState} props.state
 * @param {Map<string, SpaceGroup>} props.spaceGroups
 * @param {ShareHandlers} props.handlers
 * @returns {import('preact').VNode | null}
 */
const ShareModalBody = ({ state, spaceGroups, handlers }) => {
  if (!state.open || !state.opts) return null;
  const { opts } = state;
  const {
    onClose,
    onPatch,
    onNavigateTo,
    onEnterSpace,
    onSelectItem,
    onDrillItem,
    onSubmit,
  } = handlers;

  return h(
    Fragment,
    null,
    h('div', { class: 'share-backdrop', onClick: onClose }),
    h(
      'div',
      { class: 'share-modal' },
      h(
        'div',
        { class: 'share-header' },
        h('h2', { class: 'share-title' }, 'Share'),
        h(
          'button',
          { class: 'share-close', type: 'button', onClick: onClose },
          '×',
        ),
      ),
      h(
        'form',
        {
          class: 'share-form',
          /** @param {{ preventDefault: () => void }} e */
          onSubmit: e => {
            e.preventDefault();
            onSubmit();
          },
        },
        h('div', { class: 'share-preview' }, opts.previewText),
        // Name field
        h(
          'div',
          { class: 'share-field' },
          h('label', { class: 'share-label' }, 'Label'),
          h('input', {
            class: 'share-input',
            type: 'text',
            placeholder: 'thread-name',
            pattern: '[a-z0-9][a-z0-9-]*',
            value: state.name,
            /** @param {{ target: { value: string } }} e */
            onInput: e => onPatch({ name: e.target.value }),
          }),
          h(
            'span',
            { class: 'share-hint' },
            'Lowercase letters, numbers, hyphens',
          ),
        ),
        // Access policy
        h(
          'div',
          { class: 'share-field' },
          h('label', { class: 'share-label' }, 'Access'),
          h(
            'div',
            { class: 'share-policy-options' },
            h(
              'label',
              { class: 'share-policy-option' },
              h('input', {
                type: 'checkbox',
                id: 'share-policy-edit',
                name: 'share-policy-edit',
                checked: state.canEdit,
                /** @param {{ target: { checked: boolean } }} e */
                onChange: e => onPatch({ canEdit: e.target.checked }),
              }),
              h('span', null, '✎ Can edit'),
            ),
            h(
              'label',
              { class: 'share-policy-option' },
              h('input', {
                type: 'checkbox',
                id: 'share-policy-comment',
                name: 'share-policy-comment',
                checked: state.canComment,
                /** @param {{ target: { checked: boolean } }} e */
                onChange: e => onPatch({ canComment: e.target.checked }),
              }),
              h('span', null, '💬 Can comment'),
            ),
          ),
        ),
        // Inventory selector + breadcrumbs
        h(
          'div',
          { class: 'share-field' },
          h('label', { class: 'share-label' }, 'Share to'),
          h(
            'div',
            { class: 'share-navigator' },
            h(NavBreadcrumb, { navPath: state.navPath, onNavigateTo }),
            h(NavList, {
              state,
              spaceGroups,
              onEnterSpace,
              onSelectItem,
              onDrillItem,
            }),
          ),
        ),
        // Actions
        h(
          'div',
          { class: 'share-actions' },
          h(
            'button',
            { class: 'share-cancel', type: 'button', onClick: onClose },
            'Cancel',
          ),
          h(
            'button',
            {
              class: 'share-submit',
              type: 'submit',
              disabled: !state.selectedChannelPetName || state.submitting,
            },
            state.submitting ? 'Sharing…' : 'Share',
          ),
        ),
      ),
    ),
  );
};
harden(ShareModalBody);

/**
 * Create the share modal component. The body is one confined Preact tree
 * rendered through a single `renderConfined` into a dedicated mount inside
 * `$container`; `show(opts)` opens it and `hide()` closes it.
 *
 * @param {HTMLElement} $container - Container element for the modal
 * @returns {ShareModalAPI}
 */
export const createShareModal = $container => {
  // Dedicated confined mount; siblings of `$container` are never reconciled.
  // `display: contents` keeps the modal's own flex layout (on `$container`)
  // applying to the mount's children.
  const $mount = document.createElement('div');
  $mount.style.display = 'contents';

  /** @type {ShareState} */
  let state = harden({
    open: false,
    opts: null,
    name: '',
    canEdit: false,
    canComment: false,
    navPath: [],
    navSelectedName: null,
    selectedTargetId: null,
    selectedChannelPetName: null,
    navLevel: { loading: false, error: null, petNames: [] },
    submitting: false,
  });

  /** @type {Map<string, { profilePath: string[], icon: string, name: string, channels: ShareTarget[] }>} */
  let spaceGroups = new Map();

  /**
   * Token that invalidates in-flight nav-level loads when navigation changes,
   * so a slow `listPetNames` cannot clobber a newer level.
   */
  let navLoadToken = 0;

  /**
   * Merge a partial state update and re-render the confined tree.
   *
   * @param {Partial<ShareState>} patchValue
   */
  const patch = patchValue => {
    state = harden({ ...state, ...patchValue });
    rerender();
  };

  /**
   * Resolve and load the pet names for the current (deeper) navigation level.
   * No-op at the root level (groups are rendered synchronously).
   */
  const loadNavLevel = () => {
    if (!state.opts) return;
    if (state.navPath.length === 0) {
      patch({ navLevel: { loading: false, error: null, petNames: [] } });
      return;
    }

    navLoadToken += 1;
    const token = navLoadToken;
    patch({ navLevel: { loading: true, error: null, petNames: [] } });

    const { navPath } = state;
    const currentSegment = navPath[navPath.length - 1];
    const currentProfilePath = currentSegment.profilePath;
    const deeperNames = navPath
      .slice(1)
      .map(seg => seg.petName)
      .filter(
        /**
         * @param {string | undefined} n
         * @returns {n is string}
         */
        n => n !== undefined,
      );
    const fullPath = [...currentProfilePath, ...deeperNames];
    const { rootPowers } = state.opts;

    const run = async () => {
      /** @type {unknown} */
      let currentPowers;
      try {
        currentPowers = await resolvePersonaPowers(rootPowers, fullPath);
      } catch {
        if (token === navLoadToken) {
          patch({
            navLevel: {
              loading: false,
              error: 'Unable to access this location',
              petNames: [],
            },
          });
        }
        return;
      }
      const petNames = await listPetNames(currentPowers);
      if (token === navLoadToken) {
        patch({ navLevel: { loading: false, error: null, petNames } });
      }
    };
    run().catch(window.reportError);
  };

  /**
   * Jump to a breadcrumb depth (`0` = root).
   *
   * @param {number} depth
   */
  const navigateTo = depth => {
    const navPath = state.navPath.slice(0, depth);
    state = harden({
      ...state,
      navPath,
      navSelectedName: null,
      selectedTargetId: depth === 0 ? null : state.selectedTargetId,
      selectedChannelPetName: null,
    });
    loadNavLevel();
  };

  /**
   * Enter a space group from the root level.
   *
   * @param {{ profilePath: string[], icon: string, name: string, channels: ShareTarget[] }} group
   */
  const enterSpace = group => {
    const representative = group.channels[0];
    state = harden({
      ...state,
      navPath: [
        ...state.navPath,
        { label: group.name, profilePath: representative.profilePath },
      ],
      navSelectedName: null,
      selectedTargetId: representative.id,
      selectedChannelPetName: null,
    });
    loadNavLevel();
  };

  /**
   * Select an item at the current level as the share target.
   *
   * @param {string} petName
   */
  const selectItem = petName => {
    patch({ navSelectedName: petName, selectedChannelPetName: petName });
  };

  /**
   * Drill into an item at the current level.
   *
   * @param {string} petName
   */
  const drillItem = petName => {
    const currentSegment = state.navPath[state.navPath.length - 1];
    state = harden({
      ...state,
      navPath: [
        ...state.navPath,
        {
          label: petName,
          profilePath: currentSegment.profilePath,
          petName,
        },
      ],
      navSelectedName: null,
      selectedChannelPetName: null,
    });
    loadNavLevel();
  };

  /**
   * Execute the share: fork heritage chain to new channel, then post a
   * reference in the target channel.
   *
   * @param {string} shareName - Pet name for the shared channel
   * @param {{ canEdit: boolean, canComment: boolean }} policy - Access policy
   * @param {ShareTarget} target - Target space
   * @param {string} targetChannelPetName - Specific channel pet name within the target space
   */
  const executeShare = async (
    shareName,
    policy,
    target,
    targetChannelPetName,
  ) => {
    if (!state.opts) return;
    const { heritageChain, powers, rootPowers } = state.opts;

    const channelPetName = shareName;
    const displayName = shareName;

    await E(
      /** @type {{ makeChannel: (petName: string, proposedName: string) => Promise<unknown> }} */ (
        powers
      ),
    ).makeChannel(channelPetName, displayName);

    const newChannelRef = await E(
      /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
        powers
      ),
    ).lookup(channelPetName);

    // Post heritage chain into the new channel.
    for (let i = 0; i < heritageChain.length; i += 1) {
      const msg = heritageChain[i];
      const replyTo = i > 0 ? String(i - 1) : undefined;
      // eslint-disable-next-line no-await-in-loop
      await E(
        /** @type {{ post: (...args: unknown[]) => Promise<unknown> }} */ (
          newChannelRef
        ),
      ).post(msg.strings, msg.names, [], replyTo, msg.ids);
    }

    // Post a reference message in the target channel.
    try {
      const targetPersonaPowers = await resolvePersonaPowers(
        rootPowers,
        target.profilePath,
      );
      const targetChannelRef = await E(
        /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
          targetPersonaPowers
        ),
      ).lookup(targetChannelPetName);

      await E(
        /** @type {{ post: (...args: unknown[]) => Promise<unknown> }} */ (
          targetChannelRef
        ),
      ).post(
        ['Shared thread: ', ''],
        [channelPetName],
        [channelPetName],
        undefined,
        [],
      );

      // If sharing to an agent's space, also send an inbox message so the
      // agent is notified about the shared content.
      if (target.profilePath.length > 0) {
        const agentPetName = target.profilePath[0];
        try {
          await E(
            /** @type {{ send: (...args: unknown[]) => Promise<void> }} */ (
              rootPowers
            ),
          ).send(
            agentPetName,
            ['A thread was shared with you: ', ''],
            [channelPetName],
            [channelPetName],
          );
        } catch {
          // Agent inbox notification is best-effort.
        }
      }
    } catch (err) {
      window.reportError(err);
    }

    const onNavigate = state.opts && state.opts.onNavigate;
    hide();

    if (onNavigate) {
      onNavigate(channelPetName);
    }
  };

  /**
   * Handle form submission.
   */
  const handleSubmit = () => {
    const name = state.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-|-$/g, '');
    if (!name) return;
    if (!state.selectedChannelPetName) return;
    if (state.navPath.length === 0) return;

    const policy = { canEdit: state.canEdit, canComment: state.canComment };

    // Build the target from the navigation path. The first navPath entry's
    // profilePath is the persona path; deeper entries add petName segments.
    const firstSegment = state.navPath[0];
    const deeperPetNames = state.navPath
      .slice(1)
      .map(seg => seg.petName)
      .filter(
        /**
         * @param {string | undefined} n
         * @returns {n is string}
         */
        n => n !== undefined,
      );

    /** @type {ShareTarget} */
    const target = {
      id: state.selectedTargetId || firstSegment.label,
      name: firstSegment.label,
      icon: '',
      profilePath: [...firstSegment.profilePath, ...deeperPetNames],
    };

    const channelPetName = state.selectedChannelPetName;
    patch({ submitting: true });

    executeShare(name, policy, target, channelPetName).catch(err => {
      patch({ submitting: false });
      window.reportError(err);
    });
  };

  /**
   * Render the confined modal body for the current `state`.
   */
  const rerender = () => {
    renderConfined(
      h(ShareModalBody, {
        state,
        spaceGroups,
        handlers: {
          onClose: hide,
          onPatch: patch,
          onNavigateTo: navigateTo,
          onEnterSpace: enterSpace,
          onSelectItem: selectItem,
          onDrillItem: drillItem,
          onSubmit: handleSubmit,
        },
      }),
      $mount,
    );
  };

  const hide = () => {
    state = harden({
      open: false,
      opts: null,
      name: '',
      canEdit: false,
      canComment: false,
      navPath: [],
      navSelectedName: null,
      selectedTargetId: null,
      selectedChannelPetName: null,
      navLevel: { loading: false, error: null, petNames: [] },
      submitting: false,
    });
    spaceGroups = new Map();
    navLoadToken += 1;
    rerender();
    $container.style.display = 'none';
  };

  /**
   * @param {ShareModalShowOptions} opts
   */
  const show = opts => {
    spaceGroups = groupTargets(opts.targets);

    const defaultName =
      opts.previewText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || `shared-${Date.now()}`;

    state = harden({
      open: true,
      opts,
      name: defaultName,
      canEdit: false,
      canComment: false,
      navPath: [],
      navSelectedName: null,
      selectedTargetId: null,
      selectedChannelPetName: null,
      navLevel: { loading: false, error: null, petNames: [] },
      submitting: false,
    });

    rerender();
    $container.style.display = 'flex';

    // Focus and select the name input once rendered.
    requestAnimationFrame(() => {
      const $nameInput = /** @type {HTMLInputElement | null} */ (
        $mount.querySelector('.share-input')
      );
      if ($nameInput) $nameInput.select();
    });
  };

  // Initial state: mounted but closed.
  $container.innerHTML = '';
  $container.appendChild($mount);
  $container.style.display = 'none';
  rerender();

  return harden({ show, hide });
};
harden(createShareModal);
