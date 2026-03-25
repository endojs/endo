// @ts-check
/* global document, requestAnimationFrame */

import harden from '@endo/harden';
import { E } from '@endo/far';

/** Default emoji palette for quick react picker */
const DEFAULT_REACTS = harden([
  '\uD83D\uDC4D',
  '\u2764\uFE0F',
  '\uD83D\uDE04',
  '\uD83C\uDF89',
  '\uD83E\uDD14',
]);

/**
 * Emoji categories for the full picker.
 * Each entry is [categoryLabel, emojiString[]].
 * @type {ReadonlyArray<[string, ReadonlyArray<string>]>}
 */
const EMOJI_CATEGORIES = harden([
  [
    'Smileys',
    [
      '\uD83D\uDE00', '\uD83D\uDE03', '\uD83D\uDE04', '\uD83D\uDE01',
      '\uD83D\uDE06', '\uD83D\uDE05', '\uD83D\uDE02', '\uD83E\uDD23',
      '\uD83D\uDE0A', '\uD83D\uDE07', '\uD83D\uDE42', '\uD83D\uDE43',
      '\uD83D\uDE09', '\uD83D\uDE0C', '\uD83D\uDE0D', '\uD83E\uDD70',
      '\uD83D\uDE18', '\uD83D\uDE17', '\uD83D\uDE1A', '\uD83D\uDE19',
      '\uD83E\uDD72', '\uD83D\uDE0B', '\uD83D\uDE1B', '\uD83D\uDE1C',
      '\uD83E\uDD2A', '\uD83D\uDE1D', '\uD83E\uDD11', '\uD83E\uDD17',
      '\uD83E\uDD2D', '\uD83E\uDD2B', '\uD83E\uDD14', '\uD83E\uDD10',
      '\uD83E\uDD28', '\uD83D\uDE10', '\uD83D\uDE11', '\uD83D\uDE36',
      '\uD83D\uDE0F', '\uD83D\uDE12', '\uD83D\uDE44', '\uD83D\uDE2C',
      '\uD83E\uDD25', '\uD83D\uDE0C', '\uD83D\uDE14', '\uD83D\uDE2A',
      '\uD83E\uDD24', '\uD83D\uDE34', '\uD83D\uDE37', '\uD83E\uDD12',
      '\uD83E\uDD15', '\uD83E\uDD22', '\uD83E\uDD2E', '\uD83E\uDD27',
      '\uD83E\uDD75', '\uD83E\uDD76', '\uD83E\uDD74', '\uD83D\uDE35',
      '\uD83E\uDD2F', '\uD83E\uDD20', '\uD83E\uDD73', '\uD83E\uDD78',
      '\uD83D\uDE0E', '\uD83E\uDD13', '\uD83E\uDDD0', '\uD83D\uDE15',
      '\uD83D\uDE1F', '\uD83D\uDE41', '\uD83D\uDE2E', '\uD83D\uDE2F',
      '\uD83D\uDE32', '\uD83D\uDE33', '\uD83E\uDD7A', '\uD83D\uDE26',
      '\uD83D\uDE27', '\uD83D\uDE28', '\uD83D\uDE30', '\uD83D\uDE25',
      '\uD83D\uDE22', '\uD83D\uDE2D', '\uD83D\uDE31', '\uD83D\uDE16',
      '\uD83D\uDE23', '\uD83D\uDE1E', '\uD83D\uDE13', '\uD83D\uDE29',
      '\uD83D\uDE2B', '\uD83E\uDD71', '\uD83D\uDE24', '\uD83D\uDE21',
      '\uD83D\uDE20', '\uD83E\uDD2C', '\uD83D\uDE08', '\uD83D\uDC7F',
      '\uD83D\uDC80', '\uD83D\uDCA9', '\uD83E\uDD21', '\uD83D\uDC7B',
      '\uD83D\uDC7D', '\uD83E\uDD16', '\uD83D\uDC4B',
    ],
  ],
  [
    'Gestures',
    [
      '\uD83D\uDC4D', '\uD83D\uDC4E', '\uD83D\uDC4A', '\u270A',
      '\uD83E\uDD1B', '\uD83E\uDD1C', '\uD83D\uDC4F', '\uD83D\uDE4C',
      '\uD83D\uDC50', '\uD83E\uDD32', '\uD83E\uDD1D', '\uD83D\uDE4F',
      '\u270D\uFE0F', '\uD83D\uDC85', '\uD83E\uDD33', '\uD83D\uDCAA',
      '\u261D\uFE0F', '\u270C\uFE0F', '\uD83E\uDD1E', '\uD83E\uDD1F',
      '\uD83E\uDD18', '\uD83D\uDC4C', '\uD83E\uDD0C', '\uD83E\uDD0F',
      '\uD83D\uDC48', '\uD83D\uDC49', '\uD83D\uDC46', '\uD83D\uDC47',
      '\uD83D\uDD96',
    ],
  ],
  [
    'Hearts & Symbols',
    [
      '\u2764\uFE0F', '\uD83E\uDDE1', '\uD83D\uDC9B', '\uD83D\uDC9A',
      '\uD83D\uDC99', '\uD83D\uDC9C', '\uD83E\uDD0E', '\uD83D\uDDA4',
      '\uD83E\uDD0D', '\uD83D\uDC94', '\u2763\uFE0F', '\uD83D\uDC95',
      '\uD83D\uDC9E', '\uD83D\uDC93', '\uD83D\uDC97', '\uD83D\uDC96',
      '\uD83D\uDC98', '\uD83D\uDC9D', '\u2B50', '\uD83C\uDF1F',
      '\uD83D\uDCAB', '\u2728', '\uD83D\uDD25', '\uD83D\uDCA5',
      '\uD83C\uDF08', '\u2600\uFE0F', '\uD83C\uDF19', '\u26A1',
      '\uD83D\uDCA2', '\uD83D\uDCAF', '\u2705', '\u274C', '\u2753',
      '\u2757', '\uD83D\uDCAC', '\uD83D\uDC40',
    ],
  ],
  [
    'Celebrations',
    [
      '\uD83C\uDF89', '\uD83C\uDF8A', '\uD83C\uDF88', '\uD83C\uDF86',
      '\uD83C\uDF87', '\uD83E\uDD42', '\uD83C\uDF7B', '\uD83C\uDF7E',
      '\uD83C\uDF82', '\uD83C\uDF70', '\uD83C\uDF81', '\uD83C\uDF96\uFE0F',
      '\uD83C\uDFC6', '\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49',
    ],
  ],
  [
    'Nature',
    [
      '\uD83D\uDC36', '\uD83D\uDC31', '\uD83D\uDC2D', '\uD83D\uDC39',
      '\uD83D\uDC30', '\uD83E\uDD8A', '\uD83D\uDC3B', '\uD83D\uDC3C',
      '\uD83D\uDC28', '\uD83D\uDC2F', '\uD83E\uDD81', '\uD83D\uDC2E',
      '\uD83D\uDC37', '\uD83D\uDC38', '\uD83D\uDC35', '\uD83D\uDC12',
      '\uD83D\uDC14', '\uD83D\uDC27', '\uD83D\uDC26', '\uD83E\uDD85',
      '\uD83E\uDD89', '\uD83D\uDC1D', '\uD83D\uDC1B', '\uD83E\uDD8B',
      '\uD83C\uDF3A', '\uD83C\uDF39', '\uD83C\uDF3B', '\uD83C\uDF3C',
      '\uD83C\uDF37', '\uD83C\uDF31', '\uD83C\uDF32', '\uD83C\uDF33',
      '\uD83C\uDF34', '\uD83C\uDF35', '\uD83C\uDF3F', '\uD83C\uDF40',
    ],
  ],
  [
    'Food & Drink',
    [
      '\uD83C\uDF4E', '\uD83C\uDF4F', '\uD83C\uDF4A', '\uD83C\uDF4B',
      '\uD83C\uDF53', '\uD83C\uDF47', '\uD83C\uDF49', '\uD83C\uDF50',
      '\uD83C\uDF51', '\uD83C\uDF52', '\uD83C\uDF46', '\uD83E\uDD51',
      '\uD83C\uDF55', '\uD83C\uDF54', '\uD83C\uDF2D', '\uD83C\uDF2E',
      '\uD83C\uDF2F', '\uD83C\uDF73', '\uD83C\uDF5E', '\uD83E\uDD50',
      '\uD83C\uDF69', '\uD83C\uDF66', '\uD83C\uDF67', '\uD83C\uDF82',
      '\u2615', '\uD83C\uDF75', '\uD83C\uDF7C', '\uD83C\uDF7A',
      '\uD83C\uDF77', '\uD83E\uDD43',
    ],
  ],
  [
    'Objects',
    [
      '\uD83D\uDCDA', '\uD83D\uDCD6', '\uD83D\uDD2C', '\uD83D\uDD2D',
      '\uD83D\uDCBB', '\uD83D\uDCF1', '\u260E\uFE0F', '\uD83D\uDCE7',
      '\uD83D\uDD11', '\uD83D\uDD12', '\uD83D\uDD13', '\uD83D\uDCA1',
      '\uD83D\uDD27', '\uD83D\uDD28', '\u2699\uFE0F', '\uD83D\uDEA7',
      '\uD83D\uDEA8', '\uD83C\uDFB5', '\uD83C\uDFB6', '\uD83C\uDFA4',
      '\uD83C\uDFA8', '\uD83C\uDFAC', '\uD83D\uDCF7', '\uD83D\uDCF8',
      '\uD83D\uDCDD', '\uD83D\uDCC8', '\uD83D\uDCC9', '\uD83D\uDCCA',
      '\uD83D\uDCC5', '\uD83D\uDCCE',
    ],
  ],
]);

