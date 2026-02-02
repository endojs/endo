// @ts-check

// Set up DOM globals BEFORE importing chat modules
import { Window } from 'happy-dom';

const testWindow = new Window({ url: 'http://localhost:3000' });

// @ts-expect-error - happy-dom types
globalThis.window = testWindow;
// @ts-expect-error - happy-dom types
globalThis.document = testWindow.document;

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';
import { render, inferType, INTERFACE_TO_TYPE } from '../../value-render.js';

// ============ render tests ============

test('render null', t => {
  const result = render(null);
  t.is(result.tagName, 'SPAN');
  t.is(result.className, 'number');
  t.is(result.innerText, 'null');
});

test('render undefined', t => {
  const result = render(undefined);
  t.is(result.className, 'number');
  t.is(result.innerText, 'undefined');
});

test('render boolean true', t => {
  const result = render(true);
  t.is(result.className, 'number');
  t.is(result.innerText, 'true');
});

test('render boolean false', t => {
  const result = render(false);
  t.is(result.className, 'number');
  t.is(result.innerText, 'false');
});

test('render number', t => {
  const result = render(42);
  t.is(result.className, 'number');
  t.is(result.innerText, '42');
});

test('render large number with formatting', t => {
  const result = render(1234567);
  t.is(result.className, 'number');
  // Should have locale-specific formatting
  t.true(result.innerText.includes('1'));
  t.true(result.innerText.includes('234'));
});

test('render bigint', t => {
  const result = render(42n);
  t.is(result.className, 'bigint');
  t.true(result.innerText.includes('42'));
  t.true(result.innerText.endsWith('n'));
});

test('render string', t => {
  const result = render('hello');
  t.is(result.className, 'string');
  t.is(result.innerText, '"hello"');
});

test('render string with special characters', t => {
  const result = render('hello\nworld');
  t.is(result.className, 'string');
  t.true(result.innerText.includes('\\n'));
});

test('render empty array', t => {
  const result = render(harden([]));
  t.is(result.textContent, '[]');
});

test('render array with values', t => {
  const result = render(harden([1, 2, 3]));
  t.true(result.textContent?.includes('['));
  t.true(result.textContent?.includes(']'));
  t.true(result.textContent?.includes('1'));
  t.true(result.textContent?.includes('2'));
  t.true(result.textContent?.includes('3'));
});

