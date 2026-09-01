# Please (TM Edition) installer

This directory contains a standalone Please target and installer. It uses only
the built-in `genrule`, so no language plugin is required. It supports both an
isolated desktop VS Code profile and the extension host of an active Remote SSH
window. Neither workflow replaces the released Please extension.

Run the target using its assigned build label:

```sh
plz run distribution/install:please_vscode_tm -- install
plz run distribution/install:please_vscode_tm -- build-install
plz run distribution/install:please_vscode_tm -- remote-install
plz run distribution/install:please_vscode_tm -- remote-build-install
plz run distribution/install:please_vscode_tm -- status
plz run distribution/install:please_vscode_tm -- uninstall
```

## Install in a Remote SSH window

Use this workflow when VS Code is running locally and is connected to the
workstation with Remote SSH. Connect first, open an integrated terminal in that
remote window, and confirm which `code` command it provides:

```sh
command -v code
```

The path must contain `.vscode-server` and end in `remote-cli/code`. A desktop
installation such as `/usr/bin/code` is deliberately rejected because it does
not manage the active Remote SSH extension host.

Install the published VSIX directly from the workstation:

```sh
plz run distribution/install:please_vscode_tm -- remote-install
plz run distribution/install:please_vscode_tm -- remote-status
```

Then run **Developer: Reload Window** in VS Code. To build from source before
installing into the same Remote SSH host, run:

```sh
plz run distribution/install:please_vscode_tm -- remote-build-install
```

The remote commands never pass custom `--user-data-dir` or `--extensions-dir`
arguments. They use the active VS Code Server CLI, so the extension appears
under **SSH: hostname - Installed**. If `please-build.plz-vscode` is already
installed remotely, the installer warns that it should be disabled for the
remote workspace; it never removes or disables that extension automatically.

Remove only TM Edition from the active Remote SSH host with:

```sh
plz run distribution/install:please_vscode_tm -- remote-uninstall
```

## Install in an isolated desktop profile

Use this workflow when VS Code runs directly on the machine executing the
Please target. It creates dedicated user-data and extension directories so TM
Edition does not share an extension host with the released edition.

The install command uses a sibling `please-vscode-tm.vsix` when one is present.
Otherwise it downloads `please-vscode-tm.vsix` from the latest GitHub release.
You can supply a different local artifact or URL:

```sh
plz run distribution/install:please_vscode_tm -- install /path/to/please-vscode-tm.vsix
```

For a pinned rollout, set `PLEASE_TM_VSIX_URL` to a versioned release URL and
`PLEASE_TM_VSIX_SHA256` to its SHA-256 digest. The installer supports both
`shasum` and `sha256sum`.

## Build from source

Use `build-install` when the workstation should generate the VSIX instead of
downloading the published artifact and install it in the isolated desktop
profile:

```sh
plz run distribution/install:please_vscode_tm -- build-install
```

This clones the `release` branch of `kopachef/please-vscode` into a temporary
directory, runs `npm ci --include=dev` and `npm run package`, installs the
generated VSIX, and removes the temporary checkout.

To generate the VSIX without installing it, provide an output path and an
optional branch or tag:

```sh
plz run distribution/install:please_vscode_tm -- build ./please-vscode-tm.vsix v1.2.0-tm.1
plz run distribution/install:please_vscode_tm -- install ./please-vscode-tm.vsix
```

Set `PLEASE_TM_SOURCE_REF` to change the default `release` ref or
`PLEASE_TM_SOURCE_REPOSITORY` to build from another Git repository. Source
builds require `git`, Node.js 20 or newer, and `npm` on `PATH`.

## Requirements and isolation

The isolated desktop workflow requires a normal VS Code `code` command on
`PATH`. The Remote SSH workflow instead requires the `remote-cli/code` command
provided inside the connected remote terminal. Installing a published release
also requires `curl`. Source builds require `git`, Node.js 20 or newer, and
`npm`.

See [Using Please (TM Edition)](USAGE.md) for CodeLens, coverage, and workspace
settings examples.
