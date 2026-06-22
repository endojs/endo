// @ts-check

// Shared view types for the Floot space. The host controller (chat-side, see
// packages/chat/floot-component.js) produces these pure-data snapshots; the
// confined components only ever read them and call the controller's callbacks.
// No DOM nodes, audio handles, or capabilities appear in this shape.

export {};

/**
 * @typedef {{
 *   role: 'user' | 'assistant' | 'tool',
 *   text?: string,
 *   id?: string,
 *   name?: string,
 *   args?: string,
 *   result?: string | null,
 *   meta?: { mail?: { from?: string } },
 * }} FlootMessage
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   createdAt: number,
 *   presetId: string,
 *   status?: 'idle' | 'streaming' | 'error',
 *   messageCount?: number,
 *   loaded?: boolean,
 * }} FlootSessionMeta
 */

/**
 * @typedef {{ id: string, title: string, description?: string }} FlootPreset
 */

/**
 * @typedef {{
 *   hasMic: boolean,
 *   hasTts: boolean,
 *   micActive: boolean,
 *   speaking: boolean,
 *   ttsEnabled: boolean,
 *   ttsSpeaking: boolean,
 *   meterPct?: number,
 *   noisePct?: number,
 *   thresholdPct?: number,
 *   transcript?: string,
 *   replayingText?: string,
 * }} FlootVoiceState
 */

/**
 * @typedef {{
 *   sessions: FlootSessionMeta[],
 *   activeSessionId: string | null,
 *   presets: FlootPreset[],
 *   messages: FlootMessage[],
 *   streamingText: string,
 *   phase: string,
 *   busy: boolean,
 *   loaded: boolean,
 *   status: string,
 *   input: string,
 *   settingsOpen: boolean,
 *   usage: { inputTokens: number, outputTokens: number } | null,
 *   voice: FlootVoiceState,
 *   objects?: { controller?: string, stt?: string, tts?: string },
 * }} FlootState
 */

/**
 * @typedef {object} FlootController
 * @property {() => FlootState} getState
 * @property {(listener: () => void) => () => void} subscribe
 * @property {(text?: string) => void} send
 * @property {() => void} stop
 * @property {(id: string) => void} selectSession
 * @property {(presetId?: string) => void} newSession
 * @property {(id: string, title: string) => void} renameSession
 * @property {(id: string) => void} deleteSession
 * @property {() => void} toggleMic
 * @property {() => void} toggleTts
 * @property {(text: string) => void} replayMessage
 * @property {() => void} toggleSettings
 * @property {(text: string) => void} setInput
 */
