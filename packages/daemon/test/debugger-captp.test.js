// @ts-check
/* global setTimeout */

/**
 * @file CapTP debugger integration tests.
 *
 * These tests verify that the Debugger exo (which wraps a
 * DebugSession) works correctly when accessed over CapTP via
 * eventual send.  A mock DebugSession simulates the xsbug XML
 * protocol responses so that these tests run without a real XS
 * worker.
 *
 * The architecture under test mirrors the production topology:
 *
 *   [companion worker]  --E()--> [Debugger exo] --> [DebugSession]
 *                                     |
 *                              CapTP loopback
 *
 * Each test creates a fresh loopback CapTP pair, exposes a Debugger
 * exo on the near side, and drives it from the far side using `E()`.
 */

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/far';
import { makeLoopback } from '@endo/captp';

import { makeDebugSession } from '../src/debug-session.js';
import { makeDebugger } from '../src/debugger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();

/** Yield to the microtask queue so CapTP dispatches complete. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Feed XML text into a debug session, simulating bytes arriving
 * from a worker over the envelope bus.
 *
 * @param {import('../src/types.js').DebugSession} session
 * @param {string} xml
 */
const feedXml = (session, xml) => {
  session.feedXml(textEncoder.encode(xml));
};

/**
 * Create a Debugger exo backed by a mock session that captures
 * outbound commands and lets the test feed inbound XML.
 *
 * @returns {{
 *   session: import('../src/types.js').DebugSession,
 *   debugger: ReturnType<typeof makeDebugger>,
 *   outbound: string[],
 * }}
 */
const makeTestDebugger = () => {
  const textDecoder = new TextDecoder();
  /** @type {string[]} */
  const outbound = [];

  const session = makeDebugSession(bytes => {
    outbound.push(textDecoder.decode(bytes));
  });

  const dbg = makeDebugger(session);
  return { session, debugger: dbg, outbound };
};

/**
 * Set up a CapTP loopback and expose the debugger on the far side.
 *
 * @param {ReturnType<typeof makeDebugger>} dbg
 */
