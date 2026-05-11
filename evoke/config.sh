
# TODO want to disable this, but not sure evoke supports empty string
# TASK_FILE=TODOs.md

# TASKS_IN=TODO
# TASKS_OUT=TADA

NOTIFY=http://127.0.0.1:8077/chat

# NEXT_TASK_DELAY=1m

# Used as sender id for $NOTIFY:
# AGENT_IDENTITY="$(whoami)+${REPO_NAME}@$(hostname)"

# Evoking Claude not Pi for now
AGENT_NAME='claude'
AGENT_ARGS=('claude' '--dangerously-skip-permissions')
AGENT_SESSIONS="$HOME/.claude/projects/${PWD//\//-}"
AGENT_CURRENT_SESSION=
