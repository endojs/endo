
## Making a Release

* `npm version patch`
* `npm install` (to update `package-lock.json`)
* `git commit`
* `git tag` with a signature
* `npm run build`
* `npm publish`
* `npm version prerelease --preid=dev`
* `git commit`
* `git push`
