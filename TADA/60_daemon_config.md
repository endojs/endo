# @endo/deamon needs a config system

- right now we only rely on `$ENDO_` environment variables for configuration
- would be nice if we had support for an `$ENDO_CONFIG` file
  - file path should default to `$XDG_CONFIG_HOME/endo/config.EXT`
  - note: `$XDG_CONFIG_HOME` itself defaults to `$HOME/.config`
  - for file format, [JSONC](https://jsonc.org/) would be a bare minimum choice, but probably better to also support YAML if not TOML
  - let's just start with JSONC, and use file extension dispatch to guide parser choice

- [x] start with a basic `packages/daemon/config.js` module inside the daemon
  - JSONC parser (strips `//` and `/* */` comments, trailing commas)
  - `readConfigFile()` / `writeConfigFile()` for persistent JSONC storage
  - `resolveConfig()` merges env > file > defaults
  - `getConfigFilePath()` honors `$ENDO_CONFIG` or `$XDG_CONFIG_HOME/endo/config.jsonc`
  - exported from `@endo/daemon/config.js`
  - 15 unit tests in `packages/daemon/test/config.test.js`
- [x] add basic `endo config ...` command(s) to @endo/cli
  1. `endo config` lists all effective settings
  2. `endo config <key>` gets a single setting
  3. `endo config <key> <value>` sets a single setting in the config file
  4. `endo config file` shows the config file path and its contents
- [x] start by providing config hookups for the 4 main fields of `daemon.Config` that come only from process env currently
  - `daemon/index.js` `main()` now calls `resolveConfig()` instead of `configFromEnv()`
  - priority is:
    1. `$ENDO_<key>` override value from process.env is highest priority
    2. `config.key` value from any config file (the new mechanism added above)
    3. `defaultConfig.key` finally any builtin default value
