// @ts-check
/**
 * Tests that validate the JSON encoding pipeline between the fae agent's
 * reply tool and the whylip UI's parseResponse function.
 *
 * The pipeline is:
 *   1. Anthropic API returns tool_use with `input` (parsed object)
 *   2. Anthropic provider does JSON.stringify(block.input) -> arguments string
 *   3. processToolCalls does JSON.parse(arguments) -> args object
 *      (decodeSmallcaps is equivalent to JSON.parse for plain JSON)
 *   4. reply tool extracts args.strings and calls E(powers).reply(n, strings, ...)
 *   5. Endo daemon marshals the strings across
 *   6. Whylip UI joins strings and calls parseResponse(text)
 *   7. parseResponse does JSON.parse(text)
 *
 * Hypothesis: when the LLM embeds HTML containing JavaScript with
 * escaped single quotes (e.g., 'the Sun\'s gravity'), the inner JSON
 * may contain \' which is NOT a valid JSON escape sequence, causing
 * JSON.parse to fail at step 7.
 */

import test from 'ava';

// ---------------------------------------------------------------------------
// Simulated whylip parseResponse — ORIGINAL (before fix)
// ---------------------------------------------------------------------------
const parseResponseOriginal = text => {
  const trimmed = text.trim();
  try {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        narrative:
          typeof parsed.narrative === 'string' ? parsed.narrative : trimmed,
        scene:
          parsed.scene &&
          typeof parsed.scene.html === 'string' &&
          typeof parsed.scene.title === 'string'
            ? parsed.scene
            : null,
      };
    }
  } catch {
    // not JSON
  }
  return { narrative: trimmed, scene: null };
};

// ---------------------------------------------------------------------------
// Simulated whylip parseResponse — UPDATED (with lenient fallback)
// Mirrors useConversation.js exactly.
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
const JSON_ESCAPE_MAP = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

const lenientUnescape = raw => {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, ch) => {
      if (ch.startsWith('u')) {
        return String.fromCharCode(parseInt(ch.slice(1), 16));
      }
      return JSON_ESCAPE_MAP[ch] ?? ch;
    });
  }
};

const parseResponse = text => {
  let trimmed = text.trim();

  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim();
  }

  const extractFromParsed = (obj, method) => {
    const o = /** @type {Record<string, unknown>} */ (obj);
    const narrative = typeof o.narrative === 'string' ? o.narrative : trimmed;
    const s = /** @type {Record<string, unknown> | null} */ (o.scene);
    const scene =
      s && typeof s.html === 'string' && typeof s.title === 'string'
        ? /** @type {{ title: string, html: string }} */ (s)
        : null;
    return { narrative, scene, method };
  };

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return extractFromParsed(parsed, 'json');
    }
  } catch {
    // not direct JSON
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        return extractFromParsed(parsed, 'json');
      }
    } catch {
      // regex match wasn't valid JSON
    }
  }

  const narrativeMatch = trimmed.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sceneTitleMatch = trimmed.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sceneHtmlMatch = trimmed.match(
    /"html"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"\s*\}\s*\}$/,
  );

  if (narrativeMatch) {
    const narrative = lenientUnescape(narrativeMatch[1]);
    let scene = null;
    if (sceneTitleMatch && sceneHtmlMatch) {
      const title = lenientUnescape(sceneTitleMatch[1]);
      const html = lenientUnescape(sceneHtmlMatch[1]);
      scene = { title, html };
    }
    return { narrative, scene, method: 'regex' };
  }

  const looksLikeJson =
    trimmed.startsWith('{') && trimmed.includes('"narrative"');
  if (looksLikeJson) {
    return {
      narrative: trimmed,
      scene: null,
      method: 'raw',
      parseError:
        'Your response could not be parsed as JSON. Ensure the reply ' +
        'contains a single valid JSON object with "narrative" and "scene" ' +
        "fields. Avoid JavaScript escapes like \\' inside JSON strings — " +
        'use Unicode escapes (\\u0027) instead.',
    };
  }

  return { narrative: trimmed, scene: null, method: 'raw' };
};

// ---------------------------------------------------------------------------
// Test payloads
// ---------------------------------------------------------------------------

// HTML with NO JavaScript single-quote escapes (first prompt — worked)
const htmlNoSingleQuoteEscapes =
  '<canvas id="c" width="500" height="500"></canvas>' +
  '<script>const W=500;const planets=[{name:"Mercury",a:60}];</script>';

// HTML WITH JavaScript single-quote escapes (second prompt — broke).
// The actual JS content uses: fact:'Too close to the Sun\'s gravity'
// which means the string characters are: \  '  s
const htmlWithSingleQuoteEscapes =
  '<div class="container"><h2>Moons</h2></div>' +
  "<script>const planets=[{name:'Mercury',fact:'Too close to the Sun\\'s gravity.'}];</script>";

