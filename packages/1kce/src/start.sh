#!/bin/bash
set -e

./src/addCards.sh
yarn endo open game-1kce ./src/weblet.js --powers SELF