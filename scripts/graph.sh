#!/bin/bash
# scripts/graph.sh generates packages.png, a visualization of the internal
# package dependency graph.
set -ueo pipefail
DIR=$(dirname -- "${BASH_SOURCE[0]}")
{
    echo 'digraph {'
    echo 'rankdir=LR'
    cat "$DIR"/../packages/*/package.json | jq -r --slurp '
        . as $all |
        [.[] | {(.name): true}] | add as $locals |

        $all[] |
        .name as $from |
        (.dependencies // {}) |
        keys[] |
        {$from, to: .} |
        select($locals[.from] and $locals[.to]) |
        "\"\(.from)\" -> \"\(.to)\""
    '
    echo '}'
} | dot -Tpng > "$DIR"/../packages.png
