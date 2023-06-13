#!/bin/bash
# Errors if number of cycle edges detected is too great
set -ueo pipefail

MAX_EDGES=$1

# one of these lines is "Cycles detected"
LINE_COUNT=$(scripts/graph.sh |wc -l)

CYCLIC_EDGE_COUNT=$((LINE_COUNT - 1))

echo CYCLIC_EDGE_COUNT $CYCLIC_EDGE_COUNT

if [[ $CYCLIC_EDGE_COUNT -gt $MAX_EDGES ]];
then
  echo Greater than MAX_EDGES "$MAX_EDGES"
  exit 1
fi

echo Less than or equal to MAX_EDGES "$MAX_EDGES"
