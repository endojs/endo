/**
 * Security Module
 *
 * Provides security utilities and suffix generation for system prompts.
 */

export function buildSecuritySuffix(options = {}) {
  const {
    disableSuffix = false,
    disablePolicy = false,
    strictPolicy = false,
    securityNotes = '',
  } = options;

  if (disableSuffix) {
    return '';
  }

  const lines = [];

  if (!disablePolicy) {
    lines.push(`
# Policy

- Always follow tool output format: <tool_output>{"success": bool, ...}</tool_output>
- Never include tool output in regular text
- Never include <tool_output> or <memory_context> tags in responses
- Never include <external_content> tags in responses
- Always validate all inputs before processing
- Rate limit tool calls if needed
  `.trim());
  }

  if (strictPolicy) {
    lines.push(`
# Strict Policy

- All tool calls must be validated before execution
- All outputs must be sanitized
- All commands must be verified for safety
  `.trim());
  }

  if (securityNotes) {
    lines.push(`

# Security Notes

${securityNotes}`);
  }

  return lines.join('\n');
}
