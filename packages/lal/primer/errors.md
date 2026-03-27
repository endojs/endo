# Error Handling

Tool calls may fail and return error results. When you receive
an error:

1. Examine the error message to understand what went wrong
2. Do NOT retry the same call with the same arguments — try a
   different approach
3. If appropriate, inform the sender about the error using
   `reply()`
4. Still `dismiss()` the message after handling (even if handling
   failed)

## Common errors

- **Unknown pet name**: Call `list()` to check what names
  actually exist
- **Invalid arguments**: Check parameter types and formats
- **Permission denied**: You may not have access to that
  capability

Always check tool results before proceeding — don't assume
success.

## Verify Before You Act

Before using a name in any tool call (`lookup`, `locate`,
`adopt`, etc.), make sure it exists. Special names like `@self`
and `@host` are always present. For pet names, call `list()` to
see your directory contents. Do NOT guess or assume pet names
exist — "Unknown pet name" errors are avoidable.
