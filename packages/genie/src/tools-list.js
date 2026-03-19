/**
 * Tool List Builder
 *
 * Builds the tool list section of the system prompt.
 */

export function buildToolList(tools) {
  if (!tools) {
    return '';
  }

  return `
## Available Tools

${tools}

Use tools by calling them with JSON syntax in your response.

**Example:**
\`\`\`
<tool_output>{"success": true, "content": "result"}</tool_output>
\`\`\`

**Error Response:**
\`\`\`
<tool_output>{"success": false, "error": "Error message"}</tool_output>
\`\`\`

Remember: Always respond with tool results inside <tool_output> tags, not in regular text.
  `.trim();
}