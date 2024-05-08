#!/bin/bash
set -e

./addCards.sh
yarn endo open game-1kce ./src/weblet.js --powers SELF