/**
 * Simulate the Anthropic provider -> processToolCalls -> reply -> whylip
 * pipeline. This path uses JSON.stringify to produce the inner JSON, which
 * is the "correct" path (the LLM uses proper escaping).
 *
 * @param {string} narrative
 * @param {{ title: string, html: string }} scene
 * @returns {{ text: string, parsed: ReturnType<typeof parseResponse> }}
 */
const simulatePipeline = (narrative, scene) => {
  // Step 1: Construct the inner JSON with proper escaping
  const innerJson = JSON.stringify({ narrative, scene });

  // Step 2: Anthropic API returns input as a parsed object
  const anthropicInput = { messageNumber: 1, strings: [innerJson] };

  // Step 3: Anthropic provider does JSON.stringify(block.input)
  const argumentsString = JSON.stringify(anthropicInput);

  // Step 4: processToolCalls does JSON.parse (or decodeSmallcaps, equivalent)
  const args = JSON.parse(argumentsString);

  // Step 5+6: strings pass through Endo, whylip joins them
  const text = args.strings.join('').trim();

  // Step 7: parseResponse
  const parsed = parseResponse(text);
  return { text, parsed };
};

/**
 * Simulate pipeline when the LLM produces the inner JSON string
 * as raw text (may be slightly invalid JSON). The rawInnerJson is what
 * the Anthropic API has already parsed from the LLM's tool use output
 * and placed inside input.strings[0] as a JavaScript string value.
 *
 * @param {string} rawInnerJson
 * @param {{ useOriginal?: boolean }} [opts]
 * @returns {{ text: string, parsed: ReturnType<typeof parseResponse> }}
 */
const simulatePipelineRawLlmJson = (rawInnerJson, opts = {}) => {
  const anthropicInput = { messageNumber: 1, strings: [rawInnerJson] };
  const argumentsString = JSON.stringify(anthropicInput);
  const args = JSON.parse(argumentsString);
  const text = args.strings.join('').trim();
  const parse = opts.useOriginal ? parseResponseOriginal : parseResponse;
  const parsed = parse(text);
  return { text, parsed };
};

// ===========================================================================
// Core hypothesis tests
// ===========================================================================

test("JSON.parse rejects bare \\' in string values", t => {
  // Core hypothesis: \' inside a JSON string is invalid.
  // JSON only allows: \\ \" \/ \b \f \n \r \t \uXXXX
  //
  // Build a string containing literal characters: {"k":" \' "}
  // In JS source, we write "\\'" to get a literal backslash + apostrophe
  const invalidJson = `{"k":"\\'"}`;
  t.throws(
    () => JSON.parse(invalidJson),
    undefined,
    "JSON.parse should reject \\' as an invalid escape sequence",
  );
});

test("JSON.parse accepts \\\\' (escaped backslash + apostrophe)", t => {
  // \\' in JSON text means: escaped backslash (\) + literal apostrophe (')
  const validJson = `{"k":"\\\\'"}`;
  const parsed = JSON.parse(validJson);
  t.is(parsed.k, "\\'", 'value should be backslash + apostrophe');
});

// ===========================================================================
// Pipeline tests: correct encoding
// ===========================================================================

test('pipeline: HTML without JS single-quote escapes parses correctly', t => {
  const { parsed } = simulatePipeline('The planets orbit in ellipses.', {
    title: 'Orbits',
    html: htmlNoSingleQuoteEscapes,
  });
  t.is(parsed.narrative, 'The planets orbit in ellipses.');
  t.is(parsed.method, 'json');
  t.truthy(parsed.scene, 'scene should be extracted');
  t.is(parsed.scene?.title, 'Orbits');
  t.truthy(parsed.scene?.html.includes('<canvas'));
});

test('pipeline: HTML with JS single-quote escapes via JSON.stringify', t => {
  const { parsed } = simulatePipeline('Explore the moons.', {
    title: 'Moons',
    html: htmlWithSingleQuoteEscapes,
  });
  t.is(parsed.narrative, 'Explore the moons.');
  t.is(parsed.method, 'json');
  t.truthy(parsed.scene, 'scene should be extracted');
  t.is(parsed.scene?.title, 'Moons');
  t.truthy(parsed.scene?.html.includes("Sun\\'s gravity"));
});

// ===========================================================================
// Pipeline tests: LLM-generated raw JSON (the bug scenario)
// ===========================================================================