/**
 * Flat array of { emoji, name } for search. Built lazily on first use.
 * @type {{ emoji: string, name: string }[] | null}
 */
let emojiSearchIndex = null;

/**
 * Build the search index by deriving names from category + position.
 * @returns {{ emoji: string, name: string }[]}
 */
const getEmojiSearchIndex = () => {
  if (emojiSearchIndex) return emojiSearchIndex;
  emojiSearchIndex = [];
  for (const [category, emojis] of EMOJI_CATEGORIES) {
    const lowerCat = category.toLowerCase();
    for (const emoji of emojis) {
      emojiSearchIndex.push({ emoji, name: `${lowerCat} ${emoji}` });
    }
  }
  return emojiSearchIndex;
};

const MAX_REACT_DEPTH = 5;

/**
 * @typedef {object} ReactMessage
 * @property {string} [replyTo]
 * @property {string} [replyType]
 * @property {string[]} strings
 * @property {string} [memberId]
 */

/**
 * Create a shared react (emoji reaction) system for channel views.
 *
 * @param {object} opts
 * @param {unknown} opts.channel - Channel or ChannelMember reference
 * @param {string} [opts.ownMemberId]
 * @param {Map<string, string>} opts.nameMap
 * @param {(memberId: string) => Promise<{ proposedName: string } | undefined>} opts.getMemberInfo
 * @returns {ReturnType<typeof _createReactSystem>}
 */
