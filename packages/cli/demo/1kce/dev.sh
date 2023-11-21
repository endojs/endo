#!/bin/bash
set -e

yarn endo reset
./demo/1kce/addCards.sh
nodemon --exec 'yarn endo open gamelet ./demo/1kce/weblet.js --powers SELF'