test(`HYPOTHESIS: ORIGINAL parser fails with bare \\' in inner JSON`, t => {
  // The LLM generates an inner JSON string where the HTML contains \'
  // (invalid JSON escape) instead of the correct \\'.
  const innerJsonBad =
    '{"narrative":"The moons","scene":{"title":"Moons","html":' +
    '"<script>const f=' +
    "'" +
    'Sun' +
    "\\'" +
    's' +
    "'" +
    ';</script>"}}';

  // Confirm the inner JSON IS invalid
  t.throws(
    () => JSON.parse(innerJsonBad),
    undefined,
    "inner JSON with bare \\' should be invalid",
  );

  // ORIGINAL parser: falls back to raw JSON as narrative (the bug)
  const { parsed } = simulatePipelineRawLlmJson(innerJsonBad, {
    useOriginal: true,
  });
  t.is(parsed.scene, null, 'ORIGINAL: scene is null');
  t.is(
    parsed.narrative,
    innerJsonBad,
    'ORIGINAL: raw JSON dumped as narrative',
  );
});

test(`FIXED parser recovers from bare \\' in inner JSON`, t => {
  const innerJsonBad =
    '{"narrative":"The moons","scene":{"title":"Moons","html":' +
    '"<script>const f=' +
    "'" +
    'Sun' +
    "\\'" +
    's' +
    "'" +
    ';</script>"}}';

  // FIXED parser: extracts narrative + scene via regex fallback
  const { parsed } = simulatePipelineRawLlmJson(innerJsonBad);
  t.is(parsed.narrative, 'The moons', 'FIXED: narrative extracted');
  t.truthy(parsed.scene, 'FIXED: scene extracted via regex fallback');
  t.is(parsed.scene?.title, 'Moons');
});

test("pipeline succeeds with properly escaped \\\\' in inner JSON", t => {
  // When the LLM correctly uses \\' (escaped backslash + apostrophe)
  // in the inner JSON, it parses fine.
  const innerJsonGood =
    '{"narrative":"The moons","scene":{"title":"Moons","html":' +
    '"<script>const f=' +
    "'" +
    'Sun' +
    "\\\\'" +
    's' +
    "'" +
    ';</script>"}}';

  const result = JSON.parse(innerJsonGood);
  t.is(result.narrative, 'The moons');
  t.truthy(result.scene.html.includes("Sun\\'s"));

  const pipeResult = simulatePipelineRawLlmJson(innerJsonGood);
  t.is(pipeResult.parsed.narrative, 'The moons');
  t.truthy(pipeResult.parsed.scene, 'scene should be extracted');
});

// ===========================================================================
// Escaping level trace
// ===========================================================================

test('JSON.stringify produces the correct escaping for inner JSON', t => {
  // Desired HTML content (actual characters):
  //   fact:'Sun\'s gravity'
  // As a JS string literal: "fact:'Sun\\'s gravity'"
  const desiredHtml = "fact:'Sun\\'s gravity'";

  // JSON.stringify encodes the backslash as \\
  const innerJson = JSON.stringify({
    narrative: 'test',
    scene: { title: 'T', html: desiredHtml },
  });

  // The inner JSON text should contain \\' for the backslash-apostrophe
  t.truthy(
    innerJson.includes("\\\\'"),
    "inner JSON should have \\\\' for the backslash-apostrophe",
  );

  // The inner JSON should be valid and round-trip correctly
  const roundTripped = JSON.parse(innerJson);
  t.is(roundTripped.scene.html, desiredHtml);
});

test('end-to-end: JSON.stringify inner JSON survives full pipeline', t => {
  const desiredHtml = "fact:'Sun\\'s gravity'";
  const innerJson = JSON.stringify({
    narrative: 'test',
    scene: { title: 'T', html: desiredHtml },
  });

  const { parsed } = simulatePipelineRawLlmJson(innerJson);
  t.truthy(parsed.scene, 'scene should parse when JSON.stringify is used');
  t.is(parsed.scene?.html, desiredHtml);
});

// ===========================================================================
// Reproduce the actual bug from the worker log
// ===========================================================================

test('ORIGINAL parser: second response fails JSON.parse', t => {
  // Build the string exactly as it would arrive at parseResponse.
  // The HTML contains JS: fact:'Sun\'s gravity'
  // The \' (backslash + apostrophe) is invalid JSON.
  const stringsZero =
    '{"narrative":"The moons","scene":{"title":"Moons","html":' +
    '"<script>const f=' +
    "'" +
    'Sun' +
    "\\'" +
    "s';</script>" +
    '"}}';

  // Invalid JSON
  t.throws(() => JSON.parse(stringsZero), undefined, 'invalid JSON');

  // ORIGINAL parser falls back to raw text — the observed bug
  const result = parseResponseOriginal(stringsZero);
  t.is(result.scene, null, 'no scene extracted');
  t.is(
    result.narrative,
    stringsZero,
    'entire JSON dumped as narrative (the observed bug)',
  );
});

