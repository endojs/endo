#!/bin/bash
set -e

yarn endo reset
./src/addCards.sh
nodemon --exec 'yarn endo open game-1kce ./src/weblet.js --powers SELF'