test('render nested array', t => {
  const result = render(harden([[1, 2], [3, 4]]));
  // Should contain nested brackets
  const text = result.textContent || '';
  const openBrackets = (text.match(/\[/g) || []).length;
  t.true(openBrackets >= 3); // outer + 2 inner
});

test('render empty object', t => {
  const result = render(harden({}));
  t.is(result.textContent, '{}');
});

test('render object with properties', t => {
  const result = render(harden({ name: 'test', value: 42 }));
  t.true(result.textContent?.includes('{'));
  t.true(result.textContent?.includes('}'));
  t.true(result.textContent?.includes('"name"'));
  t.true(result.textContent?.includes('"test"'));
  t.true(result.textContent?.includes('"value"'));
  t.true(result.textContent?.includes('42'));
});

test('render nested object', t => {
  const result = render(harden({ outer: { inner: 1 } }));
  const text = result.textContent || '';
  const openBraces = (text.match(/\{/g) || []).length;
  t.true(openBraces >= 2);
});

test('render error', t => {
  const error = harden(new Error('Test error'));
  const result = render(error);
  t.is(result.className, 'error');
  t.is(result.innerText, 'Test error');
});

test('render remotable', t => {
  const remotable = Far('TestRemotable', {});
  const result = render(remotable);
  t.is(result.className, 'remotable');
  t.true(result.innerText.includes('TestRemotable'));
});

test('render promise shows pending indicator', t => {
  // Promises need special handling - they're passable as-is
  const promise = harden(Promise.resolve(42));
  const result = render(promise);
  t.is(result.innerText, '\u23F3'); // hourglass emoji
});

// Note: Tagged values in SES require makeTagged() from @endo/pass-style
// which is complex to set up. Skipping this test as it requires
// proper tagged value construction which is beyond simple harden().
test('render copyRecord shows object structure', t => {
  // Test what harden({[Symbol.toStringTag]: ...}) actually produces
  const record = harden({ name: 'test', value: 42 });
  const result = render(record);
  // Should render as a copyRecord
  t.true(result.textContent?.includes('{'));
  t.true(result.textContent?.includes('"name"'));
});

test('render mixed array', t => {
  const result = render(harden([1, 'two', true, null]));
  t.true(result.textContent?.includes('1'));
  t.true(result.textContent?.includes('"two"'));
  t.true(result.textContent?.includes('true'));
  t.true(result.textContent?.includes('null'));
});

test('render creates proper DOM structure for array', t => {
  const result = render(harden([1, 2]));
  const entries = result.querySelector('.entries');
  t.truthy(entries);
});

test('render creates proper DOM structure for object', t => {
  const result = render(harden({ a: 1 }));
  const entries = result.querySelector('.entries');
  t.truthy(entries);
});

// ============ inferType tests ============

test('inferType returns passStyle for null', t => {
  t.is(inferType(null), 'null');
});

test('inferType returns passStyle for undefined', t => {
  t.is(inferType(undefined), 'undefined');
});

test('inferType returns passStyle for boolean', t => {
  t.is(inferType(true), 'boolean');
  t.is(inferType(false), 'boolean');
});

test('inferType returns passStyle for number', t => {
  t.is(inferType(42), 'number');
});

test('inferType returns passStyle for bigint', t => {
  t.is(inferType(42n), 'bigint');
});

test('inferType returns passStyle for string', t => {
  t.is(inferType('hello'), 'string');
});

test('inferType returns passStyle for array', t => {
  t.is(inferType(harden([1, 2, 3])), 'copyArray');
});

test('inferType returns passStyle for object', t => {
  t.is(inferType(harden({ a: 1 })), 'copyRecord');
});

test('inferType returns passStyle for error', t => {
  t.is(inferType(harden(new Error('test'))), 'error');
});

test('inferType returns remotable for Far objects', t => {
  const remotable = Far('Generic', {});
  t.is(inferType(remotable), 'remotable');
});

// Note: inferType uses getInterfaceOf which returns the full interface string.
// The INTERFACE_TO_TYPE lookup matches against the type name extracted from
// the interface. Far('Alleged: EndoHost', {}) creates interface "Alleged: EndoHost"
// but the regex extracts "Alleged" not "EndoHost" when there's a colon.
// These tests verify the actual behavior of the lookup.

test('inferType returns profile for EndoHost interface', t => {
  // getInterfaceOf returns "Alleged: EndoHost", and the regex matches "EndoHost"
  const host = Far('EndoHost', {});
  t.is(inferType(host), 'profile');
});

test('inferType returns profile for EndoGuest interface', t => {
  const guest = Far('EndoGuest', {});
  t.is(inferType(guest), 'profile');
});

test('inferType returns directory for EndoDirectory interface', t => {
  const dir = Far('EndoDirectory', {});
  t.is(inferType(dir), 'directory');
});

test('inferType returns worker for EndoWorker interface', t => {
  const worker = Far('EndoWorker', {});
  t.is(inferType(worker), 'worker');
});

test('inferType returns handle for Handle interface', t => {
  const handle = Far('Handle', {});
  t.is(inferType(handle), 'handle');
});

test('inferType returns invitation for Invitation interface', t => {
  const invitation = Far('Invitation', {});
  t.is(inferType(invitation), 'invitation');
});

test('inferType returns readable for EndoReadable interface', t => {
  const readable = Far('EndoReadable', {});
  t.is(inferType(readable), 'readable');
});

// ============ INTERFACE_TO_TYPE tests ============

test('INTERFACE_TO_TYPE has expected mappings', t => {
  t.is(INTERFACE_TO_TYPE.EndoHost, 'profile');
  t.is(INTERFACE_TO_TYPE.EndoGuest, 'profile');
  t.is(INTERFACE_TO_TYPE.Endo, 'profile');
  t.is(INTERFACE_TO_TYPE.EndoDirectory, 'directory');
  t.is(INTERFACE_TO_TYPE.EndoWorker, 'worker');
  t.is(INTERFACE_TO_TYPE.Handle, 'handle');
  t.is(INTERFACE_TO_TYPE.Invitation, 'invitation');
  t.is(INTERFACE_TO_TYPE.EndoReadable, 'readable');
  t.is(INTERFACE_TO_TYPE.AsyncIterator, 'readable');
});
