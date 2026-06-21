// @ts-check

import harden from '@endo/harden';

import {
  Fragment,
  h,
  renderConfined,
  useEffect,
  useState,
} from './setup-preact-container.js';

// Profile popup, migrated from imperative `innerHTML` DOM to a confined Preact
// component rendered through a single `renderConfined`. The exported entry,
// `createProfilePopup($container)`, keeps its container-based API
// (`{ show, hide }`) so existing callers (channel-utils.js,
// channel-component.js) need no changes.
//
// Visual state (whether the popup is visible and the data it shows) lives in
// Preact state held by a small Root component; `show(...)` and `hide()` drive a
// mutable controller the Root wires to its setter via `useEffect`. The
// assign-name input is a controlled input (its value is Preact state, not a DOM
// ref), because confined event handlers receive a frozen SafeEvent with no DOM
// nodes. The same `.profile-popup-*` / `.pedigree-*` CSS classes are reused so
// index.css styling continues to apply and the popup looks identical.

/**
 * @typedef {object} ProfilePopupData
 * @property {string} proposedName
 * @property {string[]} pedigree
 * @property {string[]} [pedigreeMemberIds] - Member IDs corresponding to pedigree entries
 * @property {Map<string, string>} [nameMap] - Local address book mapping memberId to assigned name
 * @property {string} [yourName]
 * @property {(name: string) => void} [onAssignName]
 */

/**
 * @typedef {object} ProfilePopupAPI
 * @property {(options: { proposedName: string, pedigree: string[], pedigreeMemberIds?: string[], nameMap?: Map<string, string>, yourName?: string, onAssignName?: (name: string) => void, anchorElement: HTMLElement }) => void} show
 * @property {() => void} hide
 */

/**
 * Render one pedigree entry. Prefers the viewer's assigned name from the
 * address book (shown with a `named` class and the proposed name in the title);
 * falls back to the proposed name in scare quotes.
 *
 * @param {string} name - Proposed name from the pedigree
 * @param {number} index - Index in the pedigree array
 * @param {string[] | undefined} pedigreeMemberIds
 * @param {Map<string, string> | undefined} nameMap
 * @returns {import('preact').VNode}
 */
const renderPedigreeName = (name, index, pedigreeMemberIds, nameMap) => {
  const memberId = pedigreeMemberIds && pedigreeMemberIds[index];
  const assigned = memberId && nameMap && nameMap.get(memberId);
  if (assigned) {
    return h(
      'span',
      {
        class: 'pedigree-name named',
        title: `Proposed: “${name}”`,
      },
      assigned,
    );
  }
  return h('span', { class: 'pedigree-name' }, `“${name}”`);
};
harden(renderPedigreeName);

/**
 * The invitation-chain row. Renders the pedigree as a sequence of names joined
 * by arrows and terminated by the proposed name (self); an empty pedigree
 * renders the "Channel Creator" marker.
 *
 * @param {object} props
 * @param {string} props.proposedName
 * @param {string[]} props.pedigree
 * @param {string[]} [props.pedigreeMemberIds]
 * @param {Map<string, string>} [props.nameMap]
 */
const PedigreeChain = ({
  proposedName,
  pedigree,
  pedigreeMemberIds,
  nameMap,
}) => {
  if (pedigree.length === 0) {
    return h('span', { class: 'pedigree-creator' }, 'Channel Creator');
  }
  /** @type {Array<import('preact').VNode | string>} */
  const parts = [];
  pedigree.forEach((name, index) => {
    parts.push(renderPedigreeName(name, index, pedigreeMemberIds, nameMap));
    parts.push(h('span', { class: 'pedigree-arrow' }, ' → '));
  });
  parts.push(
    h('span', { class: 'pedigree-name pedigree-self' }, `“${proposedName}”`),
  );
  return h(Fragment, null, ...parts);
};
harden(PedigreeChain);

/**
 * The popup itself (backdrop + card). Drives the assign-name input from state
 * (controlled input), submits on the Save button or Enter, and closes on the
 * close button, the backdrop, or Escape.
 *
 * @param {object} props
 * @param {ProfilePopupData} props.data
 * @param {() => void} props.onClose
 */
