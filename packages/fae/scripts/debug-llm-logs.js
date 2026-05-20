#!/usr/bin/env node
// @ts-check
/* global process, Buffer */
/* eslint-disable no-await-in-loop, no-console, no-continue */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PROVIDER_ERROR_PATTERNS = [
  /Provider returned error/i,
  /\b4\d\d\b/,
  /\b5\d\d\b/,
  /API error/i,
  /Bad Request/i,
  /LLM error/i,
  /Temporary logging of sent error/i,
];

const SES_ERROR_PATTERNS = [
  /SES_UNHANDLED_REJECTION/,
  /CapTP .* exception/i,
  /TypeError#/i,
  /Error#/i,
];

const FAE_ERROR_PATTERNS = [
  /\[fae\] background error:/,
  /\[fae\] empty-content fallthrough/,
  /\[tool\] \S+ error:/,
];

const ERROR_PATTERNS = [
  ...PROVIDER_ERROR_PATTERNS,
  ...SES_ERROR_PATTERNS,
  ...FAE_ERROR_PATTERNS,
];

const SIGNAL_PATTERNS = [
  /\[LAL\] Using /,
  /\[LAL\] Calling /,
  /\[fae\] New message/,
  /\[fae\] context has /,
  /\[fae\] chat messages:/,
  /\[fae\] sent:/,
  /\[fae\] tool results:/,
  ...ERROR_PATTERNS,
];

// Categories used by --summary to bucket and tally error lines. Tool errors
// are tracked per-tool elsewhere, so they are deliberately omitted here.
const ERROR_CATEGORIES = [
  { name: 'SES_UNHANDLED_REJECTION', pattern: /SES_UNHANDLED_REJECTION/ },
  { name: 'CapTP exception', pattern: /CapTP .* exception/i },
  { name: 'provider HTTP error', pattern: /\b[45]\d\d\b/ },
  { name: 'provider returned error', pattern: /Provider returned error/i },
  { name: 'fae background error', pattern: /\[fae\] background error:/ },
  {
    name: 'fae empty-content fallthrough',
    pattern: /\[fae\] empty-content fallthrough/,
  },
];

const usage = `Usage: yarn debug:llm [options]

Inspect Endo Application Support logs for Fae/Lal LLM provider issues.

Options:
  --state=<path>       Endo state directory (default: platform Endo state path)
  --worker=<filter>    Worker id/label substring, or "active"/"most-recent"
  --agent=<filter>     Slice the log to a single agent's section by label substring
  --since=<offset>     Skip the first N bytes of the chosen log file
  --context=<n>        Lines of context around matched log lines (default: 4)
  --last=<n>           Maximum signal windows per log file (default: 20)
  --summary            One-screen post-mortem; skip raw window dump
  --tools              List each [tool] invocation paired with its result/error
  --chat               Print the latest full chat message snapshot
  --all                Include workers with no obvious LLM/error signal
  --json               Emit machine-readable JSON
  --help               Show this help

Both --key=value and --key value forms are accepted.
`;

/**
 * @param {string[]} argv
 */
