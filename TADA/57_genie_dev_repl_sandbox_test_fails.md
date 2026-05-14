# Sandboxed dev-repl isn't quite working yet

## Test fails consistently

```
$ yarn workspace @endo/genie run test
```

1. [x] run the test, analyze the failure, fix it, keep re-running the test and looping until they all pass; commit intermediate work as you go

    Verified `yarn workspace @endo/genie run test` produces 401 passing tests.
    The dev-repl-sandbox integration test exits 0 but with `SKIP:` log lines
    when the LLM-side probe flakes — those SKIPs hide the underlying tool
    failures captured below in items 2 and 3, which were never exercised by
    a test.  Items 2 and 3 are the real regression.

## Running the dev-repl manually fails

So I ran the dev-repl and asked it for a basic "sitrep".

It first tried and failed to run t the "listDirectory" tool:
```
⚡ listDirectory {"path":"."}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"Failed to list directory: target has no method \"lookup\", has [\"__getInterfaceGuard__\",\"__getMethodNames__\",\"has\",\"help\",\"list\",\"makeDirectory\",\"readText\",\"writeText\"]"}],"details":{}}
The `listDirectory` tool returned a strange error message, but it failed to list the directory contents. This suggests either a persistent environment issue or I should attempt a more general system command to list files, like `ls -F`. Since I'm in a shell-like environment, `bash` is the most appropriate tool.
```

2. [x] investigate, fix, ensure a test covers this

    Root cause: `src/sandbox/local-powers.js` Mount exo exposes only the subset
    `{ help, has, list, readText, writeText, makeDirectory }`.  But the genie
    file tools' `files` group routes through `src/tools/vfs-mount.js`, which
    drives `E(mount).lookup(...)` (to discriminate file vs. directory before
    `list`-ing) and `E(mount).remove(...)` (for `unlink` / `rmdir` / `rm`).
    On the daemon path the cap exposes those methods; on the dev-repl path
    `__getMethodNames__()` lists only the partial surface, so `vfs-mount.js`
    fails with the literal "target has no method \"lookup\"" message.

    Fix landed (commit 48bcf27cb):
      - Extended `local-powers.js` to implement `lookup`, `remove`, `move`,
        and `maybeReadText` so the local Mount surface matches the daemon's
        `MountInterface` as far as the genie tools drive it.  `lookup`
        returns either a sub-Mount-shaped exo (for directories) or a
        MountFile-shaped exo with `text()` (for files); `remove`
        discriminates file vs. (empty) directory because `fs.rm` refuses
        directories without `recursive: true`.
      - Pinned the wider method surface in
        `test/local-sandbox-powers.test.js` and added four regression tests
        that drive `listDirectory`, `stat`, `removeFile`, and recursive
        `removeDirectory` end-to-end through `vfs-mount.js` against the
        real local Mount cap (no fakes), so the next refactor that thins
        the cap fails here loudly rather than only at runtime.

It then tried to run system `ls` via "bash" tool:
```
I will use `bash` with `ls -F` to get a directory listing, which is more robust for displaying workspace contents in this context.
⚡ bash {"args":["ls -F"]}
✗ failed: Error: Tool execution failed: {"content":[{"type":"text","text":"bash execution failed: Command failed with exit code 1"}],"details":{}}
```

3. [x] this look similar to the item 1 test failure above, but have a look anyhow, make sure this works, and is tested

    Different root cause from items 1/2 but the same operator-facing
    surface.  The `bash` tool is built on `makeCommandTool` with
    `shell: true`, which routes through `makeHostSpawner`'s `spawn`.
    That spawner unconditionally ran `whichProgram(argv[0], PATH)`
    even in shell mode, so an LLM-shaped single-string payload like
    `args: ["ls -F"]` (very common because models think of `bash` as
    accepting a command, not an argv list) failed with
    "command not found: ls -F" before the shell ever got a look.
    Reproduced locally with a one-shot harness against the live
    `makeBashTool` — `args: ["ls -F"]` and `args: ['echo "$(date +%s)"']`
    both failed with that exact message; `args: ["ls", "-F"]` worked.

    Note: the sandbox-spawner path already worked because it
    pre-translates `shell: true` into `['/bin/sh', '-c', argv.join(' ')]`
    without a `whichProgram` check.  The user's original "exit code 1"
    report was probably the *previous* tool failing — listDirectory
    blew up first (item 2), then the model fell back to `bash` with
    a single-string command, hit this host-spawner bug, and the dev-repl
    surfaced both errors in sequence.  Fixing item 2 alone would have
    avoided the fallback; fixing the bash surface too makes both
    paths robust.

    Fix landed: aligned the host spawner with the sandbox spawner in
    shell mode — `argv.join(' ')` is the full command line passed to
    Node's `spawn(cmd, [], { shell: true })`, which Node delegates to
    `/bin/sh -c <joined>`.  The shell handles command resolution, so
    `whichProgram` is now skipped in shell mode (it still runs in
    non-shell mode for the `exec` tool, which is contractually argv-
    shaped).

    Added 3 regression tests in `test/tools/spawner.test.js`:
      - `shell:true accepts a single-string command line`
      - `shell:true single-string supports shell features` (`$(...)` etc.)
      - `shell:false still rejects unknown programs` (pins the asymmetry)
