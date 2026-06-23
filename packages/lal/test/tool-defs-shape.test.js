// @ts-check
/**
 * Guard the uniform tool-def shape lal's agent surface depends on.
 *
 * Every consumer reads flat fields: `spawnWorkerLoop` builds the agent
 * surface with `tools.map(({ name, summary }) => toAgentTool(...))`, and
 * `makeExecuteTool` keys the arg-validation map off `t.name` / `t.params`.
 * Nothing reads the OpenAI `{ type: 'function', function: { ... } }` shape.
 *
 * `editMessage` and `messageHistory` were originally authored in that
 * OpenAI shape, so their `name` / `summary` surfaced as `undefined` — the
 * tools were presented to the LLM nameless and were effectively dead. These
 * assertions pin every tool to the canonical `{ name, summary }` shape so a
 * future tool can't regress the surface the same way.
 */

import test from '@endo/ses-ava/prepare-endo.js';

import { tools } from '../tools/index.js';

test('every tool def exposes a flat string name and summary', t => {
  for (const def of tools) {
    t.is(
      typeof def.name,
      'string',
      `tool name should be a string: ${def.name}`,
    );
    t.true(def.name.length > 0, `tool name should be non-empty`);
    t.is(
      typeof def.summary,
      'string',
      `tool ${def.name} summary should be a string`,
    );
    t.true(
      def.summary.length > 0,
      `tool ${def.name} summary should be non-empty`,
    );
    // The OpenAI nesting is never consumed; its presence means a malformed
    // entry whose name/summary will surface as undefined.
    t.is(
      /** @type {any} */ (def).function,
      undefined,
      `tool ${def.name} must not use the OpenAI { function: {...} } shape`,
    );
    t.not(
      /** @type {any} */ (def).type,
      'function',
      `tool ${def.name} must not use the OpenAI { type: 'function' } shape`,
    );
  }
});

test('the previously-malformed mail tools surface with a name', t => {
  const byName = new Map(tools.map(def => [def.name, def]));
  for (const name of ['editMessage', 'messageHistory']) {
    const def = byName.get(name);
    t.truthy(def, `${name} should be present in the tool surface`);
    t.is(def?.name, name);
    t.is(typeof def?.summary, 'string');
  }
});
