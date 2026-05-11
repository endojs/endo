# Genie memory: session layer files

- [x] Add `observations.md`, `reflections.md`, `profile.md` to `packages/genie/memory/`.
- [x] Pivot memory files into `packages/genie/workspace_template/memory/` folder
  - Created `workspace_template/` with `memory/`, `HEARTBEAT.md`, and `SOUL.md`
  - Removed old static `packages/genie/memory/` directory
- [x] Use `workspace_template/` as basis for workspace initialisation on first spawn
  - Added `src/workspace/init.js` — copies template tree into the agent
    workspace, skipping files that already exist
  - Writes `.genie-workspace-init` marker to avoid re-running
  - Integrated into `spawnAgent()` in `main.js`
  - Integrated into `dev-repl.js`

## Details

These files form the session layer's persistent state:

| File              | Retention     | Purpose                              |
|-------------------|---------------|--------------------------------------|
| `observations.md` | 7-day rolling | Compressed recent observations       |
| `reflections.md`  | indefinite    | Consolidated long-term observations  |
| `profile.md`      | indefinite    | Stable user/project identity         |

### Observation format

Observations are date-grouped, timestamped, and priority-tagged:

```markdown
## 2026-04-02

### Current Context
- **Active task:** Implement observer module
- **Key entities:** genie, memory system

### Observations
- 🔴 14:10 User needs observer to fire at 30k unobserved tokens
- 🟡 14:12 Prefers markdown with YAML frontmatter for entity files
- 🟢 14:18 Mentioned js-yaml as dependency candidate
```

Priority levels:
- 🔴 critical — blocks current work or captures a key decision
- 🟡 contextual — relevant to active tasks
- 🟢 informational — nice to know, lowest retention priority

### Implementation notes

- Files can be created empty or with minimal template headers.
- The observer and reflector will populate them.
- These files should be included in `watchPaths` so FTS5 indexes
  them.

## References

- `PLAN/genie_memory_session_layer.md` — file table and formats
- `PLAN/genie_memory_overview.md` — file layout
- `PLAN/genie_memory_implementation.md` — Phase 1 tasks
