---
'@endo/jsonl-transcript': minor
---

Add `@endo/jsonl-transcript`, the append-only, Pi-compatible JSONL projection of a Lal reply-chain transcript graph. Sessions are written one per file under `<ENDO_STATE>/sessions/<guest-id>/<timestamp>_<session-id>.jsonl` as a tree of `id`/`parentId`-linked entries (`header`, `message`, and `custom`, with `compaction`/`branchSummary` reserved in the format for a later phase), so an operator can `cat`/`grep`/`jq` a conversation and an agent can resume one from disk. Includes the append-only writer (lazy `0600` create, `O_APPEND`, torn-line recovery on reopen), the reader/graph reconstruction, the projection to and from Lal transcript nodes, and the format reference in `docs/session-format.md`.