const parseArgs = argv => {
  const options = {
    state: '',
    worker: '',
    agent: '',
    since: 0,
    context: 4,
    last: 20,
    summary: false,
    tools: false,
    chat: false,
    all: false,
    json: false,
    help: false,
  };

  /**
   * Read the value attached to a flag, supporting both `--key=value` and
   * `--key value` syntax. Returns the value plus how many additional argv
   * tokens were consumed.
   *
   * @param {string} arg
   * @param {number} index
   * @returns {{ value: string, advance: number }}
   */
  const valueFor = (arg, index) => {
    const eqIndex = arg.indexOf('=');
    if (eqIndex >= 0) {
      return { value: arg.slice(eqIndex + 1), advance: 0 };
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-')) {
      return { value: '', advance: 0 };
    }
    return { value: next, advance: 1 };
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const head = arg.split('=', 1)[0];
    if (head === '--state') {
      const { value, advance } = valueFor(arg, i);
      options.state = value;
      i += advance;
    } else if (head === '--worker') {
      const { value, advance } = valueFor(arg, i);
      options.worker = value;
      i += advance;
    } else if (head === '--agent') {
      const { value, advance } = valueFor(arg, i);
      options.agent = value;
      i += advance;
    } else if (head === '--since') {
      const { value, advance } = valueFor(arg, i);
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(
          `--since must be a non-negative integer, got: ${value}`,
        );
      }
      options.since = parsed;
      i += advance;
    } else if (head === '--context') {
      const { value, advance } = valueFor(arg, i);
      options.context = Number(value || options.context);
      i += advance;
    } else if (head === '--last') {
      const { value, advance } = valueFor(arg, i);
      options.last = Number(value || options.last);
      i += advance;
    } else if (head === '--summary') {
      options.summary = true;
    } else if (head === '--tools') {
      options.tools = true;
    } else if (head === '--chat') {
      options.chat = true;
    } else if (head === '--all') {
      options.all = true;
    } else if (head === '--json') {
      options.json = true;
    } else if (head === '--help' || head === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}\n${usage}`);
    }
  }

  return options;
};

/**
 * Mirrors `@endo/where` state path selection closely enough for a standalone
 * debug script.
 */
const defaultStatePath = () => {
  if (process.env.XDG_STATE_HOME) {
    return path.join(process.env.XDG_STATE_HOME, 'endo');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Endo');
  }
  if (process.platform === 'win32') {
    const appData =
      process.env.LOCALAPPDATA ||
      (process.env.APPDATA ? path.join(process.env.APPDATA, 'Local') : '');
    return path.join(appData || os.homedir(), 'Endo');
  }
  return path.join(os.homedir(), '.local', 'state', 'endo');
};

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const readTextIfPresent = async filePath => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
};

/**
 * @param {string} filePath
 */
const readJsonIfPresent = async filePath => {
  const text = await readTextIfPresent(filePath);
  if (text === '') {
    return {};
  }
  return JSON.parse(text);
};

/**
 * Read the file as a Buffer plus the UTF-8 decoding of the slice starting at
 * `since` bytes. Returns the line offset (count of newlines in the prefix)
 * so callers can report absolute line numbers even after slicing.
 *
 * @param {string} filePath
 * @param {number} since
 * @returns {Promise<{ buffer: Buffer, text: string, lineOffset: number, totalSize: number }>}
 */
const readSliced = async (filePath, since) => {
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return { buffer: Buffer.alloc(0), text: '', lineOffset: 0, totalSize: 0 };
    }
    throw error;
  }
  const totalSize = buffer.length;
  if (since <= 0) {
    return { buffer, text: buffer.toString('utf8'), lineOffset: 0, totalSize };
  }
  if (since >= totalSize) {
    let lineOffset = 0;
    for (let i = 0; i < totalSize; i += 1) {
      if (buffer[i] === 0x0a) lineOffset += 1;
    }
    return { buffer, text: '', lineOffset, totalSize };
  }
  let lineOffset = 0;
  for (let i = 0; i < since; i += 1) {
    if (buffer[i] === 0x0a) lineOffset += 1;
  }
  const slice = buffer.subarray(since);
  return { buffer, text: slice.toString('utf8'), lineOffset, totalSize };
};

/**
 * @param {string} text
 */
const splitLines = text => text.split(/\r?\n/);

/**
 * @param {string | object | undefined} args
 * @returns {string}
 */
const stringifyToolArguments = args => {
  if (typeof args === 'string') {
    return args;
  }
  return JSON.stringify(args ?? {});
};

/**
 * Mirror the OpenAI-compatible message normalization used by the provider.
 *
 * @param {Array<Record<string, any>>} messages
 * @returns {object[]}
 */
const toOpenAICompatibleMessages = messages =>
  messages.map((message, messageIndex) => {
    if (message.role === 'assistant') {
      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls.map((toolCall, toolIndex) => ({
            id: toolCall.id || `tool_${messageIndex}_${toolIndex}`,
            type: 'function',
            function: {
              name: toolCall.function?.name || '',
              arguments: stringifyToolArguments(toolCall.function?.arguments),
            },
          }))
        : undefined;

      if (toolCalls && toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: toolCalls,
        };
      }
      return { role: 'assistant', content: message.content || '' };
    }

    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content || '',
        tool_call_id: message.tool_call_id || '',
      };
    }

    return { role: message.role, content: message.content || '' };
  });

/**
 * @param {string} text
 */
const hasCompleteJson = text => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;

  for (const char of text) {
    if (!started && /\s/.test(char)) {
      continue;
    }
    started = true;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return true;
      }
    }
  }

  return started && depth === 0 && !inString;
};

/**
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {string} firstText
 */
const parseJsonBlock = (lines, startIndex, firstText) => {
  let text = firstText.trim();
  let endIndex = startIndex;

  for (
    let i = startIndex + 1;
    i < lines.length && i < startIndex + 250;
    i += 1
  ) {
    if (text !== '' && hasCompleteJson(text)) {
      break;
    }
    text = `${text}\n${lines[i]}`;
    endIndex = i;
  }

  if (!hasCompleteJson(text)) {
    return undefined;
  }

  try {
    return { value: JSON.parse(text), endIndex };
  } catch {
    return undefined;
  }
};

/**
 * @param {string[]} lines
 */
const parseFaeJsonEvents = lines => {
  const events = [];

  for (let i = 0; i < lines.length; i += 1) {
    const sentAt = lines[i].indexOf('[fae] sent:');
    const toolResultsAt = lines[i].indexOf('[fae] tool results:');
    const chatMessagesAt = lines[i].indexOf('[fae] chat messages:');
    const kind =
      sentAt >= 0
        ? 'assistant'
        : toolResultsAt >= 0
          ? 'toolResults'
          : chatMessagesAt >= 0
            ? 'chatMessages'
            : '';
    const markerAt =
      sentAt >= 0
        ? sentAt
        : toolResultsAt >= 0
          ? toolResultsAt
          : chatMessagesAt;
    if (kind === '') {
      continue;
    }

    const marker =
      kind === 'assistant'
        ? '[fae] sent:'
        : kind === 'toolResults'
          ? '[fae] tool results:'
          : '[fae] chat messages:';
    const firstText = lines[i].slice(markerAt + marker.length);
    const parsed = parseJsonBlock(lines, i, firstText);
    if (parsed === undefined) {
      continue;
    }

    events.push({
      kind,
      line: i + 1,
      endLine: parsed.endIndex + 1,
      value: parsed.value,
    });
    i = parsed.endIndex;
  }

  return events;
};

/**
 * @param {unknown} message
 */
const toolCallsOf = message => {
  if (
    message &&
    typeof message === 'object' &&
    Array.isArray(/** @type {{ tool_calls?: unknown }} */ (message).tool_calls)
  ) {
    return /** @type {{ tool_calls: unknown[] }} */ (message).tool_calls;
  }
  return [];
};

/**
 * @param {ReturnType<typeof parseFaeJsonEvents>} events
 */
const analyzeToolHistory = events => {
  const findings = [];

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.kind !== 'assistant') {
      continue;
    }

    const calls = toolCallsOf(event.value);
    if (calls.length === 0) {
      continue;
    }

    const missingType = calls.filter(
      call =>
        !call ||
        typeof call !== 'object' ||
        /** @type {{ type?: unknown }} */ (call).type !== 'function',
    );
    if (missingType.length > 0) {
      findings.push({
        severity: 'high',
        line: event.line,
        message:
          'assistant tool_calls are missing type: "function"; OpenAI-compatible providers can reject the next request',
      });
    }

    const ids = calls
      .map(call =>
        call && typeof call === 'object'
          ? /** @type {{ id?: unknown }} */ (call).id
          : undefined,
      )
      .filter(id => typeof id === 'string');
    if (ids.length !== calls.length) {
      findings.push({
        severity: 'high',
        line: event.line,
        message:
          'one or more assistant tool_calls have no id; matching tool results may fail',
      });
    }

    const next = events.slice(i + 1).find(candidate => {
      if (candidate.kind === 'toolResults') {
        return true;
      }
      return candidate.kind === 'assistant';
    });

    if (!next || next.kind !== 'toolResults') {
      findings.push({
        severity: 'medium',
        line: event.line,
        message:
          'assistant tool_calls were not followed by logged tool results',
      });
      continue;
    }

    const toolResults = Array.isArray(next.value) ? next.value : [];
    const resultIds = new Set(
      toolResults
        .map(result =>
          result && typeof result === 'object'
            ? /** @type {{ tool_call_id?: unknown }} */ (result).tool_call_id
            : undefined,
        )
        .filter(id => typeof id === 'string'),
    );
    const missingResults = ids.filter(id => !resultIds.has(id));
    if (missingResults.length > 0) {
      findings.push({
        severity: 'high',
        line: next.line,
        message: `tool results missing tool_call_id(s): ${missingResults.join(
          ', ',
        )}`,
      });
    }

    const normalized = toOpenAICompatibleMessages([
      /** @type {Record<string, any>} */ (event.value),
      ...toolResults,
    ]);
    const normalizedAssistant = normalized[0];
    if (
      normalizedAssistant &&
      typeof normalizedAssistant === 'object' &&
      Array.isArray(
        /** @type {{ tool_calls?: unknown }} */ (normalizedAssistant)
          .tool_calls,
      )
    ) {
      const normalizedCalls =
        /** @type {{ tool_calls: Array<{ type?: string }> }} */ (
          normalizedAssistant
        ).tool_calls;
      if (normalizedCalls.every(call => call.type === 'function')) {
        findings.push({
          severity: 'info',
          line: event.line,
          message:
            'normalizer can repair this assistant/tool result pair for OpenAI-compatible APIs',
        });
      }
    }
  }

  return findings;
};

/**
 * Slice `lines` down to a single agent's section using the
 * `[fae-factory] Created agent "<label>"` markers as boundaries.
 * The matched marker is the start of the slice (inclusive); the next marker
 * (or end of file) is the end.
 *
 * Returns the full marker list regardless of match so callers can report
 * the available labels when no match is found.
 *
 * @param {string[]} lines
 * @param {number} lineOffset
 * @param {string} agentFilter
 * @returns {{
 *   lines: string[],
 *   lineOffset: number,
 *   agentLabels: string[],
 *   matchedLabel: string,
 * }}
 */
const sliceLinesByAgent = (lines, lineOffset, agentFilter) => {
  const markers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\[fae-factory\] Created agent "([^"]+)"/);
    if (match) {
      markers.push({ index: i, label: match[1] });
    }
  }
  const agentLabels = markers.map(m => m.label);
  if (agentFilter === '') {
    return { lines, lineOffset, agentLabels, matchedLabel: '' };
  }
  if (markers.length === 0) {
    return { lines: [], lineOffset, agentLabels, matchedLabel: '' };
  }
  const lower = agentFilter.toLowerCase();
  const matched = markers.filter(m => m.label.toLowerCase().includes(lower));
  if (matched.length === 0) {
    return { lines: [], lineOffset, agentLabels, matchedLabel: '' };
  }
  if (matched.length > 1) {
    const labels = matched.map(m => m.label).join(', ');
    throw new Error(
      `--agent=${agentFilter} matched multiple agents: ${labels} (narrow your filter)`,
    );
  }
  const start = matched[0].index;
  const next = markers.find(m => m.index > start);
  const end = next ? next.index : lines.length;
  return {
    lines: lines.slice(start, end),
    lineOffset: lineOffset + start,
    agentLabels,
    matchedLabel: matched[0].label,
  };
};

/**
 * Collect raw `[tool] name(args)` invocation lines paired in chronological
 * order with their `-> result` or `error:` follow-up. These are the actual
 * dispatcher events, not the normalized assistant tool_calls — useful for
 * tracing how the agent arrived at a reply.
 *
 * @param {string[]} lines
 * @param {number} lineOffset
 */
const collectToolInvocations = (lines, lineOffset) => {
  const entries = [];
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    const callMatch = text.match(/^\[tool\] (\S+)\(/);
    if (callMatch) {
      entries.push({
        kind: 'call',
        name: callMatch[1],
        line: i + 1 + lineOffset,
        text,
      });
      continue;
    }
    const okMatch = text.match(/^\[tool\] (\S+) -> /);
    if (okMatch) {
      entries.push({
        kind: 'ok',
        name: okMatch[1],
        line: i + 1 + lineOffset,
        text,
      });
      continue;
    }
    const errMatch = text.match(/^\[tool\] (\S+) error:/);
    if (errMatch) {
      entries.push({
        kind: 'error',
        name: errMatch[1],
        line: i + 1 + lineOffset,
        text,
      });
    }
  }
  return entries;
};

/**
 * @param {string[]} lines
 * @param {RegExp[]} patterns
 */
const matchingLineIndexes = (lines, patterns) => {
  const indexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (patterns.some(pattern => pattern.test(lines[i]))) {
      indexes.push(i);
    }
  }
  return indexes;
};

/**
 * @param {string[]} lines
 * @param {number[]} indexes
 * @param {number} context
 * @param {number} last
 * @param {number} lineOffset
 * @param {ReturnType<typeof parseFaeJsonEvents>} events
 */
const makeWindows = (lines, indexes, context, last, lineOffset, events) => {
  const chosen = indexes.slice(Math.max(0, indexes.length - last));
  const windows = [];

  for (const index of chosen) {
    const event = events.find(candidate => {
      const startIndex = candidate.line - 1;
      const endIndex = candidate.endLine - 1;
      return startIndex <= index && index <= endIndex;
    });
    const eventStartIndex = event ? event.line - 1 : index;
    const eventEndIndex = event ? event.endLine - 1 : index;
    const start = Math.max(0, eventStartIndex - context);
    const end = Math.min(lines.length - 1, eventEndIndex + context);
    const previous = windows[windows.length - 1];
    if (previous && start <= previous.end + 1) {
      previous.end = Math.max(previous.end, end);
    } else {
      windows.push({ start, end });
    }
  }

  return windows.map(window => ({
    startLine: window.start + 1 + lineOffset,
    endLine: window.end + 1 + lineOffset,
    lines: lines.slice(window.start, window.end + 1).map((text, offset) => ({
      line: window.start + offset + 1 + lineOffset,
      text,
    })),
  }));
};

/**
 * @param {string} statePath
 */
const listWorkerLogs = async statePath => {
  const workerRoot = path.join(statePath, 'worker');
  let entries;
  try {
    entries = await fs.readdir(workerRoot, { withFileTypes: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const workers = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const id = entry.name;
    const dir = path.join(workerRoot, id);
    const logPath = path.join(dir, 'worker.log');
    const metaPath = path.join(dir, 'worker.meta.json');
    const [meta, stat] = await Promise.all([
      readJsonIfPresent(metaPath),
      fs.stat(logPath).catch(error => {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
          return undefined;
        }
        throw error;
      }),
    ]);
    if (stat === undefined) {
      continue;
    }
    workers.push({
      id,
      dir,
      logPath,
      label:
        typeof (/** @type {{ label?: unknown }} */ (meta).label) === 'string'
          ? /** @type {{ label: string }} */ (meta).label
          : '',
      createdAt:
        typeof (/** @type {{ createdAt?: unknown }} */ (meta).createdAt) ===
        'string'
          ? /** @type {{ createdAt: string }} */ (meta).createdAt
          : '',
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
  }

  workers.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return workers;
};

/**
 * Resolve a `--worker=<filter>` value against the discovered worker list.
 * The reserved keywords `active` / `most-recent` pick the freshest log;
 * any other non-empty value matches by id or label substring (case-insensitive).
 *
 * @param {Awaited<ReturnType<typeof listWorkerLogs>>} workers
 * @param {string} filter
 */
const filterWorkers = (workers, filter) => {
  if (filter === '') {
    return workers;
  }
  const lower = filter.toLowerCase();
  if (lower === 'active' || lower === 'most-recent') {
    return workers.length === 0 ? [] : [workers[0]];
  }
  return workers.filter(
    worker =>
      worker.id.toLowerCase().includes(lower) ||
      worker.label.toLowerCase().includes(lower),
  );
};

/**
 * @param {string} logPath
 * @param {ReturnType<typeof parseArgs>} options
 */
const analyzeLogFile = async (logPath, options) => {
  const {
    text,
    lineOffset: baseLineOffset,
    totalSize,
  } = await readSliced(logPath, options.since);
  const allLines = splitLines(text);
  const sliced = sliceLinesByAgent(allLines, baseLineOffset, options.agent);
  const { lines, lineOffset, agentLabels, matchedLabel } = sliced;
  const signalIndexes = matchingLineIndexes(lines, SIGNAL_PATTERNS);
  const errorIndexes = matchingLineIndexes(lines, ERROR_PATTERNS);
  const events = parseFaeJsonEvents(lines);
  const toolFindings = analyzeToolHistory(events).map(finding => ({
    ...finding,
    line: finding.line + lineOffset,
  }));

  return {
    logPath,
    lineCount: lines.length,
    signalCount: signalIndexes.length,
    errorCount: errorIndexes.length,
    rangeStart: options.since,
    rangeEnd: totalSize,
    lineOffset,
    lines,
    events,
    eventSummary: events.map(event => ({
      kind: event.kind,
      line: event.line + lineOffset,
      endLine: event.endLine + lineOffset,
    })),
    toolFindings,
    toolInvocations: collectToolInvocations(lines, lineOffset),
    agentLabels,
    matchedAgent: matchedLabel,
    windows: makeWindows(
      lines,
      signalIndexes,
      options.context,
      options.last,
      lineOffset,
      events,
    ),
  };
};

/**
 * @param {ReturnType<typeof parseArgs>} options
 */
const run = async options => {
  const explicitState = options.state !== '';
  const statePath = path.resolve(options.state || defaultStatePath());

  let stateExists = false;
  try {
    const stat = await fs.stat(statePath);
    stateExists = stat.isDirectory();
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
      throw error;
    }
  }
  if (!stateExists) {
    const hint = explicitState
      ? `state path does not exist or is not a directory: ${statePath}`
      : `default Endo state path does not exist: ${statePath} (pass --state=<path> to override)`;
    throw new Error(hint);
  }

  const endoLogPath = path.join(statePath, 'endo.log');
  const workers = await listWorkerLogs(statePath);
  const filteredWorkers = filterWorkers(workers, options.worker);

  if (
    options.worker !== '' &&
    filteredWorkers.length === 0 &&
    workers.length > 0
  ) {
    throw new Error(
      `--worker=${options.worker} matched no worker logs (workers found: ${workers.length}).`,
    );
  }

  const logs = [];
  /** @type {Set<string>} */
  const allAgentLabels = new Set();

  // Skip endo.log when narrowing to a specific worker — the daemon log only
  // adds noise once the operator already knows which worker to inspect.
  if (options.worker === '') {
    const endoLog = await analyzeLogFile(endoLogPath, options);
    for (const label of endoLog.agentLabels) allAgentLabels.add(label);
    if (options.all || endoLog.signalCount > 0 || endoLog.errorCount > 0) {
      logs.push({
        id: 'endo',
        label: 'daemon',
        createdAt: '',
        mtimeMs: 0,
        size: 0,
        ...endoLog,
      });
    }
  }

  for (const worker of filteredWorkers) {
    const analysis = await analyzeLogFile(worker.logPath, options);
    for (const label of analysis.agentLabels) allAgentLabels.add(label);
    if (
      options.all ||
      options.worker !== '' ||
      analysis.signalCount > 0 ||
      analysis.errorCount > 0 ||
      analysis.toolFindings.length > 0 ||
      analysis.toolInvocations.length > 0
    ) {
      logs.push({ ...worker, ...analysis });
    }
  }

  if (options.agent !== '' && !logs.some(log => log.matchedAgent)) {
    const sorted = [...allAgentLabels].sort();
    const available = sorted.length === 0 ? '<none found>' : sorted.join(', ');
    throw new Error(
      `--agent=${options.agent} matched no agent (available: ${available})`,
    );
  }

  return {
    statePath,
    workerCount: workers.length,
    includedLogCount: logs.length,
    logs,
  };
};

/**
 * @param {number} ms
 */
const formatDuration = ms => {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes < 60) return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h${String(remMinutes).padStart(2, '0')}m`;
};

