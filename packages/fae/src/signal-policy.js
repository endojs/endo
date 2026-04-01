// @ts-check

/**
 * @typedef {{
 *   source: string,
 *   sourceUuid?: string,
 *   groupId?: string,
 *   text: string,
 * }} SignalInboundMessage
 */

/**
 * @typedef {{
 *   groupMentionPrefix?: string,
 *   agentForSender?: Record<string, string>,
 * }} SignalBridgeConfig
 */

/**
 * @typedef {{
 *   accepted: false,
 *   reason: string,
 * }} SignalRejectedMessage
 */

/**
 * @typedef {{
 *   accepted: true,
 *   senderKey: string,
 *   threadKey: string,
 *   agentName: string,
 *   text: string,
 *   isGroup: boolean,
 * }} SignalAcceptedMessage
 */

/**
 * @typedef {SignalRejectedMessage | SignalAcceptedMessage} SignalPolicyDecision
 */

/**
 * @param {string} text
 * @param {string} prefix
 * @returns {string | undefined}
 */
export const stripLeadingGroupMention = (text, prefix) => {
  const trimmed = text.trimStart();
  if (prefix.length === 0) {
    return trimmed;
  }
  if (!trimmed.startsWith(prefix)) {
    return undefined;
  }
  const rest = trimmed.slice(prefix.length).trimStart();
  if (rest.startsWith(':') || rest.startsWith(',') || rest.startsWith('-')) {
    return rest.slice(1).trimStart();
  }
  return rest;
};
harden(stripLeadingGroupMention);

/**
 * @param {SignalBridgeConfig} config
 * @param {SignalInboundMessage} message
 * @returns {string | undefined}
 */
export const resolveAgentForSender = (config, message) => {
  const mapping = config.agentForSender || {};
  const candidates = [];
  if (typeof message.sourceUuid === 'string' && message.sourceUuid.length > 0) {
    candidates.push(message.sourceUuid);
    candidates.push(`uuid:${message.sourceUuid}`);
  }
  candidates.push(message.source);
  for (const key of candidates) {
    if (Object.hasOwn(mapping, key)) {
      return mapping[key];
    }
  }
  return undefined;
};
harden(resolveAgentForSender);

/**
 * @param {SignalInboundMessage} message
 * @returns {string}
 */
export const makeThreadKey = message => {
  if (typeof message.groupId === 'string' && message.groupId.length > 0) {
    return `group:${message.groupId}:sender:${message.source}`;
  }
  return `direct:${message.source}`;
};
harden(makeThreadKey);

/**
 * Enforce inbound Signal filtering policy:
 * - sender must be configured to an Endo agent
 * - group messages must start with account mention prefix
 *
 * @param {SignalBridgeConfig} config
 * @param {SignalInboundMessage} message
 * @returns {SignalPolicyDecision}
 */
export const applySignalInboundPolicy = (config, message) => {
  const text = message.text.trim();
  if (text.length === 0) {
    return harden({ accepted: false, reason: 'empty message' });
  }

  const agentName = resolveAgentForSender(config, message);
  if (!agentName) {
    return harden({
      accepted: false,
      reason: 'sender has no configured daemon agent',
    });
  }

  const isGroup =
    typeof message.groupId === 'string' && message.groupId.length > 0;
  let normalizedText = text;
  if (isGroup) {
    const prefix = config.groupMentionPrefix || '';
    if (prefix.length === 0) {
      return harden({
        accepted: false,
        reason: 'group mention prefix not configured',
      });
    }
    const stripped = stripLeadingGroupMention(text, prefix);
    if (stripped === undefined) {
      return harden({
        accepted: false,
        reason: 'group message missing required leading mention',
      });
    }
    normalizedText = stripped;
  }

  return harden({
    accepted: true,
    senderKey: message.sourceUuid || message.source,
    threadKey: makeThreadKey(message),
    agentName,
    text: normalizedText,
    isGroup,
  });
};
harden(applySignalInboundPolicy);