const ProfilePopup = ({ data, onClose }) => {
  const {
    proposedName,
    pedigree,
    pedigreeMemberIds,
    nameMap,
    yourName,
    onAssignName,
  } = data;

  const [nameValue, setNameValue] = useState(yourName || '');

  const submitName = () => {
    const name = nameValue.trim();
    if (name) {
      if (onAssignName) {
        onAssignName(name);
      }
      onClose();
    }
  };

  // A `display: contents` wrapper carries the Escape handler declaratively
  // (the keydown bubbles up from the autofocused name input) instead of a
  // `document`-level keydown listener; it generates no box, so layout and the
  // backdrop/card positioning are unchanged.
  return h(
    'div',
    {
      style: 'display: contents',
      /** @param {{ key?: string }} e */
      onKeyDown: e => {
        if (e.key === 'Escape') onClose();
      },
    },
    h('div', { class: 'profile-popup-backdrop', onClick: onClose }),
    h(
      'div',
      { class: 'profile-popup' },
      h(
        'div',
        { class: 'profile-popup-header' },
        h('span', { class: 'profile-proposed-name' }, `“${proposedName}”`),
        h(
          'button',
          {
            type: 'button',
            class: 'profile-popup-close',
            title: 'Close',
            onClick: onClose,
          },
          '×',
        ),
      ),
      h(
        'div',
        { class: 'profile-popup-body' },
        h(
          'div',
          { class: 'profile-popup-field' },
          h('label', null, 'Proposed Name'),
          h('span', { class: 'profile-field-value' }, proposedName),
        ),
        h(
          'div',
          { class: 'profile-popup-field' },
          h('label', null, 'Your Name for Them'),
          h('input', {
            type: 'text',
            class: 'profile-assign-name',
            placeholder: 'Assign a pet name…',
            value: nameValue,
            autofocus: true,
            /** @param {{ target: { value: string } }} e */
            onInput: e => setNameValue(e.target.value),
            /** @param {{ key?: string, preventDefault: () => void }} e */
            onKeyDown: e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitName();
              }
            },
          }),
        ),
        h(
          'div',
          { class: 'profile-popup-field' },
          h('label', null, 'Invitation Chain'),
          h(
            'div',
            { class: 'pedigree-chain' },
            h(PedigreeChain, {
              proposedName,
              pedigree,
              pedigreeMemberIds,
              nameMap,
            }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'profile-popup-actions' },
        h(
          'button',
          { type: 'button', class: 'profile-save-btn', onClick: submitName },
          'Save Name',
        ),
      ),
    ),
  );
};
harden(ProfilePopup);

/**
 * Root component: owns the popup's view state and exposes its `show`/`hide`
 * setters to the host via a mutable controller. Renders nothing while hidden so
 * the container is empty, matching the original `innerHTML = ''` teardown.
 *
 * @param {object} props
 * @param {{ setState?: (s: { data: ProfilePopupData | null }) => void }} props.controller
 */
const ProfilePopupRoot = ({ controller }) => {
  const [state, setState] = useState(
    /** @type {{ data: ProfilePopupData | null }} */ ({ data: null }),
  );

  useEffect(() => {
    controller.setState = setState;
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
  }, [controller]);

  if (!state.data) {
    return null;
  }

  return h(ProfilePopup, {
    data: state.data,
    onClose: () => setState({ data: null }),
  });
};
harden(ProfilePopupRoot);

/**
 * Create a reusable profile popup component.
 *
 * @param {HTMLElement} $container - Container element for the popup
 * @returns {ProfilePopupAPI}
 */
export const createProfilePopup = $container => {
  // Mutable bridge to the root component's state setter (populated by the
  // component's effect). Intentionally NOT hardened — the component writes its
  // setter onto it.
  /** @type {{ setState?: (s: { data: ProfilePopupData | null }) => void }} */
  const controller = {};

  // The popup is fixed-position and styled via the existing `.profile-popup-*`
  // classes; the container display is toggled to match the original behavior.
  $container.style.display = 'none';

  renderConfined(h(ProfilePopupRoot, { controller }), $container);

  const hide = () => {
    $container.style.display = 'none';
    if (controller.setState) {
      controller.setState({ data: null });
    }
  };

  /**
   * @param {object} options
   * @param {string} options.proposedName
   * @param {string[]} options.pedigree
   * @param {string[]} [options.pedigreeMemberIds] - Member IDs corresponding to pedigree entries
   * @param {Map<string, string>} [options.nameMap] - Local address book mapping memberId to assigned name
   * @param {string} [options.yourName]
   * @param {(name: string) => void} [options.onAssignName]
   * @param {HTMLElement} options.anchorElement
   */
  const show = ({
    proposedName,
    pedigree,
    pedigreeMemberIds,
    nameMap,
    yourName,
    onAssignName,
    anchorElement,
  }) => {
    void anchorElement; // reserved for future anchor-relative positioning
    $container.style.display = 'flex';
    if (controller.setState) {
      controller.setState({
        data: {
          proposedName,
          pedigree,
          pedigreeMemberIds,
          nameMap,
          yourName,
          onAssignName,
        },
      });
    }
  };

  return harden({ show, hide });
};
harden(createProfilePopup);
