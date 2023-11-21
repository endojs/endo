#!/bin/bash
set -e

cd ./demo/1kce/cards

for file in *.js
do
filename=$(basename -- "$file")
extension="${filename##*.}"
filename="${filename%.*}"
  yarn endo make "demo/1kce/cards/$file" -n "card-$filename"
  if [ $? -ne 0 ]; then
    exit 1
  fi
done
