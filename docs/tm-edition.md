# Please (TM Edition)

Please (TM Edition) is packaged as `kopachef.plz-vscode-tm`. The released
extension remains `please-build.plz-vscode`, so the two installations have
different identities.

The supplied launcher also gives the TM edition separate VS Code user-data and
extension directories. This prevents the editions from registering their
overlapping commands and CodeLens providers in the same extension host.

## Build and install

From an existing checkout of this repository:

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

## Install through the standalone Please target

The executable target under `distribution/install` supports an isolated
desktop profile and an active Remote SSH extension host.

### Remote SSH

Connect from local VS Code first, then run these commands in that remote
window's integrated terminal:

```sh
command -v code
plz run distribution/install:please_vscode_tm -- remote-install
plz run distribution/install:please_vscode_tm -- remote-status
```

The `code` path must contain `.vscode-server` and end in `remote-cli/code`.
After installation, run **Developer: Reload Window**. Generate the VSIX from
source before installing it remotely with:

```sh
plz run distribution/install:please_vscode_tm -- remote-build-install
```

Remove only TM Edition from the remote extension host with:

```sh
plz run distribution/install:please_vscode_tm -- remote-uninstall
```

### Isolated desktop profile

When VS Code runs directly on the machine executing the target:

```sh
# Download and install the latest published VSIX.
plz run distribution/install:please_vscode_tm -- install

# Clone the release branch, build a fresh VSIX, and install it.
plz run distribution/install:please_vscode_tm -- build-install
```

The source-build path requires `git`, Node.js 20 or newer, and `npm`. It builds
in a temporary checkout and removes that checkout after packaging. To retain
the generated artifact instead of installing it immediately:

```sh
plz run distribution/install:please_vscode_tm -- build ./please-vscode-tm.vsix v1.2.0-tm.1
```

See [`distribution/install/README.md`](../distribution/install/README.md) for
the source repository/ref overrides and the full target interface.

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
