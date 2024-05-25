#!/bin/bash
set -e

./addCards.sh
# endo make ./src/weblet.js --bundle --name game-1kce --powers SELF
# endo install ./src/weblet.js --powers AGENT --listen 8920 --name game-1kce
endo open game-1kce