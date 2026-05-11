# Genie tiered memory: phase 1 review follow ups

Responding to the "Remaining observations" from `TADA/62_genie_memory_phase1_review.md`:

4. **Heartbeat module quality**:
  - [x] good catch, make a `TODO/` task to follow up on this immediately
    - created `TODO/64_genie_heartbeat_quality.md`

1. **System prompt override is fragile**:
  - [x] agreed, create a `TODO/` task file to follow up on this next
    - created `TODO/65_genie_system_prompt_construction.md`

2. **Heartbeat→reflector wiring incomplete**:
  - this is fine for now, actual recurring integration will happen as noted in a future phase
  - [x] but for now, write a `TODO/` task to add a `/reflect` special command
    - we don't yet have any pattern for special commands in the main agent
      loop, will need to add such: any recognized `/` command should get
      handled directly in agent, no `/` commands should be passed to the Pi
      agent (LLM)
    - created `TODO/66_genie_reflect_command.md`