/**
 * @param {string} value
 * @param {number} maxLength
 */
const truncateOneLine = (value, maxLength) => {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxLength) return flat;
  return `${flat.slice(0, maxLength - 1)}…`;
};

/**
 * @param {string} prefix
 * @param {number} maxLength
 */
const homeRelative = (prefix, maxLength) => {
  const home = os.homedir();
  if (prefix.startsWith(home)) {
    return `~${prefix.slice(home.length)}`;
  }
  return maxLength > 0 ? truncateOneLine(prefix, maxLength) : prefix;
};

/**
 * Build a one-screen post-mortem summary of a single worker log.
 *
 * @param {Awaited<ReturnType<typeof analyzeLogFile>> & {
 *   id?: string,
 *   label?: string,
 *   mtimeMs?: number,
 *   size?: number,
 * }} log
 */
const summarizeLog = log => {
  /** @type {Map<string, { calls: number, ok: number, error: number }>} */
  const toolCounts = new Map();
  /** @type {Map<string, { count: number, last: string }>} */
  const errorBuckets = new Map();
  let lastReplyArgsLine = '';

  const bumpTool = (
    /** @type {string} */ name,
    /** @type {keyof {calls:0,ok:0,error:0}} */ key,
  ) => {
    let entry = toolCounts.get(name);
    if (!entry) {
      entry = { calls: 0, ok: 0, error: 0 };
      toolCounts.set(name, entry);
    }
    entry[key] += 1;
  };

  for (const line of log.lines) {
    const callMatch = line.match(/^\[tool\] (\S+)\(/);
    if (callMatch) {
      bumpTool(callMatch[1], 'calls');
      if (callMatch[1] === 'reply') {
        lastReplyArgsLine = line;
      }
      continue;
    }
    const okMatch = line.match(/^\[tool\] (\S+) -> /);
    if (okMatch) {
      bumpTool(okMatch[1], 'ok');
      continue;
    }
    const errMatch = line.match(/^\[tool\] (\S+) error:/);
    if (errMatch) {
      bumpTool(errMatch[1], 'error');
      continue;
    }
    for (const category of ERROR_CATEGORIES) {
      if (category.pattern.test(line)) {
        const bucket = errorBuckets.get(category.name) || {
          count: 0,
          last: '',
        };
        bucket.count += 1;
        bucket.last = line;
        errorBuckets.set(category.name, bucket);
      }
    }
  }

  const llmRoundTrips = log.events.filter(e => e.kind === 'assistant').length;
  const chatSnapshots = log.events.filter(e => e.kind === 'chatMessages');
  const latestChatSnapshot = chatSnapshots.at(-1);
  const latestChatMessageCount = Array.isArray(latestChatSnapshot?.value)
    ? latestChatSnapshot.value.length
    : 0;
  const totalToolInvocations = [...toolCounts.values()].reduce(
    (acc, entry) => acc + entry.calls,
    0,
  );

  const lastAssistant = [...log.events]
    .reverse()
    .find(e => e.kind === 'assistant');
  /** @type {string} */
  let lastAssistantContent = '<none>';
  if (lastAssistant) {
    const value = /** @type {any} */ (lastAssistant.value);
    if (value && typeof value.content === 'string' && value.content !== '') {
      lastAssistantContent = truncateOneLine(value.content, 120);
    } else if (
      Array.isArray(value?.tool_calls) &&
      Number(value.tool_calls.length) > 0
    ) {
      const names = value.tool_calls
        .map(/** @type {any} */ tc => tc?.function?.name)
        .filter(/** @type {any} */ n => typeof n === 'string')
        .join(', ');
      lastAssistantContent = `<tool_calls: ${names || 'unnamed'}>`;
    } else {
      lastAssistantContent = '<empty>';
    }
  }

  /** @type {string} */
  let lastReply = '<none sent>';
  if (lastReplyArgsLine) {
    const argMatch = lastReplyArgsLine.match(/^\[tool\] reply\((.*)\)\s*$/);
    if (argMatch) {
      lastReply = truncateOneLine(argMatch[1], 120);
    } else {
      lastReply = truncateOneLine(lastReplyArgsLine, 120);
    }
  }

  return {
    id: log.id || '',
    label: log.label || '',
    logPath: log.logPath,
    rangeStart: log.rangeStart,
    rangeEnd: log.rangeEnd,
    ageMs:
      typeof log.mtimeMs === 'number' && log.mtimeMs > 0
        ? Date.now() - log.mtimeMs
        : Number.NaN,
    llmRoundTrips,
    chatSnapshotCount: chatSnapshots.length,
    latestChatMessageCount,
    totalToolInvocations,
    toolCounts: [...toolCounts.entries()].map(([name, counts]) => ({
      name,
      ...counts,
    })),
    errors: [...errorBuckets.entries()].map(([name, bucket]) => ({
      name,
      ...bucket,
    })),
    lastAssistantContent,
    lastReply,
  };
};

/**
 * @param {ReturnType<typeof summarizeLog>} summary
 */
const printSummary = summary => {
  const idDisplay = summary.id ? `${summary.id.slice(0, 8)}...` : '<unknown>';
  const labelDisplay = summary.label ? `  label=${summary.label}` : '';
  const ageDisplay = Number.isNaN(summary.ageMs)
    ? ''
    : `  age=${formatDuration(summary.ageMs)}`;
  console.log(`worker: ${idDisplay}${labelDisplay}${ageDisplay}`);
  console.log(`log:    ${homeRelative(summary.logPath, 0)}`);
  const rangeNote = summary.rangeStart > 0 ? ' (since-offset)' : ' (full file)';
  console.log(
    `range:  bytes ${summary.rangeStart}..${summary.rangeEnd}${rangeNote}`,
  );
  console.log('');

  console.log(
    `chat:   ${summary.latestChatMessageCount} message(s) in latest context (${summary.chatSnapshotCount} snapshot(s))`,
  );
  console.log(`LLM:    ${summary.llmRoundTrips} round-trip(s)`);
  console.log(`tools:  ${summary.totalToolInvocations} invocation(s)`);
  if (summary.toolCounts.length > 0) {
    const namePad = Math.max(
      ...summary.toolCounts.map(entry => entry.name.length),
      8,
    );
    for (const entry of summary.toolCounts) {
      console.log(
        `        ${entry.name.padEnd(namePad)}  ${entry.calls} call(s) (${entry.ok} ok, ${entry.error} error)`,
      );
    }
  }
  console.log('');

  if (summary.errors.length === 0) {
    console.log('errors: <none>');
  } else {
    const total = summary.errors.reduce((acc, e) => acc + e.count, 0);
    console.log(`errors: ${total}`);
    const namePad = Math.max(...summary.errors.map(e => e.name.length), 8);
    for (const entry of summary.errors) {
      console.log(
        `        ${String(entry.count).padStart(3, ' ')} ${entry.name.padEnd(namePad)}  ${truncateOneLine(entry.last, 80)}`,
      );
    }
  }
  console.log('');

  console.log(`last assistant: ${summary.lastAssistantContent}`);
  console.log(`last reply:     ${summary.lastReply}`);
};

/**
 * @param {Awaited<ReturnType<typeof analyzeLogFile>>} log
 */
const printToolInvocations = log => {
  console.log('');
  if (log.toolInvocations.length === 0) {
    console.log('tool invocations: <none>');
    return;
  }
  console.log(`tool invocations (${log.toolInvocations.length}):`);
  for (const entry of log.toolInvocations) {
    console.log(`  ${String(entry.line).padStart(5, ' ')}  ${entry.text}`);
  }
};

/**
 * @param {Awaited<ReturnType<typeof analyzeLogFile>>} log
 */
const printLatestChatSnapshot = log => {
  const latestChatSnapshot = [...log.events]
    .reverse()
    .find(event => event.kind === 'chatMessages');
  console.log('');
  console.log('latest chat messages:');
  if (!latestChatSnapshot) {
    console.log('<none logged>');
    return;
  }
  console.log(JSON.stringify(latestChatSnapshot.value, null, 2));
};

/**
 * @param {Awaited<ReturnType<typeof run>>} report
 * @param {ReturnType<typeof parseArgs>} options
 */
const printReport = (report, options) => {
  console.log(`Endo state: ${report.statePath}`);
  console.log(`Workers found: ${report.workerCount}`);
  console.log(`Logs included: ${report.includedLogCount}`);

  for (const log of report.logs) {
    console.log('');
    console.log(`== ${log.label || log.id} (${log.id}) ==\n${log.logPath}`);
    if (log.createdAt) {
      console.log(`createdAt: ${log.createdAt}`);
    }
    console.log(
      `signals: ${log.signalCount}, errors: ${log.errorCount}, parsed JSON events: ${log.events.length}`,
    );
    if (log.matchedAgent) {
      const sliceStart = log.lineOffset + 1;
      const sliceEnd = log.lineOffset + log.lineCount;
      console.log(
        `agent slice: ${log.matchedAgent} (lines ${sliceStart}-${sliceEnd})`,
      );
    }

    if (options.summary) {
      console.log('');
      printSummary(summarizeLog(log));
      if (options.tools) {
        printToolInvocations(log);
      }
      if (options.chat) {
        printLatestChatSnapshot(log);
      }
      continue;
    }

    if (options.tools) {
      printToolInvocations(log);
      if (options.chat) {
        printLatestChatSnapshot(log);
      }
      continue;
    }

    for (const finding of log.toolFindings) {
      console.log(`[${finding.severity}] L${finding.line}: ${finding.message}`);
    }

    for (const window of log.windows) {
      console.log(`-- lines ${window.startLine}-${window.endLine}`);
      for (const line of window.lines) {
        console.log(`${String(line.line).padStart(5, ' ')} ${line.text}`);
      }
    }
    if (options.chat) {
      printLatestChatSnapshot(log);
    }
  }
};

/**
 * Strip large in-memory fields before serializing to JSON. Keeps the output
 * machine-readable but prevents the multi-megabyte LLM payloads from
 * dominating the dump.
 *
 * @param {Awaited<ReturnType<typeof run>>} report
 */
const toJsonSafe = report => ({
  ...report,
  logs: report.logs.map(log => {
    const { lines: _lines, events: _events, eventSummary, ...rest } = log;
    return { ...rest, events: eventSummary };
  }),
});

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  const report = await run(options);
  if (options.json) {
    console.log(JSON.stringify(toJsonSafe(report), null, 2));
  } else {
    printReport(report, options);
  }
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
