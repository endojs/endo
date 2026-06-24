// Browser fixture: render the ItemActions Preact component through
// renderConfined under the app's severe lockdown and exercise the cancel
// confirm state machine, disabled states, and hook-state preservation across a
// host-driven re-render. Records pass/fail on globalThis for the runner.
//
// Locks down exactly as the app does (pre-lockdown.js + @endo/init).

import '../../pre-lockdown.js';
import '@endo/init';

import { h, renderConfined } from '../../setup-preact-container.js';
import { ItemActions } from '../../inventory/item-actions.js';

const results = [];
const check = (name, cond, detail = '') =>
  results.push({ name, pass: !!cond, detail: String(detail) });

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const host = document.getElementById('root');
const $ = sel => host.querySelector(sel);

(async () => {
  try {
    const calls = [];
    /** @type {Record<string, unknown>} */
    let props = {
      cancelDisabled: false,
      removeDisabled: false,
      removeTitle: 'Remove',
      onInspect: () => calls.push('inspect'),
      onCancel: () => {
        calls.push('cancel');
        return Promise.resolve();
      },
      onRemove: () => calls.push('remove'),
    };
    const mount = () => renderConfined(h(ItemActions, props), host);

    mount();
    await tick();

    // Structure
    check(
      'renders three buttons',
      host.querySelectorAll('button').length === 3,
    );
    check(
      'info button present',
      !!$('.info-button') && $('.info-button').textContent === 'ℹ',
    );
    check(
      'cancel button present',
      !!$('.cancel-button') && $('.cancel-button').textContent === '⊘',
    );
    check(
      'remove button present',
      !!$('.remove-button') && $('.remove-button').textContent === '×',
    );

    // Info
    $('.info-button').click();
    await tick();
    check('info click calls onInspect', calls.includes('inspect'));

    // Cancel: first click arms confirm
    $('.cancel-button').click();
    await tick();
    check(
      'first cancel click → confirming',
      $('.cancel-button').classList.contains('confirming'),
    );
    check(
      'confirming title',
      $('.cancel-button').title === 'Click again to cancel',
      $('.cancel-button').title,
    );
    check('first cancel click does not cancel yet', !calls.includes('cancel'));

    // Cancel: second click executes
    $('.cancel-button').click();
    await tick();
    await tick();
    check('second cancel click calls onCancel', calls.includes('cancel'));
    check(
      'after cancel → cancelled class',
      $('.cancel-button').classList.contains('cancelled'),
    );
    check('after cancel → disabled', $('.cancel-button').disabled === true);
    check(
      'after cancel → title Cancelled',
      $('.cancel-button').title === 'Cancelled',
      $('.cancel-button').title,
    );

    // Remove
    $('.remove-button').click();
    await tick();
    check('remove click calls onRemove', calls.includes('remove'));

    // Re-render with removeDisabled — preact preserves the cancel hook state.
    props = {
      ...props,
      removeDisabled: true,
      removeTitle: 'Cannot remove (immutable)',
    };
    mount();
    await tick();
    check('re-render disables remove', $('.remove-button').disabled === true);
    check(
      're-render updates remove title',
      $('.remove-button').title === 'Cannot remove (immutable)',
      $('.remove-button').title,
    );
    check(
      're-render preserves cancelled state (hook state survives)',
      $('.cancel-button').classList.contains('cancelled'),
    );
    const removeCallsBefore = calls.filter(c => c === 'remove').length;
    $('.remove-button').click();
    await tick();
    check(
      'disabled remove button does not call onRemove',
      calls.filter(c => c === 'remove').length === removeCallsBefore,
    );

    // Fresh mount with cancelDisabled (special name)
    props = {
      ...props,
      cancelDisabled: true,
      removeDisabled: false,
      removeTitle: 'Remove',
    };
    // remount into a clean host to reset hook state
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    renderConfined(h(ItemActions, props), host2);
    await tick();
    const cancel2 = host2.querySelector('.cancel-button');
    check('cancelDisabled → disabled', cancel2.disabled === true);
    check(
      'cancelDisabled title',
      cancel2.title === 'Cannot cancel system name',
      cancel2.title,
    );
    const cancelCallsBefore = calls.filter(c => c === 'cancel').length;
    cancel2.click();
    await tick();
    check(
      'disabled cancel does not enter confirm',
      !cancel2.classList.contains('confirming') &&
        calls.filter(c => c === 'cancel').length === cancelCallsBefore,
    );

    globalThis.__results = results;
  } catch (e) {
    globalThis.__results = [
      {
        name: 'probe threw',
        pass: false,
        detail: `${e.name}: ${e.message}\n${e.stack}`,
      },
    ];
  } finally {
    globalThis.__done = true;
  }
})();
