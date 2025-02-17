#!/bin/sh

set -e 

echo "Running Rollup..."
yarn rollup -c

if ! command -v eshost >/dev/null 2>&1; then
  echo "eshost not found. Installing..."
  
  if yarn --version | grep -q "^4"; then
    yarn add -D eshost
  else
    yarn global add eshost
  fi

  export PATH="$(yarn bin):$PATH"
fi

echo "Running eshost..."
eshost -h v8,xs dist/bundle.js
