
- [x] naturalize dev-repl special commands: use `.` prefix instead of `/`
  - `/heartbeat` -> `.heartbeat`
  - `/observe` -> `.observe`
  - `/reflect` -> `.reflect`
  - this rhymes with the existing `.help`, `.clear`, `.tools`, `.exit`/`.quit`
    builtins that already use dot-prefix
  - update `.help` output accordingly
  - keep `/` as a deprecated alias for one release cycle, printing a
    deprecation notice that nudges users toward the `.` form

Done. Changes made in:
- `packages/genie/dev-repl.js`: Updated all three commands to use `.` prefix
  as primary, kept `/` as deprecated alias with yellow warning, updated
  `.help` output and JSDoc comments.
- `packages/genie/main.js`: Updated daemon-mode `/observe` and `/reflect`
  handlers to accept both `.` and `/` prefixes.
