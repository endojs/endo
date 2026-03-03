# A Claw In Endo Land

The `@endo/genie` package will implement the core parts of a Claw-like AI Agent:

- workspace harnessed by LLM tools:
  - "memory_get" is the primary core ; "memory_search" is nice to have
  - "read_file" is the secondary core ; "write_file" and "edit_file" are right next to it
  - "web_search" and "web_fetch" are a tertiary priority
  - "bash" to run shell commands is tertiary
    - in fact we could perhaps provide more targeted shell command portals like
      a "git" tool for versioning the workspace only

- core constituency form `SOUL.md` and `IDENTITY.md`
  - these define most of the agent's system prompt
  - there may also be baked in blurbs, maybe config gated, like the "safety
    sandwich" used by some claws to help color tool outputs

- `MEMORY.md` system stored in the workspace
- `HEARTBEAT.md` to define repeating tasks and responsibilities

- should be able to adopt tools dynamically from a channel (chat) like `@endo/fae`
  - stretch goal if we're able to save dynamically given tools into a workspace file and then later load them

# Phase 1: memory_get, read_file, and core constituency

# Phase 2: heartbeat running worklet, write_file and edit_file

# Phase 3: bash tool and modified constituency for versioned workspace

# Phase 4: web_fetch and web_search
