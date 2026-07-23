# endo-changelog

This is a thin wrapper around [`@changesets/changelog-github`](https://npmx.dev/package/@changesets/changelog-github) which collapses single hard linebreaks in changeset summaries into spaces before delegating to the upstream formatter.

## Testing

```sh
yarn exec ava collapse-hard-breaks.test.js
```
