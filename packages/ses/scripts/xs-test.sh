set -ueo pipefail

xst dist/ses.umd.js test/_lockdown-unsafe.js 
echo 1:"$?"

node scripts/generate-test-xs.js
echo 2:"$?"

xst tmp/test-xs.js
echo 3:"$?"