export const createReactSystem = opts => {
  return _createReactSystem(opts);
};
harden(createReactSystem);

/**
 * @param {object} opts
 * @param {unknown} opts.channel
 * @param {string} [opts.ownMemberId]
 * @param {Map<string, string>} opts.nameMap
 * @param {(memberId: string) => Promise<{ proposedName: string } | undefined>} opts.getMemberInfo
 */
const _createReactSystem = ({ channel, ownMemberId, nameMap, getMemberInfo }) => {
  // ---- State ----

  /**
   * React tracking: parentKey -> Map<emoji, Set<memberId>>
   * @type {Map<string, Map<string, Set<string>>>}
   */
  const reactsForKey = new Map();

  /**
   * Reverse lookup: react message key -> { parentKey, emoji }.
   * @type {Map<string, { parentKey: string, emoji: string }>}
   */
  const reactMsgInfo = new Map();

  /**
   * All react message keys for a (parentKey, emoji) pair.
   * @type {Map<string, Map<string, string[]>>}
   */
  const reactMsgKeysForEmoji = new Map();

  // ---- Tracking ----

  /**
   * Follow the reactMsgInfo chain to find the root visible message key.
   * @param {string} key
   * @returns {string}
   */
  const getRootMessageKey = key => {
    const info = reactMsgInfo.get(key);
    if (info) return getRootMessageKey(info.parentKey);
    return key;
  };

  /**
   * Get all react message keys for a (parentKey, emoji) pair.
   * @param {string} parentKey
   * @param {string} emoji
   * @returns {string[]}
   */
  const getReactMsgKeys = (parentKey, emoji) => {
    const byEmoji = reactMsgKeysForEmoji.get(parentKey);
    if (!byEmoji) return [];
    return byEmoji.get(emoji) || [];
  };

  /**
   * Aggregate sub-reacts across all react message keys for a pill.
   * @param {string} parentKey
   * @param {string} emoji
   * @returns {Map<string, Set<string>>}
   */
  const getAggregatedSubReacts = (parentKey, emoji) => {
    const keys = getReactMsgKeys(parentKey, emoji);
    /** @type {Map<string, Set<string>>} */
    const merged = new Map();
    for (const k of keys) {
      const subReacts = reactsForKey.get(k);
      if (subReacts) {
        for (const [subEmoji, subMembers] of subReacts) {
          if (!merged.has(subEmoji)) {
            merged.set(subEmoji, new Set());
          }
          const set = /** @type {Set<string>} */ (merged.get(subEmoji));
          for (const m of subMembers) {
            set.add(m);
          }
        }
      }
    }
    return merged;
  };

  /**
   * Register a react in tracking data structures (no render).
   * @param {string} parentKey
   * @param {string} emoji
   * @param {string} memberId
   * @param {string} [msgKey]
   */
  const trackReact = (parentKey, emoji, memberId, msgKey) => {
    if (!reactsForKey.has(parentKey)) {
      reactsForKey.set(parentKey, new Map());
    }
    const emojiMap = /** @type {Map<string, Set<string>>} */ (
      reactsForKey.get(parentKey)
    );
    if (!emojiMap.has(emoji)) {
      emojiMap.set(emoji, new Set());
    }
    /** @type {Set<string>} */ (emojiMap.get(emoji)).add(memberId);
    if (msgKey) {
      reactMsgInfo.set(msgKey, { parentKey, emoji });
      if (!reactMsgKeysForEmoji.has(parentKey)) {
        reactMsgKeysForEmoji.set(parentKey, new Map());
      }
      const emojiKeys = /** @type {Map<string, string[]>} */ (
        reactMsgKeysForEmoji.get(parentKey)
      );
      if (!emojiKeys.has(emoji)) {
        emojiKeys.set(emoji, []);
      }
      /** @type {string[]} */ (emojiKeys.get(emoji)).push(msgKey);
    }
  };

  /**
   * Unregister a react from tracking data structures (no render).
   * @param {string} parentKey
   * @param {string} emoji
   * @param {string} memberId
   */
  const untrackReact = (parentKey, emoji, memberId) => {
    const emojiMap = reactsForKey.get(parentKey);
    if (!emojiMap) return;
    const members = emojiMap.get(emoji);
    if (!members) return;
    members.delete(memberId);
    if (members.size === 0) {
      emojiMap.delete(emoji);
    }
    if (emojiMap.size === 0) {
      reactsForKey.delete(parentKey);
    }
  };

  /**
   * Process a react or redact-react message. Returns the target key
   * (the root message key whose pills should be re-rendered), or
   * undefined if the message is not a react type.
   * @param {ReactMessage} message
   * @param {string} msgKey
   * @returns {string | undefined}
   */
  const processReactMessage = (message, msgKey) => {
    if (message.replyType === 'react') {
      const targetKey = message.replyTo;
      if (!targetKey) return undefined;
      const emoji = (message.strings[0] || '').trim();
      if (!emoji) return undefined;
      trackReact(targetKey, emoji, message.memberId || '', msgKey);
      return getRootMessageKey(targetKey);
    }
    if (message.replyType === 'redact-react') {
      const targetKey = message.replyTo;
      if (!targetKey) return undefined;
      const emoji = (message.strings[0] || '').trim();
      if (!emoji) return undefined;
      untrackReact(targetKey, emoji, message.memberId || '');
      return getRootMessageKey(targetKey);
    }
    return undefined;
  };

  // ---- UI builders ----

  /**
   * Build a react pill element with optional nested sub-reacts.
   * @param {string} targetKey - key to post reacts/redact-reacts to
   * @param {string} emoji
   * @param {Set<string>} members
   * @param {number} depth
   * @returns {HTMLElement}
   */
  const buildReactPill = (targetKey, emoji, members, depth) => {
    const $wrapper = document.createElement('span');
    $wrapper.className = 'react-pill-wrapper';

    const $pill = document.createElement('button');
    $pill.className = 'react-pill';
    const myId = ownMemberId || '';
    if (members.has(myId)) {
      $pill.classList.add('react-pill-own');
    }
    $pill.textContent = members.size > 1 ? `${emoji} ${members.size}` : emoji;
    $pill.title = `${emoji} (${members.size})`;

    // Build descriptive hover text with member names
    Promise.all(
      [...members].map(mid => {
        const assigned = nameMap.get(mid);
        if (assigned) return Promise.resolve(assigned);
        return getMemberInfo(mid).then(info =>
          info ? `\u201C${info.proposedName}\u201D` : `Member ${mid}`,
        );
      }),
    ).then(names => {
      $pill.title = `${emoji} ${names.join(', ')}`;
    });

    // Left click: toggle own react
    $pill.addEventListener('click', () => {
      const type = members.has(myId) ? 'redact-react' : 'react';
      E(channel)
        .post([emoji], [], [], targetKey, [], type)
        .catch(/** @param {Error} err */ err => {
          console.error(`Failed to ${type}:`, err);
        });
    });

    // Right click: open react picker to add a sub-react
    const reactMsgKeys = getReactMsgKeys(targetKey, emoji);
    if (reactMsgKeys.length > 0) {
      $pill.addEventListener('contextmenu', e => {
        e.preventDefault();
        showReactPicker($pill, reactMsgKeys[0]);
      });
    }

    $wrapper.appendChild($pill);

    // Render sub-reacts if within depth limit
    if (depth < MAX_REACT_DEPTH && reactMsgKeys.length > 0) {
      const subReacts = getAggregatedSubReacts(targetKey, emoji);
      if (subReacts.size > 0) {
        const $sub = document.createElement('span');
        $sub.className = 'react-sub';
        for (const [subEmoji, subMembers] of subReacts) {
          $sub.appendChild(
            buildReactPill(reactMsgKeys[0], subEmoji, subMembers, depth + 1),
          );
        }
        $wrapper.appendChild($sub);
      }
    }

    return $wrapper;
  };

  /**
   * Build a react pills container for the given message key.
   * Returns null if no reacts exist for this key.
   * @param {string} key
   * @returns {HTMLElement | null}
   */
  const buildReactsContainer = key => {
    const reacts = reactsForKey.get(key);
    if (!reacts || reacts.size === 0) return null;

    const $container = document.createElement('span');
    $container.className = 'react-pills';
    for (const [emoji, members] of reacts) {
      $container.appendChild(buildReactPill(key, emoji, members, 0));
    }
    return $container;
  };

  /**
   * Find or create a `.react-pills` container on the given element
   * and populate it with react pills for the given key.
   * @param {string} key
   * @param {HTMLElement | undefined} $el
   */
  const renderReactsOnElement = (key, $el) => {
    if (!$el) return;
    const reacts = reactsForKey.get(key);
    let $container = $el.querySelector('.react-pills');

    if (!reacts || reacts.size === 0) {
      if ($container) $container.remove();
      return;
    }

    if (!$container) {
      $container = document.createElement('span');
      $container.className = 'react-pills';
      $el.appendChild($container);
    }
    $container.innerHTML = '';

    for (const [emoji, members] of reacts) {
      $container.appendChild(buildReactPill(key, emoji, members, 0));
    }
  };

  /**
   * Show a quick react picker near the given element.
   * @param {HTMLElement} $anchor
   * @param {string} key - message key to react to
   */
  const showReactPicker = ($anchor, key) => {
    // Remove any existing picker
    const $existing = document.querySelector('.react-picker');
    if ($existing) $existing.remove();

    const $picker = document.createElement('div');
    $picker.className = 'react-picker';

    // --- Quick-pick row ---
    const $quickRow = document.createElement('div');
    $quickRow.className = 'react-picker-quick-row';

    for (const emoji of DEFAULT_REACTS) {
      const $btn = document.createElement('button');
      $btn.className = 'react-picker-emoji';
      $btn.textContent = emoji;
      $btn.addEventListener('click', () => {
        E(channel)
          .post([emoji], [], [], key, [], 'react')
          .catch(/** @param {Error} err */ err => {
            console.error('Failed to react:', err);
          });
        $picker.remove();
      });
      $quickRow.appendChild($btn);
    }

    // "+" button to expand full picker
    const $addBtn = document.createElement('button');
    $addBtn.className = 'react-picker-emoji react-picker-add-btn';
    $addBtn.textContent = '+';
    $addBtn.title = 'More emoji';
    $quickRow.appendChild($addBtn);
    $picker.appendChild($quickRow);

    // --- Full picker (hidden until "+" clicked) ---
    const $fullPicker = document.createElement('div');
    $fullPicker.className = 'react-picker-full';
    $fullPicker.style.display = 'none';

    // Search bar
    const $search = document.createElement('input');
    $search.className = 'react-picker-search';
    $search.type = 'text';
    $search.placeholder = 'Search emoji\u2026';
    $fullPicker.appendChild($search);

    // Scrollable grid
    const $grid = document.createElement('div');
    $grid.className = 'react-picker-grid';

    /**
     * Render emoji into the grid, grouped by category.
     * @param {string} query
     */
    const renderGrid = query => {
      $grid.innerHTML = '';
      const q = query.trim().toLowerCase();
      for (const [category, emojis] of EMOJI_CATEGORIES) {
        const matches = q
          ? emojis.filter(e => {
              if (category.toLowerCase().includes(q)) return true;
              const idx = getEmojiSearchIndex();
              const entry = idx.find(x => x.emoji === e);
              return entry ? entry.name.includes(q) : false;
            })
          : [...emojis];
        if (matches.length === 0) continue;

        const $label = document.createElement('div');
        $label.className = 'react-picker-category-label';
        $label.textContent = category;
        $grid.appendChild($label);

        const $row = document.createElement('div');
        $row.className = 'react-picker-category-row';
        for (const emoji of matches) {
          const $btn = document.createElement('button');
          $btn.className = 'react-picker-emoji';
          $btn.textContent = emoji;
          $btn.addEventListener('click', () => {
            E(channel)
              .post([emoji], [], [], key, [], 'react')
              .catch(/** @param {Error} err */ err => {
                console.error('Failed to react:', err);
              });
            $picker.remove();
          });
          $row.appendChild($btn);
        }
        $grid.appendChild($row);
      }
    };

    renderGrid('');
    $fullPicker.appendChild($grid);
    $picker.appendChild($fullPicker);

    $search.addEventListener('input', () => {
      renderGrid($search.value);
    });

    $addBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = $fullPicker.style.display !== 'none';
      $fullPicker.style.display = isOpen ? 'none' : '';
      if (!isOpen) {
        requestAnimationFrame(() => $search.focus());
      }
    });

    const rect = $anchor.getBoundingClientRect();
    $picker.style.position = 'fixed';
    $picker.style.left = `${rect.left}px`;
    $picker.style.top = `${rect.bottom + 2}px`;
    document.body.appendChild($picker);

    // Prevent clicks inside the picker from dismissing it
    $picker.addEventListener('click', e => {
      e.stopPropagation();
    });

    const dismiss = () => {
      $picker.remove();
      document.removeEventListener('click', dismiss);
    };
    requestAnimationFrame(() => {
      document.addEventListener('click', dismiss);
    });
  };

  /**
   * Create a react button (emoji face) for a message row.
   * @param {string} key - message key
   * @returns {HTMLButtonElement}
   */
  const createReactButton = key => {
    const $btn = document.createElement('button');
    $btn.className = 'react-button';
    $btn.title = 'React';
    $btn.type = 'button';
    $btn.textContent = '\uD83D\uDE00';
    $btn.addEventListener('click', e => {
      e.stopPropagation();
      showReactPicker($btn, key);
    });
    return $btn;
  };

  return harden({
    reactsForKey,
    processReactMessage,
    getRootMessageKey,
    buildReactPill,
    buildReactsContainer,
    renderReactsOnElement,
    showReactPicker,
    createReactButton,
  });
};
