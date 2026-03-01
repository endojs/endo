// @ts-check
/* global document, setTimeout */

/**
 * @typedef {object} ProfilePopupAPI
 * @property {(options: { proposedName: string, pedigree: string[], yourName?: string, onAssignName?: (name: string) => void, anchorElement: HTMLElement }) => void} show
 * @property {() => void} hide
 */

/**
 * Create a reusable profile popup component.
 *
 * @param {HTMLElement} $container - Container element for the popup
 * @returns {ProfilePopupAPI}
 */
export const createProfilePopup = $container => {
  let visible = false;

  const hide = () => {
    visible = false;
    $container.innerHTML = '';
    $container.style.display = 'none';
  };

  /**
   * @param {object} options
   * @param {string} options.proposedName
   * @param {string[]} options.pedigree
   * @param {string} [options.yourName]
   * @param {(name: string) => void} [options.onAssignName]
   * @param {HTMLElement} options.anchorElement
   */
  const show = ({
    proposedName,
    pedigree,
    yourName,
    onAssignName,
    anchorElement,
  }) => {
    void anchorElement; // reserved for future anchor-relative positioning
    visible = true;

    const pedigreeHtml =
      pedigree.length > 0
        ? pedigree
            .map(
              name =>
                `<span class="pedigree-name">\u201C${name}\u201D</span>`,
            )
            .join(' <span class="pedigree-arrow">\u2192</span> ') +
          ` <span class="pedigree-arrow">\u2192</span> <span class="pedigree-name pedigree-self">\u201C${proposedName}\u201D</span>`
        : '<span class="pedigree-creator">Channel Creator</span>';

    $container.innerHTML = `
      <div class="profile-popup-backdrop"></div>
      <div class="profile-popup">
        <div class="profile-popup-header">
          <span class="profile-proposed-name">\u201C${proposedName}\u201D</span>
          <button type="button" class="profile-popup-close" title="Close">&times;</button>
        </div>
        <div class="profile-popup-body">
          <div class="profile-popup-field">
            <label>Proposed Name</label>
            <span class="profile-field-value">${proposedName}</span>
          </div>
          <div class="profile-popup-field">
            <label>Your Name for Them</label>
            <input type="text" class="profile-assign-name" placeholder="Assign a pet name\u2026"
                   value="${yourName || ''}" />
          </div>
          <div class="profile-popup-field">
            <label>Invitation Chain</label>
            <div class="pedigree-chain">${pedigreeHtml}</div>
          </div>
        </div>
        <div class="profile-popup-actions"><button type="button" class="profile-save-btn">Save Name</button></div>
      </div>
    `;

    $container.style.display = 'flex';

    const $close = $container.querySelector('.profile-popup-close');
    if ($close) {
      $close.addEventListener('click', hide);
    }

    const $backdrop = $container.querySelector('.profile-popup-backdrop');
    if ($backdrop) {
      $backdrop.addEventListener('click', hide);
    }

    const $saveBtn = $container.querySelector('.profile-save-btn');
    const $nameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('.profile-assign-name')
    );
    if ($saveBtn && $nameInput) {
      const submitName = () => {
        const name = $nameInput.value.trim();
        if (name) {
          if (onAssignName) {
            onAssignName(name);
          }
          hide();
        }
      };
      $saveBtn.addEventListener('click', submitName);
      $nameInput.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitName();
        }
      });
    }

    // Close on Escape
    const handleEscape = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape' && visible) {
        hide();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    // Delay to avoid catching the current event
    setTimeout(() => {
      document.addEventListener('keydown', handleEscape);
    }, 0);
  };

  return harden({ show, hide });
};
harden(createProfilePopup);
