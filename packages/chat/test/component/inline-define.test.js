// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { createInlineDefine } from '../../inline-define.js';

const { document: testDocument } = createDOM();

// Mount inline-define into a bare container, matching how inline-command-form.js
// uses it: createInlineDefine({ $container, onSubmit, onExpand, onCancel,
// onValidityChange }) then focus()/isValid()/setDisabled()/dispose().
const setupDefine = async (overrides = {}) => {
  const $container = testDocument.createElement('div');
  $container.className = 'inline-eval-container';
  testDocument.body.appendChild($container);

  const events = { submit: [], expand: [], cancel: 0, validity: [] };

  const api = createInlineDefine({
    $container,
    onSubmit: data => events.submit.push(data),
    onExpand: data => events.expand.push(data),
    onCancel: () => {
      events.cancel += 1;
    },
    onValidityChange: valid => events.validity.push(valid),
    ...overrides,
  });

  // Let the root component's mount effect (which wires the controller) settle.
  await tick(80);
  return { $container, api, events };
};

const fireInput = ($el, value) => {
  $el.value = value;
  $el.dispatchEvent(new testDocument.defaultView.Event('input'));
};

const fireKeyDown = ($el, key, init = {}) => {
  $el.dispatchEvent(
    new testDocument.defaultView.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
};

test.serial('renders the source input and no slots initially', async t => {
  const { $container, api } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  t.truthy($source, 'source input rendered');
  t.is(
    $container.querySelectorAll('.inline-eval-endowment-group').length,
    0,
    'no slot rows initially',
  );
  t.false(api.isValid(), 'empty source is invalid');

  t.teardown(() => api.dispose());
});

test.serial('typing into the source updates getData and validity', async t => {
  const { $container, api, events } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, '1 + 1');
  await tick(20);

  t.deepEqual(
    api.getData(),
    { source: '1 + 1', slots: [] },
    'getData reflects source',
  );
  t.true(api.isValid(), 'non-empty source is valid');
  t.true(events.validity.includes(true), 'onValidityChange fired with true');

  t.teardown(() => api.dispose());
});

test.serial('typing @ at the start spawns a slot row', async t => {
  const { $container, api } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, '@');
  await tick(20);

  t.is(
    $container.querySelectorAll('.inline-eval-endowment-group').length,
    1,
    'one slot row created',
  );
  // The @ is stripped from the source.
  const $source2 = $container.querySelector('.inline-eval-input');
  t.is($source2.value, '', 'leading @ stripped from source');

  t.teardown(() => api.dispose());
});

test.serial('slot codeName and label feed getData', async t => {
  const { $container, api } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, '@');
  await tick(20);

  const $codeName = $container.querySelector('.inline-eval-petname');
  fireInput($codeName, 'foo');
  await tick(20);
  const $label = $container.querySelector('.inline-eval-codename');
  fireInput($label, 'a foo thing');
  await tick(20);

  // Source still needs a value to be valid.
  const $source2 = $container.querySelector('.inline-eval-input');
  fireInput($source2, 'foo()');
  await tick(20);

  t.deepEqual(
    api.getData(),
    { source: 'foo()', slots: [{ codeName: 'foo', label: 'a foo thing' }] },
    'getData includes the slot',
  );
  t.true(api.isValid());

  t.teardown(() => api.dispose());
});

test.serial('Enter on the source submits parsed data', async t => {
  const { $container, api, events } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, 'doThing()');
  await tick(20);
  fireKeyDown($source, 'Enter');
  await tick(20);

  t.is(events.submit.length, 1, 'onSubmit fired once');
  t.deepEqual(events.submit[0], { source: 'doThing()', slots: [] });

  t.teardown(() => api.dispose());
});

test.serial('Enter on empty source does not submit', async t => {
  const { $container, api, events } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireKeyDown($source, 'Enter');
  await tick(20);

  t.is(events.submit.length, 0, 'no submit on empty source');

  t.teardown(() => api.dispose());
});