test('the first response (no single-quote escapes) parses fine', t => {
  const stringsZero =
    '{"narrative":"The Dance of Worlds","scene":{"title":"Orbits","html":' +
    '"<canvas id=\\"c\\"></canvas><script>let t=0;</script>"}}';

  const result = parseResponse(stringsZero);
  t.is(result.narrative, 'The Dance of Worlds');
  t.truthy(result.scene, 'scene should be extracted');
  t.is(result.scene?.title, 'Orbits');
});

// ===========================================================================
// Updated parseResponse (with regex fallback + lenient unescape)
// ===========================================================================

test('FIXED parser: recovers narrative + scene from invalid JSON', t => {
  const stringsZero =
    '{"narrative":"The moons","scene":{"title":"Moons","html":' +
    '"<script>const f=' +
    "'" +
    'Sun' +
    "\\'" +
    "s';</script>" +
    '"}}';

  const result = parseResponse(stringsZero);
  t.is(result.narrative, 'The moons', 'narrative should be extracted');
  t.is(result.method, 'regex', 'should use regex fallback');
  t.falsy(result.parseError, 'no parseError when regex succeeds');
  t.truthy(result.scene, 'scene should be extracted via regex fallback');
  t.is(result.scene?.title, 'Moons');
  t.truthy(
    result.scene?.html.includes("Sun's"),
    "html should contain unescaped Sun's",
  );
});

test('FIXED parser: handles \\n in narrative from invalid JSON', t => {
  const stringsZero =
    '{"narrative":"Line one\\nLine two","scene":{"title":"T","html":' +
    '"<script>const x=' +
    "'" +
    "it\\'" +
    "s';</script>" +
    '"}}';

  const result = parseResponse(stringsZero);
  t.is(result.narrative, 'Line one\nLine two', 'newlines should be unescaped');
  t.is(result.method, 'regex');
  t.truthy(result.scene, 'scene should be extracted');
});

test('FIXED parser: handles escaped quotes in HTML attributes', t => {
  const stringsZero =
    '{"narrative":"Text","scene":{"title":"T","html":' +
    '"<div class=\\"box\\">content</div><script>const x=' +
    "'" +
    "it\\'" +
    "s';</script>" +
    '"}}';

  const result = parseResponse(stringsZero);
  t.is(result.narrative, 'Text');
  t.is(result.method, 'regex');
  t.truthy(result.scene, 'scene with escaped quotes should parse');
  t.truthy(result.scene?.html.includes('class="box"'));
});

test('FIXED parser: still works with valid JSON (no fallback needed)', t => {
  const valid = JSON.stringify({
    narrative: 'Hello world',
    scene: { title: 'Test', html: '<div>hi</div>' },
  });

  const result = parseResponse(valid);
  t.is(result.narrative, 'Hello world');
  t.is(result.method, 'json');
  t.falsy(result.parseError);
  t.truthy(result.scene);
  t.is(result.scene?.title, 'Test');
});

test('parseError: set when text looks like JSON but all parsing fails', t => {
  // JSON-like text where:
  //  - JSON.parse fails (bare identifier `broken`)
  //  - Regex fallback fails (narrative value not a quoted string)
  //  - Text starts with { and contains "narrative" → parseError
  const garbled = '{"narrative":broken content here, "scene": stuff}';

  const result = parseResponse(garbled);
  t.is(result.method, 'raw');
  t.truthy(result.parseError, 'parseError should be set');
  t.truthy(
    result.parseError?.includes('could not be parsed'),
    'error should describe the problem',
  );
});

test('parseError: NOT set for plain text responses', t => {
  const result = parseResponse('Just a regular text message.');
  t.is(result.method, 'raw');
  t.falsy(result.parseError, 'no parseError for plain text');
  t.is(result.narrative, 'Just a regular text message.');
});

test('parseError: NOT set for valid JSON', t => {
  const valid = JSON.stringify({
    narrative: 'Works',
    scene: null,
  });
  const result = parseResponse(valid);
  t.is(result.method, 'json');
  t.falsy(result.parseError);
});

test('lenientUnescape: handles standard JSON escapes', t => {
  t.is(lenientUnescape('hello\\nworld'), 'hello\nworld');
  t.is(lenientUnescape('tab\\there'), 'tab\there');
  t.is(lenientUnescape('quote\\"here'), 'quote"here');
  t.is(lenientUnescape('back\\\\slash'), 'back\\slash');
});

test(`lenientUnescape: handles non-standard \\' escape`, t => {
  t.is(lenientUnescape("it\\'s"), "it's");
  t.is(lenientUnescape("Sun\\'s gravity"), "Sun's gravity");
});

test('lenientUnescape: handles unicode escapes', t => {
  t.is(lenientUnescape('em\\u2014dash'), 'em\u2014dash');
});
