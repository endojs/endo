npm run-script build
cd integration-test 
npm install $( npm pack .. )
npm run create-test-file-no-lib-cjs
npm run create-test-file-browserified-tape
