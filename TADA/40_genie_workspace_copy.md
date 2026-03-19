# Genie Workspace Init

- [x] review and improve `packages/genie/src/workspace/init.js`
  - replaced `readFile`+`writeFile(wx)` with `fs.copyFile(COPYFILE_EXCL)`
