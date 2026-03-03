/**
 * Workspace Context Builder
 *
 * Builds the workspace section for system prompts.
 */

export function buildWorkspaceContext() {
  return `
## Workspace Context

### Current Time
Session started: ${new Date().toISOString()}

### Runtime
model=${process.env.MODEL || 'unknown'} | host=${process.env.HOST || 'unknown'} | os=${process.env.OS || 'unknown'} | arch=${process.env.ARCH || 'unknown'}
  `.trim();
}