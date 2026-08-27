# Please (TM Edition)

Please (TM Edition) is packaged as `kopachef.plz-vscode-tm`. The released
extension remains `please-build.plz-vscode`, so the two installations have
different identities.

The supplied launcher also gives the TM edition separate VS Code user-data and
extension directories. This prevents the editions from registering their
overlapping commands and CodeLens providers in the same extension host.

## Build and install

From this repository:

```sh
npm ci --include=dev
npm run package
npm run tm:install
```

The installer uses `dist/please-vscode-tm.vsix`. You can also provide a local
VSIX or an HTTP(S) URL directly:

```sh
./distribution/install/please-vscode-tm.sh install /path/to/please-vscode-tm.vsix
```

The `code` command must be available on `PATH`. In VS Code on macOS, run
**Shell Command: Install 'code' command in PATH** if necessary.

## Launch and inspect

Launch a repository with the TM edition:

```sh
./distribution/install/please-vscode-tm.sh open /path/to/please-workspace
```

Check the installed identity and version:

```sh
npm run tm:status
```

By default, managed files live under
`${XDG_DATA_HOME:-$HOME/.local/share}/please-vscode-tm`. Set `PLEASE_TM_HOME`
to another path ending in `please-vscode-tm` when an isolated test location is
needed.

## Uninstall

Close TM edition windows, then run:

```sh
npm run tm:uninstall
```

The command uninstalls `kopachef.plz-vscode-tm` and removes only the dedicated
managed directory. It refuses to remove a directory that lacks the installer
marker or does not end in `please-vscode-tm`. The released
`please-build.plz-vscode` installation is never uninstalled or modified.
