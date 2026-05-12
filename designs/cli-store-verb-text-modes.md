# CLI `store` verb: text/blob/tree axes

| | |
|---|---|
| **Created** | 2026-05-08 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | PR [#128](https://github.com/endojs/endo-but-for-bots/pull/128) inline review comment [discussion_r3205660244](https://github.com/endojs/endo-but-for-bots/pull/128#discussion_r3205660244) on `packages/cli/src/commands/write-text.js:15` |

## What is the Problem Being Solved?

PR [#128](https://github.com/endojs/endo-but-for-bots/pull/128) proposes
two new top-level verbs, `endo write-text` and `endo read-text`,
alongside the existing `endo store`, `endo cat`, `endo show`,
`endo checkin`, and `endo checkout` family.
The maintainer's review on `write-text.js` line 15 reads:

> We have a bunch of store verbs.
> What makes this different is perhaps that the intention is to create a
> ReadableBlob or write a file instead of capturing text as a string
> value.
> We should think hard about how we present this, probably as a
> complication on the existing `store` verb rather than a new thing.

The CLI already presents a confusing surface around stored content.
Adding two more top-level verbs without a presentation strategy
multiplies the confusion.
The right shape is a unified scheme on `endo store` (and a
correspondingly unified read verb) that subsumes write-text/read-text
without growing the verb count.

This design is a **reshape blocker** for PR #128.

## Survey: existing store-family verbs

The verbs that put data into the daemon today:

| Verb | Source | Sink representation | Pet name produced |
|---|---|---|---|
| `endo store -p <file> -n <name>` | local file | `readable-blob` (CAS) | `<name>` |
| `endo store --stdin -n <name>` | stdin (binary) | `readable-blob` (CAS) | `<name>` |
| `endo store --text <s> -n <name>` | argv string | passable string value | `<name>` |
| `endo store --text-stdin -n <name>` | stdin (UTF-8) | passable string value | `<name>` |
| `endo store --json <s> -n <name>` | argv JSON | passable structured value | `<name>` |
| `endo store --json-stdin -n <name>` | stdin (UTF-8) | passable structured value | `<name>` |
| `endo store --bigint <s> -n <name>` | argv string | passable bigint value | `<name>` |
| `endo checkin <dir> -n <name>` | local directory | `readable-tree` (CAS) | `<name>` |
| `endo checkin -z <zip> -n <name>` | local zip | `readable-tree` (CAS) | `<name>` |
| `endo checkin -z --stdin -n <name>` | stdin zip | `readable-tree` (CAS) | `<name>` |
| `endo write-text <name>` (PR #128) | stdin or `--text` | written through a mount via `writeText` | mutates a path |
| `endo mkweblet <name>` | existing `readable-tree` | weblet | `--as` |

The verbs that take data out:

| Verb | Source representation | Sink |
|---|---|---|
| `endo cat <name>` | `readable-blob` or `readable-tree` leaf | stdout (raw bytes) |
| `endo show <name>` | passable value | stdout (formatted) |
| `endo checkout <name> <dir>` | `readable-tree` | local directory |
| `endo checkout -z <name> <zip>` | `readable-tree` | local zip |
| `endo checkout -z --stdout <name>` | `readable-tree` | stdout zip |
| `endo read-text <name>` (PR #128) | path within a mount via `readText` | stdout (UTF-8) |

## The orthogonal axes

The verbs above mix three axes:

1. **Source / sink:** stdin, stdout, file path, argv string literal.
2. **Representation:** opaque blob (bytes), text (UTF-8 string), JSON
   (structured passable value), bigint (passable scalar), tree
   (`readable-tree` of nested entries).
3. **Where it lives in the formula graph:** content-addressed
   immutable formula (`readable-blob`, `readable-tree`) vs. a
   primitive value (passable string, passable bigint), vs. a path
   inside a mutable mount (the case PR #128's `writeText` covers).

The third axis is the one PR #128 introduced without naming.
`endo store --text` puts a *string value* into the formula graph.
`endo write-text` writes UTF-8 *bytes* through a mount's filesystem
boundary.
These are different operations against different addressing schemes,
even though both look like "save some text".

## Design: unified `endo store` flag scheme

### Recommendation

Reshape `endo store` so its flag set names the three axes
independently.
Drop `endo write-text` and `endo read-text` as top-level verbs.

```
endo store [--blob|--text|--json|--bigint|--tree]    # representation
           [-p <file>|--stdin|--literal <s>]         # source
           [-n <name-path>]                          # destination
           [--as <agent>]
```

All text input and output is UTF-8.
There is no `--encoding` flag: the daemon does not negotiate codecs,
and inputs that are not valid UTF-8 in text modes are rejected at the
CLI boundary.

**Representation flag** is required and mutually exclusive.
**Source flag** is required and mutually exclusive.
The `-p <file>` source flag is the **same flag for read and write**:
`endo store -p <file> -n <name>` reads from a file on the way in,
and `endo cat -p <file> <name>` writes to a file on the way out.
This keeps the file flag consistent across the verb pair without
introducing `--from` / `--to` duals or renaming `-p`.

Examples (canonical form):

```
endo store --blob -p ./image.png -n photos/cat
endo store --blob --stdin -n logs/today
endo store --text --literal "hello" -n greeting
endo store --text --stdin -n notes/meeting     # subsumes write-text
endo store --text -p ./README.md -n docs/readme
endo store --json --literal '{"a":1}' -n config
endo store --json --stdin -n inbound/payload
endo store --bigint --literal 42 -n score
endo store --tree -p ./src -n project          # subsumes checkin
endo store --tree -z ./bundle.zip -n project   # subsumes checkin -z
endo store --tree -z --stdin -n project        # subsumes checkin -z --stdin
```

### Unified read verb

The inverse should be a single verb that mirrors the same axis
structure.
Survey of existing read-side names: `endo cat`, `endo show`,
`endo follow`, `endo checkout`, `endo locate`.
Two viable choices:

1. **`endo cat` extended.**
   `cat` already handles the "blob to stdout" case.
   Add representation and sink flags so it mirrors `store`.
   Pro: unix-familiar; the binary case stays a one-word command.
   Con: `cat` connotes raw bytes; users may be surprised when
   `endo cat --text -p ./out.txt` writes a file.

2. **`endo retrieve`** as a new symmetric verb name, with
   `endo cat` retained as the bytes-to-stdout shorthand.
   Pro: symmetry with `store` is explicit in the name; reads cleanly
   in scripts (`endo store … && endo retrieve …`).
   Con: a new verb to learn; `cat` is already familiar.

**Recommendation: extend `endo cat`.**
The verb count argument that motivates this whole reshape applies
just as forcefully to the read side.
A new `retrieve` verb undoes that economy.
The name `cat` is already overloaded in unix to mean "concatenate to
stdout" (the original meaning), and Endo's existing `cat` verb is
already a generalization (it streams a blob).
Letting `cat` cover text and JSON modes, with explicit flags, is a
small extension of an already-extended name.

```
endo cat [--blob|--text|--json|--tree] [-p <file>|--stdout|--show]
         [-z] [-n] <name-path>
         [--as <agent>]
```

Default representation: `--blob`.
Default sink: `--stdout`.
The current `endo cat <name>` keeps working unchanged.
`endo show <name>` becomes a shorthand for `endo cat --show <name>`
(formatted display of a passable value).
`endo checkout` keeps its current spelling as a high-traffic verb
but is documented as `endo cat --tree -p <dir> <name>`'s shorthand.

The `-p <file>` flag mirrors `endo store -p <file>`: it names a file
on the local filesystem, reading on `store`, writing on `cat`.
The flag stays the same letter so that
`endo store -p foo.txt -n notes` and `endo cat -p foo.txt notes`
read symmetrically.

## What `--text` and `--blob` produce in the formula graph

`--blob` and `--text` name two distinct formula kinds:

- **`--blob`** writes a `readable-blob` (CAS, byte content).
  The bytes are streamed and content-addressed; the formula is the
  hash.
  This is the right kind for binary content of any size and for
  large text whose streaming and deduplication matter.

- **`--text`** writes a primitive string value formula, the same
  shape `storeValue(string)` produces today.
  The string is a small passable scalar in the formula graph, not a
  CAS blob.
  This is the right kind for short token-like text (a greeting, a
  config line, a one-word label) where the formula is the value.

So `endo store --blob -p ./image.png -n photos/cat` produces a
readable blob; `endo store --text --literal "hello" -n greeting`
produces a primitive string formula.
Reading mirrors the kind: `endo cat --blob -n photos/cat` streams
bytes; `endo show greeting` (or `endo cat --text -n greeting`)
returns the string value via CapTP.

This split is intentionally narrow.
`--text` is for **primitive string values**; it does not absorb a
file into a blob with text metadata.
A user who wants the bytes of `README.md` in the formula graph asks
for `--blob -p ./README.md`; the bytes are addressed by hash, and
any downstream code that needs them as a string decodes UTF-8 at
read time.

Readable blobs do not carry a content-type or encoding field.
The formula is the content hash; metadata about media type stays
out-of-band (in the pet name, in the consumer's expectation, or in
a sibling formula if needed).

The composition with `--tree` follows: a `readable-tree` of
`readable-blob` leaves is the shape for any directory of files,
text-or-binary alike.
The `--text` primitive-string kind has no place inside a tree leaf
(trees address blobs by hash); a directory of `.md` files becomes
a tree of blobs whose consumers know to decode UTF-8.

## Composition with `endo checkin`

A directory of files (text or binary) maps to a `readable-tree` of
`readable-blob` leaves.
The CLI surface stays simple:

```
endo store --tree -p ./docs -n docs
```

`storeTree` walks the directory and stores each leaf as a blob.
Leaves do not carry text-vs-binary metadata; consumers that need
to decode UTF-8 do so at read time.

### Mount-path writes (the `writeText` case)

PR #128's `writeText` is a different operation: it mutates a path
inside an already-existing mutable mount, not a CAS formula.
This is the operation supported by `EndoDirectory.writeText` in
`packages/daemon/src/types.d.ts:702`.

`endo store` is the wrong verb for this.
`store` connotes "create a new formula"; the mount-path case mutates
existing state in place.
The right verb for the mount-path case is **`endo write`** (no
`-text` suffix), with the same axis structure:

```
endo write [--text|--blob|--json] [--literal <s>|--stdin|-p <file>]
           <mount-name>/<path>
           [--as <agent>]
```

This dispatches to `EndoDirectory.writeText` (text mode) or a
binary-mode equivalent.
The inverse is `endo read` (or `endo cat` with the same path
syntax, since the mount lookup is transparent at the pet-name-path
level):

```
endo read [--text|--blob] <mount-name>/<path> [--as <agent>]
```

`endo read` and `endo write` are sibling verbs to `endo store` and
`endo cat`, distinguished by their target (mutable mount vs.
immutable formula).
This separation matches the underlying daemon distinction between
`storeBlob`/`storeValue` (formula creation) and `writeText` (mount
mutation), and avoids overloading `store` with two semantically
different operations.

## Rejecting `write-text` and `read-text` as top-level verbs

PR #128's two new verbs are subsumed by:

- `endo write --text --stdin <path>` (was `endo write-text <path>`)
- `endo read --text <path>` (was `endo read-text <path>`)

Neither needs its own top-level verb.
The `-text` suffix becomes an axis flag, not a verb-name component.

## Alternatives considered

### Alt 1: keep `write-text` / `read-text` as-is

Do nothing.
Land PR #128 as written.
**Rejected.** This is the position the maintainer already pushed
back on; it inflates the verb count and entrenches the conflation
between "write text to a mount" and "store a text formula".

### Alt 2: only add `--text` to `endo store`; leave mount-path writes for later

A minimal version of this design that addresses just the
`endo store --text` ergonomic question and defers the mount-path
write case.
**Rejected** as a partial fix.
PR #128 needs an answer on `write-text`; deferring leaves the new
top-level verbs in place, which is the thing the maintainer wants
removed.

### Alt 3: a single `endo write` verb subsumes both formula and mount cases

Drop the formula vs. mount distinction at the CLI surface.
`endo write --text --stdin -n <name>` could mean either "create a
text formula" or "write to a mount path", dispatched by whether
`<name>` resolves to an existing mount.
**Rejected.** This makes the operation's effect depend on the
state of the daemon (does that mount exist yet?) rather than on
the verb the user typed.
Surprising and hard to script defensively.

## Decisions

1. **Blobs are bytes.**
   `endo store --blob` writes a `readable-blob`: a stream of bytes,
   content-addressed by hash.
   The daemon does not store charset, content-type, or text-vs-blob
   mode on blobs; on UNIX `endo cat -n <blob>` writes the bytes
   verbatim.
   The representation flag's role on the value-formula side
   (`--text --literal`, `--json --literal`, `--bigint --literal`)
   is to select the input parser and produce the corresponding kind
   of value formula (primitive string, structured passable, bigint);
   it is load-bearing there.
   The flag's role on the blob side (`--blob --stdin`,
   `--blob -p <file>`) is to name the destination kind (a
   `readable-blob`) rather than to negotiate a render mode at
   egress: there is no distinct text-on-blob render mode at `cat`
   time, because blobs do not carry text-vs-binary metadata.
   A user who wants the bytes of a UTF-8 file in the formula graph
   asks for `--blob -p ./README.md`; downstream consumers that
   need those bytes as a string decode UTF-8 at read time.
   Per the maintainer's review on PR #153 ([comment 3213469481](
   https://github.com/endojs/endo-but-for-bots/pull/153#discussion_r3213469481)):
   "Blobs are bytes."

2. **`endo write` is the right name for the mount-path mutation
   verb.**
   `write` is the closest to the underlying `writeText` daemon
   method and matches `read` as inverse.
   Alternatives considered (`endo set`, `endo poke`, `endo put`)
   were either too vague or carried REST connotations
   (HTTP-PUT's full-resource replace).
   `edit` and `patch` are reserved as future siblings to
   `read` / `write`: an editing verb that opens an existing target
   for in-place modification (and a `patch` variant for structured
   diffs) is a plausible future extension and should not collide
   with `write`'s create-or-overwrite semantics.
   The `edit` verb is designed in the sibling
   [`cli-edit-verb`](cli-edit-verb.md) (PR #162); this design does
   not prejudge its shape.
   Per the maintainer's review on PR #153 ([comment 3213481202](
   https://github.com/endojs/endo-but-for-bots/pull/153#discussion_r3213481202)):
   "Write is fine."

3. **`endo store --tree` does not accept stdin in non-zip mode.**
   `endo store --tree --stdin` is incoherent: `--tree` walks a
   directory and stdin is a stream of bytes with no directory
   structure.
   The CLI rejects `--tree --stdin` (without `-z`) with an error
   that points users at the explicit zip form
   `endo store --zip --stdin -n <name>` (or its `-z` shorthand).
   The framed-zip case is the only sensible stdin-tree input.

## Deferred: Windows text-mode transcoding

UNIX treats every blob's bytes uniformly; `endo cat` writes them
verbatim and `endo store --stdin` reads them verbatim.
Windows CLIs historically distinguish text-mode (CRLF translation,
charset transcoding) from binary-mode on file handles.
A future Windows port might want `endo cat <name>` to transcode
on the way out for a text-mode target.

A single-file egress could ask the user at the CLI: "render this
blob as text or bytes?".
That approach does not generalize to trees of mixed-mode blobs
where the user does not know each leaf's intended encoding.

To support Windows text-mode transcoding generally, the daemon
would need to capture a single bit on the blob (or on a parent
directory entry) noting "this leaf was originally text" so that
egress on Windows can transcode automatically.
This is out of scope for the current design and is not blocking
PR #128 or any present consumer.
Revisit if Windows transcoding becomes a priority; the change is
a one-bit schema addition on the blob or directory entry plus a
CLI-side egress branch.

## Sibling design

- [`cli-edit-verb`](cli-edit-verb.md) (PR
  [#162](https://github.com/endojs/endo-but-for-bots/pull/162))
  designs `endo edit` as the delta-based companion to `endo write`
  and `endo read`, with hashline as the primary patch format.
  Sibling to this design; PR #153 lands first, PR #162 ships on
  top.

## Test Plan

- Unit tests for the option parser:
  each canonical form, mutual-exclusion errors, required-flag
  errors.
- Daemon integration tests for `--text --literal` value round-trip:
  store a string value, read back via `endo show` and via
  `endo cat --text`, assert exact equality.
- `--blob -p <file>` and `endo cat --blob -p <file>` round-trip:
  store the bytes of a file, write them back to a new file, assert
  byte equality (always binary, no line-ending translation; blobs
  are bytes, the daemon does not transcode).
- Tree round-trip under `--tree`: `endo store --tree -p <dir>`
  followed by `endo cat --tree -p <other-dir>`, compare directory
  contents leaf-by-leaf.
- `endo store --tree --stdin` (without `-z`) is rejected with an
  error message pointing at `--zip --stdin`.
- Mount-path round-trip for `endo write --text` and `endo read
  --text` against an existing mount, exercising multi-segment
  pet-name paths.

## Dependencies

| Design | Relationship |
|---|---|
| [`daemon-checkin-checkout`](daemon-checkin-checkout.md) | Defines `--tree` source/sink and zip framing; `endo store --tree` is the renamed `endo checkin` and inherits its design choices. |
| [`daemon-mount`](daemon-mount.md) | Defines `EndoDirectory.writeText` and `readText`; `endo write`/`endo read` are CLI surface for those. |

## Reshape blocker for

- PR [#128](https://github.com/endojs/endo-but-for-bots/pull/128) —
  `packages/cli/src/commands/write-text.js` and
  `packages/cli/src/commands/read-text.js`.
  Under this design, those files are removed in favor of new
  `endo write` / `endo read` verbs that delegate to
  `EndoDirectory.writeText` / `readText`, and `endo store` grows
  the unified `--text` axis.

## Prompt

> Design how text input/output should be presented on the `endo store`
> verb family.
> PR 128 added `endo write-text` and `endo read-text` as new top-level
> verbs; the maintainer flagged this as a presentation question:
> "we have a bunch of store verbs… probably as a complication on the
> existing `store` verb rather than a new thing".