const makeCapTPDebugger = async dbg => {
  const { makeFar } = makeLoopback('debugger-test');
  /** @type {any} */
  const remote = await makeFar(dbg);
  return remote;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('help returns description over CapTP', async t => {
  const { debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  const msg = /** @type {string} */ (await E(remote).help());
  t.is(typeof msg, 'string');
  t.true(msg.length > 0);
});

test('go sends go command over CapTP', async t => {
  const { debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  await E(remote).go();
  t.true(outbound.some(s => s.includes('<go/>')));
});

test('setBreakpoint and clearBreakpoint over CapTP', async t => {
  const { debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  await E(remote).setBreakpoint('/test.js', 10);
  t.true(outbound.some(s => s.includes('set-breakpoint')));
  t.true(outbound.some(s => s.includes('path="/test.js"')));
  t.true(outbound.some(s => s.includes('line="10"')));

  await E(remote).clearBreakpoint('/test.js', 10);
  t.true(outbound.some(s => s.includes('clear-breakpoint')));
});

test('clearAllBreakpoints over CapTP', async t => {
  const { debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  await E(remote).clearAllBreakpoints();
  t.true(outbound.some(s => s.includes('clear-all-breakpoints')));
});

test('getFrames returns stack frames over CapTP', async t => {
  const { session, debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  // Simulate a break.
  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="5">debugger statement</break>');

  // Start the frames request, flush so CapTP dispatches it,
  // then feed the response XML.
  const framesP = E(remote).getFrames();
  await flush();
  feedXml(
    session,
    '<frames>' +
      '<frame name="main" value="()" path="/app.js" line="5"/>' +
      '<frame name="run" value="()" path="/boot.js" line="1"/>' +
      '</frames>',
  );

  const frames = await framesP;
  t.is(frames.length, 2);
  t.is(frames[0].name, 'main');
  t.is(frames[0].path, '/app.js');
  t.is(frames[0].line, 5);
  t.is(frames[1].name, 'run');
});

test('getLocals returns local variables over CapTP', async t => {
  const { session, debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="3">hit</break>');

  const localsP = E(remote).getLocals();
  await flush();
  feedXml(
    session,
    '<local>' +
      '<property name="x" value="42" flags=""/>' +
      '<property name="msg" value="hello" flags=""/>' +
      '</local>',
  );

  const locals = await localsP;
  t.is(locals.length, 2);
  t.is(locals[0].name, 'x');
  t.is(locals[0].value, '42');
  t.is(locals[1].name, 'msg');
  t.is(locals[1].value, 'hello');
});

test('getGlobals returns global scope over CapTP', async t => {
  const { session, debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="1">hit</break>');

  const globalsP = E(remote).getGlobals();
  await flush();
  feedXml(
    session,
    '<global>' +
      '<property name="globalThis" value="[object Object]" flags=""/>' +
      '</global>',
  );

  const globals = await globalsP;
  t.is(globals.length, 1);
  t.is(globals[0].name, 'globalThis');
});

test('evaluate expression while stopped over CapTP', async t => {
  const { session, debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="1">hit</break>');

  const evalP = E(remote).evaluate('1 + 2');
  await flush();

  // Verify the script command was sent.
  t.true(outbound.some(s => s.includes('<script')));
  t.true(outbound.some(s => s.includes('1 + 2')));

  // Simulate eval response.
  feedXml(session, '<eval>3</eval>');

  const result = await evalP;
  t.is(result, '3');
});

test('step advances and returns break event over CapTP', async t => {
  const { session, debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="1">hit</break>');

  const stepP = E(remote).step();
  await flush();

  // Simulate the worker stopping at the next line.
  feedXml(session, '<break path="/app.js" line="2">step</break>');

  const event = await stepP;
  t.is(event.path, '/app.js');
  t.is(event.line, 2);
  t.is(event.message, 'step');
});

test('setExceptionBreakMode sends correct commands over CapTP', async t => {
  const { debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  await E(remote).setExceptionBreakMode('all');
  t.true(outbound.some(s => s.includes('path="exceptions"')));
  t.true(
    outbound.some(
      s => s.includes('set-breakpoint') && s.includes('exceptions'),
    ),
  );
});

test('isBroken reflects session state over CapTP', async t => {
  const { session, debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  const before = await E(remote).isBroken();
  t.false(before);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="1">hit</break>');

  const after = await E(remote).isBroken();
  t.true(after);
});

test('getLastBreak returns most recent break event over CapTP', async t => {
  const { session, debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  const none = await E(remote).getLastBreak();
  t.is(none, null);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="7">breakpoint hit</break>');

  const event = await E(remote).getLastBreak();
  t.is(event.path, '/app.js');
  t.is(event.line, 7);
  t.is(event.message, 'breakpoint hit');
});

test('abort sends abort command over CapTP', async t => {
  const { debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  await E(remote).abort();
  t.true(outbound.some(s => s.includes('<abort/>')));
});

test('selectFrame sends select command over CapTP', async t => {
  const { session, debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="1">hit</break>');

  const localsP = E(remote).selectFrame('1');
  await flush();

  t.true(outbound.some(s => s.includes('select') && s.includes('id="1"')));

  feedXml(session, '<local><property name="y" value="99" flags=""/></local>');

  const locals = await localsP;
  t.is(locals.length, 1);
  t.is(locals[0].name, 'y');
  t.is(locals[0].value, '99');
});

test('nested object properties are visible over CapTP', async t => {
  const { session, debugger: dbg } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="1">hit</break>');

  const localsP = E(remote).getLocals();
  await flush();

  feedXml(
    session,
    '<local>' +
      '<node name="obj" value="[object Object]" flags="">' +
      '<property name="a" value="1" flags=""/>' +
      '<property name="b" value="2" flags=""/>' +
      '</node>' +
      '</local>',
  );

  const locals = await localsP;
  t.is(locals.length, 1);
  t.is(locals[0].name, 'obj');
  t.truthy(locals[0].children);
  t.is(locals[0].children.length, 2);
  t.is(locals[0].children[0].name, 'a');
  t.is(locals[0].children[0].value, '1');
  t.is(locals[0].children[1].name, 'b');
  t.is(locals[0].children[1].value, '2');
});

test('full debug session lifecycle over CapTP', async t => {
  const { session, debugger: dbg, outbound } = makeTestDebugger();
  const remote = await makeCapTPDebugger(dbg);

  // 1. Set a breakpoint before the program runs.
  await E(remote).setBreakpoint('/app.js', 3);
  t.true(outbound.some(s => s.includes('set-breakpoint')));

  // 2. Configure exception break mode.
  await E(remote).setExceptionBreakMode('uncaught');
  t.true(outbound.some(s => s.includes('uncaughtExceptions')));

  // 3. Simulate the worker hitting the breakpoint.
  feedXml(session, '<xsbug>');
  feedXml(session, '<break path="/app.js" line="3">breakpoint</break>');

  const broken = await E(remote).isBroken();
  t.true(broken);

  // 4. Inspect frames.
  const framesP = E(remote).getFrames();
  await flush();
  feedXml(
    session,
    '<frames>' +
      '<frame name="myFunc" value="(x)" path="/app.js" line="3"/>' +
      '</frames>',
  );
  const frames = await framesP;
  t.is(frames.length, 1);
  t.is(frames[0].name, 'myFunc');

  // 5. Inspect locals.
  const localsP = E(remote).getLocals();
  await flush();
  feedXml(session, '<local><property name="x" value="42" flags=""/></local>');
  const locals = await localsP;
  t.is(locals[0].name, 'x');
  t.is(locals[0].value, '42');

  // 6. Evaluate an expression.
  const evalP = E(remote).evaluate('x * 2');
  await flush();
  feedXml(session, '<eval>84</eval>');
  const result = await evalP;
  t.is(result, '84');

  // 7. Step to next line.
  const stepP = E(remote).step();
  await flush();
  feedXml(session, '<break path="/app.js" line="4">step</break>');
  const stepEvent = await stepP;
  t.is(stepEvent.line, 4);

  // 8. Resume execution.
  await E(remote).go();
  t.true(outbound.some(s => s.includes('<go/>')));

  // 9. Clear breakpoints.
  await E(remote).clearAllBreakpoints();
  t.true(outbound.some(s => s.includes('clear-all-breakpoints')));
});