test.serial('Cmd-Enter expands with a cursor position', async t => {
  const { $container, api, events } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, 'expr');
  await tick(20);
  fireKeyDown($source, 'Enter', { metaKey: true });
  await tick(20);

  t.is(events.expand.length, 1, 'onExpand fired once');
  t.is(events.expand[0].source, 'expr');
  t.is(
    typeof events.expand[0].cursorPosition,
    'number',
    'cursorPosition present',
  );

  t.teardown(() => api.dispose());
});

test.serial('Escape on the source cancels', async t => {
  const { $container, api, events } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireKeyDown($source, 'Escape');
  await tick(20);

  t.is(events.cancel, 1, 'onCancel fired');

  t.teardown(() => api.dispose());
});

test.serial('setData populates source and slots', async t => {
  const { $container, api } = await setupDefine();

  api.setData({
    source: 'compose(a, b)',
    slots: [
      { codeName: 'a', label: 'first' },
      { codeName: 'b', label: 'second' },
    ],
  });
  await tick(20);

  t.is(
    $container.querySelectorAll('.inline-eval-endowment-group').length,
    2,
    'two slot rows from setData',
  );
  const $source = $container.querySelector('.inline-eval-input');
  t.is($source.value, 'compose(a, b)', 'source set');
  t.deepEqual(api.getData(), {
    source: 'compose(a, b)',
    slots: [
      { codeName: 'a', label: 'first' },
      { codeName: 'b', label: 'second' },
    ],
  });

  t.teardown(() => api.dispose());
});

test.serial('clear empties source and slots', async t => {
  const { $container, api } = await setupDefine();

  api.setData({ source: 'x', slots: [{ codeName: 'a', label: 'first' }] });
  await tick(20);
  t.is($container.querySelectorAll('.inline-eval-endowment-group').length, 1);

  api.clear();
  await tick(20);

  t.is(
    $container.querySelectorAll('.inline-eval-endowment-group').length,
    0,
    'slots cleared',
  );
  const $source = $container.querySelector('.inline-eval-input');
  t.is($source.value, '', 'source cleared');
  t.deepEqual(api.getData(), { source: '', slots: [] });
  t.false(api.isValid());

  t.teardown(() => api.dispose());
});

test.serial('setDisabled disables the source and slot inputs', async t => {
  const { $container, api } = await setupDefine();

  api.setData({ source: 'x', slots: [{ codeName: 'a', label: 'l' }] });
  await tick(20);

  api.setDisabled(true);
  await tick(20);

  const $source = $container.querySelector('.inline-eval-input');
  t.true($source.disabled, 'source disabled');
  const $codeName = $container.querySelector('.inline-eval-petname');
  t.true($codeName.disabled, 'slot code name disabled');
  const $label = $container.querySelector('.inline-eval-codename');
  t.true($label.disabled, 'slot label disabled');

  api.setDisabled(false);
  await tick(20);
  const $source2 = $container.querySelector('.inline-eval-input');
  t.false($source2.disabled, 're-enabled');

  t.teardown(() => api.dispose());
});

test.serial('label defaults to codeName when blank', async t => {
  const { $container, api } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, '@');
  await tick(20);
  const $codeName = $container.querySelector('.inline-eval-petname');
  fireInput($codeName, 'bar');
  await tick(20);
  const $source2 = $container.querySelector('.inline-eval-input');
  fireInput($source2, 'bar');
  await tick(20);

  t.deepEqual(api.getData().slots, [{ codeName: 'bar', label: 'bar' }]);

  t.teardown(() => api.dispose());
});

test.serial('dispose unmounts the view', async t => {
  const { $container, api } = await setupDefine();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, 'x');
  await tick(20);

  api.dispose();
  await tick(20);

  t.falsy(
    $container.querySelector('.inline-eval-input'),
    'view removed after dispose',
  );
});
